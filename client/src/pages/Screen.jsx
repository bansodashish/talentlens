import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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

function ResultCard({ rank, c, onAddToPipeline, isAdded }) {
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
                <div className={`text-3xl font-bold ${overallColor}`}>{overall}</div>
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

      {/* Add to Pipeline */}
      {c.status !== 'pending' && !c.error && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Add this candidate to your recruitment pipeline
          </p>
          {isAdded ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Added to Pipeline
            </span>
          ) : (
            <button
              onClick={() => onAddToPipeline?.(c)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Add to Pipeline
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ScreeningHistory({ jobFilter, onClearJobFilter }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(jobFilter || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [expandLoading, setExpandLoading] = useState({});

  // Sync external jobFilter prop into internal selectedJob
  useEffect(() => { setSelectedJob(jobFilter || ''); }, [jobFilter]);

  useEffect(() => {
    api.get('/screen/jobs')
      .then(r => setJobs(r.data.jobs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = {};
    if (selectedJob) params.jobTitle = selectedJob;
    if (search.trim()) params.q = search.trim();
    if (statusFilter !== 'All') params.status = statusFilter;
    api.get('/screen/candidates', { params })
      .then(r => { if (active) setCandidates(r.data.candidates || []); })
      .catch(err => { if (active) setError(err.response?.data?.error || 'Failed to load screening history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedJob, search, statusFilter]);

  const toggleExpand = async (c) => {
    if (expanded[c.id]) {
      setExpanded(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      return;
    }
    setExpandLoading(prev => ({ ...prev, [c.id]: true }));
    try {
      const r = await api.get(`/screen/screening/${c.id}`);
      setExpanded(prev => ({ ...prev, [c.id]: r.data.screening }));
    } catch (_) {
      setExpanded(prev => ({ ...prev, [c.id]: { error: 'Could not load results.' } }));
    } finally {
      setExpandLoading(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    }
  };

  const addToPipeline = async (c) => {
    try {
      await api.post('/candidates', {
        name: c.name, email: c.email, job_title: c.jobTitle,
        pipeline_stage: 'shortlisted', source: 'resume_upload',
      });
      setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'In Pipeline' } : x));
    } catch (err) {
      const existingId = err.response?.data?.candidateId;
      if (existingId) {
        await api.patch(`/candidates/${existingId}`, { pipeline_stage: 'shortlisted' });
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'In Pipeline', candidateId: existingId } : x));
      }
    }
  };

  const removeFromPipeline = async (c) => {
    if (!c.candidateId) return;
    await api.patch(`/candidates/${c.candidateId}`, { pipeline_stage: null });
    setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Screened', candidateId: c.candidateId } : x));
  };

  const recColor = (rec) => {
    if (!rec) return 'bg-slate-100 text-slate-600';
    const r = rec.toLowerCase();
    if (r.includes('strong hire')) return 'bg-green-100 text-green-700';
    if (r.includes('hire')) return 'bg-blue-100 text-blue-700';
    if (r.includes('consider')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Select Job</label>
          <select className="input" value={selectedJob}
            onChange={e => { setSelectedJob(e.target.value); if (onClearJobFilter && !e.target.value) onClearJobFilter(); }}>
            <option value="">All jobs</option>
            {jobs.map(j => (
              <option key={j.jobTitle} value={j.jobTitle}>{j.jobTitle} ({j.candidateCount})</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Search candidates</label>
          <input type="text" className="input" placeholder="Search by name or email…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Filter</label>
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {['All', 'Screened', 'In Pipeline'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>
      ) : error ? (
        <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>
      ) : !candidates.length ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-2">🤖</p>
          <p>{selectedJob ? `No screened candidates for "${selectedJob}".` : 'No screening results yet. Use the Screen Candidates tab to get started.'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Candidate', 'Match Score', 'Status', 'Screened On', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-2 font-semibold text-slate-600 text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map(c => (
                <React.Fragment key={c.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-2 text-slate-700 font-medium">{c.matchScore}%</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'In Pipeline' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {new Date(c.screenedOn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleExpand(c)}
                          className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium">
                          {expandLoading[c.id] ? '…' : expanded[c.id] ? 'Hide Results' : 'View Results'}
                        </button>
                        {c.status === 'Screened' && (
                          <button onClick={() => addToPipeline(c)}
                            className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium whitespace-nowrap">
                            + Add to Pipeline
                          </button>
                        )}
                        {c.status === 'In Pipeline' && c.candidateId && (
                          <button onClick={() => removeFromPipeline(c)}
                            className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium whitespace-nowrap">
                            Remove from Pipeline
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded[c.id] && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-6 py-4">
                        {expanded[c.id].error ? (
                          <p className="text-sm text-red-600">{expanded[c.id].error}</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-semibold text-slate-500">Job:</span>
                              <span className="text-xs text-slate-700">{expanded[c.id].jobTitle || c.jobTitle}</span>
                              {expanded[c.id].recommendation && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${recColor(expanded[c.id].recommendation)}`}>
                                  {expanded[c.id].recommendation}
                                </span>
                              )}
                            </div>
                            {expanded[c.id].summary && (
                              <p className="text-xs text-slate-600 leading-relaxed">{expanded[c.id].summary}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {expanded[c.id].strengths?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-green-700 mb-1">✅ Strengths</p>
                                  <ul className="space-y-0.5">
                                    {expanded[c.id].strengths.map((s, i) => <li key={i} className="text-xs text-slate-600">• {s}</li>)}
                                  </ul>
                                </div>
                              )}
                              {expanded[c.id].gaps?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-red-600 mb-1">⚠️ Gaps</p>
                                  <ul className="space-y-0.5">
                                    {expanded[c.id].gaps.map((g, i) => <li key={i} className="text-xs text-slate-600">• {g}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Screen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab]   = useState(() => searchParams.get('tab') === 'history' ? 'history' : 'screen');
  const [jobFilter, setJobFilter] = useState(() => searchParams.get('job') || '');
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobMode, setJobMode] = useState('existing');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobsList, setJobsList] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const scanMode = 'local';
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [results, setResults] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [savedMsg, setSavedMsg] = useState('');
  const [addedToPipeline, setAddedToPipeline] = useState(new Set());
  const [pipelineMsg, setPipelineMsg] = useState('');
  const fileInputRef = useRef(null);
  const consumedNavPrefill = useRef(false);

  useEffect(() => {
    if (consumedNavPrefill.current) return;
    const navState = location.state || {};
    const titleFromNav = (navState.jobTitle || '').trim();
    const descriptionFromNav = (navState.jobDescription || '').trim();
    if (!titleFromNav && !descriptionFromNav) return;

    if (titleFromNav) setJobTitle(titleFromNav);
    if (descriptionFromNav) setJobDescription(descriptionFromNav);
    setJobMode('existing');
    if (navState.jobId) {
      setSelectedJobId(navState.jobId);
      setJobsList(prev => (prev.some(j => String(j.id) === String(navState.jobId))
        ? prev
        : [{ id: navState.jobId, title: titleFromNav, description: descriptionFromNav }, ...prev]));
    }
    setActiveTab('screen');
    consumedNavPrefill.current = true;
  }, [location.state]);

  // Fetch active jobs to populate the "Select Existing Job" dropdown.
  useEffect(() => {
    let cancelled = false;
    setLoadingJobs(true);
    api.get('/jobs', { params: { status: 'active' } })
      .then(res => { if (!cancelled) setJobsList(res.data?.jobs || []); })
      .catch(() => { if (!cancelled) setJobsList([]); })
      .finally(() => { if (!cancelled) setLoadingJobs(false); });
    return () => { cancelled = true; };
  }, []);

  // Keep sessionStorage in sync so switching to another page and back
  // restores the last job description + results instead of losing them.
  useEffect(() => {
    try {
      sessionStorage.setItem(SCREEN_STATE_KEY, JSON.stringify({ jobDescription, jobTitle, jobMode, selectedJobId, scanMode, results, batchId }));
    } catch (_) { /* ignore quota/serialization errors */ }
  }, [jobDescription, jobTitle, jobMode, selectedJobId, scanMode, results, batchId]);

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
    if (!selectedJobId)         { setError('Please select an existing job.'); return; }
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
        autoSaveToHistory(bId, data.results || []);
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
            if (batch.status === 'completed') autoSaveToHistory(bId, batch.results || []);
          }
        } catch (pollErr) {
          clearInterval(interval);
          setLoading(false);
          setProgress(0);
          setError('Lost connection to screening task: ' + (pollErr.response?.data?.error || pollErr.message));
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

  // Screenings are persisted server-side the instant they're scored — this
  // just surfaces the confirmation automatically instead of requiring a click.
  const autoSaveToHistory = (bId, resultRows) => {
    if (!bId) return;
    const n = resultRows.filter(r => r.status !== 'failed' && !r.error).length;
    setSavedMsg(`Saved — ${n} candidate${n === 1 ? '' : 's'} added to your History.`);
    setTimeout(() => setSavedMsg(''), 4000);
  };

  const addToPipeline = async (c) => {
    const key = c.email || c.name || c.fileName;
    if (addedToPipeline.has(key)) return;
    try {
      const matchedFile = files.find(f => f.name === c.fileName);
      const form = new FormData();
      form.append('name',           c.name || c.fileName || 'Unknown');
      form.append('email',          c.email || '');
      form.append('phone',          c.phone || '');
      form.append('current_title',  c.currentRole || '');
      form.append('ai_score',       c.overallScore || '');
      form.append('ai_summary',     c.summary || '');
      form.append('pipeline_stage', 'shortlisted');
      form.append('source',         'resume_upload');
      form.append('notes',          c.summary || '');
      form.append('job_title',      jobTitle || '');
      if (matchedFile) form.append('cv', matchedFile);

      await api.post('/candidates', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAddedToPipeline(prev => new Set([...prev, key]));
      setPipelineMsg(`${c.name || c.fileName} added to pipeline as Shortlisted.`);
      setTimeout(() => setPipelineMsg(''), 4000);
    } catch (err) {
      setPipelineMsg(err.response?.data?.error || 'Could not add to pipeline.');
      setTimeout(() => setPipelineMsg(''), 4000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Resume Screener</h1>
          <p className="text-slate-500 text-sm mt-0.5">Local JD matching across skills, experience, location and role fit</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'screen',  label: 'Screen Candidates', icon: '⚡' },
          { id: 'history', label: 'Screening History',  icon: '📋' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setJobFilter(''); }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Screening History tab ── */}
      {activeTab === 'history' && (
        <ScreeningHistory
          jobFilter={jobFilter}
          onClearJobFilter={() => { setJobFilter(''); setSearchParams({ tab: 'history' }); }}
        />
      )}

      {/* ── Screen Candidates tab ── */}
      {activeTab === 'screen' && (
        <>

      {/* Form */}
      <form onSubmit={runScreening} className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job *</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto max-w-xs"
              value={selectedJobId}
              onChange={e => {
                const id = e.target.value;
                setSelectedJobId(id);
                const job = jobsList.find(j => String(j.id) === String(id));
                if (job) {
                  setJobTitle(job.title || '');
                  setJobDescription(job.description || '');
                }
                // Switching jobs should not carry over the previous job's screening results.
                setResults([]);
                setBatchId(null);
                setFiles([]);
                setProgress(0);
                setError('');
                setSavedMsg('');
                setPipelineMsg('');
                setAddedToPipeline(new Set());
              }}
            >
              <option value="">{loadingJobs ? 'Loading jobs…' : '— Select a Job —'}</option>
              {jobsList.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>

            <button
              type="button"
              className="btn-secondary text-sm whitespace-nowrap"
              onClick={() => navigate('/jobs/new', { state: { returnTo: '/cv-match' } })}
            >
              + Create New Job
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job Description *</label>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            placeholder="Paste the full job description here (role, responsibilities, must-haves, location)…"
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CV Files <span className="text-slate-400 font-normal">(PDF, DOCX, TXT — up to 25)</span>
          </label>
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const dropped = Array.from(e.dataTransfer.files || []);
              setFiles(prev => [...prev, ...dropped]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.docx,.doc"
              onChange={handleFilesChange}
              className="hidden"
            />
            <div className="text-3xl mb-1">📎</div>
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
                  className="text-red-500 hover:text-red-700 text-xs"
                  onClick={() => removeFile(i)}
                  disabled={loading}
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
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Screening…
              </span>
            ) : `⚡ Screen ${files.length || ''} CV${files.length === 1 ? '' : 's'}`}
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
              <button onClick={() => setActiveTab('history')} className="ml-auto text-emerald-700 hover:underline font-medium text-xs">View History →</button>
            </div>
          )}

          {pipelineMsg && (
            <div className="card p-3 bg-blue-50 border-blue-200 text-blue-800 text-sm flex items-center gap-2">
              <span>📊</span>
              <span>{pipelineMsg}</span>
              <Link to="/pipeline" className="ml-auto text-blue-700 hover:underline font-medium text-xs">View Pipeline →</Link>
            </div>
          )}

          <div className="space-y-3">
            {results.map((c, i) => (
              <ResultCard
                key={c.id || i}
                rank={i + 1}
                c={c}
                onAddToPipeline={addToPipeline}
                isAdded={addedToPipeline.has(c.email || c.name || c.fileName)}
              />
            ))}
          </div>
        </>
      )}

      {!loading && results.length === 0 && !error && (
          <div className="card text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">⚡</div>
            <p className="font-medium text-slate-600 mb-1">Scan resumes locally</p>
            <p className="text-sm">Paste a JD, upload CVs, and get ranked results in seconds.</p>
          </div>
        )}
        </>
      )}
    </div>
  );
}
