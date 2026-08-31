import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const statusColors = { new: 'badge-blue', screening: 'badge-yellow', interview: 'badge-purple', offer: 'badge-green', hired: 'badge-green', rejected: 'badge-red' };
const PIPELINE_STAGES = ['shortlisted', 'contacted', 'phone_screen', 'interview', 'offer'];
const PIPELINE_STAGE_LABELS = {
  shortlisted:  '⭐ Shortlisted',
  contacted:    '📬 Contacted',
  phone_screen: '📞 Phone Screen',
  interview:    '🗓 Interview',
  offer:        '🎉 Offer',
};

function statusForStage(stage) {
  if (stage === 'offer') return 'offer';
  if (!stage) return 'new';
  return stage === 'shortlisted' ? 'screening' : 'interview';
}

export default function Candidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pipelineUpdatingId, setPipelineUpdatingId] = useState(null);
  const [pipelineError, setPipelineError] = useState('');
  const [pipelineSuccess, setPipelineSuccess] = useState('');
  const [filters, setFilters] = useState({ role: '', status: '', search: '' });
  const [roleOptions, setRoleOptions] = useState([]);
  const navigate = useNavigate();

  // Merge newly-seen roles into the Role filter's options without ever
  // dropping ones we've already seen (a filtered fetchCandidates() result
  // only reflects a subset of candidates, so we union rather than replace).
  const mergeRoleOptions = (candidateList) => {
    const seen = candidateList.map(c => (c.current_title || '').trim()).filter(Boolean);
    if (!seen.length) return;
    setRoleOptions(prev => [...new Set([...prev, ...seen])].sort((a, b) => a.localeCompare(b)));
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.role) params.role = filters.role;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const res = await api.get('/candidates', { params });
      setCandidates(res.data.candidates);
      mergeRoleOptions(res.data.candidates);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCandidates(); }, [filters]);

  // Populate the Role filter's options from every distinct role on record,
  // independent of the current filters, so options don't disappear as the
  // user filters the table.
  useEffect(() => {
    api.get('/candidates').then(res => {
      mergeRoleOptions(res.data.candidates);
    }).catch(err => console.error(err));
  }, []);

  const moveCandidateToStage = async (candidate, stage) => {
    const newStage = stage || null;
    setPipelineUpdatingId(candidate.id);
    setPipelineError('');
    setPipelineSuccess('');

    // optimistic update
    setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, pipeline_stage: newStage } : c));

    try {
      const status = statusForStage(newStage);
      const res = await api.patch(`/candidates/${candidate.id}`, { pipeline_stage: newStage, status });
      const updated = res.data.candidate;
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, ...updated } : c));
      setPipelineSuccess(
        newStage
          ? `${candidate.name} moved to ${PIPELINE_STAGE_LABELS[newStage]}.`
          : `${candidate.name} removed from the pipeline.`
      );
    } catch (err) {
      // revert on failure
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, pipeline_stage: candidate.pipeline_stage } : c));
      setPipelineError(err.response?.data?.error || 'Could not update pipeline stage.');
    } finally {
      setPipelineUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Candidates</h1>
          <p className="text-slate-400 text-sm mt-1">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} found</p>
        </div>
        <Link to="/candidates/new" className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg">+ Add Candidate</Link>
      </div>

      {/* Filters */}
      <div className="card border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-4 flex flex-wrap gap-3 rounded-lg">
        <input
          type="text" placeholder="Search name, title, skills…" className="input bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-500 max-w-xs rounded-lg"
          value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}
        />
        <select className="input bg-slate-800/50 border-slate-700 text-slate-200 w-40 rounded-lg" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          {['new', 'screening', 'interview', 'offer', 'hired', 'rejected'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {(filters.status || filters.search) && (
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-sm transition-all" onClick={() => setFilters({ role: '', status: '', search: '' })}>Clear filters</button>
        )}
      </div>

      {pipelineError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/50 px-4 py-2 rounded-lg">❌ {pipelineError}</p>}
      {pipelineSuccess && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/50 px-4 py-2 rounded-lg">✓ {pipelineSuccess}</p>}

      {/* Table */}
      <div className="card border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium text-slate-300 mb-1">No candidates found</p>
            <p className="text-sm text-slate-500 mb-4">Add your first candidate to get started</p>
            <Link to="/candidates/new" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all duration-200 transform hover:scale-105 inline-block">Add Candidate</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">Candidate</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">Market</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">AI Score</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">Status</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">Pipeline Stage</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-300">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {candidates.map(c => {
                  // Generate a color gradient from candidate name
                  const charCode = c.name.charCodeAt(0) % 7;
                  const gradients = [
                    'from-blue-500 to-cyan-500',
                    'from-purple-500 to-pink-500',
                    'from-emerald-500 to-teal-500',
                    'from-rose-500 to-orange-500',
                    'from-indigo-500 to-blue-500',
                    'from-violet-500 to-purple-500',
                    'from-fuchsia-500 to-rose-500',
                  ];
                  const bgGradient = gradients[charCode];
                  return (
                  <tr key={c.id} className="hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${bgGradient} flex items-center justify-center text-xs font-bold text-white shadow-lg`}>
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{c.name}</div>
                          <div className="text-xs text-slate-500">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded-lg text-xs font-medium">
                        🌍 {c.market}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.ai_score != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${c.ai_score}%` }}></div>
                          </div>
                          <span className="text-xs font-bold text-emerald-300">{c.ai_score}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        c.status === 'screening' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' :
                        c.status === 'interview' ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' :
                        c.status === 'offer' || c.status === 'hired' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' :
                        c.status === 'rejected' ? 'bg-red-500/20 text-red-300 border-red-500/50' :
                        'bg-slate-700/50 text-slate-300 border-slate-600'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="text-xs border border-slate-700 rounded px-2 py-1 bg-slate-800/50 text-slate-300 cursor-pointer min-w-[160px] disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed hover:border-slate-600 transition-colors"
                        value={c.pipeline_stage || ''}
                        disabled={pipelineUpdatingId === c.id}
                        onClick={e => e.stopPropagation()}
                        onChange={e => moveCandidateToStage(c, e.target.value)}
                      >
                        <option value="">Not in pipeline</option>
                        {PIPELINE_STAGES.map(stage => (
                          <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/candidates/${c.id}`}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
