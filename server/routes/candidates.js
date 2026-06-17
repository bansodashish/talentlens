const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { parseCV } = require('../services/cvParser');
const { scoreCandidate, detectRole } = require('../services/scorer');

const uploadsDir = path.resolve(__dirname, '../../db/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.doc', '.docx', '.txt', '.rtf'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Only PDF, DOC, DOCX, TXT files are allowed.'), ok);
  },
});

router.use(authMiddleware);

// GET /api/candidates
router.get('/', (req, res) => {
  const { market, status, search, min_score, max_score, source, mine } = req.query;
  let query = 'SELECT c.*, u.name as added_by FROM candidates c LEFT JOIN users u ON c.created_by = u.id WHERE 1=1';
  const params = [];
  if (mine === '1' || mine === 'true') { query += ' AND c.created_by = ?'; params.push(req.user.id); }
  if (market) { query += ' AND c.market = ?'; params.push(market); }
  if (status) { query += ' AND c.status = ?'; params.push(status); }
  if (source) { query += ' AND c.source = ?'; params.push(source); }
  if (min_score) { query += ' AND c.ai_score >= ?'; params.push(Number(min_score)); }
  if (max_score) { query += ' AND c.ai_score <= ?'; params.push(Number(max_score)); }
  if (search) {
    query += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.current_title LIKE ? OR c.skills LIKE ? OR c.current_company LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  query += ' ORDER BY c.created_at DESC';
  const candidates = db.prepare(query).all(...params);
  res.json({ candidates });
});

// GET /api/candidates/:id
router.get('/:id', (req, res) => {
  const candidate = db.prepare('SELECT c.*, u.name as added_by FROM candidates c LEFT JOIN users u ON c.created_by = u.id WHERE c.id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

  const applications = db.prepare(`
    SELECT a.*, j.title as job_title, j.location as job_location, j.market as job_market
    FROM applications a
    LEFT JOIN jobs j ON a.job_id = j.id
    WHERE a.candidate_id = ?
    ORDER BY a.applied_at DESC
  `).all(req.params.id);

  const cvMatches = db.prepare(`
    SELECT m.id, m.score_pct, m.rating, m.label, m.provider, m.target_role, m.created_at,
           j.title as job_title
    FROM cv_matches m
    LEFT JOIN jobs j ON m.job_id = j.id
    WHERE m.candidate_id = ?
    ORDER BY m.created_at DESC LIMIT 10
  `).all(req.params.id);

  res.json({ candidate, applications, cvMatches });
});

// Shared CV processing helper
async function processCV(filePath, currentTitle, originalName = '') {
  let cvText = '';
  let aiScore = null;
  let aiSummary = null;

  try {
    cvText = await parseCV(filePath, originalName);
    if (cvText && cvText.trim().length > 30) {
      const detectedRole = detectRole(cvText);
      // Score against a generic JD if no specific job is linked
      const genericJd = `Professional role. ${currentTitle || 'Relevant professional experience required.'}`;
      const scored = scoreCandidate(cvText, genericJd, detectedRole);
      aiScore = scored.score_pct;
      aiSummary = `${scored.label} — ${scored.recommendation}`;
    }
  } catch (err) {
    console.error('CV parse error:', err.message);
  }

  return { cvText, aiScore, aiSummary };
}

// POST /api/candidates
router.post('/', upload.single('cv'), async (req, res) => {
  const { name, email, phone, location, market, current_title, current_company,
    experience_years, skills, linkedin_url, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Candidate name is required.' });

  let cvText = '';
  let aiScore = null;
  let aiSummary = null;
  let cvParsedAt = null;

  if (req.file) {
    const processed = await processCV(req.file.path, current_title, req.file.originalname);
    cvText = processed.cvText;
    aiScore = processed.aiScore;
    aiSummary = processed.aiSummary;
    if (cvText) cvParsedAt = new Date().toISOString();
  }

  const result = db.prepare(`
    INSERT INTO candidates
      (name, email, phone, location, market, current_title, current_company,
       experience_years, skills, linkedin_url, cv_filename, cv_path, cv_text, cv_parsed_at,
       ai_score, ai_summary, notes, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(
    name, email || null, phone || null, location || null,
    market || 'Global', current_title || null, current_company || null,
    experience_years ? Number(experience_years) : null,
    skills || null, linkedin_url || null,
    req.file ? req.file.originalname : null,
    req.file ? req.file.filename : null,
    cvText || null, cvParsedAt,
    aiScore, aiSummary, notes || null, req.user.id
  );

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(result.lastInsertRowid);

  db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)')
    .run('candidate_added', `New candidate: ${name}`, 'candidate', candidate.id, req.user.id);

  res.status(201).json({ candidate });
});

// PUT /api/candidates/:id
router.put('/:id', upload.single('cv'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Candidate not found.' });

  const { name, email, phone, location, market, current_title, current_company,
    experience_years, skills, linkedin_url, status, notes } = req.body;

  let cvText = existing.cv_text;
  let aiScore = existing.ai_score;
  let aiSummary = existing.ai_summary;
  let cvParsedAt = existing.cv_parsed_at;

  if (req.file) {
    const processed = await processCV(req.file.path, current_title || existing.current_title, req.file.originalname);
    if (processed.cvText) {
      cvText = processed.cvText;
      aiScore = processed.aiScore;
      aiSummary = processed.aiSummary;
      cvParsedAt = new Date().toISOString();
    }
  }

  db.prepare(`
    UPDATE candidates SET name=?, email=?, phone=?, location=?, market=?, current_title=?,
    current_company=?, experience_years=?, skills=?, linkedin_url=?, status=?, notes=?,
    cv_filename=?, cv_path=?, cv_text=?, cv_parsed_at=?, ai_score=?, ai_summary=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(
    name || existing.name, email ?? existing.email, phone ?? existing.phone,
    location ?? existing.location, market || existing.market,
    current_title ?? existing.current_title, current_company ?? existing.current_company,
    experience_years ? Number(experience_years) : existing.experience_years,
    skills ?? existing.skills, linkedin_url ?? existing.linkedin_url,
    status || existing.status, notes ?? existing.notes,
    req.file ? req.file.originalname : existing.cv_filename,
    req.file ? req.file.filename : existing.cv_path,
    cvText, cvParsedAt, aiScore, aiSummary,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  res.json({ candidate: updated });
});

// DELETE /api/candidates/:id
router.delete('/:id', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
  db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id);
  res.json({ message: 'Candidate deleted.' });
});

// PATCH /api/candidates/:id — partial update (status, notes, etc.)
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Candidate not found.' });

  const ALLOWED = [
    'name', 'email', 'phone', 'location', 'market', 'current_title', 'current_company',
    'experience_years', 'skills', 'linkedin_url', 'status', 'notes', 'pipeline_stage',
  ];
  const sets = [];
  const params = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No updatable fields provided.' });

  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  db.prepare(`UPDATE candidates SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  res.json({ candidate: updated });
});

// POST /api/candidates/bulk-status — bulk status update
router.post('/bulk-status', (req, res) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required.' });
  if (!status) return res.status(400).json({ error: 'status is required.' });
  const stmt = db.prepare('UPDATE candidates SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  const tx = db.transaction((rows) => { for (const id of rows) stmt.run(status, id); });
  tx(ids);
  res.json({ updated: ids.length });
});

// POST /api/candidates/bulk-delete — bulk delete
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required.' });
  const stmt = db.prepare('DELETE FROM candidates WHERE id=?');
  const tx = db.transaction((rows) => { for (const id of rows) stmt.run(id); });
  tx(ids);
  res.json({ deleted: ids.length });
});

// GET /api/candidates/:id/download-cv — gated resume download
router.get('/:id/download-cv', (req, res) => {
  const candidate = db.prepare('SELECT cv_path, cv_filename FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate || !candidate.cv_path) {
    return res.status(404).json({ error: 'Resume CV file not found for this candidate.' });
  }

  const fullPath = path.resolve(__dirname, '../../db/uploads', candidate.cv_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Physical CV file not found on disk.' });
  }

  res.download(fullPath, candidate.cv_filename || 'resume.pdf');
});

module.exports = router;
