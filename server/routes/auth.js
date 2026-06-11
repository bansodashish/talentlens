const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const { PLAN_LIMITS, getUsage } = require('../middleware/planLimits');

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, company, market, role } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const hashed = await bcrypt.hash(password, 12);
  const userRole = role === 'admin' ? 'recruiter' : (role || 'recruiter'); // prevent self-promotion to admin
  const userMarket = (typeof market === 'string' && market.trim()) ? market.trim().slice(0, 60) : 'Global';

  const result = db.prepare(
    'INSERT INTO users (name, email, password, company, role, market) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, email, hashed, company || null, userRole, userMarket);

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

  res.status(201).json({ token, user });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

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
  safeUser.plan = (safeUser.plan || 'starter').toLowerCase();
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
  const planKey = (safeUser.plan || 'starter').toLowerCase();
  const limits  = PLAN_LIMITS[planKey] || PLAN_LIMITS.starter;
  const usage   = getUsage(req.user.id);
  safeUser.plan  = planKey;
  safeUser.usage = {
    searches:   { used: usage.searches,   limit: limits.searches   === Infinity ? null : limits.searches },
    screenings: { used: usage.screenings, limit: limits.screenings === Infinity ? null : limits.screenings },
  };
  safeUser.onboarding_complete = !!safeUser.onboarding_complete;

  res.json({ user: safeUser });
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

module.exports = router;
