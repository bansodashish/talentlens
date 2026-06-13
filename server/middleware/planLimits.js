/**
 * Plan-based usage limits.
 *
 * Monthly counters are derived directly from the `searches` and `screenings`
 * tables — no separate counter table needed.
 */
const db = require('../db');

const PLAN_LIMITS = {
  starter:    { searches: 1000,      screenings: 1000 },
  growth:     { searches: 2000,      screenings: 5000 },
  enterprise: { searches: Infinity, screenings: Infinity },
};

function getPlan(userId) {
  const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  const key = (row?.plan || 'starter').toLowerCase();
  return PLAN_LIMITS[key] ? key : 'starter';
}

function monthStartSql() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01 00:00:00`;
}

function getUsage(userId) {
  const start = monthStartSql();
  const searches = db.prepare(
    'SELECT COUNT(*) as n FROM searches WHERE created_by = ? AND created_at >= ?'
  ).get(userId, start).n;
  const screenings = db.prepare(
    'SELECT COUNT(*) as n FROM screenings WHERE created_by = ? AND created_at >= ?'
  ).get(userId, start).n;
  return { searches, screenings };
}

function makeLimitMiddleware(kind) {
  return (req, res, next) => {
    const plan   = getPlan(req.user.id);
    const limit  = PLAN_LIMITS[plan][kind];
    if (limit === Infinity) return next();

    const used = getUsage(req.user.id)[kind];
    if (used >= limit) {
      return res.status(429).json({
        error: `Monthly ${kind} limit reached on the ${plan} plan (${limit}/mo).`,
        code:  'PLAN_LIMIT_REACHED',
        plan, used, limit,
        hint:  'Upgrade your plan in Profile → Plan to continue this month.',
      });
    }
    next();
  };
}

module.exports = {
  PLAN_LIMITS,
  getPlan,
  getUsage,
  limitSearches:   makeLimitMiddleware('searches'),
  limitScreenings: makeLimitMiddleware('screenings'),
};
