import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { z, ZodError } from 'zod';
import {
  type ApiErrorResponse,
  type Candidate,
  type HealthResponse,
  type SearchRequest,
  type SearchResponse,
  type SheetsAppendResponse
} from '../../shared/api';
import { runCandidateSearch } from './services/apifyService';
import { appendCandidatesToSheet } from './services/sheetsService';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

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

const candidateSchema = z.object({
  name: z.string().optional().default(''),
  role: z.string().optional().default(''),
  company: z.string().optional().default(''),
  location: z.string().optional().default(''),
  profileUrl: z.string().optional().default(''),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  source: z.string().optional().default(''),
  sourceUrl: z.string().optional().default(''),
  query: z.string().optional().default(''),
  scrapedAt: z.string().optional().default('')
});

app.get('/api/health', (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    ok: true,
    apifyConfigured: Boolean(process.env.APIFY_TOKEN && (process.env.APIFY_ACTOR_ID || process.env.APIFY_TASK_ID)),
    sheetsConfigured: Boolean(process.env.GOOGLE_SHEET_ID)
  });
});

app.post('/api/search', async (req: Request, res: Response<SearchResponse>, next: NextFunction) => {
  try {
    const criteria = searchSchema.parse(req.body) as Required<SearchRequest>;
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

app.post('/api/sheets/append', async (req: Request, res: Response<SheetsAppendResponse>, next: NextFunction) => {
  try {
    const candidates = z.array(candidateSchema).parse(req.body.candidates) as Candidate[];
    const sheetResult = await appendCandidatesToSheet(candidates);
    res.json({ sheetResult });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response<ApiErrorResponse>, _next: NextFunction) => {
  const isZodError = error instanceof ZodError;
  const status = isZodError ? 400 : 500;

  res.status(status).json({
    error: error instanceof Error ? error.message : 'Unknown error',
    details: isZodError ? error.errors : undefined
  });
});

app.listen(port, host, () => {
  console.log(`Candidate scraper API listening on http://${host}:${port}`);
});
