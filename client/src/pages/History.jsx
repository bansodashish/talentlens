import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

// ───────────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['New', 'Contacted', 'Interviewing', 'Hired', 'Rejected'];

const STATUS_STYLE = {
  New:          'bg-slate-100 text-slate-700',
  Contacted:    'bg-blue-100 text-blue-700',
  Interviewing: 'bg-purple-100 text-purple-700',
  Hired:        'bg-green-100 text-green-700',
  Rejected:     'bg-red-100 text-red-700',
};

const SOURCE_LABEL = {
  linkedin_search: 'LinkedIn Search',
  scraper:         'Web Scraper',
  resume_upload:   'Resume Upload',
  manual:          'Manual',
};

const PIPELINE_STAGE_LABELS = {
  shortlisted:  '⭐ Shortlisted',
  contacted:    '📬 Contacted',
  phone_screen: '📞 Phone Screen',
  interview:    '🗓 Interview',
  offer:        '🎉 Offer',
};

const PIPELINE_STAGE_STYLE = {
  shortlisted:  'bg-blue-100 text-blue-700',
  contacted:    'bg-cyan-100 text-cyan-700',
  phone_screen: 'bg-yellow-100 text-yellow-700',
  interview:    'bg-purple-100 text-purple-700',
  offer:        'bg-green-100 text-green-700',
};

