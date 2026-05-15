import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [activeProject, setActiveProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load projects when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    loadProjects();
  }, [isAuthenticated]);

  // Restore last active project from localStorage
  useEffect(() => {
    const savedId = localStorage.getItem('cude_active_project');
    if (savedId && projects.length > 0) {
      const found = projects.find(p => p.id === savedId);
      if (found) setActiveProject(found);
    }
  }, [projects]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch('/api/projects', { headers });
      if (r.ok) {
        const d = await r.json();
        setProjects(d.projects || []);
      }
    } catch { /* Projects API may not be available in demo mode */ }
    setLoading(false);
  };

  const selectProject = (project) => {
    setActiveProject(project);
    if (project) {
      localStorage.setItem('cude_active_project', project.id);
    } else {
      localStorage.removeItem('cude_active_project');
    }
  };

  const clearProject = () => {
    setActiveProject(null);
    localStorage.removeItem('cude_active_project');
  };

  return (
    <ProjectContext.Provider value={{
      activeProject, projects, loading,
      selectProject, clearProject, loadProjects,
      hasProjects: projects.length > 0,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
