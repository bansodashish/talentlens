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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.salary_min) payload.salary_min = Number(payload.salary_min);
      if (payload.salary_max) payload.salary_max = Number(payload.salary_max);
      if (isEdit) await api.put(`/jobs/${id}`, payload);
      else await api.post('/jobs', payload);
      navigate('/jobs');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save job.');
    } finally { setLoading(false); }
  };

  const f = (field) => ({ value: form[field] || '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <button onClick={() => navigate('/jobs')} className="text-sm text-slate-500 hover:text-slate-700 mb-2">← Back to Jobs</button>
        <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'Edit Job' : 'Post New Job'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
            <input type="text" required className="input" placeholder="e.g. Product Manager" {...f('title')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Market *</label>
            <select className="input" {...f('market')}>
              <option value="Global">🌍 Global</option>
              <option value="Americas">🌎 Americas</option>
              <option value="Europe">🌍 Europe</option>
              <option value="Asia Pacific">🌏 Asia Pacific</option>
              <option value="MENA">🕌 MENA</option>
              <option value="Africa">🌍 Africa</option>
              <option value="Both">🌍 Both</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location *</label>
            <input type="text" required className="input" placeholder="London, UK" {...f('location')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
            <select className="input" {...f('employment_type')}>
              <option>Full-time</option>
              <option>Contract</option>
              <option>Part-time</option>
            </select>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
            <select className="input" {...f('salary_currency')}>
              <option value="GBP">GBP £</option>
              <option value="AED">AED د.إ</option>
              <option value="USD">USD $</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Salary Min</label>
            <input type="number" className="input" placeholder="50000" {...f('salary_min')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Salary Max</label>
            <input type="number" className="input" placeholder="75000" {...f('salary_max')} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Description</label>
            <textarea rows={5} className="input resize-none" placeholder="Describe the role, responsibilities, and what you're looking for…" {...f('description')} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Requirements</label>
            <textarea rows={4} className="input resize-none" placeholder="List required skills, qualifications, experience…" {...f('requirements')} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Post Job'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/jobs')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
