import React from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  { icon: '🔎', title: 'LinkedIn Search',         blurb: 'Source candidates worldwide with one-click LinkedIn searches via Apify\u2019s harvestapi actor.' },
  { icon: '🤖', title: 'AI Resume Screening',     blurb: 'Score every CV against your job description with Claude. Get instant Strong-Hire, Consider or Reject decisions.' },
  { icon: '⚡', title: 'Local Scoring',           blurb: 'Prefer to stay offline? A built-in keyword scorer ranks CVs instantly with zero API calls.' },
  { icon: '👥', title: 'Candidate CRM',           blurb: 'A clean pipeline for every candidate \u2014 statuses, HR notes that auto-save, filters and side-panel profiles.' },
  { icon: '📊', title: 'Analytics & Reports',     blurb: 'Track sourcing velocity, email-found rates, score trends and recommendation breakdowns at a glance.' },
  { icon: '⬇',  title: 'Export to CSV / Excel',   blurb: 'Hand-off shortlists to hiring managers in seconds. Bulk export filtered candidates or selected rows.' },
];

const PLANS = [
  {
    name: 'Starter', price: '\u00a349', period: '/mo',
    features: ['100 LinkedIn searches / mo', '50 resume screens / mo', '1 user', 'CSV & Excel export', 'Email support'],
    cta: 'Start Free Trial', highlight: false,
  },
  {
    name: 'Growth', price: '\u00a399', period: '/mo',
    features: ['500 LinkedIn searches / mo', '200 resume screens / mo', '3 users', 'CSV & Excel export', 'Priority support'],
    cta: 'Start Free Trial', highlight: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    features: ['Unlimited searches & screens', 'Unlimited users', 'SSO + custom integrations', 'Dedicated CSM', 'SLA & on-prem option'],
    cta: 'Contact Sales', highlight: false,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Nav */}
      <header className="border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white font-bold text-sm shadow-glow">T</span>
            <span className="font-display font-bold text-lg tracking-tight">TalentLens</span>
          </Link>
          <nav className="flex items-center gap-3">
            <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 hidden sm:inline">Features</a>
            <a href="#pricing"  className="text-sm text-slate-600 hover:text-slate-900 hidden sm:inline">Pricing</a>
            <Link to="/login"    className="text-sm text-slate-600 hover:text-slate-900">Sign in</Link>
            <Link to="/register" className="btn-primary text-sm">Start Free Trial</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-mesh">
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28 text-center relative z-10">
          <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
            \u2728 AI-powered recruitment \u00b7 Worldwide
          </span>
          <h1 className="font-display text-4xl lg:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.05]">
            Find & screen{' '}
            <span className="text-gradient">top talent</span>
            <br className="hidden md:block" />
            for every role, anywhere.
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Source LinkedIn profiles, screen resumes with AI, and manage every candidate in one beautiful workspace \u2014 built for modern recruiters.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary text-base px-7 py-3">Start Free Trial →</Link>
            <a href="#features" className="btn-secondary text-base px-7 py-3">See features</a>
          </div>
        </div>

        {/* Decorative gradient blobs */}
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-blue-200 rounded-full blur-3xl opacity-40 -z-0" />
        <div className="absolute top-1/2 -right-20 w-72 h-72 bg-pink-200 rounded-full blur-3xl opacity-40 -z-0" />
      </section>

      {/* Features */}
      <section id="features" className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Everything you need to hire faster</h2>
            <p className="text-slate-500 mt-3">Sourcing, screening and CRM \u2014 in one workspace, for any industry.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className="card p-6 hover:shadow-soft transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 text-2xl flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="font-display font-semibold text-lg text-slate-800 mb-1.5">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Simple, predictable pricing</h2>
          <p className="text-slate-500 mt-3">Bring your own Apify and Claude keys \u2014 we only charge for the workspace.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map(p => (
            <div key={p.name}
                 className={`card p-7 flex flex-col ${p.highlight ? 'ring-2 ring-blue-500 shadow-glow relative bg-gradient-to-br from-white to-blue-50/40' : ''}`}>
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-gradient text-white text-[11px] font-semibold px-3 py-0.5 rounded-full shadow-glow">
                  Most popular
                </span>
              )}
              <h3 className="font-display font-bold text-xl text-slate-800">{p.name}</h3>
              <div className="mt-3 mb-5">
                <span className="font-display text-4xl font-extrabold text-slate-900">{p.price}</span>
                <span className="text-slate-500">{p.period}</span>
              </div>
              <ul className="space-y-2.5 mb-7 flex-1">
                {p.features.map(ft => (
                  <li key={ft} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">\u2713</span>
                    <span>{ft}</span>
                  </li>
                ))}
              </ul>
              <Link to="/register"
                    className={`text-center text-sm font-semibold px-4 py-2.5 rounded-xl ${p.highlight ? 'btn-primary' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors'}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-gradient text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center relative z-10">
          <h2 className="font-display text-3xl lg:text-4xl font-bold">Ready to fill your next role?</h2>
          <p className="text-white/80 mt-3 text-lg">Start sourcing in under 5 minutes.</p>
          <Link to="/register" className="inline-block mt-8 bg-white text-blue-700 font-semibold px-7 py-3 rounded-xl hover:bg-blue-50 shadow-glow transition-colors">
            Start Free Trial →
          </Link>
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_50%)]" />
      </section>

      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-slate-500">
          <span>\u00a9 {new Date().getFullYear()} TalentLens</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-slate-700">Sign in</Link>
            <Link to="/register" className="hover:text-slate-700">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
