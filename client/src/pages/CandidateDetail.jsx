import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';

const statusColors = {
  new: 'badge-blue', screening: 'badge-yellow', interview: 'badge-purple',
  offer: 'badge-green', hired: 'badge-green', rejected: 'badge-red',
};
const ratingLabel = (r) => ({ 5: 'Excellent', 4: 'Strong', 3: 'Good', 2: 'Moderate', 1: 'Weak' }[r] || '—');
const ratingColor = (r) => r >= 4 ? 'text-green-700 bg-green-100' : r >= 3 ? 'text-blue-700 bg-blue-100' : r >= 2 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100';

function ScoreBar({ score }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-700 w-10 text-right">{score}%</span>
    </div>
  );
}

export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [matchJobId, setMatchJobId] = useState('');
  const [matchProvider, setMatchProvider] = useState('local');
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimer = useRef(null);

  const fetchData = () => {
    return api.get(`/candidates/${id}`)
      .then(res => setData(res.data))
      .catch(() => navigate('/candidates'));
  };

  useEffect(() => {
    spinnerTimer.current = setTimeout(() => setShowSpinner(true), 200);
    Promise.all([
      fetchData(),
      api.get('/jobs', { params: { status: 'active' } }).then(r => setJobs(r.data.jobs || [])),
    ]).finally(() => {
      clearTimeout(spinnerTimer.current);
      setLoading(false);
      setShowSpinner(false);
    });
    return () => clearTimeout(spinnerTimer.current);
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this candidate?')) return;
    await api.delete(`/candidates/${id}`);
    navigate('/candidates');
  };

  const handleMatch = async () => {
    if (!matchJobId) return;
    setMatching(true); setMatchError('');
    try {
      await api.post(`/cv-match/candidate/${id}/job/${matchJobId}`, { provider: matchProvider });
      await fetchData(); // refresh cv match history
    } catch (err) {
      setMatchError(err.response?.data?.error || err.response?.data?.hint || 'Match failed.');
    } finally { setMatching(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64" role="status" aria-label="Loading candidate">
      {showSpinner && <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>}
    </div>
  );

  const { candidate, applications, cvMatches } = data || {};

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/candidates')} className="text-sm text-slate-500 hover:text-slate-700 mb-2">← Candidates</button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">
              {candidate?.name?.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{candidate?.name}</h1>
              <p className="text-slate-500 text-sm">{candidate?.current_title}{candidate?.current_company ? ` · ${candidate.current_company}` : ''}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/candidates/${id}/edit`} className="btn-secondary text-sm">Edit</Link>
          <button onClick={handleDelete} className="btn-danger text-sm" aria-label={`Delete candidate ${candidate?.name}`}>Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">

          {/* Profile info */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Profile</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              {[
                ['Email', candidate?.email],
                ['Phone', candidate?.phone],
                ['Location', candidate?.location],
                ['Region', candidate?.market || 'Global'],
                ['Experience', candidate?.experience_years ? `${candidate.experience_years} yrs` : null],
                ['Source', candidate?.source],
              ].map(([label, val]) => val ? (
                <div key={label}>
                  <span className="text-slate-400">{label}</span>
                  <span className="ml-2 text-slate-800">{val}</span>
                </div>
              ) : null)}
              <div className="col-span-2">
                <span className="text-slate-400">Status</span>
                <span className={`ml-2 badge ${statusColors[candidate?.status]}`}>{candidate?.status}</span>
              </div>
              {candidate?.linkedin_url && (
                <div className="col-span-2">
                  <span className="text-slate-400">LinkedIn</span>
                  <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="ml-2 text-blue-600 hover:underline text-sm truncate">{candidate.linkedin_url}</a>
                </div>
              )}
            </div>

            {candidate?.skills && (
              <div className="mt-4">
                <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wide">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.split(',').map(s => (
                    <span key={s} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{s.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {candidate?.notes && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-400 font-medium mb-1">Notes</p>
                <p className="text-sm text-slate-700">{candidate.notes}</p>
              </div>
            )}
          </div>

          {/* Applications */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Applications ({applications?.length || 0})</h3>
            {applications?.length > 0 ? (
              <div className="space-y-2">
                {applications.map(app => (
                  <div key={app.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm text-slate-800">{app.job_title}</div>
                      <div className="text-xs text-slate-400">{app.job_location} · {app.job_market} · Applied {new Date(app.applied_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {app.ai_match_score != null && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${app.ai_match_score >= 70 ? 'text-green-700 bg-green-100' : app.ai_match_score >= 50 ? 'text-blue-700 bg-blue-100' : 'text-orange-700 bg-orange-100'}`}>
                          {app.ai_match_score}%
                        </span>
                      )}
                      <span className={`badge ${statusColors[app.status] || 'badge-slate'}`}>{app.stage?.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No applications yet.</p>
            )}
          </div>

          {/* CV Match history */}
          {cvMatches?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4">CV Match History ({cvMatches.length})</h3>
              <div className="space-y-2">
                {cvMatches.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-slate-700">{m.job_title || 'Ad-hoc match'}</div>
                      <div className="text-xs text-slate-400">{m.target_role?.replace(/_/g, ' ')} · {m.provider} · {new Date(m.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ratingColor(m.rating)}`}>
                        {ratingLabel(m.rating)}
                      </span>
                      <span className={`badge ${m.score_pct >= 70 ? 'badge-green' : m.score_pct >= 50 ? 'badge-blue' : 'badge-yellow'}`}>
                        {m.score_pct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI Score */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">🤖 AI Score</h3>
            {candidate?.ai_score != null ? (
              <>
                <ScoreBar score={candidate.ai_score} />
                {candidate.ai_summary && (
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{candidate.ai_summary}</p>
                )}
                {candidate.cv_parsed_at && (
                  <p className="text-xs text-slate-400 mt-1.5">Scored from CV · {new Date(candidate.cv_parsed_at).toLocaleDateString()}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">
                {candidate?.cv_filename ? 'CV uploaded but not yet scored.' : 'Upload a CV to enable AI scoring.'}
              </p>
            )}
          </div>

          {/* Match against job */}
          {candidate?.cv_text && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Match vs Job</h3>
              <div className="space-y-2">
                <select className="input text-sm" value={matchJobId} onChange={e => setMatchJobId(e.target.value)}>
                  <option value="">Select a job…</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.title} ({j.market})</option>
                  ))}
                </select>
                <select className="input text-sm" value={matchProvider} onChange={e => setMatchProvider(e.target.value)}>
                  <option value="local">Local scoring</option>
                  <option value="openai">OpenAI GPT-4</option>
                </select>
                {matchError && <p className="text-xs text-red-600">{matchError}</p>}
                <button className="btn-primary w-full text-sm" onClick={handleMatch}
                  disabled={!matchJobId || matching}>
                  {matching ? 'Scoring…' : '🤖 Run CV Match'}
                </button>
              </div>
              {!candidate?.cv_text && (
                <p className="text-xs text-slate-400 mt-2">Upload a CV first to enable matching.</p>
              )}
            </div>
          )}

          {/* CV file */}
          {candidate?.cv_filename && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-3">📄 CV</h3>
              <p className="text-sm text-slate-600 truncate mb-1">{candidate.cv_filename}</p>
              {candidate.cv_text && (
                <p className="text-xs text-green-600 mb-3">✅ Parsed & scored</p>
              )}
              <a href={`/api/candidates/${candidate.id}/download-cv?token=${localStorage.getItem('token')}`} target="_blank" rel="noopener noreferrer"
                className="btn-secondary text-sm w-full text-center block">
                View CV
              </a>
            </div>
          )}

          {/* Quick actions */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link to="/screen" className="btn-secondary text-sm w-full text-center block">
                🤖 Screen a Resume
              </Link>
              <Link to="/jobs/new" className="btn-secondary text-sm w-full text-center block">
                💼 Create a Job for this Candidate
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
