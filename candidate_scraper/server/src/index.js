import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { runCandidateSearch } from './services/apifyService.js';
import { appendCandidatesToSheet } from './services/sheetsService.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '127.0.0.1';

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const searchSchema = z.object({
  query: z.string().min(2),
  location: z.string().optional().default('United Kingdom'),
  maxItems: z.coerce.number().int().min(1).max(100).default(25),
  sources: z.array(z.string()).optional().default(['permitted-public-web']),
  appendToSheet: z.boolean().optional().default(false)
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    apifyConfigured: Boolean(process.env.APIFY_TOKEN && (process.env.APIFY_ACTOR_ID || process.env.APIFY_TASK_ID)),
    sheetsConfigured: Boolean(process.env.GOOGLE_SHEET_ID)
  });
});

app.post('/api/search', async (req, res, next) => {
  try {
    const criteria = searchSchema.parse(req.body);
    const candidates = await runCandidateSearch(criteria);
    let sheetResult = null;

    if (criteria.appendToSheet && candidates.length > 0) {
      sheetResult = await appendCandidatesToSheet(candidates);
    }

    res.json({ candidates, sheetResult });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sheets/append', async (req, res, next) => {
  try {
    const candidates = z.array(z.record(z.unknown())).parse(req.body.candidates);
    const sheetResult = await appendCandidatesToSheet(candidates);
    res.json({ sheetResult });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.name === 'ZodError' ? 400 : 500;
  res.status(status).json({
    error: error.message,
    details: error.errors || undefined
  });
});

app.listen(port, host, () => {
  console.log(`Candidate scraper API listening on http://${host}:${port}`);
});
