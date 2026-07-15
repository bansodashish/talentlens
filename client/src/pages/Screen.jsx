import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

// Persist in-progress/completed screening state across page navigation —
// results and the JD are otherwise lost the moment this component unmounts.
const SCREEN_STATE_KEY = 'tl_screen_state';

function loadPersistedScreenState() {
  try {
    const raw = sessionStorage.getItem(SCREEN_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

const REC_STYLE = {
  'Strong Hire': 'bg-green-100 text-green-800 border-green-300',
  'Consider':    'bg-amber-100 text-amber-800 border-amber-300',
  'Reject':      'bg-red-100 text-red-700 border-red-300',
};

const SCORE_BARS = [
  { key: 'supplyChainScore', label: 'Skills Match', color: 'bg-blue-600' },
  { key: 'procurementScore', label: 'Experience',  color: 'bg-brand-600' },
  { key: 'logisticsScore',   label: 'Location',  color: 'bg-emerald-600' },
  { key: 'technologyScore',  label: 'Role / Title', color: 'bg-amber-500' },
];

function Bar({ label, value, color }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{v}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function ResultCard({ rank, c }) {
  if (c.status === 'failed' || c.error) {
    return (
      <div className="card p-4 border-l-4 border-red-400">
        <div className="flex items-center justify-between">
          <div className="font-medium text-slate-700">{c.fileName}</div>
          <span className="badge badge-red">Failed</span>
        </div>
        <p className="text-xs text-red-600 mt-1">{c.error}</p>
      </div>
    );
  }

  const overall = Number(c.overallScore) || 0;
  const overallColor =
    overall >= 75 ? 'text-green-700' :
    overall >= 55 ? 'text-amber-700' : 'text-red-700';

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 truncate">{c.name || c.fileName}</h3>
              {c.status === 'pending'
                ? <span className="text-[11px] px-2 py-0.5 rounded-full border font-medium bg-slate-100 text-slate-400 border-slate-200">Analysing…</span>
                : <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${REC_STYLE[c.recommendation] || 'bg-slate-100 text-slate-700'}`}>{c.recommendation}</span>
              }
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {c.currentRole || '—'} · {Number(c.yearsExperience) || 0} yrs experience
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {c.email && <span>✉ {c.email}</span>}
              {c.phone && <span className="ml-2">📞 {c.phone}</span>}
              {!c.email && !c.phone && <span className="italic">No contact extracted</span>}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {c.status === 'pending'
            ? <div className="text-sm text-slate-400 italic">Processing…</div>
            : <>
                <div className={`text-3xl font-bold tabular-nums ${overallColor}`}>{overall}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Overall</div>
              </>
          }
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {c.status === 'pending'
          ? <div className="col-span-4 text-xs text-slate-400 italic">Waiting for model response…</div>
          : SCORE_BARS.map(b => <Bar key={b.key} label={b.label} value={c[b.key]} color={b.color} />)
        }
      </div>

      {c.summary && (
        <p className="text-sm text-slate-600 mt-4 leading-relaxed">{c.summary}</p>
      )}

      {(c.strengths || []).length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">✅ Reasons for Selection</p>
          <div className="space-y-1.5">
            {c.strengths.map((s, i) => (
              <div key={i} className="flex gap-2 text-[12px]">
                <span className="font-semibold text-emerald-700 whitespace-nowrap">{s}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-600">Matched job requirement — candidate demonstrates this skill</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(c.gaps || []).length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide mb-2">⚠️ Lacking Points</p>
          <div className="space-y-1.5">
            {c.gaps.map((g, i) => (
              <div key={i} className="flex gap-2 text-[12px]">
                <span className="font-semibold text-rose-600 whitespace-nowrap">{g}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-600">Required by the JD but not found in the candidate's CV</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(c.keySkills || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {c.keySkills.slice(0, 12).map((s, i) => (
            <span key={i} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              {s}
            </span>
          ))}
          {c.keySkills.length > 12 && (
            <span className="text-[11px] text-slate-400">+{c.keySkills.length - 12}</span>
          )}
        </div>
      )}

      <p className="text-[10px] text-slate-300 mt-3"><span aria-hidden="true">📄</span> {c.fileName}</p>
    </div>
  );
}

export default function Screen() {
  const [jobDescription, setJobDescription] = useState(() => loadPersistedScreenState()?.jobDescription || '');
  const [jobTitle, setJobTitle] = useState(() => loadPersistedScreenState()?.jobTitle || '');
  const [scanMode, setScanMode] = useState(() => loadPersistedScreenState()?.scanMode || 'local');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [results, setResults] = useState(() => loadPersistedScreenState()?.results || []);
  const [batchId, setBatchId] = useState(() => loadPersistedScreenState()?.batchId || null);
  const [savedMsg, setSavedMsg] = useState('');
  const fileInputRef = useRef(null);

  // Keep sessionStorage in sync so switching to another page and back
  // restores the last job description + results instead of losing them.
  useEffect(() => {
    try {
      sessionStorage.setItem(SCREEN_STATE_KEY, JSON.stringify({ jobDescription, jobTitle, scanMode, results, batchId }));
    } catch (_) { /* ignore quota/serialization errors */ }
  }, [jobDescription, jobTitle, scanMode, results, batchId]);

  const stats = useMemo(() => {
    const done     = results.filter(r => r.status !== 'pending');
    const hires    = done.filter(r => r.recommendation === 'Strong Hire').length;
    const consider = done.filter(r => r.recommendation === 'Consider').length;
    const rejects  = done.filter(r => r.recommendation === 'Reject').length;
    return { hires, consider, rejects };
  }, [results]);

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => {
      // dedupe by name + size
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`));
      return [...prev, ...picked.filter(f => !seen.has(`${f.name}:${f.size}`))];
    });
    e.target.value = '';
  };

  const removeFile = (idx) => setFiles(files.filter((_, i) => i !== idx));

  const runScreening = async (e) => {
    e.preventDefault();
    if (!jobTitle.trim())       { setError('Please enter the job title being hired for.'); return; }
    if (!jobDescription.trim()) { setError('Please paste a job description.'); return; }
    if (!files.length)          { setError('Please upload at least one CV.');  return; }

    setError(''); setResults([]); setBatchId(null);
    setLoading(true); setProgress(0);

    const form = new FormData();
    form.append('job_title', jobTitle);
    form.append('job_description', jobDescription);
    form.append('mode', scanMode);
    files.forEach(f => form.append('files', f));

    try {
      const { data } = await api.post('/screen/resume', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600_000,
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded * 90) / e.total)); // Max 90% for upload phase
        },
      });

      const bId = data.batchId;
      setBatchId(bId);

      if (data.status === 'completed') {
        setResults(data.results || []);
        setLoading(false);
        setProgress(0);
        return;
      }

      // Start polling the gated async batch route
      let pollCount = 0;
      const interval = setInterval(async () => {
        pollCount++;
        try {
          const res = await api.get(`/screen/batch/${bId}`);
          const batch = res.data;

          setResults(batch.results || []);

          if (batch.progress) {
            const { total, completed, failed } = batch.progress;
            const done = completed + failed;
            // Map the remaining 10% - 100% to processing progress
            const processPct = total > 0 ? Math.round((done * 100) / total) : 0;
            setProgress(processPct);
          }

          if (batch.status === 'completed' || pollCount > 300) {
            clearInterval(interval);
            setLoading(false);
            setProgress(0);
          }
        } catch (pollErr) {
          clearInterval(interval);
          setLoading(false);
          setProgress(0);
          setError('Connection lost during screening. Try uploading the resumes again or check your internet connection. (' + (pollErr.response?.data?.error || pollErr.message) + ')');
        }
      }, 2000);

    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.hint || err.message || 'Screening failed.');
      setLoading(false);
      setProgress(0);
    }
  };

  const exportCsv = () => {
    if (!results.length) return;
    const headers = [
      'rank','fileName','name','email','phone','currentRole','yearsExperience',
      'overallScore','skillsMatchScore','experienceScore','locationScore','roleTitleScore',
      'recommendation','keySkills','summary',
    ];
    const rows = results.map((c, i) => [
      i + 1, c.fileName, c.name, c.email, c.phone, c.currentRole, c.yearsExperience,
      c.overallScore, c.supplyChainScore, c.procurementScore, c.logisticsScore, c.technologyScore,
      c.recommendation, (c.keySkills || []).join('; '), c.summary,
    ]);
    const esc = v => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_screening_${batchId || Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToHistory = () => {
    // Screenings are persisted server-side the moment they're scored,
    // so this is just a friendly confirmation for the recruiter.
    if (!batchId) return;
    const n = results.filter(r => r.status !== 'failed' && !r.error).length;
    setSavedMsg(`Saved — ${n} candidate${n === 1 ? '' : 's'} added to your History.`);
    setTimeout(() => setSavedMsg(''), 4000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Resume Screener</h1>
          <p className="text-slate-500 text-sm mt-0.5">Local JD matching across skills, experience, location and role fit</p>
        </div>
        <Link to="/history" className="btn-secondary text-sm">📋 History</Link>
      </div>

      {/* Form */}
      <form onSubmit={runScreening} className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Senior DevOps Engineer"
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job Description *</label>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            placeholder="Paste the full job description here (role, responsibilities, must-haves, location)…"
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runScreening(e); }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Screening Mode</label>
          <select
            className="input"
            value={scanMode}
            onChange={e => setScanMode(e.target.value)}
            disabled={loading}
          >
            <option value="local">⚡ Local keyword scan (free, instant)</option>
            <option value="openclaw-local">🦅 OpenClaw local model (private VPS inference)</option>
            <option value="ai">🤖 Claude AI (cloud — requires API key)</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">
            {scanMode === 'local' && 'Fast keyword scoring — no API key needed, results in seconds.'}
            {scanMode === 'openclaw-local' && 'Runs inference on your VPS via Ollama — private, no cloud billing.'}
            {scanMode === 'ai' && 'Claude AI scoring — requires a Claude API key saved in Profile → API Keys.'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CV Files <span className="text-slate-400 font-normal">(PDF, DOCX, TXT — up to 25)</span>
          </label>
          <div
            role="button"
            tabIndex={0}
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const dropped = Array.from(e.dataTransfer.files || []);
              setFiles(prev => [...prev, ...dropped]);
            }}
            aria-label="Upload CV files — click or drag and drop"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.docx,.doc"
              onChange={handleFilesChange}
              className="hidden"
              aria-hidden="true"
            />
            <div className="text-3xl mb-1" aria-hidden="true">📎</div>
            <p className="text-sm text-slate-600">Click or drop CV files here</p>
            <p className="text-xs text-slate-400 mt-1">Max 15 MB per file</p>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400">📄</span>
                  <span className="truncate text-slate-700">{f.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                </span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 text-xs focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 rounded"
                  onClick={() => removeFile(i)}
                  disabled={loading}
                  aria-label={`Remove ${f.name}`}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>
                {progress > 0 && progress < 100
                  ? `Analysing resumes: ${progress}% complete…`
                  : progress === 100
                  ? 'Compiling final scores…'
                  : scanMode === 'openclaw-local'
                  ? 'Extracting text and scoring with OpenClaw local model…'
                  : scanMode === 'ai'
                  ? 'Uploading CVs and scoring with Claude…'
                  : 'Extracting text and scoring locally…'}
              </span>
              <span>{progress > 0 ? `${progress}%` : 'Processing…'}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progress < 100 ? 'bg-blue-600' : 'bg-blue-600 animate-pulse'}`}
                style={{ width: `${progress > 0 ? progress : 10}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            <span className="flex items-center gap-2">
              {loading && <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" aria-hidden="true"></span>}
              <span aria-hidden="true">⚡</span>
              {loading ? `Screening ${files.length} CV${files.length === 1 ? '' : 's'}…` : `Screen ${files.length || ''} CV${files.length === 1 ? '' : 's'}`}
            </span>
          </button>
        </div>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <>
          <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-500">{results.filter(r => r.status !== 'pending').length} of {results.length} screened</span>
              <span className="text-green-700">✓ {stats.hires} Strong Hire</span>
              <span className="text-amber-700">~ {stats.consider} Consider</span>
              <span className="text-red-600">✗ {stats.rejects} Reject</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-sm" onClick={exportCsv}>⬇ Export CSV</button>
              <button className="btn-primary text-sm" onClick={saveToHistory}>💾 Save to History</button>
            </div>
          </div>

          {savedMsg && (
            <div className="card p-3 bg-emerald-50 border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
              <span>✅</span>
              <span>{savedMsg}</span>
              <Link to="/history" className="ml-auto text-emerald-700 hover:underline font-medium text-xs">View History →</Link>
            </div>
          )}

          <div className="space-y-3">
            {results.map((c, i) => <ResultCard key={c.id || i} rank={i + 1} c={c} />)}
          </div>
        </>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="card text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">⚡</div>
          <p className="font-medium text-slate-600 mb-1">Choose Local, OpenClaw Local, or Claude mode</p>
          <p className="text-sm">Paste a JD, upload CVs, and get ranked results in seconds.</p>
        </div>
      )}
    </div>
  );
}
