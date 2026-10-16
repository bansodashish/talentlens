import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const RECOMMENDATION_STYLE = {
  'Strong Hire': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Consider: 'bg-amber-100 text-amber-800 border-amber-200',
  Reject: 'bg-rose-100 text-rose-800 border-rose-200',
};

const FIT_STYLE = {
  strong: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  not_met: 'bg-rose-100 text-rose-800',
};

const EVIDENCE_SOURCE_LABEL = {
  cv_excerpt: 'CV excerpt',
  model_assessment: 'AI assessment',
  generated_fallback: 'Generated guidance',
};

export default function ScreeningResult() {
  const { screeningId } = useParams();
  const navigate = useNavigate();
  const [screening, setScreening] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/screen/screening/${screeningId}`)
      .then(response => { if (active) setScreening(response.data.screening); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Could not load this assessment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [screeningId]);

  const addToPipeline = async () => {
    setPipelineLoading(true);
    setError('');
    try {
      const response = await api.patch(`/screen/screening/${screeningId}/decision`, { decision: 'shortlisted' });
      setScreening(response.data.screening);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not add this candidate to the pipeline.');
    } finally {
      setPipelineLoading(false);
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" /></div>;
  if (error && !screening) return <div className="card p-5 text-red-700 bg-red-50 border-red-200">{error}</div>;

  const assessment = screening.assessment || {};
  const decisionLabels = { shortlisted: 'Shortlisted', hold: 'On hold', rejected: 'Rejected' };
  const requirements = assessment.requirements || [];
  const reasons = assessment.reasons || [];
  const useCases = assessment.useCases || [];
  const interviewQuestions = assessment.interviewQuestions || [];

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-800">Back to screenings</button>
          <p className="text-xs uppercase tracking-wide text-slate-400 mt-3">Candidate assessment</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{screening.name || screening.fileName}</h1>
          <p className="text-sm text-slate-500 mt-1">{screening.currentRole || 'Candidate'} {screening.email ? `• ${screening.email}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${RECOMMENDATION_STYLE[screening.recommendation] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{screening.recommendation || 'Review needed'}</span>
          {screening.reviewDecision && <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">{decisionLabels[screening.reviewDecision]}</span>}
          {screening.reviewDecision !== 'shortlisted' && <button disabled={pipelineLoading} onClick={addToPipeline} className="btn-primary text-sm disabled:opacity-60">{pipelineLoading ? 'Adding...' : 'Add to Pipeline'}</button>}
        </div>
      </div>

      {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

      <section className="card overflow-hidden">
        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recruiter summary</p>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">{screening.summary || 'No summary is available for this screening.'}</p>
            <p className="text-sm text-slate-500 mt-3"><span className="font-medium text-slate-700">Role:</span> {screening.jobTitle || 'Not specified'}</p>
          </div>
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Job description</p>
            <p className="text-sm font-semibold text-slate-800 mt-2">{screening.jobTitle || 'Role not specified'}</p>
            <p className="text-sm text-slate-600 mt-1 line-clamp-3">{screening.jobDescription || 'No job description was retained for this screening.'}</p>
          </div>
        </div>
      </section>

      <p className="text-sm text-slate-600 px-1">This assessment compares the job requirements with skills evidenced in the CV. Open the requirement rows to see the supporting evidence and any gaps.</p>

      <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-5 items-start">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">Why we recommend {screening.name || 'this candidate'}</h2>
              <span className="text-[11px] font-semibold text-slate-400">{reasons.length} reasons</span>
            </div>
            {reasons.length ? <div className="mt-4 space-y-3">{reasons.map((item, index) => <div key={`${item.claim}-${index}`} className="border border-slate-100 bg-slate-50/70 rounded-lg p-3">
              <div className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold flex items-center justify-center">{index + 1}</span><div><p className="text-sm font-semibold text-slate-800">{item.claim}</p><p className="text-sm text-slate-600 leading-relaxed mt-1">{item.evidence}</p><p className="text-[11px] font-medium text-slate-400 mt-2">{EVIDENCE_SOURCE_LABEL[item.evidenceSource] || 'Assessment guidance'}</p></div></div>
            </div>)}</div> : <p className="mt-3 text-sm text-slate-500">No evidence summary was captured for this screening.</p>}
          </section>

          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Requirement by requirement</h2></div>
            {requirements.length ? <div className="divide-y divide-slate-100">{requirements.map((item, index) => <div key={`${item.requirement}-${index}`} className="px-5 py-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-3 items-start">
              <p className="text-sm font-medium text-slate-800">{item.requirement}</p><div><p className="text-sm text-slate-600">{item.evidence}</p><p className="text-[11px] font-medium text-slate-400 mt-1">{EVIDENCE_SOURCE_LABEL[item.evidenceSource] || 'Assessment guidance'}</p></div><span className={`shrink-0 text-[11px] px-2 py-1 rounded font-semibold ${FIT_STYLE[item.fit] || FIT_STYLE.partial}`}>{(item.fit || 'partial').replace('_', ' ')}</span>
            </div>)}</div> : <p className="p-5 text-sm text-slate-500">No requirement-level evidence was captured for this screening.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="font-semibold text-slate-900">Best use cases</h2>
            {useCases.length ? <div className="mt-4 space-y-3">{useCases.map((item, index) => <div key={`${item.capability}-${index}`} className="border border-slate-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800">{item.capability}</p><p className="text-sm text-slate-600 leading-relaxed mt-1">{item.useCase}</p>
            </div>)}</div> : <p className="mt-3 text-sm text-slate-500">No role-specific use cases were captured.</p>}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-slate-900">Ask at interview</h2>
            {interviewQuestions.length ? <ol className="mt-4 space-y-3">{interviewQuestions.map((item, index) => <li key={`${item.question}-${index}`} className="grid grid-cols-[1.25rem_1fr] gap-2">
              <span className="text-sm font-semibold text-slate-400">{index + 1}</span><div><p className="text-sm font-medium text-slate-800">{item.question}</p><p className="mt-1 text-sm text-slate-500">{item.gap}</p></div>
            </li>)}</ol> : <p className="mt-3 text-sm text-slate-500">No specific gaps were identified for follow-up.</p>}
          </section>
        </div>
      </div>

      <aside className="border-t border-slate-200 pt-5 text-xs text-slate-500 leading-relaxed">AI-assisted assessment based on the CV and requirements supplied for this role. It supports recruiter review and must not determine a hiring outcome on its own.</aside>
      <Link to="/cv-match" className="text-sm text-blue-700 hover:text-blue-900 font-medium">Screen another candidate</Link>
    </div>
  );
}