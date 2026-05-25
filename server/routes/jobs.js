const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// All routes require auth
router.use(authMiddleware);

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
  const withCounts = jobs.map(job => {
    const count = db.prepare('SELECT COUNT(*) as count FROM applications WHERE job_id = ?').get(job.id);
    return { ...job, application_count: count.count };
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

  res.json({ job, applications });
});

// POST /api/jobs
router.post('/', (req, res) => {
  const { title, description, requirements, location, market, employment_type, salary_min, salary_max, salary_currency } = req.body;

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

  res.status(201).json({ job });
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
  res.json({ job: updated });
});

// DELETE /api/jobs/:id
router.delete('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Job deleted.' });
});

module.exports = router;
