import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ market: '', status: 'active', search: '' });
  const navigate = useNavigate();

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.market) params.market = filters.market;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const res = await api.get('/jobs', { params });
      setJobs(res.data.jobs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchJobs(); }, [filters]);

  const toggleActive = async (job, e) => {
    e.stopPropagation();
    const newStatus = job.status === 'active' ? 'closed' : 'active';
    try {
      await api.put(`/jobs/${job.id}`, { status: newStatus });
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Jobs</h1>
          <p className="text-slate-400 text-sm mt-1">{jobs.length} role{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/jobs/new" className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl">+ Create Job</Link>
      </div>

      <div className="card border border-slate-800 rounded-lg bg-slate-900/50 backdrop-blur-sm p-4 flex flex-wrap gap-3">
        <input type="text" placeholder="Search jobs…" className="input bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-500 max-w-xs rounded-lg"
          value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
        <select className="input bg-slate-800/50 border-slate-700 text-slate-200 w-40 rounded-lg" value={filters.market} onChange={e => setFilters({ ...filters, market: e.target.value })}>
          <option value="">All Markets</option>
          <option value="Global">🌍 Global</option>
          <option value="Americas">🌎 Americas</option>
          <option value="Europe">🌍 Europe</option>
          <option value="Asia Pacific">🌏 Asia Pacific</option>
          <option value="MENA">🕌 MENA</option>
          <option value="Africa">🌍 Africa</option>
          <option value="Both">Both</option>
        </select>
        <select className="input bg-slate-800/50 border-slate-700 text-slate-200 w-40 rounded-lg" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div></div>
      ) : jobs.length === 0 ? (
        <div className="card border border-slate-800 rounded-lg bg-slate-900/50 backdrop-blur-sm text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">💼</div>
          <p className="font-medium text-slate-300 mb-4">No jobs posted yet</p>
          <Link to="/jobs/new" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all duration-200 transform hover:scale-105 inline-block">Create First Job</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {jobs.map(job => (
            <div key={job.id} className="card border border-slate-800 rounded-lg bg-slate-900/50 backdrop-blur-sm p-5 hover:border-slate-700 hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01] cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-100 text-lg">{job.title}</h3>
                  <p className="text-sm text-slate-400 mt-0.5">{job.location}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => toggleActive(job, e)}
                  className={`badge rounded-full px-3 py-1 text-xs font-semibold transition-all ${job.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' : 'bg-red-500/20 text-red-300 border border-red-500/50'} cursor-pointer hover:scale-105`}
                  title={job.status === 'active' ? 'Click to mark Inactive' : 'Click to mark Active'}
                >
                  ● {job.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30">
                  <p className="text-2xl font-bold text-emerald-300">{job.screened_count ?? 0}</p>
                  <p className="text-[10px] text-emerald-200/70 uppercase tracking-wider mt-0.5">Screened</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border border-indigo-500/30">
                  <p className="text-2xl font-bold text-indigo-300">{job.strong_match_count ?? 0}</p>
                  <p className="text-[10px] text-indigo-200/70 uppercase tracking-wider mt-0.5">Strong Matches</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30">
                  <p className="text-2xl font-bold text-purple-300">{job.in_pipeline_count ?? 0}</p>
                  <p className="text-[10px] text-purple-200/70 uppercase tracking-wider mt-0.5">In Pipeline</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-4">Last Updated: {timeAgo(job.updated_at)}</p>

              <div className="flex flex-wrap gap-2 text-sm pt-4 border-t border-slate-800">
                  <Link
                    to="/cv-match"
                    state={{ jobId: job.id, jobTitle: job.title, jobDescription: job.description }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/50 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                  >
                    ⚡ Screen CVs
                  </Link>
                  <Link
                    to={`/history?tab=screenings&job=${encodeURIComponent(job.title)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/50 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                  >
                    📋 Screening Results
                  </Link>
                  <Link
                    to={`/pipeline?job=${encodeURIComponent(job.title)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/50 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                  >
                    🔄 View Pipeline
                  </Link>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
