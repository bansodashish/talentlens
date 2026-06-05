import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const MARKET_FLAG = { UK: '🇬🇧', Dubai: '🇦🇪', Global: '🌍', Americas: '🌎', Europe: '🌍', 'Asia Pacific': '🌏', MENA: '🕌', Africa: '🌍' };

function ConfigBanner({ show }) {
  if (!show) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
      <strong>⚙️ Apify not configured.</strong> Add <code className="bg-amber-100 px-1 rounded">APIFY_TOKEN</code> and{' '}
      <code className="bg-amber-100 px-1 rounded">APIFY_ACTOR_ID</code> to <code className="bg-amber-100 px-1 rounded">server/.env</code> to enable live scraping.
    </div>
  );
}

export default function Scraper() {
  const [form, setForm] = useState({ query: '', location: 'United Kingdom', max_items: 25, append_to_sheet: false });
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [apifyMissing, setApifyMissing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('search');

  useEffect(() => {
    api.get('/api/health').then(r => setApifyMissing(!r.data.modules?.candidateScraper)).catch(() => {});
    api.get('/scraper/history').then(r => setHistory(r.data.sessions || [])).catch(() => {});
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(''); setResults([]); setSelected(new Set()); setImportResult(null);
    setLoading(true);
    try {
      const res = await api.post('/scraper/search', {
        query: form.query,
        location: form.location,
        max_items: Number(form.max_items),
        append_to_sheet: form.append_to_sheet,
      });
      setResults(res.data.candidates || []);
      setSessionId(res.data.sessionId);
      // Auto-select all
      setSelected(new Set(res.data.candidates.map((_, i) => i)));
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.hint || 'Search failed.');
      setApifyMissing(err.response?.status === 503);
    } finally { setLoading(false); }
  };

  const toggleSelect = (i) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true); setImportResult(null);
    try {
      const toImport = results.filter((_, i) => selected.has(i));
      const res = await api.post('/scraper/import', { candidates: toImport, session_id: sessionId });
      setImportResult(res.data);
      // Refresh history
      api.get('/scraper/history').then(r => setHistory(r.data.sessions || [])).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed.');
    } finally { setImporting(false); }
  };

  const handleExportSheets = async () => {
    const toExport = results.filter((_, i) => selected.has(i));
    if (!toExport.length) return;
    try {
      const res = await api.post('/scraper/export-sheets', { candidates: toExport });
      alert(`✅ Exported ${res.data.updatedRows} rows to Google Sheets`);
    } catch (err) {
      alert(`Sheets export failed: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidate Sourcer</h1>
          <p className="text-slate-500 text-sm mt-0.5">Search the web for top talent via Apify</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('search')} className={activeTab === 'search' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>🔍 Search</button>
          <button onClick={() => setActiveTab('history')} className={activeTab === 'history' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>📋 History</button>
        </div>
      </div>

      <ConfigBanner show={apifyMissing} />

      {activeTab === 'search' && (
        <>
          {/* Search form */}
          <div className="card p-5">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Search Query *</label>
                  <input
                    type="text" required className="input"
                    placeholder="e.g. Product Manager, Software Engineer, Marketing Director"
                    value={form.query}
                    onChange={e => setForm({ ...form, query: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                  <select className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}>
                    <option value="United States">🌎 United States</option>
                    <option value="United Kingdom">🌍 United Kingdom</option>
                    <option value="Germany">🌍 Germany</option>
                    <option value="India">🌏 India</option>
                    <option value="Singapore">🌏 Singapore</option>
                    <option value="United Arab Emirates">🕌 United Arab Emirates</option>
                    <option value="Remote">🌍 Remote</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Results</label>
                  <select className="input w-28" value={form.max_items} onChange={e => setForm({ ...form, max_items: Number(e.target.value) })}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-0.5">
                  <input type="checkbox" className="rounded" checked={form.append_to_sheet}
                    onChange={e => setForm({ ...form, append_to_sheet: e.target.checked })} />
                  Auto-export to Google Sheets
                </label>
                <button type="submit" className="btn-primary" disabled={loading || apifyMissing}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Searching…
                    </span>
                  ) : '🔍 Search'}
                </button>
              </div>
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
            </form>
          </div>

          {/* Import result banner */}
          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-800">✅ Import complete</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    {importResult.inserted} imported · {importResult.skipped} skipped (already exist)
                  </p>
                </div>
                <Link to="/candidates" className="btn-secondary text-sm">View Candidates →</Link>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{results.length} candidates found</span>
                  <button className="text-xs text-blue-600 hover:text-blue-700"
                    onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)))}>
                    {selected.size === results.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-xs text-slate-400">{selected.size} selected</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-sm" onClick={handleExportSheets} disabled={selected.size === 0}>
                    📊 Export to Sheets
                  </button>
                  <button className="btn-primary text-sm" onClick={handleImport} disabled={selected.size === 0 || importing}>
                    {importing ? 'Importing…' : `⬇ Import ${selected.size} to TalentLenses`}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-8"></th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Role / Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Market</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Contact</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((c, i) => (
                      <tr key={i} className={`hover:bg-slate-50 cursor-pointer ${selected.has(i) ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleSelect(i)}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded" checked={selected.has(i)}
                            onChange={() => toggleSelect(i)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                              {(c.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-700 text-xs">{c.current_title || '—'}</div>
                          <div className="text-xs text-slate-400">{c.current_company || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.location || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="badge badge-blue">
                            {MARKET_FLAG[c.market] || '🌍'} {c.market}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {c.email && <div title={c.email}>✉ {c.email.substring(0, 20)}{c.email.length > 20 ? '…' : ''}</div>}
                          {c.phone && <div>📞 {c.phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {(c.linkedin_url || c.source_url) && (
                            <a href={c.linkedin_url || c.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs" onClick={e => e.stopPropagation()}>
                              View →
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="card text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-medium text-slate-600 mb-1">Search for candidates</p>
              <p className="text-sm">Enter a role, location and hit Search to find top talent</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">Scraping History</h3>
          </div>
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-3xl mb-2">📋</div>
              <p>No scraping sessions yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Query</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Results</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Imported</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{s.query}</td>
                    <td className="px-4 py-3 text-slate-600">{s.location}</td>
                    <td className="px-4 py-3 text-slate-700">{s.results_count}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{s.imported_count}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${s.status === 'completed' ? 'badge-green' : s.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
