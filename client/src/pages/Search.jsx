import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const LOCATION_OPTIONS = [
  { value: 'United States',  label: '🌎 United States',  market: 'Americas' },
  { value: 'United Kingdom', label: '🌍 United Kingdom', market: 'Europe'   },
  { value: 'Germany',        label: '🌍 Germany',        market: 'Europe'   },
  { value: 'India',          label: '🌏 India',          market: 'Asia Pacific' },
  { value: 'Singapore',      label: '🌏 Singapore',      market: 'Asia Pacific' },
  { value: 'United Arab Emirates', label: '🕌 United Arab Emirates', market: 'MENA' },
  { value: 'Remote',         label: '🌍 Remote',         market: 'Global' },
];

const EXPERIENCE_OPTIONS = ['Entry', 'Mid', 'Senior'];
const MAX_RESULT_OPTIONS = [50, 100, 200];

export default function Search() {
  const [form, setForm] = useState({
    jobTitle: '',
    location: 'United States',
    customLocation: '',
    experienceLevel: 'Mid',
    maxResults: 50,
  });
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState([]);
  const [searchId, setSearchId] = useState(null);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // Filters
  const [filterText, setFilterText]  = useState('');
  const [emailFilter, setEmailFilter] = useState('all'); // all | yes | no
  const [showEmails, setShowEmails]   = useState(false);

  const selectedLocation = form.location === '__custom' ? form.customLocation : form.location;
  const market = LOCATION_OPTIONS.find(o => o.value === form.location)?.market || 'Global';

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return results.filter(c => {
      if (emailFilter === 'yes' && !c.email) return false;
      if (emailFilter === 'no'  &&  c.email) return false;
      if (!q) return true;
      const hay = [
        c.name, c.headline, c.current_title, c.current_company,
        c.location, c.email,
        ...(c.skills || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [results, filterText, emailFilter]);

  const runSearch = async (e) => {
    e.preventDefault();
    setError(''); setResults([]); setSearchId(null); setSaveResult(null);
    setLoading(true);
    try {
      const { data } = await api.post('/search/linkedin', {
        jobTitle:        form.jobTitle,
        location:        selectedLocation,
        market,
        experienceLevel: form.experienceLevel,
        maxResults:      form.maxResults,
      });
      setResults(data.candidates || []);
      setSearchId(data.searchId);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.hint || err.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  const saveToHistory = async () => {
    if (!filtered.length) return;
    setSaving(true); setSaveResult(null);
    try {
      const { data } = await api.post('/search/save', {
        searchId,
        candidates: filtered,
      });
      setSaveResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = ['rank','name','headline','current_title','current_company','location','email','skills','profileUrl'];
    const rows = filtered.map((c, i) => [
      i + 1,
      c.name,
      c.headline,
      c.current_title,
      c.current_company,
      c.location,
      c.email,
      (c.skills || []).join('; '),
      c.profileUrl,
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
    a.download = `linkedin_search_${form.jobTitle.replace(/\s+/g, '_')}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">LinkedIn Candidate Search</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Find profiles via the harvestapi LinkedIn search actor (Full + email mode)
          </p>
        </div>
        <Link to="/scraper" className="btn-secondary text-sm">📋 Search History</Link>
      </div>

      {/* Search form */}
      <div className="card p-5">
        <form onSubmit={runSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
              <input
                type="text" required className="input"
                placeholder="e.g. Product Manager"
                value={form.jobTitle}
                onChange={e => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <select
                className="input"
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
              >
                {LOCATION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option value="__custom">✏️ Custom…</option>
              </select>
              {form.location === '__custom' && (
                <input
                  type="text" className="input mt-2"
                  placeholder="Enter location"
                  value={form.customLocation}
                  onChange={e => setForm({ ...form, customLocation: e.target.value })}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Experience</label>
                <select
                  className="input"
                  value={form.experienceLevel}
                  onChange={e => setForm({ ...form, experienceLevel: e.target.value })}
                >
                  {EXPERIENCE_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max</label>
                <select
                  className="input"
                  value={form.maxResults}
                  onChange={e => setForm({ ...form, maxResults: Number(e.target.value) })}
                >
                  {MAX_RESULT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-400">
              Uses the shared Apify token configured on the server (override via <Link to="/profile" className="text-blue-600 hover:underline">Profile → Settings</Link>).
            </p>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Searching LinkedIn…
                </span>
              ) : '🔍 Search LinkedIn'}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>

      {/* Save banner */}
      {saveResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-green-800">✅ Saved</p>
            <p className="text-sm text-green-700 mt-0.5">
              {saveResult.inserted} candidates added · {saveResult.skipped} skipped (duplicates)
            </p>
          </div>
          <Link to="/candidates" className="btn-secondary text-sm">View Candidates →</Link>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="card overflow-hidden">
          {/* Filter bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                className="input w-64"
                placeholder="Filter by name, skill, company…"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />
              <select
                className="input w-40"
                value={emailFilter}
                onChange={e => setEmailFilter(e.target.value)}
              >
                <option value="all">All candidates</option>
                <option value="yes">With email</option>
                <option value="no">Without email</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={showEmails}
                  onChange={e => setShowEmails(e.target.checked)}
                />
                Show emails
              </label>
              <span className="text-xs text-slate-500">
                {filtered.length} of {results.length} shown
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-sm" onClick={exportCsv} disabled={!filtered.length}>
                ⬇ Export CSV
              </button>
              <button className="btn-primary text-sm" onClick={saveToHistory} disabled={!filtered.length || saving}>
                {saving ? 'Saving…' : '💾 Save to History'}
              </button>
            </div>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-12">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Current Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Skills</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c, i) => (
                  <tr key={c.profileUrl || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                          {(c.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{c.name}</div>
                          {c.headline && (
                            <div className="text-xs text-slate-400 truncate max-w-[260px]" title={c.headline}>
                              {c.headline}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700 text-xs">{c.current_title || '—'}</div>
                      <div className="text-xs text-slate-400">{c.current_company || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.location || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {c.email
                        ? (showEmails
                            ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a>
                            : <span className="text-slate-400">••• hidden</span>)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(c.skills || []).slice(0, 4).map((s, idx) => (
                          <span key={idx} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                        {(c.skills || []).length > 4 && (
                          <span className="text-[10px] text-slate-400">+{c.skills.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.profileUrl && (
                        <a
                          href={c.profileUrl}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">No candidates match the current filter.</div>
          )}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="card text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">🔎</div>
          <p className="font-medium text-slate-600 mb-1">Search LinkedIn for candidates</p>
          <p className="text-sm">Enter a job title, pick a location and hit Search.</p>
        </div>
      )}
    </div>
  );
}