// Normalise DB row → CRM candidate model
function toCandidate(row) {
  const rawStatus = (row.status || 'new').toLowerCase();
  const status = STATUS_OPTIONS.find(s => s.toLowerCase() === rawStatus) || 'New';
  return {
    id:            row.id,
    userId:        row.created_by,
    name:          row.name,
    email:         row.email || '',
    phone:         row.phone || '',
    linkedinUrl:   row.linkedin_url || '',
    currentRole:   row.current_title || row.headline || '',
    company:       row.current_company || '',
    location:      row.location || '',
    market:        row.market || 'Global',
    source:        row.source || 'manual',
    overallScore:  row.ai_score || 0,
    status,
    jobTitle:      row.job_title || '',
    pipelineStage: row.pipeline_stage || '',
    cvFilename:    row.cv_filename || '',
    hrNotes:       row.notes || '',
    skills:        row.skills || row.skills_json || '',
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// CSV / Excel helpers
// ───────────────────────────────────────────────────────────────────────────────
function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = v => {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows.map(r => headers.map(h => r[h]))]
    .map(r => r.map(esc).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// "Excel-friendly" — tab-separated, opens cleanly in Excel
function downloadExcel(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const tsv = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))]
    .map(r => r.join('\t'))
    .join('\n');
  const blob = new Blob(['\uFEFF' + tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ───────────────────────────────────────────────────────────────────────────────
// Side panel
// ───────────────────────────────────────────────────────────────────────────────
function SidePanel({ candidate, onClose, onChange }) {
  const [notes, setNotes]   = useState(candidate?.hrNotes || '');
  const [saved, setSaved]   = useState(true);
  const [status, setStatus] = useState(candidate?.status || 'New');

  useEffect(() => {
    setNotes(candidate?.hrNotes || '');
    setStatus(candidate?.status || 'New');
    setSaved(true);
  }, [candidate?.id, candidate?.hrNotes, candidate?.status]);

  // Auto-save notes (debounced)
  useEffect(() => {
    if (!candidate) return;
    if (notes === (candidate.hrNotes || '')) { setSaved(true); return; }
    setSaved(false);
    const t = setTimeout(async () => {
      try {
        await api.patch(`/candidates/${candidate.id}`, { notes });
        onChange?.({ ...candidate, hrNotes: notes });
        setSaved(true);
      } catch (_) { /* keep dirty */ }
    }, 700);
    return () => clearTimeout(t);
  }, [notes, candidate, onChange]);

  if (!candidate) return null;

  const changeStatus = async (next) => {
    setStatus(next);
    try {
      await api.patch(`/candidates/${candidate.id}`, { status: next });
      onChange?.({ ...candidate, status: next });
    } catch (_) { /* ignore */ }
  };

  const skills = Array.isArray(candidate.skills)
    ? candidate.skills
    : (candidate.skills || '').toString().split(/[,;|]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-full max-w-md bg-white shadow-2xl overflow-y-auto">
        <div className="p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">{candidate.name}</h2>
              <p className="text-xs text-slate-500 truncate">
                {candidate.currentRole || '—'}{candidate.company ? ` · ${candidate.company}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <select className="input w-auto text-xs py-1"
              value={status} onChange={e => changeStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="badge badge-blue">{candidate.market}</span>
            <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              {SOURCE_LABEL[candidate.source] || candidate.source}
            </span>
            {candidate.overallScore > 0 && (
              <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                Score {candidate.overallScore}
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Contact</h3>
            <dl className="text-sm space-y-1">
              {candidate.email && <div><span className="text-slate-500">Email:</span> <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline ml-1">{candidate.email}</a></div>}
              {candidate.phone && <div><span className="text-slate-500">Phone:</span> <span className="ml-1">{candidate.phone}</span></div>}
              {candidate.location && <div><span className="text-slate-500">Location:</span> <span className="ml-1">{candidate.location}</span></div>}
              {candidate.linkedinUrl && <div><span className="text-slate-500">LinkedIn:</span> <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-1">View profile →</a></div>}
            </dl>
          </section>

          {skills.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Skills</h3>
              <div className="flex flex-wrap gap-1">
                {skills.slice(0, 30).map((s, i) => (
                  <span key={i} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{s}</span>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase">HR Notes</h3>
              <span className="text-[10px] text-slate-400">{saved ? '✓ Saved' : 'Saving…'}</span>
            </div>
            <textarea
              className="input min-h-[140px] text-sm"
              placeholder="Add notes about this candidate (auto-saved)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </section>

          <section className="text-[11px] text-slate-400 flex justify-between border-t border-slate-100 pt-3">
            <span>Created {new Date(candidate.createdAt).toLocaleDateString()}</span>
            <Link to={`/candidates/${candidate.id}`} className="text-blue-600 hover:underline">Open full profile →</Link>
          </section>
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
function Tabs({ active, setActive }) {
  const tabs = [
    ['candidates',  'All Candidates'],
    ['screenings',  'Resume Screenings'],
  ];
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => setActive(k)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${active === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
function CandidateCard({ candidate: c }) {
  const token = localStorage.getItem('token');
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 truncate">{c.name}</div>
          <div className="text-xs text-slate-400">{c.market}</div>
        </div>
        {c.pipelineStage ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PIPELINE_STAGE_STYLE[c.pipelineStage] || 'bg-slate-100 text-slate-700'}`}>
            {PIPELINE_STAGE_LABELS[c.pipelineStage] || c.pipelineStage}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 whitespace-nowrap">Not in Pipeline</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs border-t border-b border-slate-100 py-2">
        <div>
          <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Job</div>
          <div className="text-slate-700 truncate">{c.jobTitle || '—'}</div>
        </div>
        <div>
          <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Match Score</div>
          <div className="text-slate-700">{c.overallScore > 0 ? `${c.overallScore}%` : '—'}</div>
        </div>
        <div>
          <div className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">Screened On</div>
          <div className="text-slate-700">
            {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </div>
        </div>
      </div>

      <div className="text-xs space-y-1">
        <div><span className="text-slate-400">Email:</span> {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline ml-1">{c.email}</a> : <span className="ml-1 text-slate-300">—</span>}</div>
        <div><span className="text-slate-400">Phone:</span> <span className="ml-1 text-slate-700">{c.phone || '—'}</span></div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {c.cvFilename ? (
          <a
            href={`/api/candidates/${c.id}/download-cv?token=${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs flex-1 text-center"
          >
            View CV
          </a>
        ) : (
          <span className="btn-secondary text-xs flex-1 text-center opacity-50 cursor-not-allowed">View CV</span>
        )}
        <Link to={`/candidates/${c.id}`} className="btn-secondary text-xs flex-1 text-center">
          View Screening Result
        </Link>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
function CandidatesTab() {
  const [rows, setRows]            = useState([]);
  const [loading, setLoading]      = useState(true);
  const [active, setActive]        = useState(null);
  const [selectedIds, setSelected] = useState(new Set());
  const [viewMode, setViewMode]    = useState('table');

  const [market, setMarket]   = useState('');
  const [status, setStatus]   = useState('');
  const [source, setSource]   = useState('');
  const [search, setSearch]   = useState('');
  const [minScore, setMin]    = useState(0);
  const [maxScore, setMax]    = useState(100);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/candidates')
      .then(r => setRows((r.data.candidates || []).map(toCandidate)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(c => {
      if (market && c.market !== market) return false;
      if (status && c.status !== status) return false;
      if (source && c.source !== source) return false;
      const score = c.overallScore || 0;
      if (score < minScore || score > maxScore) return false;
      if (q) {
        const hay = [c.name, c.email, c.currentRole, c.company, c.location].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, market, status, source, search, minScore, maxScore]);

  const allOnPageSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const toggleAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) filtered.forEach(c => next.delete(c.id));
    else                   filtered.forEach(c => next.add(c.id));
    setSelected(next);
  };
  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const exportRows = (which, fmt) => {
    const list = which === 'selected' ? filtered.filter(c => selectedIds.has(c.id)) : filtered;
    const data = list.map(c => ({
      id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.currentRole, company: c.company,
      location: c.location, market: c.market, source: SOURCE_LABEL[c.source] || c.source,
      overallScore: c.overallScore, status: c.status, linkedin: c.linkedinUrl, createdAt: c.createdAt,
    }));
    (fmt === 'xls' ? downloadExcel : downloadCsv)(
      data,
      `candidates_${Date.now()}.${fmt === 'xls' ? 'xls' : 'csv'}`,
    );
  };

  const bulkStatus = async (next) => {
    if (!selectedIds.size) return;
    await api.post('/candidates/bulk-status', { ids: [...selectedIds], status: next.toLowerCase() });
    setSelected(new Set());
    load();
  };

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Delete ${selectedIds.size} candidate(s)? This cannot be undone.`)) return;
    await api.post('/candidates/bulk-delete', { ids: [...selectedIds] });
    setSelected(new Set());
    load();
  };

  return (
    <>
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input col-span-2" placeholder="Search name, role, company…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" value={market} onChange={e => setMarket(e.target.value)}>
            <option value="">All regions</option>
            <option value="Global">🌍 Global</option>
            <option value="Americas">🌎 Americas</option>
            <option value="Europe">🌍 Europe</option>
            <option value="Asia Pacific">🌏 Asia Pacific</option>
            <option value="MENA">🕌 MENA</option>
            <option value="Africa">🌍 Africa</option>
          </select>
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input type="number" min="0" max="100" className="input w-16 text-xs" value={minScore}
              onChange={e => setMin(Number(e.target.value) || 0)} />
            <span className="text-xs text-slate-400">–</span>
            <input type="number" min="0" max="100" className="input w-16 text-xs" value={maxScore}
              onChange={e => setMax(Number(e.target.value) || 100)} />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="card p-3 flex items-center justify-between flex-wrap gap-2 bg-blue-50 border-blue-200">
          <span className="text-sm text-blue-800 font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input text-sm w-44"
              defaultValue=""
              onChange={e => { if (e.target.value) { bulkStatus(e.target.value); e.target.value = ''; } }}
            >
              <option value="">Change status…</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-secondary text-sm" onClick={() => exportRows('selected', 'csv')}>⬇ CSV</button>
            <button className="btn-secondary text-sm" onClick={() => exportRows('selected', 'xls')}>⬇ Excel</button>
            <button className="text-sm px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700" onClick={bulkDelete}>Delete</button>
            <button className="text-sm text-slate-500 hover:text-slate-700" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {/* Table / Card toggle bar */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
          <span className="text-xs text-slate-500">{filtered.length} candidate{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setViewMode('card')}
              >
                Card
              </button>
            </div>
            <button className="btn-secondary text-xs" onClick={() => exportRows('all', 'csv')} disabled={!filtered.length}>⬇ Export CSV</button>
            <button className="btn-secondary text-xs" onClick={() => exportRows('all', 'xls')} disabled={!filtered.length}>⬇ Export Excel</button>
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <p className="text-4xl mb-2">👥</p>
            <p>No candidates match these filters.</p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {filtered.map(c => <CandidateCard key={c.id} candidate={c} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} /></th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Role</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Location</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Email</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Source</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Score</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(c => (
                  <tr key={c.id}
                      className={`hover:bg-slate-50 cursor-pointer ${selectedIds.has(c.id) ? 'bg-blue-50' : ''}`}
                      onClick={() => setActive(c)}>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.market}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="text-slate-700">{c.currentRole || '—'}</div>
                      <div className="text-slate-400">{c.company || ''}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.location || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-[180px]">{c.email || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{SOURCE_LABEL[c.source] || c.source}</td>
                    <td className="px-3 py-2">
                      {c.overallScore > 0
                        ? <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c.overallScore >= 75 ? 'bg-green-100 text-green-700' : c.overallScore >= 55 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{c.overallScore}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{new Date(c.updatedAt || c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && (
        <SidePanel
          candidate={active}
          onClose={() => setActive(null)}
          onChange={updated => {
            setRows(rs => rs.map(r => r.id === updated.id ? updated : r));
            setActive(updated);
          }}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
function SearchesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/history/searches')
      .then(r => setRows(r.data.searches || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>;
  if (!rows.length) return (
    <div className="card p-10 text-center text-slate-400">
      <p className="text-4xl mb-2">🔎</p>
      <p>No LinkedIn searches yet. Go to <Link to="/search" className="text-blue-600 hover:underline">LinkedIn Search</Link>.</p>
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Job title', 'Location', 'Market', 'Experience', 'Results', 'Status', 'Date'].map(h => (
              <th key={h} className="text-left px-4 py-2 font-semibold text-slate-600 text-xs uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-medium text-slate-800">{s.job_title}</td>
              <td className="px-4 py-2 text-slate-600">{s.location || '—'}</td>
              <td className="px-4 py-2 text-slate-600">{s.market || '—'}</td>
              <td className="px-4 py-2 text-slate-600">{s.experience_level || '—'}</td>
              <td className="px-4 py-2 text-slate-700 font-medium">{s.results_count}</td>
              <td className="px-4 py-2">
                <span className={`badge ${s.status === 'completed' ? 'badge-green' : s.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>{s.status}</span>
              </td>
              <td className="px-4 py-2 text-xs text-slate-400">{new Date(s.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Every completed screening is kept forever in the `screenings` table. The tab
// below shows a flat, filterable candidate list (by job, name/email search, and
// pipeline status) rather than grouping by day.
const SCREENING_STATUS_FILTERS = ['All', 'Screened', 'In Pipeline'];


function ScreeningsTab() {
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(searchParams.get('job') || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // expanded row id → detail object
  const [expanded, setExpanded] = useState({});
  const [expandLoading, setExpandLoading] = useState({});

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
        name: c.name,
        email: c.email,
        job_title: c.jobTitle,
        pipeline_stage: 'shortlisted',
        source: 'resume_upload',
      });
      setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'In Pipeline' } : x));
    } catch (err) {
      // If candidate already exists (duplicate email), patch their pipeline stage instead
      if (err.response?.status === 409 || err.response?.data?.candidateId) {
        const existingId = err.response?.data?.candidateId;
        if (existingId) {
          await api.patch(`/candidates/${existingId}`, { pipeline_stage: 'shortlisted' });
          setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'In Pipeline' } : x));
        }
      }
    }
  };

  const recColor = (rec) => {
    if (!rec) return 'bg-slate-100 text-slate-600';
    const r = rec.toLowerCase();
    if (r.includes('strong hire')) return 'bg-green-100 text-green-700';
    if (r.includes('hire')) return 'bg-blue-100 text-blue-700';
    if (r.includes('consider')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const hasAnyJobs = jobs.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Select Job</label>
          <select
            className="input"
            value={selectedJob}
            onChange={e => setSelectedJob(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map(j => (
              <option key={j.jobTitle} value={j.jobTitle}>
                {j.jobTitle} ({j.candidateCount})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Search candidates</label>
          <input
            type="text"
            className="input"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Filter</label>
          <select
            className="input"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {SCREENING_STATUS_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>
      ) : error ? (
        <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>
      ) : !hasAnyJobs && !candidates.length ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-2">🤖</p>
          <p>No screening batches yet. Go to <Link to="/screen" className="text-blue-600 hover:underline">AI Resume Screener</Link>.</p>
        </div>
      ) : !candidates.length ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-2">🔍</p>
          <p>No candidates match this filter.</p>
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
                    <td className="px-4 py-2 text-xs text-slate-400">{new Date(c.screenedOn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleExpand(c)}
                          className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
                        >
                          {expandLoading[c.id] ? '…' : expanded[c.id] ? 'Hide Results' : 'View Results'}
                        </button>
                        {c.status === 'Screened' && (
                          <button
                            onClick={() => addToPipeline(c)}
                            className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium whitespace-nowrap"
                          >
                            + Add to Pipeline
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
                                    {expanded[c.id].strengths.map((s, i) => (
                                      <li key={i} className="text-xs text-slate-600">• {s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {expanded[c.id].gaps?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-red-600 mb-1">⚠️ Gaps</p>
                                  <ul className="space-y-0.5">
                                    {expanded[c.id].gaps.map((g, i) => (
                                      <li key={i} className="text-xs text-slate-600">• {g}</li>
                                    ))}
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

// ───────────────────────────────────────────────────────────────────────────────
export default function History() {
  const [searchParams] = useSearchParams();
  const validTabs = ['candidates', 'screenings'];
  const initialTab = validTabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'candidates';
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidate History & CRM</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage candidates, review past searches and screening batches.</p>
        </div>
        <Tabs active={tab} setActive={setTab} />
      </div>

      {tab === 'candidates'  && <CandidatesTab />}
      {tab === 'screenings'  && <ScreeningsTab />}
    </div>
  );
}
