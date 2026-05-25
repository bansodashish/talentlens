import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const STEPS = ['Region', 'Apify key', 'Claude key', 'Test search'];

const REGIONS = [
  { key: 'Global',       label: 'Global',        icon: '🌍' },
  { key: 'Americas',     label: 'Americas',      icon: '🌎' },
  { key: 'Europe',       label: 'Europe',        icon: '🌍' },
  { key: 'Asia Pacific', label: 'Asia Pacific',  icon: '🌏' },
  { key: 'MENA',         label: 'MENA',          icon: '🕌' },
  { key: 'Africa',       label: 'Africa',        icon: '🌍' },
];

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]   = useState(0);
  const [market, setMarket]       = useState(user?.market || 'Global');
  const [apifyKey, setApifyKey]   = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [testJob, setTestJob]     = useState('Product Manager');
  const [testLoc, setTestLoc]     = useState('');
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const saveMarket = async () => {
    setBusy(true); setError('');
    try { await updateUser({ market }); next(); }
    catch (e) { setError(e.response?.data?.error || 'Failed to save.'); }
    finally   { setBusy(false); }
  };

  const saveApify = async () => {
    setBusy(true); setError('');
    try {
      if (apifyKey.trim()) await updateUser({ apify_key: apifyKey.trim() });
      next();
    } catch (e) { setError(e.response?.data?.error || 'Failed to save Apify key.'); }
    finally   { setBusy(false); }
  };

  const saveClaude = async () => {
    setBusy(true); setError('');
    try {
      if (claudeKey.trim()) await updateUser({ claude_key: claudeKey.trim() });
      next();
    } catch (e) { setError(e.response?.data?.error || 'Failed to save Claude key.'); }
    finally   { setBusy(false); }
  };

  const runTest = async () => {
    setBusy(true); setError(''); setTestResult(null);
    try {
      const res = await api.post('/search/linkedin', {
        jobTitle: testJob, location: testLoc, market, maxResults: 5,
      });
      setTestResult({ ok: true, count: res.data.count });
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.error || e.message, hint: e.response?.data?.hint });
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api.post('/auth/onboarding/complete');
      try {
        const me = await api.get('/auth/me');
        localStorage.setItem('tl_user', JSON.stringify(me.data.user));
      } catch (_) {}
      navigate('/dashboard');
    } catch (e) { setError(e.response?.data?.error || 'Failed.'); setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-hero-mesh bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white font-bold text-lg shadow-glow mb-3">T</div>
          <h1 className="font-display text-3xl font-bold text-slate-800">Welcome to TalentLens</h1>
          <p className="text-slate-500 text-sm mt-2">Let's get your workspace ready in 4 quick steps.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-gradient text-white shadow-glow' : 'bg-slate-200 text-slate-500'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] mt-1.5 ${i === step ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} style={{ marginTop: -18 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="card p-7">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>}

          {step === 0 && (
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 mb-1">Which region do you primarily recruit for?</h2>
              <p className="text-sm text-slate-500 mb-5">This sets the default for searches and candidate filters \u2014 you can change it anytime.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {REGIONS.map(r => (
                  <button key={r.key} onClick={() => setMarket(r.key)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${market === r.key ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-soft' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-2xl mb-1">{r.icon}</div>
                    <div className="font-medium text-sm">{r.label}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={saveMarket} disabled={busy} className="btn-primary">Continue →</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 mb-1">Add your Apify API key</h2>
              <p className="text-sm text-slate-500 mb-2">
                We use Apify's harvestapi actor to source LinkedIn profiles.{' '}
                <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer"
                   className="text-blue-600 hover:underline font-medium">Get your key →</a>
              </p>
              <p className="text-xs text-slate-400 mb-4">Optional \u2014 you can use the shared workspace key for now and add yours later in Profile.</p>
              <input className="input font-mono" placeholder="apify_api_..." value={apifyKey}
                onChange={e => setApifyKey(e.target.value)} />
              <div className="mt-6 flex justify-between">
                <button onClick={prev} className="btn-secondary">← Back</button>
                <button onClick={saveApify} disabled={busy} className="btn-primary">
                  {apifyKey ? 'Save & continue →' : 'Skip for now →'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 mb-1">Add your Claude API key</h2>
              <p className="text-sm text-slate-500 mb-2">
                Claude scores resumes against your job descriptions. You can also use Local Scan instead.{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                   className="text-blue-600 hover:underline font-medium">Get your key →</a>
              </p>
              <p className="text-xs text-slate-400 mb-4">Optional \u2014 you can also use the shared workspace key, or stick with Local Scan.</p>
              <input className="input font-mono" placeholder="sk-ant-..." value={claudeKey}
                onChange={e => setClaudeKey(e.target.value)} />
              <div className="mt-6 flex justify-between">
                <button onClick={prev} className="btn-secondary">← Back</button>
                <button onClick={saveClaude} disabled={busy} className="btn-primary">
                  {claudeKey ? 'Save & continue →' : 'Skip for now →'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-display font-bold text-xl text-slate-800 mb-1">Run a test search</h2>
              <p className="text-sm text-slate-500 mb-5">Let's make sure your Apify connection works. We'll pull just 5 profiles.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input className="input" placeholder="Job title" value={testJob} onChange={e => setTestJob(e.target.value)} />
                <input className="input" placeholder="Location (optional)" value={testLoc} onChange={e => setTestLoc(e.target.value)} />
              </div>
              <button onClick={runTest} disabled={busy} className="btn-primary w-full">
                {busy ? 'Testing\u2026' : '\u25b6 Run test search'}
              </button>

              {testResult && testResult.ok && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                  <strong>\u2713 Success!</strong> Found {testResult.count} profile(s). Your workspace is ready.
                </div>
              )}
              {testResult && !testResult.ok && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <strong>\u2717 Test failed:</strong> {testResult.error}
                  {testResult.hint && <p className="mt-1 text-xs text-red-600">{testResult.hint}</p>}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button onClick={prev} className="btn-secondary">← Back</button>
                <button onClick={finish} disabled={busy} className="btn-primary">
                  {testResult?.ok ? 'Finish setup →' : 'Skip & go to dashboard →'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/dashboard" className="text-xs text-slate-400 hover:text-slate-600">Skip onboarding</Link>
        </div>
      </div>
    </div>
  );
}
