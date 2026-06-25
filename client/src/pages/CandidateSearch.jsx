import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

function ConnectionTestResult({ data }) {
  if (data.error) return (
    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
      ❌ Connection failed: {data.error}
    </div>
  );

  const { auth, actors } = data;
  return (
    <div className="mt-2 space-y-2 text-xs">
      {/* Auth */}
      <div className={`p-2.5 rounded-lg flex items-center gap-2 ${auth.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        <span>{auth.ok ? '✅' : '❌'}</span>
        <span>
          {auth.ok
            ? `Apify auth OK — logged in as @${auth.username} (${auth.plan} plan)`
            : `Apify auth failed: ${auth.error}`}
        </span>
      </div>
      {/* Actors */}
      {actors && Object.entries(actors).map(([key, info]) => (
        <div key={key} className={`p-2.5 rounded-lg flex items-center gap-2 ${info.exists ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          <span>{info.exists ? '✅' : '❌'}</span>
          <span>
            <strong>LinkedIn</strong>{' '}
            {info.exists
              ? `actor found: "${info.title || info.name}"`
              : `actor "${info.id}" — ${info.reason}`}
          </span>
        </div>
      ))}
    </div>
  );
}

const PLATFORMS = [
  {
    id: 'google',
    label: 'Google X-Ray',
    icon: '🔍',
    description: 'Find LinkedIn, GitHub & Wellfound profiles via Google',
    color: 'green',
  },
];

const XRAY_TARGETS = [
  { id: 'linkedin',  label: 'LinkedIn',  icon: '💼', desc: 'Professional profiles' },
  { id: 'github',    label: 'GitHub',    icon: '🐙', desc: 'Developer profiles' },
  { id: 'wellfound', label: 'Wellfound', icon: '🌟', desc: 'Startup & tech talent' },
];

const UK_LOCATIONS  = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Edinburgh', 'Glasgow', 'Liverpool', 'Sheffield', 'Nottingham', 'Remote (UK)'];
const UAE_LOCATIONS = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Remote (UAE)'];

