import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

export default function CandidateForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', location: '', market: 'Global',
    current_title: '', current_company: '', experience_years: '',
    skills: '', linkedin_url: '', notes: '', status: 'new'
  });
  const [cvFile, setCvFile] = useState(null);

  useEffect(() => {
    if (isEdit) {
      api.get(`/candidates/${id}`)
        .then(res => setForm(f => ({ ...f, ...res.data.candidate })))
        .catch(() => navigate('/candidates'));
    }
  }, [id, isEdit, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null) fd.append(k, v); });
      if (cvFile) fd.append('cv', cvFile);

      if (isEdit) {
        await api.put(`/candidates/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/candidates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      navigate('/candidates');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save candidate.');
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setLoading(false);
    }
  };

  const f = (field) => ({
    value: form[field] || '',
    onChange: e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <button onClick={() => navigate('/candidates')} className="text-sm text-slate-500 hover:text-slate-700 mb-2">← Back to Candidates</button>
        <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'Edit Candidate' : 'Add Candidate'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
            <input type="text" required className="input" placeholder="John Smith" {...f('name')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" className="input" placeholder="john@email.com" spellCheck={false} autoComplete="email" {...f('email')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input type="text" className="input" placeholder="+44 7700 000000" {...f('phone')} />
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
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <input type="text" className="input" placeholder="London, UK" {...f('location')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Title</label>
            <input type="text" className="input" placeholder="e.g. Product Manager" {...f('current_title')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Company</label>
            <input type="text" className="input" placeholder="Acme Logistics" {...f('current_company')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
            <input type="number" min="0" max="50" className="input" placeholder="5" {...f('experience_years')} />
          </div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select className="input" {...f('status')}>
                {['new', 'screening', 'interview', 'offer', 'hired', 'rejected'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Skills (comma-separated)</label>
            <input type="text" className="input" placeholder="Supply Planning, SAP, Demand Forecasting, Logistics" {...f('skills')} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn URL</label>
            <input type="url" className="input" placeholder="https://linkedin.com/in/johnsmith" {...f('linkedin_url')} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Upload CV (PDF, DOC, DOCX)</label>
            <input
              type="file" accept=".pdf,.doc,.docx"
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              onChange={e => setCvFile(e.target.files[0])}
            />
            {form.cv_filename && <p className="text-xs text-slate-400 mt-1">Current: {form.cv_filename}</p>}
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea rows={3} className="input resize-none" placeholder="Internal notes about this candidate…" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e); }} {...f('notes')} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Candidate')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/candidates')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
