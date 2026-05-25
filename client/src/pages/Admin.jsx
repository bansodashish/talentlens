import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const roleColors = { admin: 'badge-purple', recruiter: 'badge-blue', viewer: 'badge-slate' };
const marketLabel = { UK: '🇬🇧', Dubai: '🇦🇪', Both: '🌍', Global: '🌍', Americas: '🌎', Europe: '🌍', 'Asia Pacific': '🌏', MENA: '🕌', Africa: '🌍' };

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/dashboard'); return; }
    Promise.all([
      api.get('/users'),
      api.get('/users/stats'),
    ]).then(([u, s]) => {
      setUsers(u.data.users);
      setStats(s.data.stats);
    }).catch(() => setError('Failed to load admin data.'))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  const handleRoleChange = async (id, role) => {
    await api.patch(`/users/${id}/role`, { role });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await api.delete(`/users/${id}`);
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Manage users and view platform-wide statistics.</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Users', stats.total_users, 'bg-blue-50 text-blue-700'],
            ['Candidates', stats.total_candidates, 'bg-purple-50 text-purple-700'],
            ['Jobs', stats.total_jobs, 'bg-green-50 text-green-700'],
            ['CV Matches', stats.total_matches, 'bg-orange-50 text-orange-700'],
            ['Scrape Sessions', stats.total_sessions, 'bg-slate-50 text-slate-700'],
          ].map(([label, val, cls]) => (
            <div key={label} className={`card p-4 text-center ${cls}`}>
              <div className="text-2xl font-bold">{val}</div>
              <div className="text-xs font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Registered Users ({users.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['User', 'Company', 'Market', 'Role', 'Activity', 'API Keys', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.id === user.id ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{u.name} {u.id === user.id && <span className="text-xs text-blue-500">(you)</span>}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.company || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">{marketLabel[u.market] || u.market}</td>
                  <td className="px-4 py-3">
                    {u.id === user.id ? (
                      <span className={`badge ${roleColors[u.role]}`}>{u.role}</span>
                    ) : (
                      <select
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}>
                        <option value="admin">admin</option>
                        <option value="recruiter">recruiter</option>
                        <option value="viewer">viewer</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>{u.candidate_count} candidates</div>
                    <div>{u.job_count} jobs · {u.match_count} matches</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className={u.has_apify_key ? 'text-green-600' : 'text-slate-300'}>
                      {u.has_apify_key ? '✅ Apify' : '— Apify'}
                    </div>
                    <div className={u.has_claude_key ? 'text-green-600' : 'text-slate-300'}>
                      {u.has_claude_key ? '✅ Claude' : '— Claude'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== user.id && (
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <strong>Tip:</strong> To promote the first user to admin, update the database directly:<br />
        <code className="text-xs bg-amber-100 px-1 py-0.5 rounded mt-1 inline-block">
          UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
        </code>
      </div>
    </div>
  );
}
