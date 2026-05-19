import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider, useProject } from './context/ProjectContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Catalog from './pages/Catalog';
import Upload from './pages/Upload';
import ApprovalQueue from './pages/ApprovalQueue';
import Investigation from './pages/Investigation';
import Governance from './pages/Governance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Connectors from './pages/Connectors';
import AuditLog from './pages/AuditLog';
import UserManagement from './pages/UserManagement';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Login from './pages/Login';
import Glossary from './pages/Glossary';
import OntologySchema from './pages/OntologySchema';
import DataExplorer from './pages/DataExplorer';
import Lineage from './pages/Lineage';

function AppContent() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const { activeProject, selectProject, hasProjects } = useProject();
  const [events, setEvents] = useState([]);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    if (loading) return;

    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'connected') return;
        if (ev.payload?.background) return;
        setEvents(prev => [ev, ...prev].slice(0, 100));
      } catch (_) {}
    };
    es.onerror = () => {};
    const pollQueue = () => fetch('/api/queue').then(r=>r.json()).then(d=>setQueueCount(d.total||0)).catch(()=>{});
    pollQueue();
    const iv = setInterval(pollQueue, 15000);
    return () => { es.close(); clearInterval(iv); };
  }, [loading, isAuthenticated]);

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading CUDE Platform...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar queueCount={queueCount} user={user} onLogout={logout} activeProject={activeProject} onClearProject={() => selectProject(null)}/>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"            element={<Dashboard events={events}/>}/>
          <Route path="/projects"    element={<Projects onSelectProject={(p) => { selectProject(p); }}/>}/>
          <Route path="/projects/:id" element={<ProjectDetail/>}/>
          <Route path="/connectors"  element={<Connectors/>}/>
          <Route path="/catalog"     element={<Catalog events={events}/>}/>
          <Route path="/upload"      element={<Upload/>}/>
          <Route path="/queue"       element={<ApprovalQueue/>}/>
          <Route path="/knowledge-graph" element={<Investigation/>}/>
          <Route path="/investigate" element={<Investigation/>}/>
          <Route path="/glossary"    element={<Glossary/>}/>
          <Route path="/ontology"    element={<OntologySchema/>}/>
          <Route path="/data-explorer" element={<DataExplorer/>}/>
          <Route path="/lineage"     element={<Lineage/>}/>
          <Route path="/governance"  element={<Governance/>}/>
          <Route path="/reports"     element={<Reports/>}/>
          <Route path="/settings"    element={<Settings/>}/>
          <Route path="/audit"       element={<AuditLog/>}/>
          <Route path="/users"       element={<UserManagement/>}/>
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <AppContent />
      </ProjectProvider>
    </AuthProvider>
  );
}
