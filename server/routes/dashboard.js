const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  const totalCandidates = db.prepare('SELECT COUNT(*) as count FROM candidates').get().count;
  const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE status = ?').get('active').count;
  const totalApplications = db.prepare('SELECT COUNT(*) as count FROM applications').get().count;
  const hiredCount = db.prepare('SELECT COUNT(*) as count FROM applications WHERE status = ?').get('hired').count;

  const ukCandidates = db.prepare('SELECT COUNT(*) as count FROM candidates WHERE market = ?').get('UK').count;
  const dubaiCandidates = db.prepare('SELECT COUNT(*) as count FROM candidates WHERE market = ?').get('Dubai').count;

  const ukJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE (market = ? OR market = ?) AND status = ?').get('UK', 'Both', 'active').count;
  const dubaiJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE (market = ? OR market = ?) AND status = ?').get('Dubai', 'Both', 'active').count;

  const avgScore = db.prepare('SELECT AVG(ai_score) as avg FROM candidates WHERE ai_score IS NOT NULL').get().avg;

  const stageBreakdown = db.prepare(`
    SELECT stage, COUNT(*) as count FROM applications GROUP BY stage
  `).all();

  const recentActivities = db.prepare(`
    SELECT a.*, u.name as user_name FROM activities a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC LIMIT 10
  `).all();

  const topCandidates = db.prepare(`
    SELECT id, name, current_title, market, ai_score, status FROM candidates
    ORDER BY ai_score DESC LIMIT 5
  `).all();

  res.json({
    stats: {
      totalCandidates,
      totalJobs,
      totalApplications,
      hiredCount,
      ukCandidates,
      dubaiCandidates,
      ukJobs,
      dubaiJobs,
      avgAiScore: avgScore ? Math.round(avgScore) : 0
    },
    stageBreakdown,
    recentActivities,
    topCandidates
  });
});

