/**
 * index.ts — Express HTTP server.
 *
 * Replaces app.py. Endpoints:
 *   GET  /api/roles                 — role library
 *   GET  /api/sample-batch-datasets — bundled sample datasets
 *   POST /api/match                 — single resume score (multipart)
 *   POST /api/batch-match           — batch score (multipart CSV/XLSX or JSON)
 *   GET  /*                         — serves ../static/ (production build)
 *
 * In dev the Vite proxy forwards /api/* to this server, so no CORS config needed.
 */

// Config must be loaded before anything that reads env vars
import "./config.js";

import { createRequire } from "node:module";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// CJS interop for xlsx (CommonJS-only package)
const require = createRequire(import.meta.url);

import { roleLibrary, JdCache } from "./scoring.js";
import { buildMatchResult, ProviderError } from "./providers/index.js";
import { ResumeFile } from "./parsers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/ → backend/ → job_hunt/
const ROOT = path.resolve(__dirname, "../../");
const STATIC_DIR = path.join(ROOT, "static");
const EXAMPLES_DIR = path.join(ROOT, "examples");

// ─── Sample batch datasets (mirrors Python SAMPLE_BATCH_DATASETS) ─────────────
const SAMPLE_DATASETS: Record<string, { label: string; file: string; jdFile: string }> = {
  backend: {
    label: "Backend Engineer (N26 Acquire)",
    file: "sample_backend_engineer_acquire_batch.csv",
    jdFile: "backend_engineer_acquire_jd.txt",
  },
  qa: {
    label: "QA Automation Engineer",
    file: "sample_qa_automation_batch.csv",
    jdFile: "qa_automation_jd.txt",
  },
};

// ─── Multer — store uploads in memory (binary-safe, no temp files) ─────────────
const upload = multer({ storage: multer.memoryStorage() });

// ─── App ───────────────────────────────────────────────────────────────────────
const app = express();

// Enable CORS so the React dev server (localhost:3000) can call us directly
// without going through the Vite proxy (the proxy was unreliable under
// concurrent multipart uploads).
app.use(cors({
  origin: true,           // reflect the request origin
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "50mb" }));

// ─── Basic auth middleware ─────────────────────────────────────────────────────
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const enabled = (process.env.BASIC_AUTH_ENABLED ?? "true").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(enabled)) return next();

  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="CV Match Recruiter"');
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  const [user, ...rest] = decoded.split(":");
  const pass = rest.join(":");
  const expectedUser = process.env.RECRUITER_USERNAME ?? "recruiter";
  const expectedPass = process.env.RECRUITER_PASSWORD ?? "change-me";

  // Constant-time comparison to prevent timing attacks
  const userOk = crypto.timingSafeEqual(Buffer.from(user), Buffer.from(expectedUser));
  const passOk = crypto.timingSafeEqual(
    Buffer.from(pass.padEnd(expectedPass.length)),
    Buffer.from(expectedPass.padEnd(pass.length))
  );
  if (userOk && passOk) return next();

  res.set("WWW-Authenticate", 'Basic realm="CV Match Recruiter"');
  res.status(401).json({ error: "Authentication required." });
}

app.use(authMiddleware);

// ─── GET /api/roles ────────────────────────────────────────────────────────────
app.get("/api/roles", (_req, res) => {
  res.json({ roles: roleLibrary() });
});

// ─── GET /api/sample-batch-datasets ───────────────────────────────────────────
app.get("/api/sample-batch-datasets", (_req, res) => {
  const datasets = Object.entries(SAMPLE_DATASETS).map(([id, meta]) => ({
    id,
    label: meta.label,
    file: meta.file,
  }));
  res.json({ datasets });
});

