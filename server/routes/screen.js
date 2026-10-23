/**
 * AI Resume Screener Routes — /api/screen/*
 *
 * POST /api/screen/resume — multipart upload of one or more CVs + a JD.
 *   Each file is scored by the deterministic keyword scorer (`local`) or
 *   OpenAI (`openai`), then persisted
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
const { limitScreenings } = require('../middleware/planLimits');
const { parseCV }        = require('../services/cvParser');
const { scoreWithOpenAI } = require('../services/openaiScorer');
const { scoreCandidate, detectRole, ALL_ROLES, extractContact, extractYears } = require('../services/scorer');
const { extractJobTitle } = require('../utils/extractJobTitle');
const { resolveUploadsDir } = require('../utils/storagePaths');

// Hard ceiling for a single OpenAI Luna call, so a stalled request can't keep
// the whole batch (and the UI spinner) in `processing` forever.
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
const MAX_CV_FILES = 20;

function buildSummaryEvidence(assessment, recommendation) {
  const requirements = assessment?.requirements || [];
  const reasons = assessment?.reasons || [];
  const supportedRequirement = requirements.find(item => item.fit === 'strong' && item.evidenceSource === 'cv_excerpt' && item.evidence);
  const supportedReason = reasons.find(item => item.evidenceSource === 'cv_excerpt' && item.evidence);
  const evidence = supportedRequirement || supportedReason;

  if (!evidence) {
    return {
      decision: `${recommendation || 'Review needed'} based on the available assessment.`,
      requirement: '',
      quote: '',
      source: 'no_cv_evidence',
    };
  }

  return {
    decision: `${recommendation || 'Review needed'} based on the candidate's demonstrated match for ${supportedRequirement ? supportedRequirement.requirement : supportedReason.claim.replace(/^Demonstrates\s+/i, '')}.`,
    requirement: supportedRequirement?.requirement || supportedReason.claim.replace(/^Demonstrates\s+/i, ''),
    quote: evidence.evidence,
    source: 'cv_excerpt',
  };
}

function getRecommendationForScore(score) {
  if (score >= 80) return 'Strong Hire';
  if (score >= 60) return 'Consider';
  return 'Reject';
}

function getQuantitativeAnalysis(requirements, roleFit, experience) {
  const components = [
    { score: requirements, maximum: 60 },
    { score: roleFit, maximum: 20 },
    { score: experience, maximum: 20 },
  ];

  if (!components.every(({ score }) => Number.isFinite(score))) return null;

  const total = components.reduce(
    (sum, { score, maximum }) => sum + Math.round((Math.max(0, Math.min(100, score)) / 100) * maximum),
    0
  );
  return { total, recommendation: getRecommendationForScore(total) };
}

function composeHRSummary({ summary, strengths, gaps, assessment, jobTitle }) {
  const cleanItem = value => String(value || '')
    .replace(/^(?:Matched|Missing):\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const uniqueItems = values => [...new Set(values.map(cleanItem).filter(Boolean))].slice(0, 3);
  const supportedStrengths = uniqueItems([
    ...(strengths || []),
    ...(assessment?.reasons || []).map(item => item.claim),
  ]);
  const clarificationAreas = uniqueItems([
    ...(gaps || []),
    ...(assessment?.requirements || [])
      .filter(item => item.fit === 'partial' || item.fit === 'not_met')
      .map(item => item.requirement),
  ]);
  const cleanedSummary = String(summary || '')
    .replace(/^Quantitative screening\s*-\s*(?:Strong Hire|Consider|Reject)\s*\(\s*\d+\s*\/\s*100\s*\)\.\s*/i, '')
    .replace(/^Key skill gaps?:\s*/i, '')
    .replace(/\b(?:Strong Hire|Consider|Reject)\s*\(\s*\d+\s*\/\s*100\s*\)\.?\s*/gi, '')
    .trim();
  const role = jobTitle ? ` for the ${jobTitle} role` : '';
  const overview = cleanedSummary && !/^analysis incomplete|^review needed/i.test(cleanedSummary)
    ? cleanedSummary
    : `The CV shows evidence relevant${role}.`;
  const strengthSentence = supportedStrengths.length
    ? ` Demonstrated strengths include ${supportedStrengths.join(', ')}.`
    : '';
  const clarificationSentence = clarificationAreas.length
    ? ` Areas to clarify include ${clarificationAreas.join(', ')}.`
    : ' Further discussion should confirm the depth of experience against the role requirements.';

  return `${overview}${strengthSentence}${clarificationSentence}`.replace(/\s+/g, ' ').trim();
}

