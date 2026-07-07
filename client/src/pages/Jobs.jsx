import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const statusBadge = { active: 'badge-green', paused: 'badge-yellow', closed: 'badge-red' };

const reedDistribution = (job) => (job.distributions || []).find(d => d.portal === 'reed_uk');

const distributionBadge = (distribution) => {
  if (!distribution) return <span className="badge badge-slate">Reed UK: Not posted</span>;
  if (distribution.status === 'posted') return <span className="badge badge-green">Reed UK: Posted</span>;
  if (distribution.status === 'pending') return <span className="badge badge-yellow">Reed UK: Pending</span>;
  return <span className="badge badge-red">Reed UK: Failed</span>;
};

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Jobs</h1>
          <p className="text-slate-500 text-sm">{jobs.length} role{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/jobs/new" className="btn-primary">+ Post Job</Link>
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
          <Link to="/jobs/new" className="btn-primary text-sm">Post First Job</Link>
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
                <span className={`badge ${statusBadge[job.status]}`}>{job.status}</span>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <span className="badge badge-blue">
                  🌍 {job.market}
                </span>
                <span className="badge badge-slate">{job.employment_type}</span>
                {distributionBadge(reedDistribution(job))}
                {job.salary_min && (
                  <span className="badge badge-green">
                    {job.salary_currency} {job.salary_min.toLocaleString()}{job.salary_max ? `–${job.salary_max.toLocaleString()}` : '+'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>📋 {job.application_count} application{job.application_count !== 1 ? 's' : ''}</span>
                <span>{new Date(job.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
