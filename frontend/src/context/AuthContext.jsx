import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('cude_token'));
  const [loading, setLoading] = useState(true);

  // On mount, check if auth is available and validate existing token
  useEffect(() => {
    // Check if auth is available (database mode) or demo mode
    // In demo mode, /api/auth/me doesn't exist — Express returns HTML from the SPA catch-all
    fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        const contentType = r.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          // Got HTML back, not JSON — auth endpoint doesn't exist (demo mode)
          setUser({ id: 'demo', email: 'demo@cude.local', display_name: 'Demo User', role: 'ADMIN' });
          setLoading(false);
          return null;
        }
        if (!r.ok) throw new Error('Not authenticated');
        return r.json();
      })
      .then(d => { if (d) { setUser(d.user); } setLoading(false); })
      .catch(() => { logout(); setLoading(false); });
  }, []);

  const login = async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Login failed');
    localStorage.setItem('cude_token', d.token);
    setToken(d.token);
    setUser(d.user);
    return d;
  };

  const register = async (email, password, displayName) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Registration failed');
    localStorage.setItem('cude_token', d.token);
    setToken(d.token);
    setUser(d.user);
    return d;
  };

  const logout = () => {
    localStorage.removeItem('cude_token');
    setToken(null);
    setUser(null);
  };

  const isAuthenticated = !!user; // user is set either by login (with token) or demo mode detection (without token)

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Fetch wrapper that auto-injects Authorization header
export function authFetch(url, options = {}) {
  const token = localStorage.getItem('cude_token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
