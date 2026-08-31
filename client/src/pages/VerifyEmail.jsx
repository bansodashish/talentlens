import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    api.get('/auth/verify-email', { params: { token } })
      .then(res => {
        setStatus('success');
        setMessage(res.data.message || 'Email verified successfully.');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-bold text-xl">TL</span>
          </div>
          <h1 className="text-2xl font-bold text-white">TalentLenses</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          {status === 'verifying' && <p className="text-slate-600">Verifying your email…</p>}
          {status === 'success' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{message}</div>
          )}
          {status === 'error' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{message}</div>
          )}
          <p className="text-center text-sm text-slate-500 mt-6">
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
