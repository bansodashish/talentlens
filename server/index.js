require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;
const isProd = process.env.NODE_ENV === 'production';

// In production the React build is served by Express itself — no CORS needed.
// In development allow the CRA dev server on :3000.
if (!isProd) {
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  }));
} else {
  // Allow same-origin + any custom domain set via ALLOWED_ORIGIN env
  const allowed = process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : [];
  app.use(cors({ origin: allowed, credentials: true }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving (GATED: served privately via authenticated Express route instead)

// ── Serve React build in production ──────────────────────────────────────────
if (isProd) {
  const buildPath = path.resolve(__dirname, '../client/build');
  app.use(express.static(buildPath));
}

// Initialise DB (runs schema + migrations)
require('./db');

// ── Core routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/jobs',         require('./routes/jobs'));
app.use('/api/candidates',   require('./routes/candidates'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/dashboard',    require('./routes/dashboard'));

// ── Integrated module routes ─────────────────────────────────────────────────
app.use('/api/scraper',      require('./routes/scraper'));   // Candidate sourcing (Apify)
app.use('/api/search',       require('./routes/search'));    // LinkedIn search (harvestapi)
app.use('/api/screen',       require('./routes/screen'));    // AI Resume Screener (Claude)
app.use('/api/history',      require('./routes/history'));   // CRM history (searches + screenings)
app.use('/api/users',        require('./routes/users'));     // Admin: user management

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TalentLens API',
    version: '2.0.0',
    modules: {
      recruitment: true,
      cvMatching: true,
      candidateScraper: Boolean(process.env.APIFY_TOKEN),
      linkedinSearch: Boolean(process.env.APIFY_TOKEN),
      apolloSearch: Boolean(process.env.APOLLO_API_KEY),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
    timestamp: new Date().toISOString(),
  });
});

// In production, all non-API routes return the React app
if (isProd) {
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found.` }));
}
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`
🚀 TalentLens API  →  http://localhost:${PORT}
📋 Health          →  http://localhost:${PORT}/api/health
🔍 Scraper         →  /api/scraper/*
🔍 Search          →  /api/search/* (LinkedIn + Apollo)
🤖 CV Match        →  /api/cv-match/*
  `);
});

module.exports = app;
