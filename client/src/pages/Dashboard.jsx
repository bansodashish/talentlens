import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// ───────────────────────────────────────────────────────────────────────────────
const MARKET_COLORS = {
  UK: '#3b82f6', Dubai: '#f59e0b', Both: '#8b5cf6', Unknown: '#94a3b8',
  Global: '#4f46e5', Americas: '#3b82f6', Europe: '#0ea5e9',
  'Asia Pacific': '#10b981', MENA: '#f59e0b', Africa: '#ef4444',
};
const REC_COLORS = { 'Strong Hire': '#10b981', 'Consider': '#f59e0b', 'Reject': '#ef4444' };

// ───────────────────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent, to }) {
  const content = (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {sub && <span className={`badge ${accent || 'badge-blue'}`}>{sub}</span>}
      </div>
      <div className="text-3xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function ChartCard({ title, children, action, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// Beautiful empty state component
function EmptyState({ icon, title, description, action }) {
  return (
    <div className="h-[230px] flex flex-col items-center justify-center gap-3 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5 max-w-[200px]">{description}</p>
      </div>
      {action}
    </div>
  );
}

// Animated spark bar for empty chart background
function SparkBackground() {
  const bars = [20, 45, 30, 60, 25, 70, 40, 55, 35, 80, 50, 65];
  return (
    <div className="absolute inset-0 flex items-end gap-1.5 px-6 pb-10 opacity-[0.06] pointer-events-none overflow-hidden">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 bg-blue-600 rounded-t-sm" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: '🔍', label: 'Search LinkedIn',    sub: 'Find candidates',        to: '/candidate-search', color: 'from-blue-500 to-blue-600' },
  { icon: '🤖', label: 'Screen Resumes',     sub: 'AI-powered scoring',     to: '/cv-match',         color: 'from-violet-500 to-purple-600' },
  { icon: '➕', label: 'Add Candidate',      sub: 'Manual entry',           to: '/candidates/new',   color: 'from-emerald-500 to-green-600' },
  { icon: '📋', label: 'Post a Job',         sub: 'Create job listing',     to: '/jobs/new',         color: 'from-orange-400 to-amber-500' },
];

// ───────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user }            = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/analytics')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  const {
    stats = {}, weeklySourced = [], byMarket = [], recommendations = [],
    scoreTrend = [], recentSearches = [], recentScreenings = [], topCandidates = [],
  } = data || {};

  const pieData        = byMarket.map(m => ({ name: m.market, value: m.count }));
  const hasSourced     = weeklySourced.some(w => w.count > 0);
  const hasRegionData  = pieData.length > 0;
  const hasRecs        = recommendations.some(r => r.count > 0);
  const hasScore       = scoreTrend.some(s => s.avg > 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {greeting()}, {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            AI-powered recruitment · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/candidate-search" className="btn-primary text-sm">🔍 Candidate Search</Link>
          <Link to="/cv-match"         className="btn-secondary text-sm">🤖 Screen Resumes</Link>
          <Link to="/candidates"       className="btn-secondary text-sm">👥 View All Candidates</Link>
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Candidates sourced this month"
          value={stats.totalThisMonth ?? 0} sub="This month" accent="badge-blue" to="/candidates" />
        <StatCard icon="📧" label="Email found rate"
          value={`${stats.emailFoundPct ?? 0}%`}
          sub={`${stats.emailFoundThisMonth ?? 0} this month`} accent="badge-green" />
        <StatCard icon="🤖" label="Resumes screened this month"
          value={stats.screenedThisMonth ?? 0} sub="This month" accent="badge-purple" to="/history" />
        <StatCard icon="🌟" label="Strong Hire candidates"
          value={stats.strongHireCount ?? 0} sub="All time" accent="badge-yellow" to="/history" />
      </div>

      {/* ── Charts row 1 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sourced chart */}
        <ChartCard title="Candidates sourced — last 4 weeks">
          {hasSourced ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={weeklySourced}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Sourced" fill="var(--tl-primary, #3b82f6)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="relative overflow-hidden rounded-xl h-[230px]">
              <SparkBackground />
              <EmptyState
                icon="📊"
                title="No sourcing data yet"
                description="Start searching for candidates to see your weekly sourcing trends here."
                action={
                  <Link to="/candidate-search" className="btn-primary text-xs px-3 py-1.5">
                    🔍 Start Searching
                  </Link>
                }
              />
            </div>
          )}
        </ChartCard>

        {/* Region chart */}
        <ChartCard title="Candidates by region">
          {hasRegionData ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  innerRadius={50} outerRadius={85} paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={MARKET_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[230px] flex flex-col items-center justify-center gap-4 px-4">
              {/* Market flags illustration */}
              <div className="flex items-center gap-3">
                {[
                  { flag: '🇬🇧', label: 'UK', color: '#3b82f6' },
                  { flag: '🇦🇪', label: 'Dubai', color: '#f59e0b' },
                  { flag: '🌍', label: 'Global', color: '#8b5cf6' },
                ].map(m => (
                  <div key={m.label} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                      style={{ background: `${m.color}18`, border: `2px dashed ${m.color}40` }}>
                      {m.flag}
                    </div>
                    <span className="text-xs font-medium text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">No regional data yet</p>
                <p className="text-xs text-slate-400 mt-0.5">Add candidates to see your UK vs Dubai market breakdown</p>
              </div>
              <Link to="/candidate-search" className="btn-secondary text-xs px-3 py-1.5">
                ➕ Add Candidates
              </Link>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Charts row 2 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Screening recommendations">
          {hasRecs ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={recommendations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Candidates" radius={[4,4,0,0]}>
                  {recommendations.map(r => (
                    <Cell key={r.label} fill={REC_COLORS[r.label] || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="relative overflow-hidden rounded-xl h-[230px]">
              <div className="absolute inset-0 flex items-end gap-4 px-8 pb-10 opacity-[0.07] pointer-events-none">
                {[['Strong Hire', '#10b981', 70], ['Consider', '#f59e0b', 45], ['Reject', '#ef4444', 30]].map(([l, c, h]) => (
                  <div key={l} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: c }} />
                ))}
              </div>
              <EmptyState
                icon="🤖"
                title="No screening results yet"
                description="Upload candidate CVs to get AI-powered Strong Hire / Consider / Reject recommendations."
                action={
                  <Link to="/cv-match" className="btn-primary text-xs px-3 py-1.5">
                    🤖 Screen Resumes
                  </Link>
                }
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Avg screening score (last 8 weeks)">
          {hasScore ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg" name="Avg score"
                  stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="relative overflow-hidden rounded-xl h-[230px]">
              {/* Ghost trend line */}
              <svg className="absolute inset-0 w-full h-full opacity-[0.07]" viewBox="0 0 400 200" preserveAspectRatio="none">
                <polyline points="20,160 70,130 120,120 170,90 220,100 270,70 320,55 370,40"
                  fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="20,160 70,130 120,120 170,90 220,100 270,70 320,55 370,40"
                  fill="none" stroke="#8b5cf6" strokeWidth="20" opacity="0.3"/>
              </svg>
              <EmptyState
                icon="📈"
                title="Score trend will appear here"
                description="Screen more candidates to track how your average AI score changes week over week."
                action={
                  <Link to="/cv-match" className="btn-secondary text-xs px-3 py-1.5">
                    Start Screening
                  </Link>
                }
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Bottom section ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent searches */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Recent Candidate Searches</h3>
            <Link to="/candidate-search" className="text-xs text-blue-600 hover:underline">New search</Link>
          </div>
          {recentSearches.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm font-medium text-slate-600">No searches yet</p>
              <p className="text-xs text-slate-400 mt-1 mb-3">Search LinkedIn, CV-Library or Reed to find top talent</p>
              <Link to="/candidate-search" className="btn-primary text-xs px-3 py-1.5 inline-flex">
                Start Searching
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentSearches.map(s => (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.job_title}</p>
                      <p className="text-xs text-slate-500 truncate">{s.location || '—'} · {s.market || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold text-blue-600">{s.results_count}</span>
                      <p className="text-[10px] text-slate-400">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent screenings */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Recent screening batches</h3>
            <Link to="/cv-match" className="text-xs text-blue-600 hover:underline">Screen more</Link>
          </div>
          {recentScreenings.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm font-medium text-slate-600">No screenings yet</p>
              <p className="text-xs text-slate-400 mt-1 mb-3">Upload CVs and let AI score and rank your candidates</p>
              <Link to="/cv-match" className="btn-secondary text-xs px-3 py-1.5 inline-flex">
                Screen Resumes
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentScreenings.map(b => (
                <li key={b.batch_id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">⭐ {b.top_candidate}</p>
                      <p className="text-xs text-slate-500">{b.total} file{b.total === 1 ? '' : 's'} · top {b.top_score || 0}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 shrink-0">{new Date(b.created_at).toLocaleDateString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top candidates or Quick Actions when empty */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">
              {topCandidates.length > 0 ? 'Top 5 candidates' : 'Quick Actions'}
            </h3>
            {topCandidates.length > 0 && (
              <Link to="/history" className="text-xs text-blue-600 hover:underline">View all</Link>
            )}
          </div>

          {topCandidates.length > 0 ? (
            <ul className="space-y-2.5">
              {topCandidates.map((c, i) => (
                <li key={`${c.kind}-${c.id}`} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">{c.role || '—'}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {c.market && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c.market}</span>}
                      {c.email
                        ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📧 ✓</span>
                        : <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">no email</span>}
                    </div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${c.score >= 75 ? 'text-green-600' : c.score >= 55 ? 'text-amber-600' : 'text-red-500'}`}>
                    {c.score}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(a => (
                <Link key={a.to} to={a.to}
                  className="group relative overflow-hidden rounded-xl p-3 flex flex-col gap-1.5 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                  style={{ background: `linear-gradient(135deg, var(--bg1), var(--bg2))` }}>
                  <div className="absolute inset-0 opacity-10 bg-gradient-to-br"
                    style={{ backgroundImage: `linear-gradient(135deg, ${a.color.split(' ')[1]}, ${a.color.split(' ')[3]})` }} />
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: `linear-gradient(135deg, ${a.color.split(' ')[1]}, ${a.color.split(' ')[3]})` }}>
                    {a.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{a.label}</p>
                    <p className="text-[10px] text-slate-500">{a.sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Getting Started banner (shown when no data at all) ────────────── */}
      {!hasSourced && !hasRegionData && (
        <div className="card p-6 overflow-hidden relative">
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-5"
            style={{ background: 'var(--tl-primary, #3b82f6)' }} />
          <div className="absolute -right-2 top-8 w-24 h-24 rounded-full opacity-[0.07]"
            style={{ background: 'var(--tl-primary, #3b82f6)' }} />

          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🚀</span>
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--tl-primary, #3b82f6)', color: '#fff' }}>
                  Getting Started
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Set up your recruitment pipeline</h3>
              <p className="text-sm text-slate-500">
                TalentLens is ready — connect your platforms and start sourcing top supply chain talent for UK and Dubai markets.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              {[
                { step: '1', label: 'Search Candidates', icon: '🔍', to: '/candidate-search' },
                { step: '2', label: 'Screen Resumes',    icon: '🤖', to: '/cv-match' },
                { step: '3', label: 'Build Pipeline',    icon: '📋', to: '/pipeline' },
              ].map(s => (
                <Link key={s.step} to={s.to}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors bg-white group">
                  <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--tl-primary, #3b82f6)' }}>
                    {s.step}
                  </span>
                  <span className="text-xs font-medium text-slate-700">{s.icon} {s.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
