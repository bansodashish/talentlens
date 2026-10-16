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

export default function ScreeningResult() {
  const { screeningId } = useParams();
  const navigate = useNavigate();
  const [screening, setScreening] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    let active = true;
    api.get(`/screen/screening/${screeningId}`)
      .then(response => { if (active) setScreening(response.data.screening); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Could not load this assessment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [screeningId]);

  const updateDecision = async (decision) => {
    setActionLoading(decision);
    setError('');
    try {
      const response = await api.patch(`/screen/screening/${screeningId}/decision`, { decision });
      setScreening(response.data.screening);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save the recruiter decision.');
    } finally {
      setActionLoading('');
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cv-match/results/${screeningId}`);
      setShareMessage('Secure link copied');
    } catch (_) {
      setShareMessage('Copy this page URL from your browser');
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" /></div>;
  if (error && !screening) return <div className="card p-5 text-red-700 bg-red-50 border-red-200">{error}</div>;

  const assessment = screening.assessment || {};
  const decisionLabels = { shortlisted: 'Shortlisted', hold: 'On hold', rejected: 'Rejected' };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-800">Back to screenings</button>
          <p className="text-xs uppercase tracking-wide text-slate-400 mt-3">Screening assessment</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{screening.name || screening.fileName}</h1>
          <p className="text-sm text-slate-500 mt-1">{screening.currentRole || 'Candidate'} {screening.email ? `• ${screening.email}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${RECOMMENDATION_STYLE[screening.recommendation] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{screening.recommendation || 'Review needed'}</span>
          {screening.reviewDecision && <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">{decisionLabels[screening.reviewDecision]}</span>}
        </div>
      </div>

      {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

      <section className="card p-5 grid md:grid-cols-[1fr_auto] gap-5">
        <div>
          <h2 className="font-semibold text-slate-900">Recruiter summary</h2>
          <p className="text-sm text-slate-600 leading-relaxed mt-2">{screening.summary || 'No summary is available for this screening.'}</p>
          <p className="text-sm text-slate-500 mt-3"><span className="font-medium text-slate-700">Role:</span> {screening.jobTitle || 'Not specified'}</p>
        </div>
        <div className="flex flex-wrap md:flex-col gap-2 md:justify-center">
          <button disabled={!!actionLoading} onClick={() => updateDecision('shortlisted')} className="btn-primary text-sm">{actionLoading === 'shortlisted' ? 'Saving...' : 'Shortlist'}</button>
          <button disabled={!!actionLoading} onClick={() => updateDecision('hold')} className="btn-secondary text-sm">Hold</button>
          <button disabled={!!actionLoading} onClick={() => updateDecision('rejected')} className="text-sm px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50">Reject</button>
          <button onClick={share} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">Share</button>
          {shareMessage && <span className="text-xs text-emerald-700">{shareMessage}</span>}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Requirement by requirement</h2></div>
        {(assessment.requirements || []).length ? <div className="divide-y divide-slate-100">
          {assessment.requirements.map((item, index) => <div key={`${item.requirement}-${index}`} className="p-5 flex gap-4 items-start">
            <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-semibold ${FIT_STYLE[item.fit] || FIT_STYLE.partial}`}>{(item.fit || 'partial').replace('_', ' ')}</span>
            <div><h3 className="text-sm font-semibold text-slate-800">{item.requirement}</h3><p className="text-sm text-slate-600 mt-1">{item.evidence}</p></div>
          </div>)}
        </div> : <p className="p-5 text-sm text-slate-500">No requirement-level evidence was captured for this screening.</p>}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5"><h2 className="font-semibold text-slate-900">Why we recommend</h2>
          <div className="mt-4 space-y-4">{(assessment.reasons || []).map((item, index) => <div key={`${item.claim}-${index}`}><p className="text-sm font-semibold text-slate-800">{item.claim}</p><p className="text-sm text-slate-600 mt-1">{item.evidence}</p></div>)}</div>
        </section>
        <section className="card p-5"><h2 className="font-semibold text-slate-900">Best use cases</h2>
          <div className="mt-4 space-y-4">{(assessment.useCases || []).map((item, index) => <div key={`${item.capability}-${index}`}><p className="text-sm font-semibold text-slate-800">{item.capability}</p><p className="text-sm text-slate-600 mt-1">{item.useCase}</p></div>)}</div>
        </section>
      </div>

      <section className="card p-5"><h2 className="font-semibold text-slate-900">Ask at interview</h2>
        {(assessment.interviewQuestions || []).length ? <ol className="mt-4 space-y-3 list-decimal list-inside text-sm text-slate-700">{assessment.interviewQuestions.map((item, index) => <li key={`${item.question}-${index}`}><span className="font-medium">{item.question}</span><p className="ml-5 mt-1 text-slate-500">{item.gap}</p></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">No specific gaps were identified for follow-up.</p>}
      </section>

      <aside className="border-t border-slate-200 pt-5 text-xs text-slate-500 leading-relaxed">AI-assisted assessment based on the CV and requirements supplied for this role. It supports recruiter review and must not determine a hiring outcome on its own.</aside>
      <Link to="/cv-match" className="text-sm text-blue-700 hover:text-blue-900 font-medium">Screen another candidate</Link>
    </div>
  );
}