export default function CandidateSearch() {
  const navigate = useNavigate();

  // Form state
  const [platform, setPlatform]   = useState('google');
  const [query, setQuery]         = useState('');
  const [location, setLocation]   = useState('');
  const [maxItems, setMaxItems]   = useState(10);

  // Results state
  const [results, setResults]       = useState([]);
  const [selected, setSelected]     = useState(new Set());
  const [searching, setSearching]   = useState(false);
  const [importing, setImporting]   = useState(false);
  const [error, setError]           = useState('');
  const [importMsg, setImportMsg]   = useState('');
  const [searched, setSearched]     = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const timerRef                    = useRef(null);

  // Google X-Ray specific
  const [xrayTarget, setXrayTarget]       = useState('linkedin');
  const [googleSearchId, setGoogleSearchId] = useState(null);

  // Platform status
  const [platformStatus, setPlatformStatus] = useState({});

  // History
  const [history, setHistory]     = useState([]);
  const [tab, setTab]             = useState('search');

  useEffect(() => {
    api.get('/scraper/platforms').then(r => setPlatformStatus(r.data.platforms || {})).catch(() => {});
    api.get('/scraper/history').then(r => setHistory(r.data.sessions || [])).catch(() => {});
  }, []);

  const status = platformStatus['google'];

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(''); setResults([]); setSelected(new Set()); setImportMsg('');
    setSearched(false); setElapsed(0);
    setSearching(true);

    // Elapsed timer
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    try {
      let candidates;
      const res = await api.post('/search/google', {
        jobTitle: query, location, maxResults: maxItems, xrayTarget,
      });
      candidates = res.data.candidates || [];
      setGoogleSearchId(res.data.searchId);
      setResults(candidates);
      setSelected(new Set(candidates.map((_, i) => i)));
      setSearched(true);
      api.get('/scraper/history').then(r => setHistory(r.data.sessions || [])).catch(() => {});
    } catch (err) {
      const msg = err.response?.data?.hint || err.response?.data?.error || err.message || 'Search failed.';
      setError(msg);
      setSearched(true);
    } finally {
      clearInterval(timerRef.current);
      setSearching(false);
    }
  };

  const handleTestConnection = () => {}; // eslint-disable-line

  const toggleSelect = (i) => {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    setSelected(s);
  };

  const toggleAll = () => {
    selected.size === results.length ? setSelected(new Set()) : setSelected(new Set(results.map((_, i) => i)));
  };

  const handleImport = async () => {
    const toImport = results.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return;
    setImporting(true); setImportMsg('');
    try {
      const res = await api.post('/search/save', { searchId: googleSearchId, candidates: toImport });
      setImportMsg(`✅ Imported ${res.data.inserted} candidates${res.data.skipped > 0 ? ` (${res.data.skipped} duplicates skipped)` : ''}.`);
    } catch (err) {
      setImportMsg('❌ Import failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setImporting(false);
    }
  };

  const handleExportSheets = async () => {
    const toExport = results.filter((_, i) => selected.has(i));
    if (toExport.length === 0) return;
    try {
      await api.post('/scraper/export-sheets', { candidates: toExport });
      setImportMsg('✅ Exported to Google Sheets.');
    } catch (err) {
      setImportMsg('❌ Sheets export failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Candidate Search</h1>
        <p className="text-sm text-slate-500 mt-1">Find candidates on LinkedIn, GitHub & Wellfound via Google X-Ray.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[['search', '🔍 Search'], ['history', '📋 History']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left — form */}
          <div className="space-y-4">



            {/* Google X-Ray source picker */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Search Source</h3>
                <div className="grid grid-cols-3 gap-2">
                  {XRAY_TARGETS.map(t => (
                    <button key={t.id} type="button" onClick={() => setXrayTarget(t.id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${
                        xrayTarget === t.id
                          ? 'border-green-500 bg-green-50 text-green-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}>
                      <span className="text-lg">{t.icon}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Free: 100 queries/day · 10 results per query</p>
              </div>

            {/* Not configured warning */}
            {status && !status.configured && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <strong>Google X-Ray</strong> is not configured.{' '}
                Add GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID to server/.env
              </div>
            )}

            {/* Search form */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Search</h3>
              <form onSubmit={handleSearch} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Keywords / Job title</label>
                  <input type="text" required className="input text-sm"
                    placeholder="e.g. Supply Chain Manager"
                    value={query} onChange={e => setQuery(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                  <input list="locations" className="input text-sm"
                    placeholder="e.g. London or Dubai"
                    value={location} onChange={e => setLocation(e.target.value)} />
                  <datalist id="locations">
                    <optgroup label="UK">{UK_LOCATIONS.map(l => <option key={l} value={l} />)}</optgroup>
                    <optgroup label="UAE">{UAE_LOCATIONS.map(l => <option key={l} value={l} />)}</optgroup>
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Max results</label>
                  <select className="input text-sm" value={maxItems} onChange={e => setMaxItems(Number(e.target.value))}>
                    {[10, 20, 30].map(n => (
                      <option key={n} value={n}>
                        {n}{n > 10 ? ` (~${Math.ceil(n / 10)} API calls)` : ''}
                      </option>
                    ))}
                  </select>
                </div>



                {error && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
                )}

                <button type="submit" className="btn-primary w-full text-sm" disabled={searching}>
                  {searching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Searching…
                    </span>
                  ) : '🔍 Search'}
                </button>
              </form>
            </div>
          </div>

          {/* Right — results */}
          <div className="lg:col-span-2 space-y-3">

            {/* Searching state */}
            {searching && (
              <div className="card p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-16 h-16">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 border-t-blue-500"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">
                      🔍
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">Searching Google X-Ray…</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Searching Google for {XRAY_TARGETS.find(t => t.id === xrayTarget)?.label || ''} profiles…
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{elapsed}s elapsed</p>
                  </div>
                  <div className="w-48 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: `${Math.min(elapsed / 120 * 100, 95)}%`, transition: 'width 1s linear' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {!searching && results.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={selected.size === results.length} onChange={toggleAll} />
                      Select all ({results.length})
                    </label>
                    <span className="text-xs text-slate-400">{selected.size} selected</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleExportSheets} className="btn-secondary text-xs" disabled={selected.size === 0}>
                      📊 Export to Sheets
                    </button>
                    <button onClick={handleImport} className="btn-primary text-sm" disabled={selected.size === 0 || importing}>
                      {importing ? 'Importing…' : `⬇️ Import ${selected.size} to TalentLenses`}
                    </button>
                  </div>
                </div>

                {importMsg && (
                  <div className={`p-3 rounded-lg text-sm ${importMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {importMsg}
                    {importMsg.startsWith('✅') && <Link to="/candidates" className="ml-2 underline font-medium">View candidates →</Link>}
                  </div>
                )}

                <div className="space-y-2">
                  {results.map((c, i) => (
                    <div key={i}
                      className={`card p-4 flex items-start gap-3 cursor-pointer transition-all ${selected.has(i) ? 'ring-2 ring-blue-400 bg-blue-50/30' : 'hover:bg-slate-50'}`}
                      onClick={() => toggleSelect(i)}>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)}
                        onClick={e => e.stopPropagation()} className="mt-1 flex-shrink-0" />
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
                        {c.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.current_title}{c.current_company ? ` · ${c.current_company}` : ''}</div>
                          </div>
                          {c.market && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${c.market === 'Dubai' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {c.market === 'Dubai' ? '🇦🇪' : '🇬🇧'} {c.market}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400">
                          {c.location && <span>📍 {c.location}</span>}
                          {c.experience_years && <span>⏱ {c.experience_years} yrs</span>}
                          {c.email && <span>✉️ {c.email}</span>}
                          {c.phone && <span>📞 {c.phone}</span>}
                          {(c.linkedin_url || c.profileUrl) && (
                            <a href={c.linkedin_url || c.profileUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()} className="text-blue-500 hover:underline">
                              {c.source === 'google_cse_github' ? 'GitHub ↗' : c.source === 'google_cse_wellfound' ? 'Wellfound ↗' : 'LinkedIn ↗'}
                            </a>
                          )}
                        </div>
                        {c.skills && (
                      <div className="flex flex-wrap gap-1 mt-2">
                            {(Array.isArray(c.skills) ? c.skills : c.skills.split(','))
                              .filter(Boolean).slice(0, 5).map((s, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded">{typeof s === 'string' ? s.trim() : s}</span>
                            ))}
                            {(Array.isArray(c.skills) ? c.skills : c.skills.split(',')).filter(Boolean).length > 5 && (
                              <span className="text-slate-400 text-xs">+{(Array.isArray(c.skills) ? c.skills : c.skills.split(',')).filter(Boolean).length - 5} more</span>
                            )}
                          </div>
                        )}
                        {(c.summary || c.snippet) && <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{c.summary || c.snippet}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Error state */}
            {!searching && searched && error && (
              <div className="card p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
                  <div>
                    <p className="font-semibold text-slate-800">Search failed</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Troubleshooting steps:</p>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Check <code className="bg-slate-200 px-1 rounded">GOOGLE_CSE_API_KEY</code> and <code className="bg-slate-200 px-1 rounded">GOOGLE_CSE_ID</code> in server/.env</li>
                    <li>Verify your Google CSE engine is configured to search <strong>linkedin.com/in/*</strong></li>
                    <li>Check your daily quota at <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">console.cloud.google.com</a></li>
                  </ol>
                </div>
              </div>
            )}

            {/* 0 results state */}
            {!searching && searched && !error && results.length === 0 && (
              <div className="card p-6 space-y-4">
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">🕵️</div>
                  <p className="font-semibold text-slate-700">No candidates found</p>
                  <p className="text-sm text-slate-400 mt-1">The search completed but returned 0 results.</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700 space-y-1.5">
                  <p className="font-semibold">Things to try:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Use broader keywords — e.g. <em>"logistics"</em> instead of <em>"supply chain coordinator"</em></li>
                    <li>Leave the location blank to search globally</li>
                    <li>Try a different source (LinkedIn / GitHub / Wellfound)</li>
                    <li>Check your Google CSE daily quota at console.cloud.google.com</li>
                  </ul>
                </div>
              </div>
            )}

                {!searching && !searched && (
                <div className="card p-12 text-center text-slate-400">
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="font-medium text-slate-600">Search for candidates</p>
                  <p className="text-sm mt-1">Select a source above and enter keywords to get started.</p>
                </div>
                )}
          </div>
        </div>
      ) : (
        /* History tab */
        <div className="card overflow-hidden">
          {history.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No search history yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Platform', 'Query', 'Location', 'Results', 'Imported', 'Status', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map(s => {
                  const p = PLATFORMS.find(p => p.id === s.platform);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="text-sm">🔍 {s.source || s.platform || 'google_cse'}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.query}</td>
                      <td className="px-4 py-3 text-slate-500">{s.location || '—'}</td>
                      <td className="px-4 py-3">{s.results_count}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{s.imported_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${s.status === 'completed' ? 'badge-green' : s.status === 'error' ? 'badge-red' : 'badge-yellow'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
