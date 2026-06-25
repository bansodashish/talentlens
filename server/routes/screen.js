/**
 * AI Resume Screener Routes — /api/screen/*
 *
 * POST /api/screen/resume — multipart upload of one or more CVs + a JD.
 *   Each file is scored by Claude (claude-sonnet-4-20250514) and persisted
 *   to the `screenings` table. Results are returned ranked by overallScore.
 *
 * GET  /api/screen/history       — list past screening batches for this user
 * GET  /api/screen/batch/:batchId — full details of one batch
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { decrypt }        = require('../utils/encryption');
const { limitScreenings } = require('../middleware/planLimits');
const { parseCV }        = require('../services/cvParser');
const { screenResume, MODEL } = require('../services/claudeScreener');
const { screenResume: screenOpenClawLocal, MODEL: OPENCLAW_LOCAL_MODEL } = require('../services/openclawLocalScreener');
const { scoreCandidate, detectRole, ALL_ROLES } = require('../services/scorer');

// Quick regex-based extraction for local mode (Claude does this natively).
function extractContact(text) {
  const emailMatch = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  // Best-effort name = first non-email, non-phone line under 60 chars
  const name = lines.find(l =>
    l.length < 60 && !/@|\d{4,}|http/i.test(l) && /[A-Za-z]/.test(l)
  ) || '';
  return {
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    name,
  };
}

function extractYears(text) {
  const m = text.match(/(\d{1,2})\+?\s*years?(?:\s+of)?\s+experience/i);
  return m ? Number(m[1]) : 0;
}

// Convert local-scorer output into the same shape the UI / DB expects.
function toScreeningShape(scored, contact, role, text) {
  const recMap = { 5: 'Strong Hire', 4: 'Strong Hire', 3: 'Consider', 2: 'Reject', 1: 'Reject' };
  const overall = scored.score_pct;
  const skills  = Math.round((scored.details.skills || 0) * 100);
  const exp     = Math.round((scored.details.experience || 0) * 100);
  const location = Math.round((scored.details.location || 0) * 100);
  const title   = Math.round((scored.details.title || 0) * 100);

  // Pull matched JD skills as keySkills. Local mode no longer needs manual profile keywords.
  const keySkills = (scored.details.matchedSkills || [])
    .slice(0, 12);

  const roleTitle = role && ALL_ROLES[role] ? ALL_ROLES[role].title : '';
  const locationNote = scored.details.locationExplanation
    ? ` Location: ${scored.details.locationExplanation}.`
    : '';
  const gapNote = scored.gaps?.length
    ? ` Key gaps: ${scored.gaps.slice(0, 3).map(g => g.replace(/^Missing:\s*/i, '')).join(', ')}.`
    : '';
  const summary = `Local JD match — ${scored.label}. ${scored.recommendation}.${locationNote}${gapNote}`;

  return {
    name: contact.name || '',
    email: contact.email,
    phone: contact.phone,
    currentRole: roleTitle,
    yearsExperience: extractYears(text),
    keySkills,
    supplyChainScore: skills,
    procurementScore: exp,
    logisticsScore:   location,
    technologyScore:  title,
    overallScore:     overall,
    recommendation:   recMap[scored.rating] || 'Consider',
    summary,
  };
}

// Temp upload dir
const tmpDir = path.resolve(__dirname, '../../db/uploads/tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 15 * 1024 * 1024, files: 25 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.txt', '.docx', '.doc'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Unsupported file type. Use PDF, TXT, DOC or DOCX.'), ok);
  },
});

router.use(authMiddleware);

// ── Resilience helpers ────────────────────────────────────────────────────────
// Mark any rows still 'pending' in a batch as 'failed'. The background worker
// runs in-memory and is fire-and-forget, so without this a crashed/restarted
// worker would leave rows 'pending' forever and the UI poller would spin
// indefinitely. This guarantees every batch reaches a terminal state.
function failPendingInBatch(batchId, message) {
  try {
    db.prepare(`
      UPDATE screenings
      SET status = 'failed', error_message = ?, summary = ?
      WHERE batch_id = ? AND status = 'pending'
    `).run(message, `Screening failed: ${message}`, batchId);
  } catch (e) {
    console.error('[screen] failPendingInBatch error:', e.message);
  }
}

// On startup, recover screenings orphaned by a previous crash/restart/deploy.
// Their in-memory workers no longer exist, so they would never complete and
// their batches would spin forever in the UI. Resolve them immediately.
try {
  const recovered = db.prepare(`
    UPDATE screenings
    SET status = 'failed',
        error_message = 'Screening was interrupted by a server restart. Please run it again.',
        summary       = 'Screening was interrupted by a server restart. Please run it again.'
    WHERE status = 'pending'
  `).run();
  if (recovered.changes > 0) {
    console.log(`[screen] recovered ${recovered.changes} orphaned pending screening(s) from a previous restart`);
  }
} catch (e) {
  console.error('[screen] orphan recovery error:', e.message);
}

// Reject a promise if it does not settle within `ms`, so a single stuck file
// (e.g. a malformed PDF that makes the parser hang) fails that one file instead
// of freezing the whole batch.
function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Background Async Screener Worker ──────────────────────────────────────────
async function processScreeningsBackground({ batchId, mode, apiKey, jobDescription, inserted, userId }) {
  const updateStmt = db.prepare(`
    UPDATE screenings
    SET candidate_name = ?, email = ?, phone = ?, current_role = ?, years_experience = ?,
        key_skills = ?, must_have_score = ?, nice_to_have_score = ?, title_match_score = ?, experience_score = ?,
        overall_score = ?, recommendation = ?, summary = ?, resume_text = ?, raw_json = ?,
        status = 'completed', error_message = NULL
    WHERE id = ?
  `);

  const failStmt = db.prepare(`
    UPDATE screenings
    SET status = 'failed', error_message = ?, summary = ?
    WHERE id = ?
  `);

  for (const file of inserted) {
    const ext = path.extname(file.originalname).toLowerCase();
    let plainText = '';

    try {
      // Local mode always needs text extraction. AI mode sends PDFs natively.
      if (mode === 'local' || ext !== '.pdf') {
        plainText = await withTimeout(
          Promise.resolve().then(() => parseCV(file.path, file.originalname)),
          60_000,
          `Parsing ${file.originalname}`
        );
        if (!plainText || plainText.trim().length < 20) {
          throw new Error('Could not extract readable text from file.');
        }
      }

      let result, raw;
      if (mode === 'local') {
        const detectedRole = detectRole(plainText);
        const local = scoreCandidate(plainText, jobDescription, detectedRole);
        const contact = extractContact(plainText);
        result = toScreeningShape(local, contact, detectedRole, plainText);
        raw = { mode: 'local', detectedRole, ...local };
      } else if (mode === 'openclaw-local') {
        const out = await screenOpenClawLocal({
          jobDescription,
          filePath: file.path,
          plainText,
          fileName: file.originalname,
        });
        result = out.result;
        raw = { provider: 'openclaw-local', model: OPENCLAW_LOCAL_MODEL, ...out.raw };
      } else {
        const out = await screenResume({
          apiKey,
          jobDescription,
          filePath:  ext === '.pdf' ? file.path : null,
          plainText: ext === '.pdf' ? null : plainText,
          fileName:  file.originalname,
          mimeType:  file.mimetype,
        });
        result = out.result;
        raw    = out.raw;
      }

      updateStmt.run(
        result.name, result.email, result.phone, result.currentRole, result.yearsExperience,
        JSON.stringify(result.keySkills),
        result.supplyChainScore, result.procurementScore, result.logisticsScore, result.technologyScore,
        result.overallScore, result.recommendation, result.summary, plainText || null, JSON.stringify(raw),
        file.id
      );
    } catch (err) {
      console.error(`[background screen] ${file.originalname} failed:`, err.message);
      const rawMsg = err.response?.data?.error?.message || err.message || 'Unknown Claude error';
      const code   = err.response?.status;

      let error = rawMsg;
      if (mode === 'openclaw-local') {
        if (/ECONNREFUSED|connect ECONNREFUSED|timed out|timeout/i.test(rawMsg)) {
          error = 'Local OpenClaw service is unavailable. Check OPENCLAW_LOCAL_BASE_URL and ensure the model server is running.';
        }
      } else {
        if (code === 401 || /invalid.*api.?key|authentication/i.test(rawMsg)) {
          error = 'Invalid Claude API key. Save one under Profile → API Keys.';
        } else if (code === 429 || /rate.?limit/i.test(rawMsg)) {
          error = 'Claude rate-limit reached — please retry in a minute.';
        } else if (code === 402 || /credit|quota|insufficient/i.test(rawMsg)) {
          error = 'Your Anthropic account is out of credits. Top up at https://console.anthropic.com/settings/billing.';
        }
      }

      failStmt.run(error, `Screening failed: ${error}`, file.id);
    } finally {
      try { fs.unlinkSync(file.path); } catch (_) {}
    }
  }

  // Record activity after the entire batch is completed
  try {
    db.prepare(`
      INSERT INTO activities (type, description, entity_type, entity_id, user_id)
      VALUES ('resume_screened', ?, 'screening_batch', NULL, ?)
    `).run(`Screened ${inserted.length} resume(s) (${mode === 'local' ? 'local scan' : mode === 'openclaw-local' ? 'OpenClaw local' : 'Claude'})`, userId);
  } catch (_) {}
}

// ── POST /api/screen/resume ──────────────────────────────────────────────────
router.post('/resume', limitScreenings, upload.array('files', 25), async (req, res) => {
  const jobDescription = req.body.job_description || req.body.jobDescription || '';
  const requestedMode = String(req.body.mode || 'local').toLowerCase();
  const mode = ['local', 'ai', 'openclaw-local'].includes(requestedMode) ? requestedMode : 'local';
  const files = req.files || [];

  if (!jobDescription.trim()) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    return res.status(400).json({ error: 'job_description is required.' });
  }
  if (!files.length) {
    return res.status(400).json({ error: 'At least one resume file is required.' });
  }

  // ── Resolve API key only for AI mode ──
  let apiKey = null;
  if (mode === 'ai') {
    const userRow = db.prepare('SELECT claude_key_enc FROM users WHERE id = ?').get(req.user.id);
    apiKey = decrypt(userRow?.claude_key_enc)
      || process.env.CLAUDE_API_KEY
      || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(503).json({
        error: 'Claude API is not configured.',
        hint:  'Add CLAUDE_API_KEY to server/.env, save a personal key under Profile → Settings, or use Local Scan.',
      });
    }
  } else if (mode === 'openclaw-local') {
    if (!process.env.OPENCLAW_LOCAL_BASE_URL || !process.env.OPENCLAW_LOCAL_MODEL) {
      files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(503).json({
        error: 'Local OpenClaw mode is not configured.',
        hint: 'Set OPENCLAW_LOCAL_BASE_URL and OPENCLAW_LOCAL_MODEL in server/.env and restart the API.',
      });
    }
  }

  const batchId = crypto.randomBytes(8).toString('hex');
  const inserted = [];

  const insertStmt = db.prepare(`
    INSERT INTO screenings
      (batch_id, file_name, candidate_name, email, phone, current_role, years_experience,
       key_skills, must_have_score, nice_to_have_score, title_match_score, experience_score,
       overall_score, recommendation, summary, job_description, resume_text, raw_json,
       status, error_message, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Pre-insert all records with status = 'pending'
  for (const file of files) {
    const r = insertStmt.run(
      batchId, file.originalname,
      '', '', '', '', 0, '[]', 0, 0, 0, 0, 0,
      'Reject', 'Pending screening...', jobDescription, null, null,
      'pending', null, req.user.id
    );
    inserted.push({
      id: r.lastInsertRowid,
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype
    });
  }

  // Trigger background process. It runs independently, but if it rejects before
  // the per-file handlers run (e.g. a process-level error), mark any rows still
  // 'pending' as failed so the UI poller always reaches a terminal state instead
  // of spinning forever.
  processScreeningsBackground({
    batchId,
    mode,
    apiKey,
    jobDescription,
    inserted,
    userId: req.user.id
  }).catch((err) => {
    console.error('[screen] background batch crashed:', err?.message || err);
    failPendingInBatch(batchId, `Screening worker error: ${err?.message || 'unknown error'}`);
  });

  // Respond immediately with 202 Accepted and the batch information
  res.status(202).json({
    batchId,
    mode,
    model: mode === 'ai' ? MODEL : mode === 'openclaw-local' ? OPENCLAW_LOCAL_MODEL : 'local-scorer',
    count: files.length,
    status: 'processing',
    results: []
  });
});

