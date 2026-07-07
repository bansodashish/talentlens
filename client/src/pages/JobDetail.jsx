import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';

const statusColors = { applied: 'badge-blue', screening: 'badge-yellow', interview: 'badge-purple', offer: 'badge-green', hired: 'badge-green', rejected: 'badge-red' };

const distributionBadgeClass = (status) => {
  if (status === 'posted') return 'badge-green';
  if (status === 'pending') return 'badge-yellow';
  if (status === 'failed') return 'badge-red';
  return 'badge-slate';
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryingPortal, setRetryingPortal] = useState('');

  const loadJob = useCallback(() => api.get(`/jobs/${id}`)
    .then(res => setData(res.data))
    .catch(() => navigate('/jobs'))
    .finally(() => setLoading(false)), [id, navigate]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const retryReedPublish = async () => {
    setRetryingPortal('reed_uk');
    try {
      await api.post(`/jobs/${id}/distributions/reed/retry`);
      await loadJob();
    } finally {
      setRetryingPortal('');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this job?')) return;
    await api.delete(`/jobs/${id}`);
    navigate('/jobs');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  const { job, applications } = data || {};
  const reedDistribution = (job?.distributions || []).find(d => d.portal === 'reed_uk');

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/jobs')} className="text-sm text-slate-500 hover:text-slate-700 mb-2">← Jobs</button>
          <h1 className="text-2xl font-bold text-slate-800">{job?.title}</h1>
          <div className="flex gap-2 mt-2">
            <span className="badge badge-blue">
              🌍 {job?.market}
            </span>
            <span className="badge badge-slate">{job?.location}</span>
            <span className="badge badge-slate">{job?.employment_type}</span>
            {job?.status === 'active' ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">{job?.status}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/jobs/${id}/edit`} className="btn-secondary text-sm">Edit</Link>
          <button onClick={handleDelete} className="btn-danger text-sm">Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Description</h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{job?.description || 'No description provided.'}</p>
            {job?.requirements && (
              <>
                <h3 className="font-semibold text-slate-800 mt-5 mb-3">Requirements</h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{job.requirements}</p>
              </>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Applications ({applications?.length || 0})</h3>
              <Link to="/candidates" className="text-sm text-blue-600 hover:text-blue-700">Find candidates →</Link>
            </div>
            {applications?.length > 0 ? (
              <div className="space-y-2">
                {applications.map(app => (
                  <Link key={app.id} to={`/candidates/${app.candidate_id}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <div>
                      <div className="font-medium text-sm text-slate-800">{app.candidate_name}</div>
                      <div className="text-xs text-slate-400">{app.current_title} · Applied {new Date(app.applied_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.ai_score && <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{app.ai_score}%</span>}
                      <span className={`badge ${statusColors[app.status] || 'badge-slate'}`}>{app.stage}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No applications yet.</p>
            )}
          </div>
        </div>

        <div className="card p-5 h-fit">
          <h3 className="font-semibold text-slate-800 mb-4">Job Details</h3>
          <div className="space-y-3 text-sm">
            {job?.salary_min && (
              <div className="flex justify-between">
                <span className="text-slate-500">Salary</span>
                <span className="font-medium text-slate-700">
                  {job.salary_currency} {job.salary_min.toLocaleString()}{job.salary_max ? `–${job.salary_max.toLocaleString()}` : '+'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Department</span>
              <span className="font-medium text-slate-700">{job?.department}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Posted</span>
              <span className="font-medium text-slate-700">{job?.created_at ? new Date(job.created_at).toLocaleDateString() : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Posted by</span>
              <span className="font-medium text-slate-700">{job?.created_by_name}</span>
            </div>
          </div>
        </div>

        <div className="card p-5 h-fit">
          <h3 className="font-semibold text-slate-800 mb-4">Job Board Publishing</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Reed UK</span>
              <span className={`badge ${distributionBadgeClass(reedDistribution?.status)}`}>
                {reedDistribution?.status || 'not posted'}
              </span>
            </div>
            {reedDistribution?.external_job_id && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Reference</span>
                <span className="font-medium text-slate-700 text-right">{reedDistribution.external_job_id}</span>
              </div>
            )}
            {reedDistribution?.external_url && (
              <a href={reedDistribution.external_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:text-blue-700 block">
                Open Reed posting →
              </a>
            )}
            {reedDistribution?.error_message && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                {reedDistribution.error_message}
              </p>
            )}
            <button
              type="button"
              className="btn-secondary text-sm w-full"
              onClick={retryReedPublish}
              disabled={retryingPortal === 'reed_uk'}
            >
              {retryingPortal === 'reed_uk' ? 'Publishing…' : reedDistribution ? 'Retry Reed publish' : 'Publish to Reed UK'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
