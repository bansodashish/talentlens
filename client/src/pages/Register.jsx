import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', market: 'Both' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await register(form);
      navigate('/onboarding');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white font-bold text-xl">TL</span>
          </div>
          <h1 className="text-2xl font-bold text-white">TalentLenses</h1>
          <p className="text-slate-400 text-sm mt-1">AI-powered recruitment, worldwide</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Create account</h2>
          <p className="text-sm text-slate-500 mb-6">Start sourcing top talent today</p>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
              <input type="text" required className="input" placeholder="Jane Smith" value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Work email</label>
              <input type="email" required className="input" placeholder="jane@company.com" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <input type="text" className="input" placeholder="Acme Logistics" value={form.company} onChange={set('company')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Market focus</label>
              <select className="input" value={form.market} onChange={set('market')}>
                <option value="Global">🌍 Global</option>
                <option value="Americas">🌎 Americas</option>
                <option value="Europe">🌍 Europe</option>
                <option value="Asia Pacific">🌏 Asia Pacific</option>
                <option value="MENA">🕌 MENA</option>
                <option value="Africa">🌍 Africa</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" required className="input" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
