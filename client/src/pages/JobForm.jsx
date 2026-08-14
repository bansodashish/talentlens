import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

export default function JobForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', requirements: '',
    location: '', market: 'Global', employment_type: 'Full-time',
    salary_min: '', salary_max: '', salary_currency: 'GBP', status: 'active'
  });

  useEffect(() => {
    if (isEdit) {
      api.get(`/jobs/${id}`).then(res => setForm(f => ({ ...f, ...res.data.job }))).catch(() => navigate('/jobs'));
    }
  }, [id, isEdit, navigate]);

  const buildPayload = () => {
    const payload = { ...form };
    payload.title = (payload.title || '').trim();
    payload.description = payload.description || '';
    payload.market = payload.market || 'Global';
    payload.location = payload.location || 'Remote';
    payload.employment_type = payload.employment_type || 'Full-time';
    payload.salary_currency = payload.salary_currency || 'GBP';
    if (payload.salary_min === '') payload.salary_min = null;
    else if (payload.salary_min != null) payload.salary_min = Number(payload.salary_min);
    if (payload.salary_max === '') payload.salary_max = null;
    else if (payload.salary_max != null) payload.salary_max = Number(payload.salary_max);
    return payload;
  };

  const saveJob = async () => {
    const payload = buildPayload();
    if (isEdit) {
      const res = await api.put(`/jobs/${id}`, payload);
      return res.data.job;
    }
    const res = await api.post('/jobs', payload);
    return res.data.job;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await saveJob();
      navigate('/jobs');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save job.');
    } finally { setLoading(false); }
  };

  const handleStartScreening = async () => {
    const title = (form.title || '').trim();
    const description = (form.description || '').trim();
    if (!title || !description) {
      setError('Please enter Job Title and Job Description before starting screening.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const savedJob = await saveJob();
      navigate('/cv-match', {
        state: {
          jobId: savedJob?.id,
          jobTitle: title,
          jobDescription: description,
        },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start screening.');
    } finally {
      setLoading(false);
    }
  };

  const f = (field) => ({ value: form[field] || '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <button onClick={() => navigate('/jobs')} className="text-sm text-slate-500 hover:text-slate-700 mb-2">← Back to Jobs</button>
        <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'Edit Job' : 'Create New Job'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
            <input type="text" required className="input" placeholder="e.g. Product Manager" {...f('title')} />
          </div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select className="input" {...f('status')}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Description *</label>
            <textarea rows={5} className="input resize-none" placeholder="Describe the role, responsibilities, and what you're looking for…" {...f('description')} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Job'}
          </button>
          {!isEdit && (
            <button type="button" className="btn-secondary" onClick={handleStartScreening} disabled={loading}>
              {loading ? 'Saving…' : 'Start Screening'}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => navigate('/jobs')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
