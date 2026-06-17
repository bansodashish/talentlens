import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEMES } from '../context/ThemeContext';

const mainNav = [
  { path: '/dashboard',  label: 'Dashboard' },
  { path: '/candidates', label: 'Candidates' },
  { path: '/jobs',       label: 'Jobs' },
  { path: '/pipeline',   label: 'Pipeline' },
];

const aiNav = [
  { path: '/candidate-search', label: 'Candidate Search' },
  { path: '/cv-match',         label: 'Screen' },
  { path: '/history',          label: 'History' },
];

function NavLink({ path, label, onClick, navText, navActiveBg, disabled }) {
  const location = useLocation();
  const active = location.pathname.startsWith(path);
  if (disabled) {
    return (
      <span
        title="Not available for your role"
        style={{ color: navText, opacity: 0.4 }}
        className="px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap cursor-not-allowed select-none inline-flex items-center gap-1">
        <span aria-hidden="true">🔒</span>{label}
      </span>
    );
  }
  return (
    <Link to={path} onClick={onClick}
      style={active ? { background: navActiveBg, color: '#fff' } : { color: navText }}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
        active ? '' : 'hover:bg-black/5'
      }`}>
      {label}
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);
  const themeRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Role-based nav access: recruiters may only use Candidate Search + Screen.
  const isAdmin = user?.role === 'admin';
  const RECRUITER_ALLOWED = ['/candidate-search', '/cv-match'];
  const navDisabled = (path) => !isAdmin && !RECRUITER_ALLOWED.includes(path);

  const marketBadge = { UK: '🇬🇧', Dubai: '🇦🇪', Both: '🌍' }[user?.market] || '';
  const navBg      = 'var(--tl-nav-bg)';
  const navBorder  = 'var(--tl-nav-border)';
  const navText    = 'var(--tl-nav-text)';
  const navActive  = 'var(--tl-nav-active-bg)';
  const logoBg     = 'var(--tl-logo-bg)';
  const logoText   = 'var(--tl-logo-text)';
  const pageBg     = 'var(--tl-page-bg)';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: pageBg }}>
      {/* ── Top Navbar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40" style={{ background: navBg, borderBottom: `1px solid ${navBorder}` }}>
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-4">

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 flex-shrink-0 mr-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: logoBg, color: logoText }}>TL</div>
            <span className="font-bold text-sm hidden sm:block" style={{ color: navText === 'var(--tl-nav-text)' ? 'inherit' : navText }}>TalentLenses</span>
          </Link>

          {/* Primary nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {mainNav.map(n => <NavLink key={n.path} {...n} disabled={navDisabled(n.path)} navText={navText} navActiveBg={navActive} />)}
          </nav>

          <div className="hidden md:block h-5 w-px mx-1" style={{ background: navBorder }} />

          {/* AI nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider px-1 select-none" style={{ color: navText, opacity: 0.5 }}>AI</span>
            {aiNav.map(n => <NavLink key={n.path} {...n} disabled={navDisabled(n.path)} navText={navText} navActiveBg={navActive} />)}
          </nav>

          <div className="flex-1" />

          {/* Market badge */}
          <span className="hidden sm:inline-flex text-xs px-2 py-1 rounded-full font-medium"
            style={{ background: `${navBorder}`, color: navText }}>
            {marketBadge} {user?.market}
          </span>

          {/* 🎨 Theme picker */}
          <div className="relative" ref={themeRef}>
            <button onClick={() => setThemeOpen(o => !o)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
              style={{ color: navText }} title="Change theme">
              <span>🎨</span>
              <span className="hidden sm:block">Themes</span>
            </button>

            {themeOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-2xl shadow-xl py-3 z-50 overflow-hidden"
                style={{ background: 'var(--tl-card-bg, #fff)', border: `1px solid ${navBorder}` }}>

                {/* Header */}
                <div className="px-4 pb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: navText, opacity: 0.4 }}>Choose Theme</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${navActive}22`, color: navActive }}>
                    {THEMES.length} themes
                  </span>
                </div>

                {/* Light group */}
                <div className="px-3 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider px-1 py-1.5" style={{ color: navText, opacity: 0.35 }}>
                    ☀️ Light
                  </p>
                  {THEMES.filter(t => !t.dark).map(t => (
                    <button key={t.id} onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-all hover:scale-[1.01]"
                      style={{ background: theme === t.id ? `${navActive}18` : 'transparent',
                               outline: theme === t.id ? `1.5px solid ${navActive}50` : 'none' }}>
                      {/* Swatch strip */}
                      <div className="flex gap-0.5 flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 40, height: 22 }}>
                        {t.swatches.map((s, i) => (
                          <div key={i} className="flex-1" style={{ background: s }} />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: navText }}>{t.name}</div>
                        <div className="text-[10px] truncate" style={{ color: navText, opacity: 0.5 }}>{t.description}</div>
                      </div>
                      {theme === t.id && (
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] flex-shrink-0"
                          style={{ background: navActive }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mx-3 my-1.5" style={{ height: '1px', background: navBorder }} />

                {/* Dark group */}
                <div className="px-3 pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider px-1 py-1.5" style={{ color: navText, opacity: 0.35 }}>
                    🌙 Dark
                  </p>
                  {THEMES.filter(t => t.dark).map(t => (
                    <button key={t.id} onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-all hover:scale-[1.01]"
                      style={{ background: theme === t.id ? `${navActive}18` : 'transparent',
                               outline: theme === t.id ? `1.5px solid ${navActive}50` : 'none' }}>
                      <div className="flex gap-0.5 flex-shrink-0 rounded-lg overflow-hidden border" style={{ width: 40, height: 22, borderColor: `${navBorder}` }}>
                        {t.swatches.map((s, i) => (
                          <div key={i} className="flex-1" style={{ background: s }} />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: navText }}>{t.name}</div>
                        <div className="text-[10px] truncate" style={{ color: navText, opacity: 0.5 }}>{t.description}</div>
                      </div>
                      {theme === t.id && (
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] flex-shrink-0"
                          style={{ background: navActive }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User avatar + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: logoBg, color: logoText }}>
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:block" style={{ color: navText }}>{user?.name?.split(' ')[0]}</span>
              <svg className="w-3.5 h-3.5" style={{ color: navText }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-lg py-1 z-50"
                style={{ background: 'var(--tl-card-bg, #fff)', border: `1px solid ${navBorder}` }}>
                <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${navBorder}` }}>
                  <div className="text-sm font-semibold truncate" style={{ color: navText }}>{user?.name}</div>
                  <div className="text-xs truncate" style={{ color: navText, opacity: 0.6 }}>{user?.email}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${navActive}22`, color: navActive }}>
                      {user?.role}
                    </span>
                    {user?.company && <span className="text-xs truncate" style={{ color: navText, opacity: 0.5 }}>{user.company}</span>}
                  </div>
                </div>

                <Link to="/profile" onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-black/5"
                  style={{ color: navText }}>
                  <span>⚙️</span> Profile & Settings
                </Link>

                {user?.role === 'admin' && (
                  <Link to="/admin" onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-black/5"
                    style={{ color: navText }}>
                    <span>🛡️</span> Admin Panel
                  </Link>
                )}

                <div style={{ borderTop: `1px solid ${navBorder}`, marginTop: '4px', paddingTop: '4px' }}>
                  <button onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm transition-colors hover:bg-red-50"
                    style={{ color: '#ef4444' }}>
                    <span>⏻</span> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(o => !o)} className="md:hidden p-2 rounded-lg hover:bg-black/5"
            style={{ color: navText }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden px-4 py-3 space-y-1" style={{ borderTop: `1px solid ${navBorder}`, background: navBg }}>
            <p className="text-xs font-semibold uppercase tracking-wider px-2 mb-2" style={{ color: navText, opacity: 0.5 }}>Navigation</p>
            {mainNav.map(n => <NavLink key={n.path} {...n} disabled={navDisabled(n.path)} onClick={() => setMobileOpen(false)} navText={navText} navActiveBg={navActive} />)}
            <p className="text-xs font-semibold uppercase tracking-wider px-2 mt-3 mb-2" style={{ color: navText, opacity: 0.5 }}>AI Tools</p>
            {aiNav.map(n => <NavLink key={n.path} {...n} disabled={navDisabled(n.path)} onClick={() => setMobileOpen(false)} navText={navText} navActiveBg={navActive} />)}
            <div style={{ borderTop: `1px solid ${navBorder}`, paddingTop: '8px', marginTop: '8px' }}>
              <NavLink path="/profile" label="Profile & Settings" onClick={() => setMobileOpen(false)} navText={navText} navActiveBg={navActive} />
              {user?.role === 'admin' && <NavLink path="/admin" label="Admin Panel" onClick={() => setMobileOpen(false)} navText={navText} navActiveBg={navActive} />}
            </div>
          </div>
        )}
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
