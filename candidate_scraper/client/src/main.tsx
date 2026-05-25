import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, Database, FileSpreadsheet, Loader2, Search, ShieldCheck } from 'lucide-react';
import type { Candidate, SearchResponse, SheetResult, SheetsAppendResponse } from '../../shared/api';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function App() {
  const [query, setQuery] = useState('supply chain manager');
  const [location, setLocation] = useState('United Kingdom');
  const [maxItems, setMaxItems] = useState(25);
  const [appendToSheet, setAppendToSheet] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [sheetResult, setSheetResult] = useState<SheetResult | null>(null);

  const canExport = useMemo(() => candidates.length > 0 && !loading, [candidates, loading]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus('Running Apify search...');
    setSheetResult(null);

    try {
      const response = await fetch(`${apiBase}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          location,
          maxItems,
          appendToSheet,
          sources: ['authorized-public-source']
        })
      });

      const data: SearchResponse = await response.json();
      if (!response.ok) throw new Error((data as unknown as { error: string }).error || 'Search failed');

      setCandidates(data.candidates || []);
      setSheetResult(data.sheetResult || null);
      setStatus(`Found ${data.candidates?.length || 0} candidate rows`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function exportRows() {
    setLoading(true);
    setStatus('Appending rows to Google Sheets...');

    try {
      const response = await fetch(`${apiBase}/api/sheets/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates })
      });

      const data: SheetsAppendResponse = await response.json();
      if (!response.ok) throw new Error((data as unknown as { error: string }).error || 'Export failed');

      setSheetResult(data.sheetResult);
      setStatus(`Exported ${data.sheetResult?.updatedRows || candidates.length} rows`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Database aria-hidden="true" />
          <span>Candidate Source</span>
        </div>

        <form onSubmit={runSearch} className="search-form">
          <label>
            Role keywords
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>

          <label>
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>

          <label>
            Max rows
            <input
              type="number"
              min="1"
              max="100"
              value={maxItems}
              onChange={(event) => setMaxItems(Number(event.target.value))}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={appendToSheet}
              onChange={(event) => setAppendToSheet(event.target.checked)}
            />
            Append after search
          </label>

          <button type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
            Run search
          </button>
        </form>

        <div className="notice">
          <ShieldCheck aria-hidden="true" />
          <p>Use only authorized sources. Emails and phone numbers should be collected only when your HR process has a lawful basis.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <div>
            <h1>Supply Chain Candidates</h1>
            <p>{status}</p>
          </div>
          <button type="button" onClick={exportRows} disabled={!canExport}>
            <FileSpreadsheet aria-hidden="true" />
            Export
          </button>
        </header>

        {sheetResult && (
          <div className="success">
            <Check aria-hidden="true" />
            Google Sheets updated: {sheetResult.updatedCells || 0} cells
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Company</th>
                <th>Location</th>
                <th>Profile</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">Run a search to review candidate rows before export.</td>
                </tr>
              ) : (
                candidates.map((candidate, index) => (
                  <tr key={`${candidate.profileUrl || candidate.sourceUrl || candidate.name}-${index}`}>
                    <td>{candidate.name}</td>
                    <td>{candidate.role}</td>
                    <td>{candidate.company}</td>
                    <td>{candidate.location}</td>
                    <td>
                      {candidate.profileUrl ? <a href={candidate.profileUrl} target="_blank" rel="noreferrer">Open</a> : ''}
                    </td>
                    <td>{candidate.email}</td>
                    <td>{candidate.phone}</td>
                    <td>{candidate.source}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
