const crypto = require('crypto');
const express = require('express');

const db = require('../db');
const { getDatasetItems } = require('../services/apifyScreener');
const { normalise } = require('../services/screenerUtils');

const router = express.Router();
const CALLBACK_HEADER = 'x-talentlenses-callback-secret';

function matchesSecret(secret, expectedHash) {
  if (!secret || !expectedHash) return false;
  const actualHash = crypto.createHash('sha256').update(secret).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

function processRun(runId, runStatus, callbackSecret) {
  const run = db.prepare('SELECT * FROM apify_screening_runs WHERE apify_run_id = ?').get(runId);
  if (!run || !matchesSecret(callbackSecret, run.callback_secret_hash) || run.processed_at) return;

  if (runStatus !== 'SUCCEEDED') {
    const message = `Apify screening run ended with status ${runStatus || 'unknown'}.`;
    db.transaction(() => {
      db.prepare(`
        UPDATE screenings SET status = 'failed', error_message = ?, summary = ?
        WHERE batch_id = ? AND status = 'pending'
      `).run(message, `Screening failed: ${message}`, run.batch_id);
      db.prepare(`
        UPDATE apify_screening_runs
        SET status = ?, error_message = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(runStatus || 'FAILED', message, run.id);
    })();
    return;
  }

  getDatasetItems(run.dataset_id)
    .then((items) => {
      const update = db.prepare(`
        UPDATE screenings
        SET candidate_name = ?, email = ?, phone = ?, current_role = ?, years_experience = ?,
            key_skills = ?, must_have_score = ?, nice_to_have_score = ?, title_match_score = ?, experience_score = ?,
            overall_score = ?, recommendation = ?, summary = ?, raw_json = ?,
            job_title = COALESCE(job_title, ?), status = 'completed', error_message = NULL
        WHERE id = ? AND batch_id = ? AND status = 'pending'
      `);
      const failed = db.prepare(`
        UPDATE screenings SET status = 'failed', error_message = ?, summary = ?
        WHERE id = ? AND batch_id = ? AND status = 'pending'
      `);

      db.transaction(() => {
        const returnedIds = new Set();
        for (const item of items) {
          const screeningId = Number(item.screeningId);
          if (!Number.isInteger(screeningId)) continue;
          returnedIds.add(screeningId);

          if (item.status === 'failed' || item.error) {
            const message = String(item.error || 'The screening Actor could not score this CV.');
            failed.run(message, `Screening failed: ${message}`, screeningId, run.batch_id);
            continue;
          }

          const result = normalise(item.result || item);
          update.run(
            result.name, result.email, result.phone, result.currentRole, result.yearsExperience,
            JSON.stringify(result.keySkills),
            result.supplyChainScore, result.procurementScore, result.logisticsScore, result.technologyScore,
            result.overallScore, result.recommendation, result.summary,
            JSON.stringify({ provider: 'apify-openrouter', ...result, actor: item.actor || null }),
            result.jobTitle || null, screeningId, run.batch_id
          );
        }

        const pendingRows = db.prepare('SELECT id FROM screenings WHERE batch_id = ? AND status = ?').all(run.batch_id, 'pending');
        for (const row of pendingRows) {
          const message = returnedIds.has(row.id)
            ? 'The screening Actor returned an invalid result.'
            : 'The screening Actor did not return a result for this CV.';
          failed.run(message, `Screening failed: ${message}`, row.id, run.batch_id);
        }

        db.prepare(`
          UPDATE apify_screening_runs
          SET status = 'SUCCEEDED', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND processed_at IS NULL
        `).run(run.id);
      })();
    })
    .catch((error) => {
      console.error('[apify webhook] result processing failed:', error.message);
      db.prepare(`
        UPDATE apify_screening_runs SET status = 'PROCESSING_ERROR', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, run.id);
    });
}

router.post('/webhook', (req, res) => {
  const runId = String(req.body?.runId || '').trim();
  const runStatus = String(req.body?.runStatus || '').trim();
  const callbackSecret = req.get(CALLBACK_HEADER);

  if (!runId || !callbackSecret) return res.status(401).json({ error: 'Invalid Apify webhook.' });
  const run = db.prepare('SELECT callback_secret_hash FROM apify_screening_runs WHERE apify_run_id = ?').get(runId);
  if (!run || !matchesSecret(callbackSecret, run.callback_secret_hash)) {
    return res.status(401).json({ error: 'Invalid Apify webhook.' });
  }
  res.status(202).json({ accepted: true });
  setImmediate(() => processRun(runId, runStatus, callbackSecret));
});

module.exports = router;