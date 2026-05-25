import React, { useEffect, useMemo, useRef, useState } from "react";

// Backend URL — talk directly to Express (CORS-enabled), bypassing the Vite
// proxy which was unreliable under concurrent multipart uploads.
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const PROVIDERS = [
  { value: "local", label: "Local weighted scorer" },
  { value: "openai", label: "OpenAI GPT" },
  { value: "affinda", label: "Affinda" },
  { value: "rchilli", label: "RChilli" },
];

const AVATAR_COLORS = ["avatar-blue", "avatar-yellow", "avatar-green", "avatar-red"];

// ── helpers ────────────────────────────────────────────────────────────────

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseCsvValue(value) {
  if (Array.isArray(value)) return value.join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function scoreToPercent(scoreValue) {
  if (scoreValue === null || scoreValue === undefined || scoreValue === "") return null;
  const n = Number(scoreValue);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function scoreClass(pct) {
  if (pct === null) return "score-red";
  if (pct >= 85) return "score-green";
  if (pct >= 70) return "score-yellow";
  return "score-red";
}

function statusInfo(pct, isError) {
  if (isError) return { cls: "status-error", text: "Error" };
  if (pct === null) return { cls: "status-yellow", text: "Under review" };
  if (pct >= 85) return { cls: "status-green", text: "Shortlisted" };
  if (pct >= 70) return { cls: "status-yellow", text: "Under review" };
  return { cls: "status-red", text: "Weak match" };
}

function barColor(p) {
  if (p >= 85) return "bar-green";
  if (p >= 60) return "bar-yellow";
  return "bar-red";
}

async function extractTextFromFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || n.endsWith(".docx") || n.endsWith(".doc")) return "";
  try {
    const text = await file.text();
    return text.trim() || "";
  } catch {
    return "";
  }
}

async function filesToCandidates(files) {
  const result = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullText = await extractTextFromFile(file);
    result.push({
      id: `cand-${i + 1}`,
      name: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      file,
      fullText,
    });
  }
  return result;
}

