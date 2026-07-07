const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const reedJobPosting = require('../services/reedJobPostingService');

// All routes require auth
router.use(authMiddleware, adminMiddleware);

const PORTAL_REED = 'reed_uk';

const serialiseDistribution = (row) => row ? {
  id: row.id,
  job_id: row.job_id,
  portal: row.portal,
  status: row.status,
  external_job_id: row.external_job_id,
  external_url: row.external_url,
  error_message: row.error_message,
  attempts: row.attempts,
  last_attempt_at: row.last_attempt_at,
  posted_at: row.posted_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
} : null;

const getJobDistributions = (jobId) => db.prepare(`
  SELECT * FROM job_distributions WHERE job_id = ? ORDER BY created_at ASC
`).all(jobId).map(serialiseDistribution);

const getJobsDistributionsMap = (jobIds) => {
  if (!jobIds.length) return new Map();
  const placeholders = jobIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM job_distributions WHERE job_id IN (${placeholders}) ORDER BY created_at ASC
  `).all(...jobIds);
  const map = new Map(jobIds.map(id => [id, []]));
  for (const row of rows) map.get(row.job_id)?.push(serialiseDistribution(row));
  return map;
};

const recordDistributionAttempt = ({ jobId, portal, status, externalJobId = null, externalUrl = null, errorMessage = null }) => {
  db.prepare(`
    INSERT INTO job_distributions
      (job_id, portal, status, external_job_id, external_url, error_message, attempts, last_attempt_at, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CASE WHEN ? = 'posted' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(job_id, portal) DO UPDATE SET
      status = excluded.status,
      external_job_id = excluded.external_job_id,
      external_url = excluded.external_url,
      error_message = excluded.error_message,
      attempts = job_distributions.attempts + 1,
      last_attempt_at = CURRENT_TIMESTAMP,
      posted_at = CASE WHEN excluded.status = 'posted' THEN CURRENT_TIMESTAMP ELSE job_distributions.posted_at END,
      updated_at = CURRENT_TIMESTAMP
  `).run(jobId, portal, status, externalJobId, externalUrl, errorMessage, status);

  return serialiseDistribution(db.prepare(`
    SELECT * FROM job_distributions WHERE job_id = ? AND portal = ?
  `).get(jobId, portal));
};

const friendlyReedError = (err) => {
  const apiMessage = err.response?.data?.error || err.response?.data?.message || err.response?.data?.Message;
  return apiMessage || err.hint || err.message || 'Reed UK publish failed.';
};

const publishJobToReed = async (job) => {
  try {
    const published = await reedJobPosting.publishJob(job);
    const distribution = recordDistributionAttempt({
      jobId: job.id,
      portal: PORTAL_REED,
      status: 'posted',
      externalJobId: published.externalJobId,
      externalUrl: published.externalUrl,
    });

    db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)').run(
      'job_published_reed', `Job published to Reed UK: ${job.title}`, 'job', job.id, job.created_by
    );

    return distribution;
  } catch (err) {
    console.error('Reed UK job publish failed:', err.response?.data || err.message);
    return recordDistributionAttempt({
      jobId: job.id,
      portal: PORTAL_REED,
      status: 'failed',
      errorMessage: friendlyReedError(err),
    });
  }
};

const wantsReedPublish = (targets = []) => Array.isArray(targets) && targets.includes(PORTAL_REED);

// GET /api/jobs
router.get('/', (req, res) => {
  const { market, status, search } = req.query;
  let query = 'SELECT j.*, u.name as created_by_name FROM jobs j LEFT JOIN users u ON j.created_by = u.id WHERE 1=1';
  const params = [];

  if (market) { query += ' AND j.market = ?'; params.push(market); }
  if (status) { query += ' AND j.status = ?'; params.push(status); }
  if (search) { query += ' AND (j.title LIKE ? OR j.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY j.created_at DESC';
  const jobs = db.prepare(query).all(...params);

  // Add application count
  const distributionsByJob = getJobsDistributionsMap(jobs.map(job => job.id));
  const withCounts = jobs.map(job => {
    const count = db.prepare('SELECT COUNT(*) as count FROM applications WHERE job_id = ?').get(job.id);
    return { ...job, application_count: count.count, distributions: distributionsByJob.get(job.id) || [] };
  });

  res.json({ jobs: withCounts });
});

// GET /api/jobs/:id
router.get('/:id', (req, res) => {
  const job = db.prepare('SELECT j.*, u.name as created_by_name FROM jobs j LEFT JOIN users u ON j.created_by = u.id WHERE j.id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const applications = db.prepare(`
    SELECT a.*, c.name as candidate_name, c.email as candidate_email, c.current_title, c.ai_score
    FROM applications a
    LEFT JOIN candidates c ON a.candidate_id = c.id
    WHERE a.job_id = ?
    ORDER BY a.applied_at DESC
  `).all(req.params.id);

  res.json({ job: { ...job, distributions: getJobDistributions(job.id) }, applications });
});

// POST /api/jobs
router.post('/', async (req, res) => {
  const { title, description, requirements, location, market, employment_type, salary_min, salary_max, salary_currency, publish_targets } = req.body;

  if (!title || !location || !market) {
    return res.status(400).json({ error: 'Title, location and market are required.' });
  }

  const result = db.prepare(`
    INSERT INTO jobs (title, description, requirements, location, market, employment_type, salary_min, salary_max, salary_currency, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description, requirements, location, market, employment_type || 'Full-time', salary_min, salary_max, salary_currency || 'GBP', req.user.id);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);

  db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)').run(
    'job_created', `New job posted: ${title}`, 'job', job.id, req.user.id
  );

  const distributions = [];
  if (wantsReedPublish(publish_targets)) {
    distributions.push(await publishJobToReed(job));
  }

  res.status(201).json({ job: { ...job, distributions }, distributions });
});

// POST /api/jobs/:id/distributions/reed/retry
router.post('/:id/distributions/reed/retry', async (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const distribution = await publishJobToReed(job);
  res.json({ distribution, distributions: getJobDistributions(job.id) });
});

// PUT /api/jobs/:id
router.put('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const { title, description, requirements, location, market, employment_type, salary_min, salary_max, salary_currency, status } = req.body;

  db.prepare(`
    UPDATE jobs SET title=?, description=?, requirements=?, location=?, market=?, employment_type=?, salary_min=?, salary_max=?, salary_currency=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(title || job.title, description ?? job.description, requirements ?? job.requirements, location || job.location, market || job.market, employment_type || job.employment_type, salary_min ?? job.salary_min, salary_max ?? job.salary_max, salary_currency || job.salary_currency, status || job.status, req.params.id);

  const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  res.json({ job: { ...updated, distributions: getJobDistributions(updated.id) } });
});

// DELETE /api/jobs/:id
router.delete('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Job deleted.' });
});

module.exports = router;