// ── GET /api/dashboard/analytics ─────────────────────────────────────────────
// New TalentLens dashboard data — scoped to the current user.
router.get('/analytics', (req, res) => {
  const uid = req.user.id;

  // Start of current month (UTC, ISO)
  const now   = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  // ── Top-row stats ─────────────────────────────────────────────────────────
  const totalThisMonth = db.prepare(`
    SELECT COUNT(*) as n FROM candidates
    WHERE created_by = ? AND created_at >= ?
  `).get(uid, monthStart).n;

  const emailFoundThisMonth = db.prepare(`
    SELECT COUNT(*) as n FROM candidates
    WHERE created_by = ? AND created_at >= ?
      AND email IS NOT NULL AND TRIM(email) <> ''
  `).get(uid, monthStart).n;

  const screenedThisMonth = db.prepare(`
    SELECT COUNT(*) as n FROM screenings
    WHERE created_by = ? AND created_at >= ?
  `).get(uid, monthStart).n;

  const strongHireCount = db.prepare(`
    SELECT COUNT(*) as n FROM screenings
    WHERE created_by = ? AND recommendation = 'Strong Hire'
  `).get(uid).n;

  const emailFoundPct = totalThisMonth ? Math.round((emailFoundThisMonth / totalThisMonth) * 100) : 0;

  // ── Sourced by week — last 4 weeks ────────────────────────────────────────
  // Build 4 buckets, each 7 days ending today.
  const weeklySourced = [];
  for (let i = 3; i >= 0; i--) {
    const end   = new Date(now.getTime() - i * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const n = db.prepare(`
      SELECT COUNT(*) as n FROM candidates
      WHERE created_by = ? AND created_at >= ? AND created_at < ?
    `).get(uid, start.toISOString(), end.toISOString()).n;
    weeklySourced.push({
      week:  `${start.getUTCMonth() + 1}/${start.getUTCDate()}`,
      count: n,
    });
  }

  // ── Pie: candidates by market ─────────────────────────────────────────────
  const byMarket = db.prepare(`
    SELECT COALESCE(NULLIF(market, ''), 'Unknown') as market, COUNT(*) as count
    FROM candidates WHERE created_by = ?
    GROUP BY market
  `).all(uid);

  // ── Active vacancies for screening ────────────────────────────────────────
  // Primary source: active jobs table. Enriched with screening usage counts
  // by matching on normalized job title.
  const activeJobs = db.prepare(`
    SELECT
      j.id as job_id,
      j.title as job_title,
      j.location,
      j.market,
      j.status,
      j.created_at,
      j.updated_at,
      COALESCE(s.screened_candidates, 0) as screened_candidates,
      COALESCE(s.screening_batches, 0) as screening_batches,
      s.last_screened_at
    FROM jobs j
    LEFT JOIN (
      SELECT
        lower(trim(job_title)) as title_key,
        COUNT(*) as screened_candidates,
        COUNT(DISTINCT batch_id) as screening_batches,
        MAX(created_at) as last_screened_at
      FROM screenings
      WHERE created_by = ?
        AND job_title IS NOT NULL
        AND trim(job_title) <> ''
      GROUP BY lower(trim(job_title))
    ) s ON lower(trim(j.title)) = s.title_key
    WHERE j.created_by = ?
      AND j.status = 'active'
    ORDER BY COALESCE(s.last_screened_at, j.updated_at, j.created_at) DESC, j.id DESC
    LIMIT 10
  `).all(uid, uid);

  // Secondary source: screening titles not yet present in active jobs.
  const screeningOnlyVacancies = db.prepare(`
    SELECT
      MIN(job_title) as job_title,
      COUNT(*) as screened_candidates,
      COUNT(DISTINCT batch_id) as screening_batches,
      MAX(created_at) as last_screened_at
    FROM screenings
    WHERE created_by = ?
      AND job_title IS NOT NULL
      AND trim(job_title) <> ''
      AND lower(trim(job_title)) NOT IN (
        SELECT lower(trim(title))
        FROM jobs
        WHERE created_by = ? AND status = 'active'
      )
    GROUP BY lower(trim(job_title))
    ORDER BY last_screened_at DESC
    LIMIT 10
  `).all(uid, uid);

  const activeVacancies = [
    ...activeJobs.map((j) => ({
      id: `job-${j.job_id}`,
      title: j.job_title,
      location: j.location || '—',
      market: j.market || '—',
      status: j.status,
      screenedCandidates: j.screened_candidates || 0,
      screeningBatches: j.screening_batches || 0,
      lastScreenedAt: j.last_screened_at || null,
      source: 'jobs',
    })),
    ...screeningOnlyVacancies.map((s) => ({
      id: `screening-${String(s.job_title || '').toLowerCase().replace(/\s+/g, '-')}`,
      title: s.job_title,
      location: 'From Screening',
      market: '—',
      status: 'active',
      screenedCandidates: s.screened_candidates || 0,
      screeningBatches: s.screening_batches || 0,
      lastScreenedAt: s.last_screened_at || null,
      source: 'screening',
    })),
  ]
    .sort((a, b) => {
      const aT = a.lastScreenedAt ? Date.parse(a.lastScreenedAt) : 0;
      const bT = b.lastScreenedAt ? Date.parse(b.lastScreenedAt) : 0;
      return bT - aT;
    })
    .slice(0, 10);

  // ── Recommendation breakdown ──────────────────────────────────────────────
  const recRows = db.prepare(`
    SELECT recommendation, COUNT(*) as count FROM screenings
    WHERE created_by = ? AND recommendation IS NOT NULL
    GROUP BY recommendation
  `).all(uid);
  const recMap = Object.fromEntries(recRows.map(r => [r.recommendation, r.count]));
  const recommendations = ['Strong Hire', 'Consider', 'Reject'].map(label => ({
    label, count: recMap[label] || 0,
  }));

  // ── Line: avg screening score by week (last 8 weeks) ─────────────────────
  const scoreTrend = [];
  for (let i = 7; i >= 0; i--) {
    const end   = new Date(now.getTime() - i * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const row = db.prepare(`
      SELECT AVG(overall_score) as avg FROM screenings
      WHERE created_by = ? AND created_at >= ? AND created_at < ?
        AND overall_score IS NOT NULL
    `).get(uid, start.toISOString(), end.toISOString());
    scoreTrend.push({
      week: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`,
      avg:  row.avg ? Math.round(row.avg) : 0,
    });
  }

  // ── Recent activity feeds ─────────────────────────────────────────────────
  const recentSearches = db.prepare(`
    SELECT id, job_title, location, market, results_count, status, created_at
    FROM searches WHERE created_by = ?
    ORDER BY created_at DESC LIMIT 5
  `).all(uid);

  const recentScreenings = db.prepare(`
    SELECT batch_id,
           COUNT(*) as total,
           MAX(created_at) as created_at,
           MAX(overall_score) as top_score
    FROM screenings
    WHERE created_by = ?
    GROUP BY batch_id
    ORDER BY created_at DESC LIMIT 5
  `).all(uid);

  // Attach top candidate name to each batch
  for (const b of recentScreenings) {
    const top = db.prepare(`
      SELECT candidate_name FROM screenings
      WHERE created_by = ? AND batch_id = ?
      ORDER BY overall_score DESC LIMIT 1
    `).get(uid, b.batch_id);
    b.top_candidate = top?.candidate_name || '—';
  }

  // ── Top candidates widget — best across sources + screenings ──────────────
  const topCandidatesC = db.prepare(`
    SELECT id, name, current_title as role, market, email, ai_score as score,
           'candidate' as kind, source
    FROM candidates
    WHERE created_by = ? AND ai_score IS NOT NULL
    ORDER BY ai_score DESC LIMIT 10
  `).all(uid);

  const topCandidatesS = db.prepare(`
    SELECT id, candidate_name as name, current_role as role, NULL as market,
           email, overall_score as score, 'screening' as kind,
           'resume_upload' as source
    FROM screenings
    WHERE created_by = ? AND overall_score IS NOT NULL
    ORDER BY overall_score DESC LIMIT 10
  `).all(uid);

  const topCandidates = [...topCandidatesC, ...topCandidatesS]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  res.json({
    stats: {
      totalThisMonth,
      emailFoundThisMonth,
      emailFoundPct,
      screenedThisMonth,
      strongHireCount,
    },
    weeklySourced,
    byMarket,
    recommendations,
    scoreTrend,
    activeVacancies,
    recentSearches,
    recentScreenings,
    topCandidates,
  });
});

module.exports = router;
