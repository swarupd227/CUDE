import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderSearch, Upload, ClipboardCheck, Network, Shield, FileText, Settings2, Cpu, Plug, ScrollText, FolderKanban, X, Users, BookOpen, Share2, Database } from 'lucide-react';

const ALL_ROLES = ['ADMIN','OWNER','STEWARD','AUDITOR','VIEWER'];

const NAV = [
  { section:'Data', items:[
    { to:'/', icon:LayoutDashboard, label:'Dashboard', exact:true, roles:['ADMIN','OWNER','STEWARD','AUDITOR','VIEWER'] },
    { to:'/projects', icon:FolderKanban, label:'Projects', roles:['ADMIN','OWNER','STEWARD'] },
    { to:'/catalog', icon:FolderSearch, label:'Asset Catalog', roles:['ADMIN','OWNER','STEWARD','AUDITOR','VIEWER'] },
    { to:'/glossary', icon:BookOpen, label:'Business Glossary', roles:['ADMIN','OWNER','STEWARD'] },
  ]},
  { section:'Intelligence', items:[
    { to:'/knowledge-graph', icon:Share2, label:'Knowledge Graph', roles:['ADMIN','OWNER','STEWARD','AUDITOR'] },
    { to:'/data-explorer', icon:Database, label:'Data Explorer', roles:['ADMIN','OWNER','STEWARD'] },
    { to:'/ontology', icon:Network, label:'Ontology Schema', roles:['ADMIN','OWNER'] },
    { to:'/connectors', icon:Plug, label:'Connector Library', roles:['ADMIN','OWNER'] },
  ]},
  { section:'Control', items:[
    { to:'/queue', icon:ClipboardCheck, label:'Approval Queue', badge:'queue', roles:['ADMIN','OWNER','STEWARD'] },
    { to:'/upload', icon:Upload, label:'Upload & Parse', roles:['ADMIN','OWNER','STEWARD'] },
  ]},
  { section:'Governance', items:[
    { to:'/reports', icon:FileText, label:'Compliance Reports', roles:['ADMIN','OWNER','STEWARD','AUDITOR'] },
    { to:'/governance', icon:Shield, label:'Governance & Alerts', roles:['ADMIN','OWNER','STEWARD','AUDITOR'] },
    { to:'/audit', icon:ScrollText, label:'Audit Trail', roles:['ADMIN','OWNER','AUDITOR'] },
    { to:'/settings', icon:Settings2, label:'Policy & Settings', roles:['ADMIN','OWNER'] },
  ]},
  { section:'Admin', items:[
    { to:'/users', icon:Users, label:'User Management', roles:['ADMIN'] },
  ]},
];

export default function Sidebar({ queueCount = 0, user, onLogout, activeProject, onClearProject }) {
  const navigate = useNavigate();
  const [viewAsRole, setViewAsRole] = React.useState(localStorage.getItem('cude_view_as') || 'ADMIN');

  const handleRoleChange = (role) => {
    setViewAsRole(role);
    localStorage.setItem('cude_view_as', role);
  };

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center shadow-lg flex-shrink-0">
            <Cpu size={15} className="text-white"/>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 leading-tight">CUDE Enterprise</div>
            <div className="text-[10px] text-slate-500">Agentic Data Governance</div>
          </div>
        </div>
      </div>

      {/* Active Project */}
      {activeProject ? (
        <div className="px-3 py-2.5 border-b border-slate-800 bg-blue-950/20">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/projects')} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              <FolderKanban size={12} className="text-blue-400 flex-shrink-0"/>
              <div className="min-w-0">
                <div className="text-[10px] text-blue-400 font-medium truncate">{activeProject.name}</div>
                <div className="text-[9px] text-slate-600 font-mono">{activeProject.code}</div>
              </div>
            </button>
            <button onClick={onClearProject} className="text-slate-600 hover:text-slate-300 p-0.5" title="Clear project filter">
              <X size={11}/>
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-b border-slate-800">
          <button onClick={() => navigate('/projects')} className="text-[10px] text-slate-500 hover:text-blue-400 flex items-center gap-1.5 transition-colors w-full">
            <FolderKanban size={11}/>All Projects
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-3">
        {NAV.map(({ section, items }) => {
          const visibleItems = items.filter(item => !item.roles || item.roles.includes(viewAsRole));
          if (visibleItems.length === 0) return null;
          return (
          <div key={section}>
            <div className="px-2 mb-1 text-[9px] font-semibold text-slate-600 uppercase tracking-widest">{section}</div>
            {visibleItems.map(({ to, icon: Icon, label, exact, badge }) => (
              <NavLink key={to} to={to} end={exact}
                className={({ isActive }) =>
                  `flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150 ` +
                  (isActive
                    ? 'bg-blue-600/15 text-blue-400 border-l-[3px] border-blue-500 ml-0 pl-2'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-l-[3px] border-transparent')
                }>
                <span className="flex items-center gap-2">
                  <Icon size={13}/>{label}
                </span>
                {badge === 'queue' && queueCount > 0 && (
                  <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">{queueCount}</span>
                )}
              </NavLink>
            ))}
          </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-800 space-y-2">
        <div>
          <div className="text-[9px] text-slate-700 uppercase tracking-wider mb-1">View as Role</div>
          <select className="input w-full text-[10px] py-1" value={viewAsRole} onChange={e => handleRoleChange(e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-300 font-medium truncate">{user.display_name}</div>
              <div className="text-[9px] text-slate-600 truncate">{user.email}</div>
            </div>
            <button onClick={onLogout} className="text-[10px] text-slate-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors flex-shrink-0">Logout</button>
          </div>
        )}
        <div className="text-[9px] text-slate-700 leading-relaxed">
          v3.0 · Powered by Claude AI
        </div>
      </div>
    </aside>
  );
}
