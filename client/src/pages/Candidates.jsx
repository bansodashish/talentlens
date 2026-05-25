import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const statusColors = { new: 'badge-blue', screening: 'badge-yellow', interview: 'badge-purple', offer: 'badge-green', hired: 'badge-green', rejected: 'badge-red' };

export default function Candidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ market: '', status: '', search: '' });
  const navigate = useNavigate();

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.market) params.market = filters.market;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const res = await api.get('/candidates', { params });
      setCandidates(res.data.candidates);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCandidates(); }, [filters]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidates</h1>
          <p className="text-slate-500 text-sm">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} found</p>
        </div>
        <Link to="/candidates/new" className="btn-primary">+ Add Candidate</Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input
          type="text" placeholder="Search name, title, skills…" className="input max-w-xs"
          value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}
        />
        <select className="input w-40" value={filters.market} onChange={e => setFilters({ ...filters, market: e.target.value })}>
          <option value="">All Markets</option>
          <option value="Global">🌍 Global</option>
          <option value="Americas">🌎 Americas</option>
          <option value="Europe">🌍 Europe</option>
          <option value="Asia Pacific">🌏 Asia Pacific</option>
          <option value="MENA">🕌 MENA</option>
          <option value="Africa">🌍 Africa</option>
        </select>
        <select className="input w-40" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          {['new', 'screening', 'interview', 'offer', 'hired', 'rejected'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {(filters.market || filters.status || filters.search) && (
          <button className="btn-secondary text-sm" onClick={() => setFilters({ market: '', status: '', search: '' })}>Clear filters</button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium text-slate-600 mb-1">No candidates found</p>
            <p className="text-sm mb-4">Add your first candidate to get started</p>
            <Link to="/candidates/new" className="btn-primary text-sm">Add Candidate</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Role / Company</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Market</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">AI Score</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{c.name}</div>
                          <div className="text-xs text-slate-400">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{c.current_title || '—'}</div>
                      <div className="text-xs text-slate-400">{c.current_company || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge badge-blue">
                        🌍 {c.market}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.ai_score != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.ai_score}%` }}></div>
                          </div>
                          <span className="text-xs font-medium text-slate-700">{c.ai_score}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusColors[c.status] || 'badge-slate'} style={{ display: 'inline-block' }}>
                        <span className={`badge ${statusColors[c.status] || 'badge-slate'}`}>{c.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/candidates/${c.id}`}
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                        onClick={e => e.stopPropagation()}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
