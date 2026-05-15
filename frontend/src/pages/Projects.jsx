import React, { useEffect, useState } from 'react';
import { FolderKanban, Plus, Users, Shield, Archive, Settings2, ChevronRight, X, Trash2 } from 'lucide-react';
import { Spinner, ClassBadge } from '../components/UI';
import { API, formatDate } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const CEILINGS = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];

function CreateProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ code:'', name:'', description:'', sensitivity_ceiling:'TRADE_SECRET' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required'); return; }
    setSaving(true); setError(null);
    try {
      const token = localStorage.getItem('cude_token');
      const r = await fetch(`${API}/projects`, {
        method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
        body: JSON.stringify(form)
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      onCreated?.(r.project);
      onClose();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Plus size={18} className="text-blue-400"/>Create New Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Project Code *</div>
              <input className="input w-full font-mono uppercase" placeholder="e.g. THOR-7NM" value={form.code}
                onChange={e => setForm(f=>({...f, code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')}))} required/>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-1.5">Project Name *</div>
              <input className="input w-full" placeholder="e.g. Thor 7nm Tapeout" value={form.name}
                onChange={e => setForm(f=>({...f, name:e.target.value}))} required/>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Description</div>
            <textarea className="input w-full h-16 resize-none" placeholder="What does this project govern?"
              value={form.description} onChange={e => setForm(f=>({...f, description:e.target.value}))}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Sensitivity Ceiling</div>
            <div className="flex gap-2 flex-wrap">
              {CEILINGS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f=>({...f, sensitivity_ceiling:c}))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.sensitivity_ceiling === c ? 'border-blue-600 bg-blue-600/20 text-blue-300' : 'border-slate-700 bg-slate-800/50 text-slate-500'}`}>
                  {c.replace('_',' ')}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-600 mt-1.5">No asset in this project can be classified above this tier.</div>
          </div>
          {error && <div className="text-xs text-red-400 p-2 border border-red-800/40 rounded-lg bg-red-950/20">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-xs">
              {saving ? <><Spinner size={12}/>Creating...</> : <><Plus size={13}/>Create Project</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectCard({ project, onSelect, onArchive, onDelete }) {
  const ceilingColors = { TRADE_SECRET:'border-red-800/40', RESTRICTED:'border-orange-800/40', CONFIDENTIAL:'border-yellow-800/40', INTERNAL:'border-blue-800/40', PUBLIC:'border-green-800/40' };
  return (
    <div onClick={() => onSelect(project)} className={`card-hover p-5 border ${ceilingColors[project.sensitivity_ceiling] || 'border-slate-800'} cursor-pointer`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-blue-400"/>
            <span className="text-sm font-bold text-slate-100">{project.name}</span>
          </div>
          <div className="text-xs font-mono text-slate-500 mt-0.5">{project.code}</div>
        </div>
        <ClassBadge cls={project.sensitivity_ceiling}/>
      </div>
      {project.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{project.description}</p>}
      <div className="flex items-center justify-between text-[10px] text-slate-600">
        <span>Created {formatDate(project.created_at)}</span>
        <div className="flex items-center gap-3">
          {project.member_role && <span className="badge bg-blue-900/30 text-blue-300 border border-blue-700/30">{project.member_role}</span>}
          <button onClick={(e) => { e.stopPropagation(); onDelete?.(project.id, project.name); }} className="text-slate-600 hover:text-red-400 p-1" title="Delete project"><Trash2 size={12}/></button>
          <ChevronRight size={12} className="text-slate-700"/>
        </div>
      </div>
    </div>
  );
}

export default function Projects({ onSelectProject }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/projects`, { headers }).then(r => r.json());
      setProjects(d.projects || []);
    } catch { setProjects([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleArchive = async (projectId) => {
    await fetch(`${API}/projects/${projectId}/archive`, { method:'POST', headers });
    load();
  };

  const handleDelete = async (projectId, projectName) => {
    if (!confirm(`Delete project "${projectName}"? This will permanently remove all assets, connectors, and data in this project.`)) return;
    await fetch(`${API}/projects/${projectId}`, { method:'DELETE', headers });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FolderKanban size={24} className="text-blue-400"/>Discovery Projects
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Each project is a governance container — assets, connectors, policies, and stewards scoped together.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={14}/>New Project</button>
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={() => load()}/>}

      {projects.length === 0 ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-700/30 flex items-center justify-center mb-6">
            <FolderKanban size={36} className="text-blue-400"/>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">No Projects Yet</h2>
          <p className="text-slate-500 text-sm max-w-md mb-6">
            Create your first governance project to start discovering and classifying unstructured data. Each project scopes its own connectors, policies, and steward team.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={14}/>Create First Project</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} onSelect={() => { onSelectProject?.(p); navigate(`/projects/${p.id}`); }} onArchive={handleArchive} onDelete={handleDelete}/>
          ))}
        </div>
      )}
    </div>
  );
}
