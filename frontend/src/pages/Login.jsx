import React, { useState } from 'react';
import { Cpu, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setSuccessMsg(null); setLoading(true);
    try {
      if (mode === 'register') {
        const result = await register(email, password, displayName);
        setSuccessMsg(result.message);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center shadow-2xl mx-auto mb-4">
            <Cpu size={32} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">CUDE Enterprise</h1>
          <p className="text-slate-500 text-sm mt-1">Configurable Universal Discovery Engine</p>
        </div>

        {/* Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1">
            <button onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              Sign In
            </button>
            <button onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'register' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Display Name</label>
                <input type="text" className="input w-full" placeholder="Your name"
                  value={displayName} onChange={e => setDisplayName(e.target.value)} required/>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Email</label>
              <input type="email" className="input w-full" placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)} required/>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Password</label>
              <input type="password" className="input w-full" placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter password'}
                value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'register' ? 6 : 1}/>
            </div>

            {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg p-3">{error}</div>}
            {successMsg && <div className="text-xs text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg p-3">{successMsg}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Please wait...' : mode === 'login'
                ? <><LogIn size={15}/>Sign In</>
                : <><UserPlus size={15}/>Create Account</>}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-slate-600 mt-4">
              First time? <button onClick={() => setMode('register')} className="text-blue-400 hover:text-blue-300">Create an account</button> — the first user gets Admin access.
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-700 mt-6">CUDE Platform v3.0 · Agentic Data Governance</p>
      </div>
    </div>
  );
}
