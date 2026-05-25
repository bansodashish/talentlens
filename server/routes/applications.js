const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { scoreCandidate, detectRole } = require('../services/scorer');

router.use(authMiddleware);

// GET /api/applications
router.get('/', (req, res) => {
  const { job_id, candidate_id, status, stage } = req.query;
  let query = `
    SELECT a.*,
      j.title as job_title, j.location as job_location, j.market as job_market, j.description as job_description,
      c.name as candidate_name, c.email as candidate_email, c.current_title, c.ai_score, c.market as candidate_market
    FROM applications a
    LEFT JOIN jobs j ON a.job_id = j.id
    LEFT JOIN candidates c ON a.candidate_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (job_id)       { query += ' AND a.job_id = ?';       params.push(job_id); }
  if (candidate_id) { query += ' AND a.candidate_id = ?'; params.push(candidate_id); }
  if (status)       { query += ' AND a.status = ?';       params.push(status); }
  if (stage)        { query += ' AND a.stage = ?';        params.push(stage); }
  query += ' ORDER BY a.applied_at DESC';
  res.json({ applications: db.prepare(query).all(...params) });
});

// POST /api/applications
router.post('/', async (req, res) => {
  const { job_id, candidate_id, notes } = req.body;
  if (!job_id || !candidate_id) return res.status(400).json({ error: 'job_id and candidate_id are required.' });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidate_id);
  if (!job)       return res.status(404).json({ error: 'Job not found.' });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

  const existing = db.prepare('SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?').get(job_id, candidate_id);
  if (existing) return res.status(409).json({ error: 'Candidate already applied to this job.' });

  // ── Real AI match scoring ─────────────────────────────────────────────────
  let aiMatchScore = null;
  let aiMatchSummary = null;
  let aiMatchDetails = null;
  let aiProvider = 'local';

  if (candidate.cv_text && candidate.cv_text.trim().length > 30) {
    try {
      const jdText = [job.title, job.description, job.requirements].filter(Boolean).join('\n\n');
      const detectedRole = detectRole(candidate.cv_text);
      const scored = scoreCandidate(candidate.cv_text, jdText, detectedRole);
      aiMatchScore = scored.score_pct;
      aiMatchSummary = scored.label;
      aiMatchDetails = JSON.stringify({
        strengths: scored.strengths,
        gaps: scored.gaps,
        details: scored.details,
        recommendation: scored.recommendation,
      });
    } catch (err) {
      console.error('Scoring error on application create:', err.message);
    }
  }

  // Fallback: market alignment heuristic when no CV text
  if (aiMatchScore === null) {
    const marketBonus = (job.market === candidate.market || job.market === 'Both') ? 15 : -5;
    aiMatchScore = Math.min(100, Math.max(10, (candidate.ai_score || 60) + marketBonus));
    aiMatchSummary = 'Score estimated (no CV text)';
  }

  const result = db.prepare(`
    INSERT INTO applications (job_id, candidate_id, ai_match_score, ai_match_summary, ai_match_details, ai_provider, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(job_id, candidate_id, aiMatchScore, aiMatchSummary, aiMatchDetails, aiProvider, notes || null);

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);

  db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)')
    .run('application_created', `${candidate.name} applied to ${job.title}`, 'application', application.id, req.user.id);

  res.status(201).json({ application });
});

// PUT /api/applications/:id
router.put('/:id', (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  const { status, stage, notes } = req.body;
  db.prepare('UPDATE applications SET status=?, stage=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status || app.status, stage || app.stage, notes ?? app.notes, req.params.id);

  db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)')
    .run('application_updated', `Application stage → ${stage || app.stage}`, 'application', app.id, req.user.id);

  res.json({ application: db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) });
});

// DELETE /api/applications/:id
router.delete('/:id', (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  res.json({ message: 'Application removed.' });
});

module.exports = router;