// ─── POST /api/match ──────────────────────────────────────────────────────────
app.post("/api/match", upload.single("resume"), async (req, res) => {
  const t0 = Date.now();
  const fname = req.file?.originalname ?? "(no file)";
  const fsize = req.file?.buffer.length ?? 0;
  console.log(`[match] ▶ ${fname} (${fsize} bytes) provider=${req.body.provider}`);
  try {
    const provider: string = req.body.provider ?? "local";
    const targetRole: string = req.body.target_role ?? "";
    const jobDescription: string = req.body.job_description ?? "";
    const resumeText: string = req.body.resume_text ?? "";

    const resumeFile: ResumeFile | null = req.file
      ? {
          filename: req.file.originalname,
          content: req.file.buffer,
          contentType: req.file.mimetype,
        }
      : null;

    if (!jobDescription) {
      res.status(400).json({ error: "Job description is required." });
      return;
    }
    if (!resumeFile && !resumeText) {
      res.status(400).json({ error: "Upload a resume or paste resume text." });
      return;
    }

    const result = await buildMatchResult(
      provider,
      targetRole,
      jobDescription,
      resumeText,
      resumeFile
    );
    console.log(`[match] ✓ ${fname} score=${result.score} (${Date.now() - t0}ms)`);
    res.json(result);
  } catch (err) {
    console.log(`[match] ✗ ${fname} error: ${(err as Error).message} (${Date.now() - t0}ms)`);
    if (err instanceof ProviderError) {
      res.status(502).json({ error: err.message });
    } else if (err instanceof Error) {
      res.status(err.message.includes("could not be parsed") ? 400 : 500).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Unexpected server error." });
    }
  }
});

// ─── POST /api/batch-match ────────────────────────────────────────────────────
app.post(
  "/api/batch-match",
  (req: Request, res: Response, next: NextFunction) => {
    // Apply multer only for multipart requests; JSON body already parsed globally
    const ct = req.headers["content-type"] ?? "";
    if (ct.includes("multipart/form-data")) {
      upload.single("batch_file")(req, res, next);
    } else {
      next();
    }
  },
  async (req: Request, res: Response) => {
    try {
      let provider: string;
      let targetRole: string;
      let jobDescription: string;
      let candidates: CandidateRow[];
      let shortlistThreshold: number;
      const jdCache: JdCache = {};

      const ct = req.headers["content-type"] ?? "";

      if (ct.includes("multipart/form-data")) {
        // ── Multipart (frontend batch upload) ──
        provider = (req.body.provider as string) ?? "local";
        targetRole = (req.body.target_role as string) ?? "";
        jobDescription = (req.body.job_description as string) ?? "";
        shortlistThreshold = parseInt((req.body.shortlist_threshold as string) ?? "4", 10);
        const sampleDataset = (req.body.sample_dataset as string) ?? "";

        if (req.file) {
          candidates = parseBatchFile(req.file.buffer, req.file.originalname);
        } else if (sampleDataset) {
          const loaded = loadSampleDataset(sampleDataset);
          if (!loaded) {
            res.status(400).json({ error: `Unknown sample dataset: ${sampleDataset}` });
            return;
          }
          candidates = loaded.candidates;
          if (!jobDescription && loaded.jd) jobDescription = loaded.jd;
        } else {
          candidates = [];
        }
      } else {
        // ── JSON (API mode) ──
        const body = req.body as Record<string, unknown>;
        provider = String(body.provider ?? "local").toLowerCase();
        targetRole = String(body.target_role ?? "");
        jobDescription = String(body.job_description ?? "");
        shortlistThreshold = parseInt(String(body.shortlist_threshold ?? "4"), 10);
        const sampleDataset = String(body.sample_dataset ?? "");

        if (Array.isArray(body.candidates)) {
          candidates = body.candidates as CandidateRow[];
        } else if (sampleDataset) {
          const loaded = loadSampleDataset(sampleDataset);
          if (!loaded) {
            res.status(400).json({ error: `Unknown sample dataset: ${sampleDataset}` });
            return;
          }
          candidates = loaded.candidates;
          if (!jobDescription && loaded.jd) jobDescription = loaded.jd;
        } else {
          candidates = [];
        }
      }

      if (!jobDescription) {
        res.status(400).json({ error: "Job description is required." });
        return;
      }
      if (!candidates.length) {
        res.status(400).json({ error: "Candidates must be a non-empty array." });
        return;
      }

      // ── Score each candidate ──
      let matched = 0;
      let shortlisted = 0;
      let errors = 0;
      const results: Record<string, unknown>[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const candidateJd = String(c.job_description || jobDescription).trim();
        const resumeTextC = String(c.resume_text || "").trim();
        const threshold = parseInt(String(c.shortlist_threshold || shortlistThreshold), 10);

        if (!candidateJd) {
          errors++;
          results.push(batchError(c, i, "job_description is required."));
          continue;
        }
        if (!resumeTextC) {
          errors++;
          results.push(batchError(c, i, "resume_text is required for batch matching."));
          continue;
        }

        try {
          const result = await buildMatchResult(provider, targetRole, candidateJd, resumeTextC, null, jdCache);
          const isShortlisted = (result.rating ?? 0) >= threshold;
          matched++;
          if (isShortlisted) shortlisted++;
          results.push({
            candidateId: c.candidate_id || c.id || `candidate-${i + 1}`,
            name: c.name ?? "",
            email: c.email ?? "",
            score: result.score,
            rating: result.rating,
            label: result.label,
            recommendation: result.recommendation,
            shortlisted: isShortlisted,
            strengths: result.strengths,
            gaps: result.gaps,
            details: result.details,
            provider: result.provider,
            skills: c.skills ?? [],
            experience: c.experience ?? "",
            location: c.location ?? "",
            jobDescription: candidateJd,
          });
        } catch (err) {
          errors++;
          results.push(batchError(c, i, (err as Error).message));
        }
      }

      res.json({
        provider,
        targetRole,
        processedCandidates: candidates.length,
        matchedCandidates: matched,
        shortlistedCandidates: shortlisted,
        errorCandidates: errors,
        results,
      });
    } catch (err) {
      res.status(500).json({ error: `Unexpected server error: ${(err as Error).message}` });
    }
  }
);

