import React, { useEffect, useState } from 'react';
import { Users, Plus, Shield, X } from 'lucide-react';
import { Spinner } from '../components/UI';
import { API, formatDate } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';

const ROLE_STYLES = {
  ADMIN: 'bg-red-900/40 text-red-300 border-red-700/30',
  USER: 'bg-blue-900/40 text-blue-300 border-blue-700/30',
};

export default function UserManagement() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email:'', password:'', display_name:'', system_role:'USER' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/users`, { headers }).then(r => r.json());
      setUsers(r.users || []);
    } catch { setUsers([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.display_name) { setError('All fields required'); return; }
    setCreating(true); setError(null);
    try {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST', headers, body: JSON.stringify(form)
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setShowCreate(false);
      setForm({ email:'', password:'', display_name:'', system_role:'USER' });
      load();
    } catch (e) { setError(e.message); }
    setCreating(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Users size={22} className="text-blue-400"/>User Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} registered user{users.length !== 1 ? 's' : ''} on the platform</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={14}/>Create User</button>
      </div>

      {showCreate && (
        <div className="card p-5 border-blue-800/40 bg-blue-950/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-blue-300">Create New User</div>
            <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300"><X size={16}/></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><div className="text-xs text-slate-400 mb-1">Display Name</div><input className="input w-full" placeholder="Full name" value={form.display_name} onChange={e => setForm(f=>({...f, display_name:e.target.value}))} required/></div>
            <div><div className="text-xs text-slate-400 mb-1">Email</div><input type="email" className="input w-full" placeholder="user@company.com" value={form.email} onChange={e => setForm(f=>({...f, email:e.target.value}))} required/></div>
            <div><div className="text-xs text-slate-400 mb-1">Password</div><input type="password" className="input w-full" placeholder="Min 6 chars" value={form.password} onChange={e => setForm(f=>({...f, password:e.target.value}))} required minLength={6}/></div>
            <div><div className="text-xs text-slate-400 mb-1">System Role</div>
              <select className="input w-full" value={form.system_role} onChange={e => setForm(f=>({...f, system_role:e.target.value}))}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {error && <div className="col-span-2 text-xs text-red-400 p-2 border border-red-800/40 rounded bg-red-950/20">{error}</div>}
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-xs">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary text-xs">{creating ? <Spinner size={12}/> : <><Plus size={12}/>Create</>}</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
                {(u.display_name || u.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">{u.display_name}</div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className={`badge border ${ROLE_STYLES[u.system_role] || ROLE_STYLES.USER}`}>{u.system_role}</span>
              <span className="text-slate-600">{u.last_login_at ? `Last login: ${formatDate(u.last_login_at)}` : 'Never logged in'}</span>
              {u.id === currentUser?.id && <span className="text-[10px] text-blue-400">(you)</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
