import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Download, Filter, Clock } from 'lucide-react';
import { Spinner } from '../components/UI';
import { API, formatDate } from '../utils/helpers';

const ACTION_COLORS = {
  'asset.classified': 'text-blue-400',
  'asset.uploaded': 'text-green-400',
  'asset.analyzed': 'text-purple-400',
  'approval.approved': 'text-green-400',
  'approval.rejected': 'text-red-400',
  'approval.escalated': 'text-orange-400',
  'connector.configured': 'text-cyan-400',
  'connector.scanned': 'text-blue-400',
  'policy.modified': 'text-yellow-400',
  'user.login': 'text-slate-400',
  'user.registered': 'text-green-400',
};

const ACTOR_ICONS = {
  USER: '👤',
  AGENT: '🤖',
  SYSTEM: '⚙️',
  SCHEDULER: '⏰',
};

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', actor_type: '' });

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 30 });
      if (filters.action) params.set('action', filters.action);
      if (filters.actor_type) params.set('actor_type', filters.actor_type);
      const d = await fetch(`${API}/audit?${params}`).then(r => r.json());
      setEntries(d.entries || []);
      setTotal(d.total || 0);
      setPage(p);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(1); }, [filters]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Shield size={22} className="text-blue-400"/>Audit Trail</h1>
          <p className="text-slate-500 text-sm mt-0.5">Immutable record of every action — HMAC-signed for tamper evidence</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(page)} className="btn-secondary"><RefreshCw size={13}/>Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="input text-xs" value={filters.actor_type} onChange={e => setFilters(f => ({ ...f, actor_type: e.target.value }))}>
          <option value="">All Actors</option>
          <option value="USER">Users</option>
          <option value="AGENT">Agents</option>
          <option value="SYSTEM">System</option>
          <option value="SCHEDULER">Scheduler</option>
        </select>
        <select className="input text-xs" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
          <option value="">All Actions</option>
          <option value="asset.uploaded">Asset Uploaded</option>
          <option value="asset.classified">Asset Classified</option>
          <option value="asset.analyzed">Asset Analyzed</option>
          <option value="approval.approved">Approval Approved</option>
          <option value="approval.rejected">Approval Rejected</option>
          <option value="approval.escalated">Approval Escalated</option>
          <option value="connector.scanned">Connector Scanned</option>
          <option value="policy.modified">Policy Modified</option>
        </select>
        <span className="text-xs text-slate-500 self-center">{total} entries</span>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={28}/></div>
      ) : entries.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-slate-400 font-medium">No audit entries yet</div>
          <div className="text-slate-600 text-sm mt-1">Actions will be logged here as you use the platform</div>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div key={entry.id} className="card p-3 flex items-start gap-3 hover:border-slate-700 transition-colors">
              <span className="text-lg flex-shrink-0">{ACTOR_ICONS[entry.actor_type] || '❓'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold uppercase tracking-wide ${ACTION_COLORS[entry.action] || 'text-slate-400'}`}>{entry.action}</span>
                  <span className="text-[10px] text-slate-600">{entry.entity_type} · {entry.entity_id?.substring(0, 8)}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{entry.actor_id}</div>
                {entry.after_state && (
                  <div className="text-[10px] text-slate-600 mt-1 font-mono truncate">
                    {typeof entry.after_state === 'string' ? entry.after_state : JSON.stringify(entry.after_state).substring(0, 120)}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-[10px] text-slate-600 font-mono">{new Date(entry.created_at).toLocaleString()}</div>
                {entry.hmac_signature && (
                  <div className="text-[9px] text-slate-700 font-mono mt-0.5" title={`HMAC: ${entry.hmac_signature}`}>
                    HMAC: {entry.hmac_signature?.substring(0, 12)}...
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1} className="btn-ghost text-xs disabled:opacity-30">Previous</button>
          <span className="text-xs text-slate-500 self-center">Page {page}</span>
          <button onClick={() => load(page + 1)} disabled={entries.length < 30} className="btn-ghost text-xs disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