// Convert local-scorer output into the same shape the UI / DB expects.
function toScreeningShape(scored, contact, role, text, jobDescription) {
  const skills  = Math.round((scored.details.skills || 0) * 100);
  const title = Number.isFinite(scored.details.title)
    ? Math.round(scored.details.title * 100)
    : null;
  const experience = Number.isFinite(scored.details.experience)
    ? Math.round(scored.details.experience * 100)
    : null;
  const quantitativeAnalysis = getQuantitativeAnalysis(skills, title, experience);
  const overall = quantitativeAnalysis?.total ?? null;
  const recommendation = quantitativeAnalysis?.recommendation || 'Review needed';

  // Pull matched JD skills as keySkills. Local mode no longer needs manual profile keywords.
  const keySkills = (scored.details.matchedSkills || [])
    .slice(0, 12);

  const roleTitle = role && ALL_ROLES[role] ? ALL_ROLES[role].title : '';
  
  const assessment = scored.assessment || { requirements: [], reasons: [], useCases: [], interviewQuestions: [] };
  const summary = composeHRSummary({
    summary: scored.summary,
    strengths: scored.strengths || keySkills,
    gaps: scored.gaps,
    assessment,
    jobTitle: extractJobTitle(jobDescription),
  });

  return {
    name: contact.name || '',
    email: contact.email,
    phone: contact.phone,
    currentRole: roleTitle,
    jobTitle: extractJobTitle(jobDescription),
    yearsExperience: extractYears(text),
    keySkills,
    supplyChainScore: skills,
    procurementScore: null,
    logisticsScore: title,
    technologyScore: experience,
    overallScore: overall,
    recommendation,
    summary,
    assessment,
    summaryEvidence: buildSummaryEvidence(assessment, recommendation),
  };
}

