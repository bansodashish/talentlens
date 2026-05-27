const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
};

// GET /api/users — list all users (admin only)
router.get('/', authMiddleware, adminOnly, (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id, u.name, u.email, u.role, u.company, u.market,
      u.created_at, u.updated_at,
      (u.apify_key_enc IS NOT NULL)  as has_apify_key,
      (u.claude_key_enc IS NOT NULL) as has_claude_key,
      (u.apollo_key_enc IS NOT NULL) as has_apollo_key,
      (SELECT COUNT(*) FROM candidates  WHERE created_by = u.id) as candidate_count,
      (SELECT COUNT(*) FROM jobs        WHERE created_by = u.id) as job_count,
      (SELECT COUNT(*) FROM cv_matches  WHERE created_by = u.id) as match_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

// GET /api/users/stats — platform-wide stats (admin only)
router.get('/stats', authMiddleware, adminOnly, (req, res) => {
  const stats = {
    total_users:      db.prepare('SELECT COUNT(*) as n FROM users').get().n,
    total_candidates: db.prepare('SELECT COUNT(*) as n FROM candidates').get().n,
    total_jobs:       db.prepare('SELECT COUNT(*) as n FROM jobs').get().n,
    total_matches:    db.prepare('SELECT COUNT(*) as n FROM cv_matches').get().n,
    total_sessions:   db.prepare('SELECT COUNT(*) as n FROM scraper_sessions').get().n,
  };
  res.json({ stats });
});

// PATCH /api/users/:id/role — promote/demote user (admin only)
router.patch('/:id/role', authMiddleware, adminOnly, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'recruiter', 'viewer'].includes(role))
    return res.status(400).json({ error: 'Invalid role.' });
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, req.params.id);
  res.json({ success: true });
});

// DELETE /api/users/:id — delete user (admin only, cannot delete self)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