// ─── Static file serving (production build) ───────────────────────────────────
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback — serve index.html for any unmatched route
  app.get("*", (_req, res) => {
    const index = path.join(STATIC_DIR, "index.html");
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(404).json({ error: "Not found" });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = parseInt(process.env.PORT ?? "8000", 10);

app.listen(PORT, HOST, () => {
  console.log(`CV Match AI Agent running at http://${HOST}:${PORT}`);
  const sslStatus =
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
      ? "SSL verification DISABLED (NODE_TLS_REJECT_UNAUTHORIZED=0)"
      : "SSL verification enabled (system CA bundle)";
  console.log(`HTTPS: ${sslStatus}`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CandidateRow {
  candidate_id?: string;
  id?: string;
  name?: string;
  email?: string;
  job_description?: string;
  resume_text?: string;
  skills?: string[];
  experience?: string;
  location?: string;
  shortlist_threshold?: number | string;
}

function batchError(c: CandidateRow, idx: number, msg: string) {
  return {
    candidateId: c.candidate_id || c.id || `candidate-${idx + 1}`,
    name: c.name ?? "",
    email: c.email ?? "",
    error: msg,
  };
}

function parseBatchFile(buffer: Buffer, filename: string): CandidateRow[] {
  const name = filename.toLowerCase();
  if (name.endsWith(".xlsx")) return parseXlsx(buffer);
  return parseCsv(buffer.toString("utf-8"));
}

function parseCsv(text: string): CandidateRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (!lines.length) return [];

  const parseFields = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  };

  const headers = parseFields(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CandidateRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseFields(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push({
      candidate_id: row.candidate_id || row.id || "",
      name: row.name || row.candidate_name || "",
      email: row.email || row.candidate_email || "",
      job_description: row.job_description || row.jd || "",
      resume_text: row.resume_text || row.summary || "",
      skills: (row.skills || "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
      experience: row.experience || "",
      location: row.location || "",
      shortlist_threshold: row.shortlist_threshold || "",
    });
  }
  return rows;
}

function parseXlsx(buffer: Buffer): CandidateRow[] {
  try {
    const XLSX = require("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const data: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return data.map((row) => {
      const r = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v ?? "").trim()])
      );
      return {
        candidate_id: r.candidate_id || r.id || "",
        name: r.name || r.candidate_name || "",
        email: r.email || r.candidate_email || "",
        job_description: r.job_description || r.jd || "",
        resume_text: r.resume_text || r.summary || "",
        skills: (r.skills || "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
        experience: r.experience || "",
        location: r.location || "",
        shortlist_threshold: r.shortlist_threshold || "",
      };
    });
  } catch {
    return [];
  }
}

function loadSampleDataset(key: string): { candidates: CandidateRow[]; jd: string } | null {
  const config = SAMPLE_DATASETS[key.trim().toLowerCase()];
  if (!config) return null;
  const csvPath = path.join(EXAMPLES_DIR, config.file);
  if (!fs.existsSync(csvPath)) throw new Error(`Bundled sample dataset is missing: ${config.file}`);
  const candidates = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  const jdPath = path.join(EXAMPLES_DIR, config.jdFile);
  const jd = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, "utf-8").trim() : "";
  return { candidates, jd };
}