function buildCsvFile(candidates) {
  const rows = [["candidate_id", "name", "email", "resume_text"]];
  for (const c of candidates) rows.push([c.id, c.name, "", c.fullText]);
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  return new File([new Blob([csv], { type: "text/csv" })], "batch.csv", { type: "text/csv" });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── sub-components ─────────────────────────────────────────────────────────

function CandidateCard({ row, idx, onClick }) {
  const score = scoreToPercent(row.score);
  const isError = row.label === "error";
  const avatarCls = AVATAR_COLORS[idx % AVATAR_COLORS.length];
  const { cls: statusCls, text: statusText } = statusInfo(score, isError);
  const skills = (row.details?.matchedSkills || []).slice(0, 3);
  const initials = (row.name || "C")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const errMsg = isError ? (row.recommendation || row.gaps?.[0] || "Failed to score") : "";
  const subtitle = isError
    ? errMsg
    : row.details?.resumeRoleFamily
    ? row.details.resumeRoleFamily.replace(/_/g, " ")
    : row.details?.jobRoleFamily
    ? row.details.jobRoleFamily.replace(/_/g, " ")
    : "Role unknown";

  return (
    <div className="candidate-card candidate-ranking" onClick={onClick} style={{ cursor: "pointer" }} title={isError ? errMsg : undefined}>
      <div className={`candidate-avatar ${avatarCls}`}>
        {initials}
      </div>
      <div className="candidate-info">
        <div className="candidate-name">{row.name || "Candidate"}</div>
        <div className="candidate-title">{subtitle}</div>
      </div>
      <div className="candidate-skills">
        {skills.length > 0
          ? skills.map((s) => <span key={s} className="skill-pill">{s}</span>)
          : <span className="skill-pill muted-pill">—</span>}
      </div>
      <div className={`candidate-score ${isError ? "score-error" : scoreClass(score)}`}>
        {isError ? "Err" : score !== null ? `${score}%` : "—"}
      </div>
      <div className={`candidate-status ${statusCls}`}>{statusText}</div>
    </div>
  );
}

function DeepDive({ candidate, onBack }) {
  const d = candidate.details || {};
  const overallPct = scoreToPercent(candidate.score);
  const overallCls = scoreClass(overallPct);

  const factors = [
    { label: "Skills overlap", weight: "50%", pct: Math.round((d.skills ?? 0) * 100), icon: "S" },
    { label: "Keywords", weight: "30%", pct: Math.round((d.keywords ?? 0) * 100), icon: "K" },
    { label: "Experience", weight: "8%", pct: Math.round((d.experience ?? 0) * 100), icon: "E" },
    { label: "Role family", weight: "8%", pct: Math.round((d.roleFamily ?? 0) * 100), icon: "R" },
    { label: "Title match", weight: "4%", pct: Math.round((d.title ?? 0) * 100), icon: "T" },
  ];

  return (
    <div className="deep-dive-panel">
      {/* Header */}
      <div className="deep-dive-header">
        <div className="deep-dive-identity">
          <div className="candidate-avatar avatar-blue deep-dive-avatar">
            {(candidate.name || "C")[0].toUpperCase()}
          </div>
          <div>
            <div className="candidate-name">{candidate.name || "Candidate"}</div>
            <div className="candidate-title">
              {d.jobRoleFamily ? `JD: ${d.jobRoleFamily.replace(/_/g, " ")}` : ""}
              {d.resumeRoleFamily ? ` · CV: ${d.resumeRoleFamily.replace(/_/g, " ")}` : ""}
            </div>
            {candidate.label && (
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                {candidate.label}
                {candidate.recommendation ? ` — ${candidate.recommendation}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className={`candidate-score ${overallCls} deep-dive-score`}>
          {overallPct !== null ? `${overallPct}%` : "—"}
          <span className="deep-dive-score-label">match</span>
        </div>
      </div>

      {/* Body */}
      <div className="deep-dive-body">
        {/* Score breakdown */}
        <div className="deep-dive-col">
          <h3 className="deep-dive-section-title">Score breakdown</h3>
          {factors.map((f) => {
            const sc = f.pct >= 85 ? "score-green" : f.pct >= 70 ? "score-yellow" : "score-red";
            const av = f.pct >= 85 ? "avatar-green" : f.pct >= 70 ? "avatar-yellow" : "avatar-red";
            const st = f.pct >= 85 ? "status-green" : "status-yellow";
            const stTxt = f.pct >= 85 ? "Strong" : f.pct >= 70 ? "Good" : f.pct >= 40 ? "Weak" : "Poor";
            return (
              <div key={f.label} className="candidate-card" style={{ marginBottom: "0.55rem" }}>
                <div className={`candidate-avatar ${av}`} style={{ width: 36, height: 36, fontSize: "0.85rem" }}>
                  {f.icon}
                </div>
                <div className="candidate-info">
                  <div className="candidate-name" style={{ fontSize: "0.9rem" }}>{f.label}</div>
                  <div className="candidate-title">Weight: {f.weight}</div>
                </div>
                <div className={`candidate-score ${sc}`} style={{ fontSize: "1rem", padding: "0.5rem 0.7rem", minWidth: 56 }}>
                  {f.pct}%
                </div>
                <div className={`candidate-status ${st}`} style={{ fontSize: "0.8rem", padding: "0.5rem 0.7rem", minWidth: 60 }}>
                  {stTxt}
                </div>
              </div>
            );
          })}
        </div>

        {/* Insights */}
        <div className="deep-dive-col">
          <h3 className="deep-dive-section-title">Analysis</h3>
          <div className="ai-insights">
            {(candidate.strengths || []).map((s) => (
              <div key={s} className="insight-green">✓ {s}</div>
            ))}
            {(candidate.gaps || []).map((g) => (
              <div key={g} className="insight-red">! {g}</div>
            ))}
            {(d.explanations || []).map((e) => (
              <div key={e} className="insight-blue">→ {e}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Contact */}
      {(candidate.email || d.location || d.uploadedResume) && (
        <div className="contact-details">
          {candidate.email && <><span className="contact-label">Email</span><span className="contact-link">{candidate.email}</span></>}
          {d.location && <><span className="contact-label">Location</span><span className="contact-link">{d.location}</span></>}
          {d.uploadedResume && <><span className="contact-label">Resume</span><span className="contact-link">{d.uploadedResume}</span></>}
        </div>
      )}

      <button className="btn subtle" style={{ marginTop: "1.5rem" }} onClick={onBack}>
        ← Back to list
      </button>
    </div>
  );
}

// ── main app ──────────────────────────────────────────────────────────────

export default function App() {
  const inputRef = useRef(null);

  const [provider, setProvider] = useState("openai");
  const [jobDescription, setJobDescription] = useState("");
  const [shortlistThreshold, setShortlistThreshold] = useState("4");
  const [candidates, setCandidates] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [uiError, setUiError] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const canStart = candidates.length > 0 && !loading && jobDescription.trim().length >= 30;

  const summary = useMemo(() => {
    if (!result?.results) return { processed: 0, matched: 0, shortlisted: 0, errors: 0 };
    return {
      processed: result.processedCandidates || 0,
      matched: result.matchedCandidates || 0,
      shortlisted: result.shortlistedCandidates || 0,
      errors: result.errorCandidates || 0,
    };
  }, [result]);

  async function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter(Boolean).slice(0, 10);
    if (!selected.length) return;
    setUiError("");
    const parsed = await filesToCandidates(selected);
    setCandidates(parsed);
    if (Array.from(fileList).length > 10)
      setUiError("Only the first 10 files were loaded.");
  }

  async function onScreenCandidates() {
    if (!candidates.length) return setUiError("Please upload at least one resume.");
    if (jobDescription.trim().length < 30) return setUiError("Please paste a job description (at least 30 characters).");

    setUiError("");
    setLoading(true);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setSelectedCandidate(null);

    try {
      const jd = jobDescription.trim();
      const thresh = shortlistThreshold || "4";
      const hasBinary = candidates.some((c) => {
        const n = (c.file?.name || "").toLowerCase();
        return n.endsWith(".pdf") || n.endsWith(".docx") || n.endsWith(".doc");
      });

      if (hasBinary) {
        setProgress({ done: 0, total: candidates.length });

        // Show an empty results panel immediately so the user sees streaming updates
        setResult({
          provider, targetRole: "",
          processedCandidates: 0, matchedCandidates: 0,
          shortlistedCandidates: 0, errorCandidates: 0,
          results: [],
        });

        let processed = 0, matched = 0, shortlisted = 0, errors = 0;
        const allResults = [];

        await Promise.all(candidates.map(async (candidate) => {
          const fd = new FormData();
          fd.set("provider", provider);
          fd.set("job_description", jd);
          fd.set("target_role", "");
          if (candidate.file) fd.set("resume", candidate.file, candidate.file.name);
          else if (candidate.fullText) fd.set("resume_text", candidate.fullText);

          let row;
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 120000);
            const res = await fetch(`${API_BASE}/api/match`, { method: "POST", body: fd, signal: controller.signal });
            clearTimeout(timer);
            const payload = await res.json();
            if (payload.error) {
              row = { candidateId: candidate.id, name: candidate.name, email: "", score: null, rating: 0, label: "error", recommendation: payload.error, shortlisted: false, strengths: [], gaps: [payload.error], details: {} };
            } else {
              const isShortlisted = (payload.rating ?? 0) >= parseInt(thresh, 10);
              row = { candidateId: candidate.id, name: candidate.name, email: "", score: payload.score ?? null, rating: payload.rating ?? 0, label: payload.label || "", recommendation: payload.recommendation || "", shortlisted: isShortlisted, strengths: payload.strengths || [], gaps: payload.gaps || [], details: payload.details || {} };
            }
          } catch (err) {
            const msg = err.name === "AbortError" ? "Request timed out" : (err.message || "Unknown error");
            row = { candidateId: candidate.id, name: candidate.name, email: "", score: null, rating: 0, label: "error", recommendation: msg, shortlisted: false, strengths: [], gaps: [msg], details: {} };
          }

          // Stream: push result and re-render immediately
          allResults.push(row);
          processed++;
          if (row.label !== "error" && row.score !== null) matched++;
          if (row.shortlisted) shortlisted++;
          if (row.label === "error") errors++;

          const sorted = [...allResults].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          setResult({
            provider, targetRole: "",
            processedCandidates: processed,
            matchedCandidates: matched,
            shortlistedCandidates: shortlisted,
            errorCandidates: errors,
            results: sorted,
          });
        }));
      } else {
        const fd = new FormData();
        fd.set("provider", provider);
        fd.set("target_role", "");
        fd.set("shortlist_threshold", thresh);
        fd.set("job_description", jd);
        fd.set("batch_file", buildCsvFile(candidates), "batch.csv");
        const res = await fetch(`${API_BASE}/api/batch-match`, { method: "POST", body: fd });
        const payload = await res.json();
        setResult(payload);
        if (payload.error) setUiError(payload.error);
      }
    } catch (err) {
      setUiError(err.message || "Unexpected error.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function exportJson() {
    if (!result) return;
    downloadFile(`cv-match-${Date.now()}.json`, JSON.stringify(result, null, 2), "application/json");
  }

  function exportCsv() {
    if (!result?.results) return;
    const rows = result.results.map((r) => ({
      candidateId: r.candidateId, name: r.name, email: r.email,
      score: r.score, rating: r.rating, shortlisted: r.shortlisted,
      label: r.label, recommendation: r.recommendation,
      strengths: r.strengths || [], gaps: r.gaps || [],
      matchedSkills: r.details?.matchedSkills || [],
      missingSkills: r.details?.missingSkills || [],
    }));
    const headers = Object.keys(rows[0] || {});
    const lines = [headers.join(","), ...rows.map((r) => headers.map((k) => csvEscape(parseCsvValue(r[k]))).join(","))];
    downloadFile(`cv-batch-${Date.now()}.csv`, lines.join("\n") + "\n", "text/csv");
  }

  return (
    <div className="app-shell">
      <p className="eyebrow">Step 2 of 5</p>
      <h1>View AI-Ranked Candidate List</h1>
      <p className="subhead">
        Every uploaded CV is scored 0–100 against your JD. Candidates are ranked with key skills and
        status shown <u>at a glance</u>.
      </p>

      {result && (
        <div className="actions" style={{ marginBottom: "1rem" }}>
          <button className="btn ghost" onClick={exportJson}>Export JSON</button>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        </div>
      )}

      <main className="layout">
        {/* ── Left: form ─────────────────────────────────────────── */}
        <section className="card form-card">
          <div className="form-card-header">
            <h2>Screening Setup</h2>
            <p>Configure provider, paste a JD, and upload CVs</p>
          </div>
          <div className="form-card-body">
            <div className="grid two">
              <label>
                Provider
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label>
                Shortlist threshold
                <input type="number" min="1" max="5" value={shortlistThreshold} onChange={(e) => setShortlistThreshold(e.target.value)} />
              </label>
            </div>

            <label className="jd-label">
              Job description
              <textarea
                className="jd-input"
                placeholder="Paste the full job description here…"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={10}
              />
              <span className="jd-hint">
                {jobDescription.trim().length} characters
                {jobDescription.trim().length < 30 ? " — paste at least 30 characters" : ""}
              </span>
            </label>

            <div className="grid two" style={{ marginTop: "0.85rem" }}>
              <div className="stat-box">
                <span>Files loaded</span>
                <strong>{candidates.length}</strong>
              </div>
              <div className="stat-box">
                <span>Provider</span>
                <strong style={{ fontSize: "0.95rem" }}>{PROVIDERS.find((p) => p.value === provider)?.label || provider}</strong>
              </div>
            </div>

            <div
              className={`dropzone${dragActive ? " drag" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
            >
              <input ref={inputRef} className="hidden-input" type="file" multiple accept=".pdf,.docx,.doc,.txt" onChange={(e) => addFiles(e.target.files)} />
              <div className="drop-icon">📂</div>
              <p className="drop-title">Drop resumes here or click to browse</p>
              <p className="drop-subtitle">PDF, DOC, DOCX, TXT · up to 10 resumes per batch</p>
            </div>

            {candidates.length > 0 && (
              <div className="chips-wrap">
                {candidates.map((c) => <span key={c.id} className="chip">{c.name}</span>)}
              </div>
            )}

            {uiError && <p className="error-text">{uiError}</p>}

            <div className="cta-row">
              <button className="btn primary" onClick={onScreenCandidates} disabled={!canStart}>
                {loading ? "Screening…" : "▶ Start Screening"}
              </button>
              <button
                className="btn subtle"
                onClick={() => { setCandidates([]); setResult(null); setUiError(""); if (inputRef.current) inputRef.current.value = ""; }}
                disabled={loading || candidates.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        {/* ── Right: results ─────────────────────────────────────── */}
        <section className="card result-card">
          {!result && !loading && (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>No results yet</p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>Upload CVs, paste a job description,<br/>and click Start Screening.</p>
            </div>
          )}

          {loading && !result && (
            <div className="loading-state">
              <div className="spinner" />
              <p className="muted">
                {progress.total > 0
                  ? `Screened ${progress.done} of ${progress.total} candidate${progress.total !== 1 ? "s" : ""}…`
                  : "Screening candidates…"}
              </p>
              {progress.total > 1 && (
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                </div>
              )}
            </div>
          )}

          {result && !selectedCandidate && (
            <>
              {loading && progress.total > 0 && (
                <div className="streaming-banner">
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  <span>Screening {progress.done} of {progress.total}… results appear as each CV is scored</span>
                  <div className="progress-bar-wrap" style={{ flex: 1, minWidth: 80 }}>
                    <div className="progress-bar" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                </div>
              )}
            </>
          )}

          {result && !selectedCandidate && (
            <>
              <div className="metrics">
                <article className="m-processed"><span>Processed</span><strong>{summary.processed}</strong></article>
                <article className="m-matched"><span>Matched</span><strong>{summary.matched}</strong></article>
                <article className="m-shortlisted"><span>Shortlisted</span><strong>{summary.shortlisted}</strong></article>
                <article className="m-errors"><span>Errors</span><strong>{summary.errors}</strong></article>
              </div>

              <div className="candidates-scroll">
                {(result.results || []).map((row, idx) => (
                  <CandidateCard key={row.candidateId || idx} row={row} idx={idx} onClick={() => setSelectedCandidate(row)} />
                ))}
              </div>

              <div className="score-guide">
                <span>Score guide:</span>
                <span className="score-guide-block guide-green">85–100 Excellent</span>
                <span className="score-guide-block guide-yellow">70–84 Good</span>
                <span className="score-guide-block guide-red">Below 70 Weak</span>
              </div>
            </>
          )}

          {selectedCandidate && !loading && (
            <DeepDive candidate={selectedCandidate} onBack={() => setSelectedCandidate(null)} />
          )}
        </section>
      </main>
    </div>
  );
}
