/**
 * Plan-based usage limits.
 *
 * Monthly counters are derived directly from the `searches` and `screenings`
 * tables — no separate counter table needed.
 */
const db = require('../db');

const PLAN_LIMITS = {
  starter:    { searches: 100,      screenings: 50 },
  growth:     { searches: 500,      screenings: 200 },
  enterprise: { searches: Infinity, screenings: Infinity },
};

function getPlan(userId) {
  const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  const key = (row?.plan || 'starter').toLowerCase();
  return PLAN_LIMITS[key] ? key : 'starter';
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function getUsage(userId) {
  const start = monthStartIso();
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