// ── GET /api/screen/history ──────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const rows = db.prepare(`
    SELECT batch_id,
           COUNT(*) as total,
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
           MAX(overall_score) as top_score,
           MAX(created_at) as created_at,
           MAX(job_description) as job_description
    FROM screenings
    WHERE created_by = ?
    GROUP BY batch_id
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json({ batches: rows });
});

// ── GET /api/screen/batch/:batchId ───────────────────────────────────────────
router.get('/batch/:batchId', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM screenings
    WHERE batch_id = ? AND created_by = ?
    ORDER BY overall_score DESC
  `).all(req.params.batchId, req.user.id);
  if (!rows.length) return res.status(404).json({ error: 'Batch not found.' });

  const results = rows.map(r => ({
    id: r.id,
    fileName: r.file_name,
    name: r.candidate_name,
    email: r.email,
    phone: r.phone,
    currentRole: r.current_role,
    yearsExperience: r.years_experience,
    keySkills: r.key_skills ? JSON.parse(r.key_skills) : [],
    supplyChainScore: r.must_have_score,
    procurementScore: r.nice_to_have_score,
    logisticsScore:   r.title_match_score,
    technologyScore:  r.experience_score,
    overallScore:     r.overall_score,
    recommendation:   r.recommendation,
    summary:          r.summary,
    status:           r.status,
    error:            r.error_message,
    createdAt:        r.created_at,
  }));

  const total = results.length;
  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const pending = results.filter(r => r.status === 'pending').length;
  const batchStatus = pending > 0 ? 'processing' : 'completed';

  res.json({
    batchId:        req.params.batchId,
    jobDescription: rows[0].job_description,
    createdAt:      rows[0].created_at,
    status:         batchStatus,
    progress:       { total, completed, failed, pending },
    results,
  });
});

module.exports = router;
