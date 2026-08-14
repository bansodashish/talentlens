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
          <h1 className="text-2xl font-bold text-slate-800">Jobs</h1>
          <p className="text-slate-500 text-sm">{jobs.length} role{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/jobs/new" className="btn-primary">+ Create Job</Link>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <input type="text" placeholder="Search jobs…" className="input max-w-xs"
          value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
        <select className="input w-40" value={filters.market} onChange={e => setFilters({ ...filters, market: e.target.value })}>
          <option value="">All Markets</option>
          <option value="Global">🌍 Global</option>
          <option value="Americas">🌎 Americas</option>
          <option value="Europe">🌍 Europe</option>
          <option value="Asia Pacific">🌏 Asia Pacific</option>
          <option value="MENA">🕌 MENA</option>
          <option value="Africa">🌍 Africa</option>
          <option value="Both">Both</option>
        </select>
        <select className="input w-40" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">💼</div>
          <p className="font-medium text-slate-600 mb-4">No jobs posted yet</p>
          <Link to="/jobs/new" className="btn-primary text-sm">Create First Job</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {jobs.map(job => (
            <div key={job.id} className="card p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{job.title}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{job.location}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => toggleActive(job, e)}
                  className={`badge ${job.status === 'active' ? 'badge-green' : 'badge-red'} cursor-pointer`}
                  title={job.status === 'active' ? 'Click to mark Inactive' : 'Click to mark Active'}
                >
                  ● {job.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div>
                  <p className="text-lg font-bold text-slate-800">{job.screened_count ?? 0}</p>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide">Applications</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{job.strong_match_count ?? 0}</p>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide">Strong Matches</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{job.in_pipeline_count ?? 0}</p>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide">In Pipeline</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-3">Last Updated: {timeAgo(job.updated_at)}</p>

              <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-100">
                <div className="flex gap-3">
                  <Link
                    to={`/screen?tab=history&job=${encodeURIComponent(job.title)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:underline font-medium text-xs"
                  >
                    View Screening Results
                  </Link>
                  <Link
                    to={`/pipeline?job=${encodeURIComponent(job.title)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:underline font-medium text-xs"
                  >
                    View Pipeline
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
