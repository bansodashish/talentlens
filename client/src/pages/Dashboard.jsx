import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

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
// Recruitment Tasks widget (self-contained, manages its own state)
function RecruitmentTasks() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [adding, setAdding]         = useState(false);
  const [newTitle, setNewTitle]     = useState('');
  const [newDate, setNewDate]       = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [editTitle, setEditTitle]   = useState('');
  const [editDate, setEditDate]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const inputRef  = useRef(null);
  const editRef   = useRef(null);

  useEffect(() => {
    api.get('/tasks')
      .then(r => setTasks(r.data.tasks || []))
      .catch(() => setError('Could not load tasks. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (adding)    inputRef.current?.focus(); }, [adding]);
  useEffect(() => { if (editingId) editRef.current?.focus();  }, [editingId]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const r = await api.post('/tasks', { title: newTitle.trim(), due_date: newDate || null });
      setTasks(prev => [...prev, r.data.task]);
      setNewTitle('');
      setNewDate('');
      setAdding(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save task. Make sure the server is running.');
    } finally { setSaving(false); }
  };

  const toggleComplete = async (task) => {
    const optimistic = tasks.map(t => t.id === task.id ? { ...t, completed: task.completed ? 0 : 1 } : t);
    setTasks(optimistic);
    try {
      await api.patch(`/tasks/${task.id}`, { completed: !task.completed });
    } catch {
      setTasks(tasks); // rollback
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDate(task.due_date || '');
  };

  const saveEdit = async (id) => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const r = await api.patch(`/tasks/${id}`, { title: editTitle.trim(), due_date: editDate || null });
      setTasks(prev => prev.map(t => t.id === id ? r.data.task : t));
      setEditingId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try { await api.delete(`/tasks/${id}`); }
    catch { /* re-fetch on error */ api.get('/tasks').then(r => setTasks(r.data.tasks || [])); }
  };

  // Move task up/down in the list
  const moveTask = async (index, dir) => {
    const next = [...tasks];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    // assign new sort_order values
    const reordered = next.map((t, i) => ({ ...t, sort_order: i + 1 }));
    setTasks(reordered);
    try {
      await Promise.all(reordered.map(t => api.patch(`/tasks/${t.id}`, { sort_order: t.sort_order })));
    } catch { api.get('/tasks').then(r => setTasks(r.data.tasks || [])); }
  };

  const today   = new Date().toISOString().split('T')[0];
  const pending = tasks.filter(t => !t.completed);
  const done    = tasks.filter(t =>  t.completed);

  const dueBadge = (due_date) => {
    if (!due_date) return null;
    const d = new Date(due_date + 'T00:00:00');
    const diff = Math.ceil((d - new Date()) / 86400000);
    if (diff < 0) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Overdue</span>;
    if (diff === 0) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">Today</span>;
    if (diff <= 3)  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{diff}d</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{d.toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</span>;
  };

  const TaskRow = ({ task, index, total }) => {
    const isEditing = editingId === task.id;
    return (
      <li className={`group flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0 ${task.completed ? 'opacity-60' : ''}`}>
        {/* Sequence number */}
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
          {index + 1}
        </span>

        {/* Checkbox */}
        <button
          onClick={() => toggleComplete(task)}
          className={`w-4 h-4 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${
            task.completed
              ? 'bg-green-500 border-green-500'
              : 'border-slate-300 hover:border-blue-400'
          }`}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <input
                ref={editRef}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(task.id); if (e.key === 'Escape') setEditingId(null); }}
                className="w-full text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Task title…"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={editDate}
                  min={today}
                  onChange={e => setEditDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button onClick={() => saveEdit(task.id)} disabled={saving}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  Save
                </button>
                <button onClick={() => setEditingId(null)}
                  className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm text-slate-800 ${task.completed ? 'line-through text-slate-400' : ''}`}>
                {task.title}
              </span>
              {dueBadge(task.due_date)}
            </div>
          )}
        </div>

        {/* Actions — visible on hover */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => moveTask(index, -1)} disabled={index === 0}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-20" title="Move up" aria-label="Move up">
              <svg className="w-3 h-3 text-slate-400" viewBox="0 0 10 10" fill="none">
                <path d="M5 7V3M5 3L2 6M5 3L8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button onClick={() => moveTask(index, 1)} disabled={index === total - 1}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-20" title="Move down" aria-label="Move down">
              <svg className="w-3 h-3 text-slate-400" viewBox="0 0 10 10" fill="none">
                <path d="M5 3v4M5 7L2 4M5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button onClick={() => startEdit(task)}
              className="p-1 rounded hover:bg-slate-100" title="Edit" aria-label="Edit task">
              <svg className="w-3 h-3 text-slate-400" viewBox="0 0 10 10" fill="none">
                <path d="M6.5 1.5l2 2-5 5H1.5v-2l5-5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            </button>
            <button onClick={() => deleteTask(task.id)}
              className="p-1 rounded hover:bg-red-50" title="Delete" aria-label="Delete task">
              <svg className="w-3 h-3 text-slate-400 hover:text-red-500" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="card p-5 animate-fade-up delay-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center text-base">✅</span>
          <h3 className="font-semibold text-slate-800">Recruitment Tasks</h3>
          {pending.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold tabular-nums">
              {pending.length} open
            </span>
          )}
        </div>
        <button
          onClick={() => { setAdding(true); setNewTitle(''); setNewDate(''); }}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
          aria-label="Add new task"
        >
          <span className="text-base leading-none">+</span> Add Task
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center justify-between gap-2">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Add task form */}
      {adding && (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <input
            ref={inputRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="e.g. Follow up with John Smith – Software Eng"
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">📅 Due date (optional):</span>
              <input
                type="date"
                value={newDate}
                min={today}
                onChange={e => setNewDate(e.target.value)}
                className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={addTask} disabled={saving || !newTitle.trim()}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {saving ? 'Saving…' : 'Add Task'}
              </button>
              <button onClick={() => setAdding(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : tasks.length === 0 && !adding ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm font-medium text-slate-600">No recruitment tasks yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-3">Keep track of follow-ups, interviews to schedule, and candidate reviews</p>
          <button onClick={() => setAdding(true)}
            className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1">
            + Add First Task
          </button>
        </div>
      ) : (
        <div>
          {pending.length > 0 && (
            <ul>
              {pending.map((task, i) => (
                <TaskRow key={task.id} task={task} index={i} total={pending.length} />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600 py-1">
                {done.length} completed task{done.length !== 1 ? 's' : ''}
              </summary>
              <ul className="mt-1">
                {done.map((task, i) => (
                  <TaskRow key={task.id} task={task} index={i} total={done.length} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
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
    stats = {}, activeVacancies = [], pipelineActivity = [],
  } = data || {};

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
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

      {/* ── Getting Started banner ────────────────────────────── */}
      <div className="card p-6 overflow-hidden relative animate-fade-up delay-75">
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
              <h3 className="text-lg font-bold text-slate-800 mb-1">Start Recruiting your next Candidate</h3>
              <p className="text-sm text-slate-500">
                Create a new job, screen CVs and identify the strongest candidates based on your requirements. Build your pipeline and manage candidates from application through to offer.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              {[
                { step: '1', label: 'Create Job & Screen Candidates', icon: '📋', to: '/jobs/new' },
                { step: '2', label: 'Build Pipeline',    icon: '📊', to: '/pipeline' },
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

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {/* removed */}

      {/* ── Active vacancies + Pipeline Activity ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up delay-150">

        {/* Active Vacancies */}
        <ChartCard title="Active Vacancies for Screening">
          {activeVacancies.length > 0 ? (
            <div className="space-y-2 max-h-[290px] overflow-auto pr-1">
              {activeVacancies.map((v) => (
                <div key={v.id} className="rounded-xl border border-slate-200 p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{v.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {v.location || '—'} · {v.market || '—'}
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: v.source === 'screening' ? '#e0f2fe' : '#e2e8f0', color: v.source === 'screening' ? '#0369a1' : '#334155' }}>
                      {v.source === 'screening' ? 'From Screening' : 'Active Job'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      {v.screenedCandidates || 0} candidates screened
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                      {v.screeningBatches || 0} batch{(v.screeningBatches || 0) === 1 ? '' : 'es'}
                    </span>
                    {v.lastScreenedAt && (
                      <span className="text-slate-400">
                        Last screening: {new Date(v.lastScreenedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl h-[230px]">
              <SparkBackground />
              <EmptyState
                icon="📌"
                title="No active vacancies yet"
                description="Create an active job or run resume screening with a JD to auto-populate vacancies here."
                action={
                  <div className="flex gap-2">
                    <Link to="/jobs/new" className="btn-primary text-xs px-3 py-1.5">📋 Create Job</Link>
                    <Link to="/cv-match" className="btn-secondary text-xs px-3 py-1.5">🤖 Start Screening</Link>
                  </div>
                }
              />
            </div>
          )}
        </ChartCard>

        {/* Pipeline Activity */}
        <ChartCard
          title="Pipeline Activity"
          action={<Link to="/pipeline" className="text-xs text-blue-600 hover:underline">View pipeline</Link>}
        >
          {(() => {
            const STAGE_META = [
              { stage: 'shortlisted',  label: 'Shortlisted',  icon: '⭐', bar: 'bg-blue-500',   tip: 'Candidates shortlisted from search or screening' },
              { stage: 'contacted',    label: 'Contacted',    icon: '📩', bar: 'bg-cyan-500',    tip: 'Candidates you have reached out to' },
              { stage: 'phone_screen', label: 'Phone Screen', icon: '📞', bar: 'bg-yellow-500',  tip: 'Candidates in phone screening stage' },
              { stage: 'interview',    label: 'Interview',    icon: '🗓', bar: 'bg-purple-500',  tip: 'Candidates in interview stage' },
              { stage: 'offer',        label: 'Offer',        icon: '🎉', bar: 'bg-green-500',   tip: 'Candidates with active offers' },
            ];
            const total = pipelineActivity.reduce((s, r) => s + r.count, 0);
            const countMap = Object.fromEntries(pipelineActivity.map(r => [r.stage, r.count]));
            const maxCount = Math.max(...STAGE_META.map(m => countMap[m.stage] || 0), 1);

            if (total === 0) {
              return (
                <div className="relative overflow-hidden rounded-xl h-[230px]">
                  {/* Ghost funnel bars */}
                  <div className="absolute inset-0 flex items-end gap-3 px-8 pb-10 opacity-[0.07] pointer-events-none">
                    {[80, 60, 45, 30, 15].map((h, i) => (
                      <div key={i} className="flex-1 bg-blue-600 rounded-t-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <EmptyState
                    icon="📊"
                    title="No candidates in pipeline yet"
                    description="Move candidates to Shortlisted, Contacted, Phone Screen, Interview or Offer stages to track progress here."
                    action={
                      <Link to="/pipeline" className="btn-primary text-xs px-3 py-1.5">
                        Open Pipeline
                      </Link>
                    }
                  />
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {STAGE_META.map(({ stage, label, icon, bar, tip }, idx) => {
                  const count = countMap[stage] || 0;
                  const pct   = Math.round((count / maxCount) * 100);
                  const isLast = idx === STAGE_META.length - 1;
                  return (
                    <div key={stage}>
                      <div className="flex items-center gap-3">
                        {/* Stage label + tooltip */}
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                          <span className="text-sm">{icon}</span>
                          <span className="text-xs font-medium text-slate-700 truncate">{label}</span>
                          <span
                            className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 text-[9px] font-bold flex items-center justify-center cursor-default shrink-0"
                            title={tip}
                            aria-label={tip}
                          >
                            i
                          </span>
                        </div>
                        {/* Bar */}
                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${bar} rounded-full transition-all duration-500`}
                            style={{ width: count > 0 ? `${Math.max(pct, 6)}%` : '0%' }}
                          />
                        </div>
                        {/* Count */}
                        <span className="text-sm font-bold text-slate-700 tabular-nums w-7 text-right shrink-0">
                          {count}
                        </span>
                      </div>
                      {/* Funnel arrow connector */}
                      {!isLast && (
                        <div className="ml-[7.5rem] flex items-center pl-1 h-2">
                          <svg width="12" height="8" viewBox="0 0 12 8" className="text-slate-300" fill="none">
                            <path d="M6 0 L12 0 L6 8 L0 0 Z" fill="currentColor"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>{total} total in pipeline</span>
                  <Link to="/pipeline" className="text-blue-500 hover:underline">Manage →</Link>
                </div>
              </div>
            );
          })()}
        </ChartCard>

      </div>

      {/* ── Recruitment Tasks ─────────────────────────────────────────────── */}
      <RecruitmentTasks />

    </div>
  );
}
