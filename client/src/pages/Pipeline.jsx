import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const STAGES = ['application', 'phone_screen', 'technical', 'final', 'offer'];
const STAGE_LABELS = { application: '📋 Application', phone_screen: '📞 Phone Screen', technical: '🔧 Technical', final: '🏁 Final Round', offer: '🎉 Offer' };
const STAGE_COLORS = { application: 'border-blue-300', phone_screen: 'border-yellow-300', technical: 'border-purple-300', final: 'border-orange-300', offer: 'border-green-300' };

export default function Pipeline() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marketFilter, setMarketFilter] = useState('');

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/applications');
      setApplications(res.data.applications);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchApplications(); }, []);

  const updateStage = async (appId, newStage) => {
    try {
      await api.put(`/applications/${appId}`, { stage: newStage, status: newStage === 'offer' ? 'offer' : 'screening' });
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, stage: newStage } : a));
    } catch (err) { console.error(err); }
  };

  const filtered = marketFilter ? applications.filter(a => a.job_market === marketFilter) : applications;
  const byStage = STAGES.reduce((acc, s) => ({ ...acc, [s]: filtered.filter(a => a.stage === s) }), {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pipeline</h1>
          <p className="text-slate-500 text-sm">{filtered.length} active application{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-40 text-sm" value={marketFilter} onChange={e => setMarketFilter(e.target.value)}>
            <option value="">All Markets</option>
            <option value="Global">🌍 Global</option>
            <option value="Americas">🌎 Americas</option>
            <option value="Europe">🌍 Europe</option>
            <option value="Asia Pacific">🌏 Asia Pacific</option>
            <option value="MENA">🕌 MENA</option>
            <option value="Africa">🌍 Africa</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => (
            <div key={stage} className="flex-shrink-0 w-64">
              <div className={`card border-t-4 ${STAGE_COLORS[stage]} overflow-hidden`}>
                <div className="p-3 bg-slate-50 border-b border-slate-100">
                  <div className="text-sm font-semibold text-slate-700">{STAGE_LABELS[stage]}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{byStage[stage].length} candidate{byStage[stage].length !== 1 ? 's' : ''}</div>
                </div>

                <div className="p-2 space-y-2 min-h-[300px] max-h-[600px] overflow-y-auto">
                  {byStage[stage].length === 0 && (
                    <div className="text-xs text-slate-300 text-center py-8">No candidates</div>
                  )}
                  {byStage[stage].map(app => (
                    <div key={app.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-1">
                        <Link to={`/candidates/${app.candidate_id}`} className="font-medium text-sm text-slate-800 hover:text-blue-600 leading-tight">
                          {app.candidate_name}
                        </Link>
                        {app.ai_match_score && (
                          <span className="text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">{app.ai_match_score}%</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-2">{app.current_title || 'Candidate'}</p>
                      <p className="text-xs text-slate-400 truncate mb-2">{app.job_title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          🌍 {app.job_market}
                        </span>
                        <select
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600 cursor-pointer"
                          value={app.stage}
                          onChange={e => updateStage(app.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                        >
                          {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">🔄</div>
          <p className="font-medium text-slate-600 mb-1">Pipeline is empty</p>
          <p className="text-sm mb-4">Add candidates to jobs to see them in the pipeline</p>
          <Link to="/candidates" className="btn-primary text-sm">View Candidates</Link>
        </div>
      )}
    </div>
  );
}
