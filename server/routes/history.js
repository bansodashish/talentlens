/**
 * History Routes — /api/history/*
 *
 * Aggregates the user's past LinkedIn searches and Claude screening batches
 * for the CRM "History" page.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ── GET /api/history/searches ────────────────────────────────────────────────
router.get('/searches', (req, res) => {
  const rows = db.prepare(`
    SELECT id, job_title, location, market, experience_level,
           max_results, results_count, status, error_message, created_at
    FROM searches
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.user.id);
  res.json({ searches: rows });
});

// ── GET /api/history/screenings ──────────────────────────────────────────────
// Returns one row per batch with aggregate stats.
router.get('/screenings', (req, res) => {
  const rows = db.prepare(`
    SELECT batch_id,
           COUNT(*) as total,
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN recommendation='Strong Hire' THEN 1 ELSE 0 END) as strong_hire,
           SUM(CASE WHEN recommendation='Consider'    THEN 1 ELSE 0 END) as consider,
           SUM(CASE WHEN recommendation='Reject'      THEN 1 ELSE 0 END) as reject,
           MAX(overall_score) as top_score,
           AVG(overall_score) as avg_score,
           MAX(created_at) as created_at,
           SUBSTR(MAX(job_description), 1, 200) as job_description_preview
    FROM screenings
    WHERE created_by = ?
    GROUP BY batch_id
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.user.id);
  res.json({ batches: rows });
});

module.exports = router;
