import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Tag, Search, Sparkles, X, Building2, Factory, MessageSquare } from 'lucide-react';

const API = '/api';

export default function Glossary() {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ term: '', definition: '', category: 'General', synonyms: '' });

  // AI Generate state
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiForm, setAiForm] = useState({ company_name: '', division: '', industry: 'Semiconductor', additional_context: '' });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const fetchTerms = async () => {
    try {
      const d = await fetch(`${API}/glossary`).then(r => r.json());
      setTerms(d.terms || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { fetchTerms(); }, []);

  const addTerm = async () => {
    if (!form.term.trim()) return;
    const token = localStorage.getItem('cude_token');
    await fetch(`${API}/glossary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        term: form.term.trim(),
        definition: form.definition.trim(),
        category: form.category.trim() || 'General',
        synonyms: form.synonyms.split(',').map(s => s.trim()).filter(Boolean),
      })
    });
    setForm({ term: '', definition: '', category: 'General', synonyms: '' });
    setShowAdd(false);
    fetchTerms();
  };

  const deleteTerm = async (id) => {
    const token = localStorage.getItem('cude_token');
    await fetch(`${API}/glossary/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    setTerms(terms.filter(t => t.id !== id));
  };

  const handleAIGenerate = async () => {
    if (!aiForm.company_name.trim()) return;
    setAiGenerating(true);
    setAiResult(null);
    try {
      const token = localStorage.getItem('cude_token');
      const d = await fetch(`${API}/glossary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(aiForm)
      }).then(r => r.json());
      setAiResult(d);
      setTerms(d.terms || []);
    } catch (e) {
      setAiResult({ error: e.message });
    }
    setAiGenerating(false);
  };

  // Group by category
  const filtered = terms.filter(t =>
    !search || t.term.toLowerCase().includes(search.toLowerCase()) ||
    t.definition?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = {};
  for (const t of filtered) {
    const cat = t.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  const INDUSTRIES = ['Semiconductor', 'Pharmaceutical', 'Financial Services', 'Healthcare', 'Automotive', 'Aerospace & Defense', 'Technology', 'Energy', 'Manufacturing', 'Telecommunications', 'Other'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><BookOpen size={22} className="text-purple-400"/>Business Glossary</h1>
          <p className="text-xs text-slate-500 mt-1">Define business terms, tag assets with domain-specific vocabulary, and make business meaning searchable.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{terms.length} term{terms.length !== 1 ? 's' : ''}</span>
          <button onClick={() => { setShowAIDialog(true); setShowAdd(false); }}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium transition-all shadow-lg shadow-purple-900/30">
            <Sparkles size={14}/>AI Generate
          </button>
          <button onClick={() => { setShowAdd(!showAdd); setShowAIDialog(false); }} className="btn-primary text-xs flex items-center gap-1">
            <Plus size={14}/>{showAdd ? 'Cancel' : 'Add Term'}
          </button>
        </div>
      </div>

      {/* AI Generate Dialog */}
      {showAIDialog && (
        <div className="card p-5 border border-indigo-700/40 bg-gradient-to-br from-indigo-950/30 to-purple-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                <Sparkles size={16} className="text-white"/>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">AI Glossary Generator</div>
                <div className="text-[10px] text-slate-500">Claude will generate a comprehensive business glossary tailored to your organization</div>
              </div>
            </div>
            <button onClick={() => { setShowAIDialog(false); setAiResult(null); }} className="text-slate-500 hover:text-slate-300"><X size={16}/></button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1"><Building2 size={11}/>Company Name *</label>
              <input className="input w-full text-xs" placeholder="e.g. Marvell Technology, Pfizer, Goldman Sachs"
                value={aiForm.company_name} onChange={e => setAiForm({ ...aiForm, company_name: e.target.value })}/>
            </div>
            <div>
              <label className="label flex items-center gap-1"><Factory size={11}/>Division / Business Unit</label>
              <input className="input w-full text-xs" placeholder="e.g. Custom Silicon, Cloud Infrastructure, R&D"
                value={aiForm.division} onChange={e => setAiForm({ ...aiForm, division: e.target.value })}/>
            </div>
          </div>

          <div>
            <label className="label">Industry</label>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.map(ind => (
                <button key={ind} onClick={() => setAiForm({ ...aiForm, industry: ind })}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    aiForm.industry === ind
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'border-slate-700 text-slate-400 hover:border-indigo-600 hover:text-indigo-300'
                  }`}>
                  {ind}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-1"><MessageSquare size={11}/>Additional Context (optional)</label>
            <textarea className="input w-full text-xs" rows={2}
              placeholder="e.g. Focus on EDA/chip design terminology. Include ITAR export control terms. We work with automotive OEMs..."
              value={aiForm.additional_context} onChange={e => setAiForm({ ...aiForm, additional_context: e.target.value })}/>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleAIGenerate} disabled={!aiForm.company_name.trim() || aiGenerating}
              className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {aiGenerating ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating with Claude...</>
              ) : (
                <><Sparkles size={14}/>Generate Glossary</>
              )}
            </button>
            {aiGenerating && <span className="text-[10px] text-indigo-400 animate-pulse">This may take 10-15 seconds...</span>}
          </div>

          {/* AI Result */}
          {aiResult && !aiResult.error && (
            <div className="border border-green-800/30 rounded-lg p-3 bg-green-950/10">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
                <span className="text-green-300 font-medium">
                  Generated {aiResult.generated} terms, saved {aiResult.saved} to glossary
                  {aiResult.mock && <span className="text-amber-400 ml-2">(Mock — set ANTHROPIC_API_KEY for live AI)</span>}
                </span>
              </div>
            </div>
          )}
          {aiResult?.error && (
            <div className="border border-red-800/30 rounded-lg p-3 bg-red-950/10">
              <div className="text-xs text-red-400">Generation failed: {aiResult.error}</div>
            </div>
          )}
        </div>
      )}

      {/* Add Term Form */}
      {showAdd && (
        <div className="card p-4 border border-purple-800/30 bg-purple-950/10 space-y-3">
          <div className="text-sm font-semibold text-purple-300">New Business Term</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Term *</label>
              <input className="input w-full text-xs" placeholder="e.g. DDR5 PHY, Tapeout, Design Win"
                value={form.term} onChange={e => setForm({ ...form, term: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addTerm()}/>
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input w-full text-xs" placeholder="e.g. Semiconductor, Finance, Legal"
                value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}/>
            </div>
          </div>
          <div>
            <label className="label">Definition</label>
            <textarea className="input w-full text-xs" rows={2} placeholder="What does this term mean in your business context?"
              value={form.definition} onChange={e => setForm({ ...form, definition: e.target.value })}/>
          </div>
          <div>
            <label className="label">Synonyms (comma-separated)</label>
            <input className="input w-full text-xs" placeholder="e.g. DDR5, double data rate, PHY interface"
              value={form.synonyms} onChange={e => setForm({ ...form, synonyms: e.target.value })}/>
          </div>
          <button onClick={addTerm} disabled={!form.term.trim()} className="btn-primary text-xs">Save Term</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <input className="input w-full pl-9 text-xs" placeholder="Search terms, definitions, categories..."
          value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {/* Terms grouped by category */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading glossary...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-slate-700 mx-auto mb-3"/>
          <div className="text-slate-500 text-sm">{search ? 'No matching terms found' : 'No business terms defined yet'}</div>
          <div className="text-slate-600 text-xs mt-1">{!search && 'Click "AI Generate" to auto-populate or "Add Term" to create manually'}</div>
        </div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, catTerms]) => (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag size={12} className="text-purple-400"/>
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">{category}</span>
              <span className="text-[10px] text-slate-600">{catTerms.length} term{catTerms.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid gap-2">
              {catTerms.map(t => (
                <div key={t.id} className="card p-3 flex items-start gap-3 group hover:border-purple-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-white">{t.term}</div>
                      {t.related_signals?.length > 0 && (
                        <div className="flex gap-1">
                          {t.related_signals.map((s, i) => (
                            <span key={i} className="badge bg-amber-900/20 text-amber-400 border border-amber-700/20 text-[8px]">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {t.definition && <div className="text-xs text-slate-400 mt-1 leading-relaxed">{t.definition}</div>}
                    {t.synonyms?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.synonyms.map((s, i) => (
                          <span key={i} className="badge bg-slate-800 text-slate-400 text-[10px]">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteTerm(t.id)}
                    className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Delete term">
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
