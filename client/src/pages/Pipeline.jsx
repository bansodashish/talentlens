import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

const STAGES = ['shortlisted', 'contacted', 'phone_screen', 'interview', 'offer'];
const STAGE_LABELS = {
  shortlisted:  '⭐ Shortlisted',
  contacted:    '📬 Contacted',
  phone_screen: '📞 Phone Screen',
  interview:    '🗓 Interview',
  offer:        '🎉 Offer',
};
const STAGE_COLORS = {
  shortlisted:  'border-t-blue-500 from-blue-500/10',
  contacted:    'border-t-cyan-500 from-cyan-500/10',
  phone_screen: 'border-t-yellow-500 from-yellow-500/10',
  interview:    'border-t-purple-500 from-purple-500/10',
  offer:        'border-t-emerald-500 from-emerald-500/10',
};
const STAGE_DROP_BG = {
  shortlisted:  'bg-blue-500/10',
  contacted:    'bg-cyan-500/10',
  phone_screen: 'bg-yellow-500/10',
  interview:    'bg-purple-500/10',
  offer:        'bg-emerald-500/10',
};

export default function Pipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobFilter = searchParams.get('job') || '';
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/candidates');
      setCandidates(res.data.candidates || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCandidates(); }, []);

  const updateStage = async (candidateId, newStage) => {
    const status = newStage === 'offer' ? 'offer' : (newStage === 'shortlisted' ? 'screening' : 'interview');
    // optimistic update
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, pipeline_stage: newStage, status } : c));
    try {
      await api.patch(`/candidates/${candidateId}`, { pipeline_stage: newStage, status });
    } catch (err) {
      console.error(err);
      fetchCandidates();
    }
  };

  const handleDragStart = (e, candidateId) => {
    setDraggedId(candidateId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    if (draggedId !== null) {
      updateStage(draggedId, targetStage);
    }
    setDraggedId(null);
    setDragOverStage(null);
  };

  const inPipeline = candidates.filter(c => STAGES.includes(c.pipeline_stage));
  const jobFiltered = jobFilter
    ? inPipeline.filter(c => (c.job_title || '').trim().toLowerCase() === jobFilter.trim().toLowerCase())
    : inPipeline;
  const filtered = jobFiltered;
  const byStage = STAGES.reduce((acc, s) => ({ ...acc, [s]: filtered.filter(c => c.pipeline_stage === s) }), {});
  const jobOptions = [...new Set(candidates.map(c => (c.job_title || '').trim()).filter(Boolean))].sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Pipeline</h1>
          <p className="text-slate-400 text-sm mt-1">{filtered.length} active application{filtered.length !== 1 ? 's' : ''}</p>
          {jobFilter && (
            <p className="text-xs text-cyan-400 mt-1">
              Filtered by job: <strong>{jobFilter}</strong>{' '}
              <button type="button" onClick={() => setSearchParams({})} className="underline ml-1">Clear</button>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <select
            className="input bg-slate-800/50 border-slate-700 text-slate-200 w-56 text-sm rounded-lg"
            value={jobFilter}
            onChange={e => setSearchParams(e.target.value ? { job: e.target.value } : {})}
          >
            <option value="">— Select a Job —</option>
            {jobOptions.map(title => (
              <option key={title} value={title}>{title}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : !jobFilter ? (
        <div className="flex items-center justify-center h-64 text-center text-slate-400">
          <div>
            <div className="text-4xl mb-3">🔄</div>
            <p className="font-medium text-slate-300 mb-1">Select a job to view its pipeline</p>
            <p className="text-sm text-slate-500">Use the dropdown above to choose a job</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const isOver = dragOverStage === stage;
            const isOffer = stage === 'offer';
            return (
              <div key={stage} className="flex-shrink-0 w-80">
                <div className={`border-t-4 ${STAGE_COLORS[stage]} bg-gradient-to-b ${STAGE_COLORS[stage]} border border-slate-800 rounded-lg overflow-hidden backdrop-blur-sm`}>
                  <div className="p-4 border-b border-slate-800/50 bg-slate-900/40">
                    <div className="text-sm font-bold text-slate-100">{STAGE_LABELS[stage]}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-slate-200 text-[10px] font-semibold">
                        {byStage[stage].length}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-3 space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto transition-all duration-200 ${
                      isOver ? STAGE_DROP_BG[stage] : ''
                    }`}
                    onDragOver={e => handleDragOver(e, stage)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, stage)}
                  >
                    {byStage[stage].length === 0 && (
                      <div className={`text-xs text-center py-12 border-2 border-dashed rounded-lg transition-all ${
                        isOver ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : 'border-slate-700 text-slate-500'
                      }`}>
                        {isOver ? '⬇ Drop here' : 'No candidates'}
                      </div>
                    )}

                    {byStage[stage].map(cand => {
                      const isDragging = draggedId === cand.id;
                      return (
                        <div
                          key={cand.id}
                          draggable={!isOffer}
                          onDragStart={!isOffer ? e => handleDragStart(e, cand.id) : undefined}
                          onDragEnd={!isOffer ? handleDragEnd : undefined}
                          className={`border rounded-lg p-3 transition-all duration-200 select-none backdrop-blur-sm ${
                            isOffer
                              ? 'border-emerald-500/50 bg-emerald-500/10 cursor-default'
                              : isDragging
                              ? 'border-blue-400/50 bg-blue-500/10 opacity-60 shadow-xl cursor-grabbing scale-105'
                              : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50 hover:shadow-lg cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isOffer
                                ? <span className="text-emerald-400 text-xs flex-shrink-0" title="Frozen at Offer">🔒</span>
                                : <span className="text-slate-500 text-xs flex-shrink-0">⠿</span>
                              }
                              <Link
                                to={`/candidates/${cand.id}`}
                                className="font-semibold text-sm text-slate-200 hover:text-cyan-300 leading-tight truncate transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                {cand.name}
                              </Link>
                            </div>
                            {cand.ai_score != null && (
                              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-full ml-1 flex-shrink-0 border border-emerald-500/50">
                                {cand.ai_score}%
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate mb-1">{cand.current_title || 'Candidate'}</p>
                          <p className="text-xs text-slate-500 truncate mb-2">{cand.current_company || cand.email}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                              🌍 {cand.market}
                            </span>
                            {isOffer ? (
                              <span className="text-xs text-emerald-300 font-bold">✓ Offered</span>
                            ) : (
                              <select
                                className="text-xs border border-slate-700 rounded px-1.5 py-0.5 bg-slate-800/50 text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                value={cand.pipeline_stage}
                                onChange={e => updateStage(cand.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                              >
                                {STAGES.filter(s => s !== 'offer').map(s => (
                                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">🔄</div>
          <p className="font-medium text-slate-300 mb-1">Pipeline is empty</p>
          <p className="text-sm text-slate-500 mb-4">Set a candidate's pipeline stage on the Candidates page to see them here</p>
          <Link to="/candidates" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all duration-200 transform hover:scale-105 inline-block">View Candidates</Link>
        </div>
      )}
    </div>
  );
}