// Temp upload dir
const tmpDir = path.resolve(resolveUploadsDir(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_CV_FILES },
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
async function processScreeningsBackground({ batchId, mode, jobDescription, jobTitle, inserted, userId }) {
  const updateStmt = db.prepare(`
    UPDATE screenings
    SET candidate_name = ?, email = ?, phone = ?, current_role = ?, years_experience = ?,
        key_skills = ?, must_have_score = ?, nice_to_have_score = ?, title_match_score = ?, experience_score = ?,
        overall_score = ?, recommendation = ?, summary = ?, resume_text = ?, raw_json = ?,
        job_title = COALESCE(job_title, ?),
        status = 'completed', error_message = NULL
    WHERE id = ?
  `);

  const failStmt = db.prepare(`
    UPDATE screenings
    SET status = 'failed', error_message = ?, summary = ?
    WHERE id = ?
  `);

  // Process each file from its extracted plain text.
  const processFile = async (file) => {
    let plainText = '';

    try {
      plainText = await withTimeout(
        Promise.resolve().then(() => parseCV(file.path, file.originalname)),
        60_000,
        `Parsing ${file.originalname}`
      );
      if (!plainText || plainText.trim().length < 20) {
        throw new Error('Could not extract readable text from file.');
      }

      let result, raw;
      if (mode === 'local') {
        const detectedRole = detectRole(jobDescription) || detectRole(plainText);
        const local = scoreCandidate(plainText, jobDescription, detectedRole);
        const contact = extractContact(plainText);
        result = toScreeningShape(local, contact, detectedRole, plainText, jobDescription);
        raw = { mode: 'local', detectedRole, ...local };
      } else if (mode === 'openai') {
        const contact = extractContact(plainText);
        try {
          const detectedRole = detectRole(jobDescription) || detectRole(plainText);
          const scored = await withTimeout(
            scoreWithOpenAI(plainText, jobDescription, detectedRole),
            OPENAI_TIMEOUT_MS,
            `OpenAI Luna scoring of ${file.originalname}`
          );
          result = toScreeningShape(scored, contact, detectedRole, plainText, jobDescription);
          raw = { provider: 'openai', model: process.env.OPENAI_MODEL || 'gpt-6-luna', ...scored };
        } catch (err) {
          if (err.code !== 'OPENAI_INVALID_RESPONSE') throw err;
          const detectedRole = detectRole(jobDescription) || detectRole(plainText);
          const local = scoreCandidate(plainText, jobDescription, detectedRole);
          result = toScreeningShape(local, contact, detectedRole, plainText, jobDescription);
          raw = { mode: 'local', fallbackFrom: 'openai_invalid_response', detectedRole, ...local };
          console.warn(`[background screen] ${file.originalname}: OpenAI returned invalid JSON; used local scoring fallback`);
        }
      }

      updateStmt.run(
        result.name, result.email, result.phone, result.currentRole, result.yearsExperience,
        JSON.stringify(result.keySkills),
        result.supplyChainScore, result.procurementScore, result.logisticsScore, result.technologyScore,
        result.overallScore, result.recommendation, result.summary, plainText || null, JSON.stringify(raw),
        result.jobTitle || null,
        file.id
      );
    } catch (err) {
      console.error(`[background screen] ${file.originalname} failed:`, err.message);
      const rawMsg = err.response?.data?.error?.message || err.message || 'Unknown error';

      let error = rawMsg;
      if (mode === 'openai' && /401|incorrect api key|invalid api key|authentication/i.test(rawMsg)) {
        error = 'OpenAI authentication failed. Check OPENAI_API_KEY in server/.env and restart the API.';
      } else if (mode === 'openai' && /timed out|timeout|ECONNRESET|ETIMEDOUT/i.test(rawMsg)) {
        error = `OpenAI Luna did not respond within ${OPENAI_TIMEOUT_MS / 1000}s. Check OPENAI_MODEL and network access, or retry with fewer files.`;
      }

      failStmt.run(error, `Screening failed: ${error}`, file.id);
    } finally {
      try { fs.unlinkSync(file.path); } catch (_) {}
    }
  };

  // Sequential processing for all modes — SQLite (better-sqlite3) does not
  // support concurrent writes; parallel processing causes SQLITE_BUSY errors.
  for (const file of inserted) {
    await processFile(file);
  }

  // Record activity after the entire batch is completed
  try {
    db.prepare(`
      INSERT INTO activities (type, description, entity_type, entity_id, user_id)
      VALUES ('resume_screened', ?, 'screening_batch', NULL, ?)
    `).run(`Screened ${inserted.length} resume(s) (${mode === 'local' ? 'local scan' : 'OpenClaw local'})`, userId);
  } catch (_) {}

  // Find-or-create a Job entry for this job title so it shows up in the Jobs tab.
  // Re-screening the same title (case/whitespace-insensitive) reuses the
  // existing job row instead of creating a duplicate.
  if (jobTitle && jobTitle.trim()) {
    try {
      const existing = db.prepare(
        `SELECT id FROM jobs WHERE created_by = ? AND lower(trim(title)) = lower(trim(?))`
      ).get(userId, jobTitle);
      if (existing) {
        db.prepare('UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
      } else {
        db.prepare(`
          INSERT INTO jobs (title, location, market, status, created_by)
          VALUES (?, ?, ?, 'active', ?)
        `).run(jobTitle.trim(), 'Not specified', 'Global', userId);
      }
    } catch (e) {
      console.error('[screen] find-or-create job error:', e.message);
    }
  }
}

// ── POST /api/screen/resume ──────────────────────────────────────────────────
router.post('/resume', limitScreenings, upload.array('files', MAX_CV_FILES), async (req, res) => {
  const jobDescription = req.body.job_description || req.body.jobDescription || '';
  const jobTitleInput = String(req.body.job_title || req.body.jobTitle || '').trim();
  const requestedMode = String(req.body.mode || 'local').toLowerCase();
  const mode = ['local', 'openai'].includes(requestedMode) ? requestedMode : 'local';
  const files = req.files || [];

  if (!jobDescription.trim()) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    return res.status(400).json({ error: 'job_description is required.' });
  }
  if (!jobTitleInput) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    return res.status(400).json({ error: 'job_title is required.' });
  }
  if (!files.length) {
    return res.status(400).json({ error: 'At least one resume file is required.' });
  }

  if (mode === 'openai' && !process.env.OPENAI_API_KEY) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    return res.status(503).json({
      error: 'OpenAI Luna mode is not configured.',
      hint: 'Set OPENAI_API_KEY and OPENAI_MODEL=gpt-6-luna in server/.env, then restart the API.',
    });
  }

  const batchId = crypto.randomBytes(8).toString('hex');
  const inserted = [];

  const insertStmt = db.prepare(`
    INSERT INTO screenings
      (batch_id, file_name, candidate_name, email, phone, current_role, years_experience,
       key_skills, must_have_score, nice_to_have_score, title_match_score, experience_score,
       overall_score, recommendation, summary, job_description, resume_text, raw_json,
       status, error_message, created_by, job_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Every candidate in this batch is screened against the same JD. The
  // recruiter-entered job title is the guaranteed-accurate source of truth;
  // heuristic extraction from the JD text is only a defensive fallback (it
  // should never trigger now that job_title is a required field).
  const batchJobTitle = jobTitleInput || extractJobTitle(jobDescription);

  // Pre-insert all records with status = 'pending'
  for (const file of files) {
    const r = insertStmt.run(
      batchId, file.originalname,
      '', '', '', '', 0, '[]', 0, 0, 0, 0, 0,
      'Reject', 'Pending screening...', jobDescription, null, null,
      'pending', null, req.user.id, batchJobTitle || null
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
    jobDescription,
    jobTitle: batchJobTitle,
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
    model: mode === 'openclaw-local'
      ? OPENCLAW_LOCAL_MODEL
      : mode === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-6-luna')
        : 'local-scorer',
    count: files.length,
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
// Shapes a raw `screenings` row into the object the UI expects, parsing the
// stored key_skills/raw_json fields and deriving strengths/gaps fallbacks.
// Shared by the single-batch view and the day-grouped Today/History views.
function shapeScreeningRow(r) {
  let strengths = [];
  let gaps = [];
  let assessment = null;
  const keySkillsParsed = r.key_skills ? JSON.parse(r.key_skills) : [];

  if (r.raw_json) {
    try {
      const raw = JSON.parse(r.raw_json);
      strengths = (raw.strengths || []).map(s => s.replace(/^Matched:\s*/i, ''));
      gaps = (raw.gaps || []).map(g => g.replace(/^Missing:\s*/i, ''));
      assessment = raw.assessment || null;
    } catch (_) {}
  }

  // Fallback for openclaw-local / AI records: derive strengths from key_skills
  if (strengths.length === 0 && keySkillsParsed.length > 0) {
    strengths = keySkillsParsed;
  }

  // Fallback: parse gaps from summary text ("Key gaps: X, Y, Z")
  if (gaps.length === 0 && r.summary) {
    const gapMatch = r.summary.match(/Key gaps?:\s*([^.]+)/i);
    if (gapMatch) {
      gaps = gapMatch[1].split(',').map(g => g.trim()).filter(Boolean);
    }
  }

  if (!assessment) {
    assessment = {
      requirements: [...strengths.slice(0, 4).map(skill => ({ requirement: skill, fit: 'strong', evidence: `Matched skill: ${skill}.`, evidenceSource: 'generated_fallback' })), ...gaps.slice(0, 4).map(skill => ({ requirement: skill, fit: 'not_met', evidence: `Gap identified: ${skill}.`, evidenceSource: 'generated_fallback' }))],
      reasons: strengths.slice(0, 4).map(skill => ({ claim: skill, evidence: 'Identified from the candidate CV.', evidenceSource: 'generated_fallback' })),
      useCases: strengths.slice(0, 3).map(skill => ({ capability: skill, useCase: `Apply this capability in the ${r.job_title || 'target'} role.` })),
      interviewQuestions: gaps.slice(0, 4).map(gap => ({ question: `What experience do you have with ${gap}?`, gap })),
    };
  }

  const matchBreakdown = {
    jobRequirements: r.must_have_score ?? null,
    preferredSkills: r.nice_to_have_score ?? null,
    roleMatch: r.title_match_score ?? null,
    experience: r.experience_score ?? null,
  };
  const quantitativeAnalysis = getQuantitativeAnalysis(
    matchBreakdown.jobRequirements,
    matchBreakdown.roleMatch,
    matchBreakdown.experience
  );
  const recommendation = quantitativeAnalysis?.recommendation || 'Review needed';

  return {
    id: r.id,
    fileName: r.file_name,
    name: r.candidate_name,
    email: r.email,
    phone: r.phone,
    currentRole: r.current_role,
    jobTitle: r.job_title,
    yearsExperience: r.years_experience,
    keySkills: keySkillsParsed,
    supplyChainScore: r.must_have_score,
    procurementScore: r.nice_to_have_score,
    logisticsScore:   r.title_match_score,
    technologyScore:  r.experience_score,
    overallScore:     quantitativeAnalysis?.total ?? null,
    matchBreakdown,
    recommendation,
    summary:          composeHRSummary({
      summary: r.summary,
      strengths,
      gaps,
      assessment,
      jobTitle: r.job_title,
    }),
    strengths,
    gaps,
    assessment,
    summaryEvidence: buildSummaryEvidence(assessment, recommendation),
    reviewDecision: r.review_decision || null,
    reviewedAt: r.reviewed_at || null,
    status:           r.status,
    error:            r.error_message,
    createdAt:        r.created_at,
    jobDescription:   r.job_description,
  };
}

router.get('/batch/:batchId', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM screenings
    WHERE batch_id = ? AND created_by = ?
    ORDER BY overall_score DESC
  `).all(req.params.batchId, req.user.id);
  if (!rows.length) return res.status(404).json({ error: 'Batch not found.' });

  const results = rows.map((row, index) => ({
    ...shapeScreeningRow(row),
    rank: index + 1,
    totalCandidates: rows.length,
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

// ── GET /api/screen/jobs ──────────────────────────────────────────────────────
// Distinct job titles that have ever been screened, for the "Select Job" filter.
router.get('/jobs', (req, res) => {
  const rows = db.prepare(`
    SELECT MIN(job_title) as job_title, COUNT(*) as candidate_count
    FROM screenings
    WHERE created_by = ? AND status = 'completed'
      AND job_title IS NOT NULL AND trim(job_title) <> ''
    GROUP BY lower(trim(job_title))
    ORDER BY MAX(created_at) DESC
  `).all(req.user.id);
  res.json({ jobs: rows.map(r => ({ jobTitle: r.job_title, candidateCount: r.candidate_count })) });
});

// ── GET /api/screen/screening/:id ────────────────────────────────────────────
// Full detail for a single screening record — recommendation, summary,
// strengths, gaps — used by the "View Results" expand in the Screenings tab.
router.get('/screening/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM screenings WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Screening not found.' });
  const batchRows = db.prepare(`
    SELECT id FROM screenings
    WHERE batch_id = ? AND created_by = ?
    ORDER BY overall_score DESC
  `).all(row.batch_id, req.user.id);
  const rank = batchRows.findIndex(batchRow => batchRow.id === row.id) + 1;

  res.json({
    screening: {
      ...shapeScreeningRow(row),
      rank: rank || null,
      totalCandidates: batchRows.length || null,
    },
  });
});

router.patch('/screening/:id/decision', (req, res) => {
  const decision = String(req.body?.decision || '').toLowerCase();
  if (!['shortlisted', 'hold', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be shortlisted, hold, or rejected.' });
  }

  const screening = db.prepare('SELECT * FROM screenings WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!screening) return res.status(404).json({ error: 'Screening not found.' });

  let candidateId = null;
  db.transaction(() => {
    if (decision === 'shortlisted') {
      const existing = screening.email
        ? db.prepare('SELECT id FROM candidates WHERE created_by = ? AND lower(trim(email)) = lower(trim(?))').get(req.user.id, screening.email)
        : db.prepare('SELECT id FROM candidates WHERE created_by = ? AND lower(trim(name)) = lower(trim(?))').get(req.user.id, screening.candidate_name);
      if (existing) {
        candidateId = existing.id;
        db.prepare('UPDATE candidates SET pipeline_stage = ?, job_title = COALESCE(job_title, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('shortlisted', screening.job_title, candidateId);
      } else {
        const created = db.prepare(`
          INSERT INTO candidates (name, email, phone, current_title, source, job_title, pipeline_stage, created_by)
          VALUES (?, ?, ?, ?, 'resume_upload', ?, 'shortlisted', ?)
        `).run(screening.candidate_name || 'Unnamed candidate', screening.email, screening.phone, screening.current_role, screening.job_title, req.user.id);
        candidateId = created.lastInsertRowid;
      }
    }
    db.prepare('UPDATE screenings SET review_decision = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?').run(decision, screening.id);
  })();

  const row = db.prepare('SELECT * FROM screenings WHERE id = ?').get(screening.id);
  res.json({ screening: shapeScreeningRow(row), candidateId });
});

// ── GET /api/screen/candidates ────────────────────────────────────────────────
// Flat, filterable list of every screened candidate (across all batches/days),
// used by the Screening History tab. Supports filtering by job title, a free-text
// search (name/email), and pipeline status (joined against the candidates table
// by email so we can tell "In Pipeline" apart from plain "Screened").
router.get('/candidates', (req, res) => {
  const jobTitle = String(req.query.jobTitle || '').trim();
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all').trim().toLowerCase();

  const clauses = ["s.created_by = ?", "s.status = 'completed'"];
  const params = [req.user.id];

  if (jobTitle) {
    clauses.push('lower(trim(s.job_title)) = lower(trim(?))');
    params.push(jobTitle);
  }
  if (q) {
    clauses.push('(s.candidate_name LIKE ? OR s.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const rows = db.prepare(`
    SELECT
      s.id, s.batch_id, s.candidate_name, s.email, s.job_title,
      s.must_have_score, s.title_match_score, s.experience_score, s.created_at,
      c.id as candidate_id, c.pipeline_stage
    FROM screenings s
    LEFT JOIN candidates c
      ON c.created_by = s.created_by AND (
        (s.email IS NOT NULL AND trim(s.email) <> '' AND lower(trim(c.email)) = lower(trim(s.email)))
        OR ((s.email IS NULL OR trim(s.email) = '') AND lower(trim(c.name)) = lower(trim(s.candidate_name)))
      )
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.created_at DESC
  `).all(...params);

  let candidates = rows.map(r => {
    const quantitativeAnalysis = getQuantitativeAnalysis(
      r.must_have_score,
      r.title_match_score,
      r.experience_score
    );
    return {
      id: r.id,
      batchId: r.batch_id,
      name: r.candidate_name || '—',
      email: r.email || null,
      jobTitle: r.job_title || '—',
      matchScore: quantitativeAnalysis?.total ?? null,
      recommendation: quantitativeAnalysis?.recommendation || 'Review needed',
      status: r.pipeline_stage ? 'In Pipeline' : 'Screened',
      candidateId: r.candidate_id || null,
      screenedOn: r.created_at,
    };
  });

  // Deduplicate: keep only the latest screening per candidate+job combination.
  // Guards against the same CV being uploaded and screened multiple times.
  const seen = new Map();
  for (const c of candidates) {
    const key = `${(c.email || c.name).toLowerCase().trim()}|||${c.jobTitle.toLowerCase().trim()}`;
    if (!seen.has(key) || c.screenedOn > seen.get(key).screenedOn) {
      seen.set(key, c);
    }
  }
  candidates = [...seen.values()].sort((a, b) => b.screenedOn.localeCompare(a.screenedOn));

  if (status === 'in pipeline' || status === 'pipeline') {
    candidates = candidates.filter(c => c.status === 'In Pipeline');
  } else if (status === 'screened') {
    candidates = candidates.filter(c => c.status === 'Screened');
  }

  res.json({ candidates });
});

// ── GET /api/screen/daily-lists ──────────────────────────────────────────────
// Groups every completed screening by the calendar day it ran on, giving each
// day its own persistent candidate list. Screenings are never deleted, so
// every day's list stays intact as new days are added.
router.get('/daily-lists', (req, res) => {
  const rows = db.prepare(`
    SELECT DATE(created_at) as list_date,
           COUNT(*) as candidate_count,
           COUNT(DISTINCT batch_id) as batch_count
    FROM screenings
    WHERE created_by = ? AND status = 'completed'
    GROUP BY DATE(created_at)
    ORDER BY list_date DESC
  `).all(req.user.id);

  const lists = rows.map(r => ({
    listDate: r.list_date,
    candidateCount: r.candidate_count,
    batchCount: r.batch_count,
  }));

  res.json({ lists });
});

// ── GET /api/screen/daily-lists/:date ────────────────────────────────────────
// Returns every candidate screened on a specific day (YYYY-MM-DD), each with
// the JD match scores computed at screening time.
router.get('/daily-lists/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
  }
  const rows = db.prepare(`
    SELECT * FROM screenings
    WHERE created_by = ? AND status = 'completed' AND DATE(created_at) = ?
    ORDER BY overall_score DESC
  `).all(req.user.id, date);

  res.json({ listDate: date, candidates: rows.map(shapeScreeningRow) });
});

module.exports = router;
