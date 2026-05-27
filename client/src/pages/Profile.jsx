import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const Section = ({ title, children }) => (
  <div className="card p-6">
    <h3 className="font-semibold text-slate-800 mb-4 pb-3 border-b border-slate-100">{title}</h3>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    {children}
  </div>
);

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState({ name: '', company: '', market: 'Both' });
  const [keys, setKeys] = useState({ apify_key: '', claude_key: '', apollo_key: '' });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });

  const [saving, setSaving] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgKeys, setMsgKeys] = useState('');
  const [msgPw, setMsgPw] = useState('');
  const [keysLoaded, setKeysLoaded] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({ name: user.name || '', company: user.company || '', market: user.market || 'Both' });
    }
  }, [user]);

  const loadKeys = async () => {
    if (keysLoaded) return;
    try {
      const res = await api.get('/auth/me/keys');
      setKeys({
        apify_key: res.data.apify_key || '',
        claude_key: res.data.claude_key || '',
        apollo_key: res.data.apollo_key || '',
      });
      setKeysLoaded(true);
    } catch { setMsgKeys('Failed to load keys.'); }
  };

  const flash = (setter, text, ms = 3000) => {
    setter(text);
    setTimeout(() => setter(''), ms);
  };

  const handleProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUser(profile);
      flash(setMsg, '✅ Profile updated.');
    } catch (err) {
      flash(setMsg, err.response?.data?.error || '❌ Update failed.');
    } finally { setSaving(false); }
  };

  const handleKeys = async (e) => {
    e.preventDefault();
    setSavingKeys(true);
    try {
      await updateUser(keys);
      flash(setMsgKeys, '✅ API keys saved securely.');
    } catch (err) {
      flash(setMsgKeys, err.response?.data?.error || '❌ Save failed.');
    } finally { setSavingKeys(false); }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_password !== passwords.confirm_password)
      return flash(setMsgPw, '❌ New passwords do not match.');
    if (passwords.new_password.length < 8)
      return flash(setMsgPw, '❌ Password must be at least 8 characters.');
    setSavingPw(true);
    try {
      await updateUser({ current_password: passwords.current_password, new_password: passwords.new_password });
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      flash(setMsgPw, '✅ Password changed.');
    } catch (err) {
      flash(setMsgPw, err.response?.data?.error || '❌ Change failed.');
    } finally { setSavingPw(false); }
  };

  const marketBadge = user?.market || 'Global';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{user?.name}</h1>
          <p className="text-sm text-slate-500">{user?.email} · <span className="capitalize">{user?.role}</span> · {marketBadge}</p>
        </div>
      </div>

      {/* Profile info */}
      <Section title="Profile Information">
        <form onSubmit={handleProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name">
              <input type="text" required className="input" value={profile.name}
                onChange={e => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Company">
              <input type="text" className="input" value={profile.company}
                onChange={e => setProfile({ ...profile, company: e.target.value })} />
            </Field>
          </div>
          <Field label="Market focus">
            <select className="input" value={profile.market}
              onChange={e => setProfile({ ...profile, market: e.target.value })}>
              <option value="Global">🌍 Global</option>
              <option value="Americas">🌎 Americas</option>
              <option value="Europe">🌍 Europe</option>
              <option value="Asia Pacific">🌏 Asia Pacific</option>
              <option value="MENA">🕌 MENA</option>
              <option value="Africa">🌍 Africa</option>
            </select>
          </Field>
          <Field label="Email address">
            <input type="email" className="input bg-slate-50 cursor-not-allowed" value={user?.email || ''} disabled />
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
          </Field>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            {msg && <span className="text-sm">{msg}</span>}
          </div>
        </form>
      </Section>

      {/* API Keys */}
      <Section title="🔑 API Keys">
        <p className="text-sm text-slate-500 mb-4">
          Keys are encrypted with AES-256 before being stored. They're used server-side for candidate sourcing and AI scoring.
        </p>

        {!keysLoaded ? (
          <button type="button" className="btn-secondary text-sm mb-4" onClick={loadKeys}>
            🔓 Reveal saved keys
          </button>
        ) : null}

        <form onSubmit={handleKeys} className="space-y-4">
          <Field label="Apify API Token">
            <input type={keysLoaded ? 'text' : 'password'} className="input font-mono text-sm"
              placeholder={user?.has_apify_key ? '••••••••••••••••••••' : 'apify_api_...'}
              value={keys.apify_key}
              onFocus={loadKeys}
              onChange={e => setKeys({ ...keys, apify_key: e.target.value })} />
            {user?.has_apify_key && <p className="text-xs text-green-600 mt-1">✅ Key saved</p>}
          </Field>
          <Field label="Claude / Anthropic API Key">
            <input type={keysLoaded ? 'text' : 'password'} className="input font-mono text-sm"
              placeholder={user?.has_claude_key ? '••••••••••••••••••••' : 'sk-ant-...'}
              value={keys.claude_key}
              onFocus={loadKeys}
              onChange={e => setKeys({ ...keys, claude_key: e.target.value })} />
            {user?.has_claude_key && <p className="text-xs text-green-600 mt-1">✅ Key saved</p>}
          </Field>
          <Field label="Apollo API Key">
            <input type={keysLoaded ? 'text' : 'password'} className="input font-mono text-sm"
              placeholder={user?.has_apollo_key ? '••••••••••••••••••••' : 'apollo_api_key...'}
              value={keys.apollo_key}
              onFocus={loadKeys}
              onChange={e => setKeys({ ...keys, apollo_key: e.target.value })} />
            {user?.has_apollo_key && <p className="text-xs text-green-600 mt-1">✅ Key saved</p>}
            <p className="text-xs text-slate-400 mt-1">Used for Apollo People Search candidate sourcing.</p>
          </Field>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={savingKeys}>{savingKeys ? 'Saving…' : 'Save keys'}</button>
            {keys.apify_key || keys.claude_key || keys.apollo_key ? (
              <button type="button" className="btn-secondary text-sm"
                onClick={() => {
                  setKeys({ apify_key: '', claude_key: '', apollo_key: '' });
                  updateUser({ apify_key: '', claude_key: '', apollo_key: '' }).catch(() => {});
                }}>
                Clear keys
              </button>
            ) : null}
            {msgKeys && <span className="text-sm">{msgKeys}</span>}
          </div>
        </form>
      </Section>

      {/* Change password */}
      <Section title="🔒 Change Password">
        <form onSubmit={handlePassword} className="space-y-4">
          <Field label="Current password">
            <input type="password" required className="input" value={passwords.current_password}
              onChange={e => setPasswords({ ...passwords, current_password: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="New password">
              <input type="password" required className="input" placeholder="Min. 8 characters" value={passwords.new_password}
                onChange={e => setPasswords({ ...passwords, new_password: e.target.value })} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" required className="input" value={passwords.confirm_password}
                onChange={e => setPasswords({ ...passwords, confirm_password: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={savingPw}>{savingPw ? 'Changing…' : 'Change password'}</button>
            {msgPw && <span className="text-sm">{msgPw}</span>}
          </div>
        </form>
      </Section>
    </div>
  );
}
