import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
    ['searches',    'LinkedIn Searches'],
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
function CandidatesTab() {
  const [rows, setRows]            = useState([]);
  const [loading, setLoading]      = useState(true);
  const [active, setActive]        = useState(null);
  const [selectedIds, setSelected] = useState(new Set());

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

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
          <span className="text-xs text-slate-500">{filtered.length} candidate{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
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
function ScreeningsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/history/screenings')
      .then(r => setRows(r.data.batches || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>;
  if (!rows.length) return (
    <div className="card p-10 text-center text-slate-400">
      <p className="text-4xl mb-2">🤖</p>
      <p>No screening batches yet. Go to <Link to="/screen" className="text-blue-600 hover:underline">AI Resume Screener</Link>.</p>
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Batch', 'CVs', 'Strong Hire', 'Consider', 'Reject', 'Top Score', 'Avg', 'Date'].map(h => (
              <th key={h} className="text-left px-4 py-2 font-semibold text-slate-600 text-xs uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(b => (
            <tr key={b.batch_id} className="hover:bg-slate-50">
              <td className="px-4 py-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{b.batch_id.slice(0, 8)}</code></td>
              <td className="px-4 py-2 font-medium text-slate-800">{b.total}</td>
              <td className="px-4 py-2 text-green-700">{b.strong_hire}</td>
              <td className="px-4 py-2 text-amber-700">{b.consider}</td>
              <td className="px-4 py-2 text-red-600">{b.reject}</td>
              <td className="px-4 py-2 font-medium text-slate-700">{b.top_score || 0}</td>
              <td className="px-4 py-2 text-slate-600">{Math.round(b.avg_score || 0)}</td>
              <td className="px-4 py-2 text-xs text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
export default function History() {
  const [tab, setTab] = useState('candidates');

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
      {tab === 'searches'    && <SearchesTab />}
      {tab === 'screenings'  && <ScreeningsTab />}
    </div>
  );
}
