const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const { PLAN_LIMITS, getUsage } = require('../middleware/planLimits');
const { sendMail } = require('../utils/mailer');

// Brute-force protection: cap login/register attempts per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Per-account lockout (independent of the IP-based limiter above — this catches
// distributed attempts against one account from many IPs).
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// Password reset / email verification tokens: hashed at rest, single-use, short expiry.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, hashToken(token), expiresAt);
  const link = `${appUrl()}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your TalentLenses email',
    html: `<p>Hi ${user.name},</p><p>Please verify your email address to finish setting up your TalentLenses account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

// ── POST /api/auth/register ──────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, company, market, role } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail)
    return res.status(400).json({ error: 'Email and password are required.' });

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const hashed = await bcrypt.hash(password, 12);
  const userRole = role === 'admin' ? 'recruiter' : (role || 'recruiter'); // prevent self-promotion to admin
  const userMarket = (typeof market === 'string' && market.trim()) ? market.trim().slice(0, 60) : 'Global';

  const result = db.prepare(
    'INSERT INTO users (name, email, password, company, role, market, plan) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, normalizedEmail, hashed, company || null, userRole, userMarket, 'basic');

  const user = db.prepare('SELECT id, name, email, role, company, market, plan, onboarding_complete, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  user.onboarding_complete = !!user.onboarding_complete;

  // Designated admin account — auto-promote so there is always one admin login.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail && user.email.toLowerCase() === adminEmail && user.role !== 'admin') {
    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('admin', user.id);
    user.role = 'admin';
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  try {
    db.prepare('INSERT INTO activities (type, description, entity_type, entity_id, user_id) VALUES (?, ?, ?, ?, ?)').run(
      'user_registered', `${name} joined TalentLenses`, 'user', user.id, user.id
    );
  } catch (_) {}

  // Soft-gate email verification: account is usable immediately, but we send a
  // verification link the client can prompt the user to complete later.
  sendVerificationEmail(user).catch((err) => console.error('[auth] verification email failed:', err.message));

  res.status(201).json({ token, user });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  // Per-account lockout — check before verifying the password so a locked
  // account can't be brute-forced further while "locked".
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.status(423).json({
      error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}, or reset your password.`,
    });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const failedCount = (user.failed_login_count || 0) + 1;
    if (failedCount >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET failed_login_count = 0, locked_until = ? WHERE id = ?').run(lockedUntil, user.id);
      return res.status(423).json({
        error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes, or reset your password.`,
      });
    }
    db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(failedCount, user.id);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Successful login — clear any lockout state.
  if (user.failed_login_count || user.locked_until) {
    db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(user.id);
  }

  // Designated admin account — auto-promote so there is always one admin login.
  // Set ADMIN_EMAIL in server/.env (e.g. ADMIN_EMAIL=admin@yourcompany.com).
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail && user.email.toLowerCase() === adminEmail && user.role !== 'admin') {
    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('admin', user.id);
    user.role = 'admin';
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const { password: _, apify_key_enc, claude_key_enc, apollo_key_enc, openai_key_enc, ...safeUser } = user;
  safeUser.onboarding_complete = !!safeUser.onboarding_complete;
  safeUser.plan = (safeUser.plan || 'basic').toLowerCase();
  res.json({ token, user: safeUser });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });

  const { password, apify_key_enc, claude_key_enc, apollo_key_enc, openai_key_enc, ...safeUser } = row;
  // Return masked indicators (not actual values) so the UI can show "key saved"
  safeUser.has_apify_key  = !!apify_key_enc;
  safeUser.has_claude_key = !!claude_key_enc;
  safeUser.has_apollo_key = !!apollo_key_enc;
  safeUser.has_openai_key = !!openai_key_enc;

  // Plan + usage snapshot for the current month
  const planKey = (safeUser.plan || 'basic').toLowerCase();
  const limits  = PLAN_LIMITS[planKey] || PLAN_LIMITS.basic;
  const usage   = getUsage(req.user.id);
  safeUser.plan  = planKey;
  safeUser.usage = {
    searches:   { used: usage.searches,   limit: limits.searches   === Infinity ? null : limits.searches },
    screenings: { used: usage.screenings, limit: limits.screenings === Infinity ? null : limits.screenings },
  };
  safeUser.onboarding_complete = !!safeUser.onboarding_complete;

  res.json({ user: safeUser });
});

// ── POST /api/auth/me/upgrade-request ── request a Pro upgrade (admin approves) ──
router.post('/me/upgrade-request', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });

  const currentPlan = (row.plan || 'basic').toLowerCase();
  if (currentPlan === 'pro')
    return res.status(400).json({ error: 'You are already on the Pro plan.' });

  const existing = db.prepare(
    "SELECT id FROM upgrade_requests WHERE user_id = ? AND status = 'pending'"
  ).get(req.user.id);
  if (existing)
    return res.status(409).json({ error: 'You already have a pending upgrade request.' });

  db.prepare(
    "INSERT INTO upgrade_requests (user_id, requested_plan, status) VALUES (?, 'pro', 'pending')"
  ).run(req.user.id);

  res.status(201).json({ ok: true });
});

// ── POST /api/auth/onboarding/complete ───────────────────────────────────────────
router.post('/onboarding/complete', authMiddleware, (req, res) => {
  db.prepare('UPDATE users SET onboarding_complete = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ── GET /api/auth/me/keys ─── return decrypted keys for profile page ───────
router.get('/me/keys', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT apify_key_enc, claude_key_enc, apollo_key_enc, openai_key_enc FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  res.json({
    apify_key:  decrypt(row.apify_key_enc)  || '',
    claude_key: decrypt(row.claude_key_enc) || '',
    apollo_key: decrypt(row.apollo_key_enc) || '',
    openai_key: decrypt(row.openai_key_enc) || '',
  });
});

// ── PUT /api/auth/me ── update profile ─────────────────────────────────────
router.put('/me', authMiddleware, async (req, res) => {
  const { name, company, market, apify_key, claude_key, apollo_key, openai_key, current_password, new_password } = req.body;

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });

  // Password change — require current password
  let hashedPassword = row.password;
  if (new_password) {
    if (!current_password) return res.status(400).json({ error: 'Current password required to change password.' });
    const valid = await bcrypt.compare(current_password, row.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    hashedPassword = await bcrypt.hash(new_password, 12);
  }

  const userMarket = (typeof market === 'string' && market.trim()) ? market.trim().slice(0, 60) : row.market;

  db.prepare(`
    UPDATE users SET
      name = ?, company = ?, market = ?,
      apify_key_enc  = ?,
      claude_key_enc = ?,
      apollo_key_enc = ?,
      openai_key_enc = ?,
      password = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name  || row.name,
    company !== undefined ? company : row.company,
    userMarket,
    apify_key  !== undefined ? (apify_key  ? encrypt(apify_key)  : null) : row.apify_key_enc,
    claude_key !== undefined ? (claude_key ? encrypt(claude_key) : null) : row.claude_key_enc,
    apollo_key !== undefined ? (apollo_key ? encrypt(apollo_key) : null) : row.apollo_key_enc,
    openai_key !== undefined ? (openai_key ? encrypt(openai_key) : null) : row.openai_key_enc,
    hashedPassword,
    req.user.id
  );

  const updated = db.prepare('SELECT id, name, email, role, company, market, created_at, updated_at FROM users WHERE id = ?').get(req.user.id);
  updated.has_apify_key = apify_key !== undefined ? !!apify_key : !!row.apify_key_enc;
  updated.has_claude_key = claude_key !== undefined ? !!claude_key : !!row.claude_key_enc;
  updated.has_apollo_key = apollo_key !== undefined ? !!apollo_key : !!row.apollo_key_enc;
  updated.has_openai_key = openai_key !== undefined ? !!openai_key : !!row.openai_key_enc;
  res.json({ user: updated });
});

// ── POST /api/auth/forgot-password ── request a reset link ─────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const genericMessage = { message: 'If that email is registered, a reset link has been sent.' };

  const user = db.prepare('SELECT id, name, email FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (!user) return res.json(genericMessage); // never reveal whether the email exists

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, hashToken(token), expiresAt);

  const link = `${appUrl()}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your TalentLenses password',
    html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password. This link expires in 30 minutes and can only be used once.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
  });

  res.json(genericMessage);
});

// ── POST /api/auth/reset-password ── consume token, set new password ───────
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password)
    return res.status(400).json({ error: 'Token and new password are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const tokenHash = hashToken(token);
  const row = db.prepare(
    "SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP"
  ).get(tokenHash);
  if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

  const hashed = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE users SET password = ?, failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hashed, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);

  res.json({ message: 'Password updated. You can now sign in with your new password.' });
});

// ── GET /api/auth/verify-email ── consume verification token ───────────────
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });

  const tokenHash = hashToken(token);
  const row = db.prepare(
    "SELECT * FROM email_verifications WHERE token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP"
  ).get(tokenHash);
  if (!row) return res.status(400).json({ error: 'This verification link is invalid or has expired.' });

  db.prepare('UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.user_id);
  db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(row.id);

  res.json({ message: 'Email verified successfully.' });
});

// ── POST /api/auth/resend-verification ── re-send verification email ──────
router.post('/resend-verification', authMiddleware, async (req, res) => {
  const user = db.prepare('SELECT id, name, email, email_verified FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.email_verified) return res.status(400).json({ error: 'Email is already verified.' });

  await sendVerificationEmail(user);
  res.json({ message: 'Verification email sent.' });
});

module.exports = router;
