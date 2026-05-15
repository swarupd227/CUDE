import React, { useState, useEffect } from 'react';
import { Database, Search, Sparkles, Play, Download, Table2, BarChart3, ChevronRight, ChevronDown, Key, ArrowRight, Copy, Pencil } from 'lucide-react';
import { Spinner } from '../components/UI';
import { API } from '../utils/helpers';

export default function DataExplorer() {
  const [question, setQuestion] = useState('');
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState(null);
  const [resultTab, setResultTab] = useState('table');
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [expandedTable, setExpandedTable] = useState(null);
  const [sources, setSources] = useState([]);
  const [activeSource, setActiveSource] = useState(null);
  const [editingSQL, setEditingSQL] = useState(false);
  const [editSQL, setEditSQL] = useState('');
  const [copied, setCopied] = useState(false);
  const [suggestions] = useState([
    'Show total sales by territory',
    'Top 10 products by revenue',
    'Monthly sales trend by year',
    'Customer count by country',
    'Sales by product category',
    'Top resellers by total sales',
    'Employee sales performance',
    'Average order value by territory',
  ]);

  // Load schema ONLY from discovered STRUCTURED_DATA assets in the catalog
  // Schema browser stays empty until project-level discovery has been run
  useEffect(() => {
    fetch(`${API}/catalog?domain=STRUCTURED_DATA&limit=100`).then(r => r.json()).then(d => {
      const dbMap = {};
      (d.assets || []).forEach(a => {
        // Check both full_path (has mysql:// URL) and vault_path (has database.table format)
        const fullPath = a.full_path || '';
        const vaultPath = a.vault_path || '';
        const urlMatch = fullPath.match(/mysql:\/\/([^/:]+)(?::(\d+))?\/([^/]+)/);
        const dotMatch = vaultPath.match(/^([^.]+)\.\w+$/);
        if (urlMatch) {
          const key = `${urlMatch[1]}/${urlMatch[3]}`;
          if (!dbMap[key]) dbMap[key] = { host: urlMatch[1], port: parseInt(urlMatch[2]) || 3306, database: urlMatch[3], tables: 0, user: 'cude', password: 'cude_demo_pass' };
          dbMap[key].tables++;
        } else if (dotMatch && a.source_connector === 'mysql') {
          const key = `mysql/${dotMatch[1]}`;
          if (!dbMap[key]) dbMap[key] = { host: 'mysql', port: 3306, database: dotMatch[1], tables: 0, user: 'cude', password: 'cude_demo_pass' };
          dbMap[key].tables++;
        }
      });
      const srcList = Object.values(dbMap);
      setSources(srcList);
      if (srcList.length > 0) {
        setActiveSource(srcList[0]);
        loadSchema(srcList[0]);
      } else {
        setLoadingSchema(false);
      }
    }).catch(() => setLoadingSchema(false));
  }, []);

  const loadSchema = (config) => {
    setLoadingSchema(true);
    fetch(`${API}/connectors/sql/schema`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {})
    }).then(r => r.json()).then(d => {
      if (d.tables?.length) {
        setSchema(d);
        if (!activeSource) setActiveSource({ host: d.host || 'mysql', database: d.database, tables: d.tableCount });
      }
      setLoadingSchema(false);
    }).catch(() => setLoadingSchema(false));
  };

  const handleQuery = async (q) => {
    const queryText = q || question;
    if (!queryText.trim()) return;
    setQuerying(true); setResult(null); setResultTab('table'); setEditingSQL(false);
    try {
      const d = await fetch(`${API}/connectors/sql/nlq`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText, ...(activeSource || {}) })
      }).then(r => r.json());
      setResult(d);
      if (d.sql) setEditSQL(d.sql);
    } catch (e) {
      setResult({ error: e.message });
    }
    setQuerying(false);
  };

  const handleExecuteSQL = async (sql) => {
    setQuerying(true); setResult(null); setResultTab('table'); setEditingSQL(false);
    try {
      const d = await fetch(`${API}/connectors/sql/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, ...(activeSource || {}) })
      }).then(r => r.json());
      setResult({ ...d, sql, explanation: 'Direct SQL execution' });
      setEditSQL(sql);
    } catch (e) {
      setResult({ error: e.message });
    }
    setQuerying(false);
  };

  const handleCopySQL = () => {
    if (result?.sql) { navigator.clipboard.writeText(result.sql); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const exportCSV = () => {
    if (!result?.rows?.length) return;
    const header = result.columns.join(',');
    const rows = result.rows.map(r => result.columns.map(c => { const v = r[c]; return typeof v === 'string' && v.includes(',') ? `"${v}"` : v ?? ''; }).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'query-results.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!result?.rows?.length) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'query-results.json'; a.click(); URL.revokeObjectURL(url);
  };

  // Simple SQL keyword highlighter
  const highlightSQL = (sql) => {
    if (!sql) return '';
    return sql.replace(/\b(SELECT|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ON|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|AS|AND|OR|IN|NOT|NULL|IS|BETWEEN|LIKE|TOP|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CAST|CASE|WHEN|THEN|ELSE|END|UNION|ALL|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|DESC|ASC)\b/gi,
      '<span style="color:#c084fc">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#22d3ee">$1</span>')
      .replace(/'([^']*)'/g, "<span style='color:#4ade80'>'$1'</span>");
  };

  return (
    <div className="flex h-full">
      {/* Schema Browser */}
      <div className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
        <div className="p-3 border-b border-slate-800">
          <h3 className="text-xs font-bold text-white flex items-center gap-2"><Database size={13} className="text-orange-400"/>Schema Browser</h3>
          {schema && <p className="text-[9px] text-slate-600 mt-0.5">{schema.database} · {schema.tableCount} tables · {schema.totalColumns} cols</p>}
        </div>

        {/* Source selector */}
        {sources.length > 1 && (
          <div className="p-2 border-b border-slate-800">
            <select className="input w-full text-[10px] py-1"
              value={activeSource ? `${activeSource.host}/${activeSource.database}` : ''}
              onChange={e => {
                const src = sources.find(s => `${s.host}/${s.database}` === e.target.value);
                if (src) { setActiveSource(src); loadSchema(src); }
              }}>
              {sources.map(s => <option key={`${s.host}/${s.database}`} value={`${s.host}/${s.database}`}>{s.database} ({s.host})</option>)}
            </select>
          </div>
        )}

        <div className="p-1.5">
          {loadingSchema && <div className="text-[10px] text-slate-500 p-3 text-center"><Spinner size={12}/> Loading schema...</div>}
          {!loadingSchema && schema?.tables?.map(t => (
            <div key={t.name}>
              <button onClick={() => setExpandedTable(expandedTable === t.name ? null : t.name)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] hover:bg-slate-800/60 transition-colors ${expandedTable === t.name ? 'bg-slate-800/60' : ''}`}>
                {expandedTable === t.name ? <ChevronDown size={9} className="text-slate-500"/> : <ChevronRight size={9} className="text-slate-500"/>}
                <span className={`font-mono font-medium ${t.type === 'fact' ? 'text-orange-400' : t.type === 'dimension' ? 'text-blue-400' : 'text-slate-300'}`}>
                  {t.type === 'fact' ? '◫' : '□'} {t.name}
                </span>
                <span className="text-slate-700 ml-auto text-[8px] font-mono">{t.rowCount?.toLocaleString()}</span>
              </button>
              {expandedTable === t.name && (
                <div className="ml-4 mb-1 border-l border-slate-800 pl-2">
                  {t.columns?.map(c => (
                    <div key={c.name} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 text-slate-500">
                      {c.isPrimaryKey ? <Key size={7} className="text-amber-500 flex-shrink-0"/> : c.isForeignKey ? <ArrowRight size={7} className="text-blue-400 flex-shrink-0"/> : <span className="w-[7px]"/>}
                      <span className="text-slate-400">{c.name}</span>
                      <span className="text-slate-700 ml-auto font-mono">{c.type}</span>
                    </div>
                  ))}
                  {t.foreignKeys?.length > 0 && (
                    <div className="mt-1 px-1.5 pb-1">
                      {t.foreignKeys.map((fk, i) => (
                        <div key={i} className="text-[8px] text-blue-400/70">{fk.column} → {fk.referencedTable}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loadingSchema && !schema?.tables?.length && (
            <div className="text-[10px] text-slate-600 p-4 text-center leading-relaxed">
              No database connected.<br/>Configure a MySQL connector to begin exploring structured data.
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header + Search */}
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Database size={20} className="text-orange-400"/>Data Explorer
              <span className="text-xs font-normal text-slate-500 ml-1">Ask questions about your structured data</span>
            </h1>
            {activeSource && (
              <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"/>
                {activeSource.database}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
              <input className="input w-full pl-9 py-2.5 text-sm"
                placeholder="Ask a question... e.g. 'Show total sales by territory'"
                value={question} onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQuery()}/>
            </div>
            <button onClick={() => handleQuery()} disabled={querying || !question.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-orange-900/20">
              {querying ? <><Spinner size={14}/>Querying...</> : <><Sparkles size={14}/>Ask AI</>}
            </button>
          </div>
          {/* Suggestions — only when no result */}
          {!result && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {suggestions.map(s => (
                <button key={s} onClick={() => { setQuestion(s); handleQuery(s); }}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-slate-700 text-slate-400 hover:border-orange-600 hover:text-orange-300 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {result && (
            <div className="p-4 space-y-3">
              {/* Generated SQL Block — always visible above results */}
              {result.sql && (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-300">Generated SQL</span>
                      <span className="text-[9px] text-slate-600">·</span>
                      <span className="text-[10px] text-slate-500">{activeSource?.database || 'MySQL'}</span>
                      {!result.mock && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-700/30">AI-generated</span>}
                      {result.mock && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-700/30">Rule-based</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={handleCopySQL} className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center gap-1 transition-colors">
                        <Copy size={10}/>{copied ? 'Copied!' : 'Copy'}
                      </button>
                      <button onClick={() => { setEditingSQL(!editingSQL); setEditSQL(result.sql); }}
                        className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center gap-1 transition-colors">
                        <Pencil size={10}/>Edit & Run
                      </button>
                    </div>
                  </div>
                  {editingSQL ? (
                    <div className="p-3 bg-slate-950">
                      <textarea className="w-full bg-transparent text-green-400 font-mono text-xs outline-none resize-none min-h-[80px]"
                        value={editSQL} onChange={e => setEditSQL(e.target.value)} rows={5}/>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleExecuteSQL(editSQL)} className="text-[10px] px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-white font-medium flex items-center gap-1">
                          <Play size={10}/>Run Query
                        </button>
                        <button onClick={() => setEditingSQL(false)} className="text-[10px] px-3 py-1.5 rounded bg-slate-800 text-slate-400">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950 font-mono text-xs leading-relaxed overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: highlightSQL(result.sql) }}/>
                  )}
                </div>
              )}

              {/* AI Explanation */}
              {result.explanation && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-slate-500 font-medium flex-shrink-0">AI:</span>
                  <span className="text-slate-400">{result.explanation}</span>
                  {result.tables_used?.length > 0 && (
                    <span className="text-slate-600 flex-shrink-0 ml-auto">Tables: {result.tables_used.join(', ')}</span>
                  )}
                </div>
              )}

              {/* Error */}
              {result.error && (
                <div className="border border-red-800/40 rounded-lg p-3 bg-red-950/20 text-xs text-red-400">{result.error}</div>
              )}

              {/* Data Results */}
              {result.rows?.length > 0 && (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  {/* Result Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 border-b border-slate-800">
                    <div className="flex items-center gap-1">
                      {[
                        { id: 'table', icon: Table2, label: 'Table' },
                        { id: 'chart', icon: BarChart3, label: 'Chart' },
                      ].map(t => (
                        <button key={t.id} onClick={() => setResultTab(t.id)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${resultTab === t.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                          <t.icon size={12}/>{t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      {result.timingMs && <span>⏱ {result.timingMs}ms</span>}
                      <span>{result.rowCount} rows · {result.columns?.length} cols</span>
                      {result.truncated && <span className="text-amber-400">(truncated)</span>}
                      <div className="flex gap-1">
                        <button onClick={exportCSV} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center gap-1 transition-colors">
                          <Download size={9}/>CSV
                        </button>
                        <button onClick={exportJSON} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center gap-1 transition-colors">
                          <Download size={9}/>JSON
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Table View */}
                  {resultTab === 'table' && (
                    <div className="overflow-auto max-h-[500px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-900">
                            {result.columns?.map(col => (
                              <th key={col} className="text-left px-4 py-2.5 text-slate-400 font-semibold border-b border-slate-800 whitespace-nowrap uppercase text-[10px] tracking-wider">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.slice(0, 200).map((row, i) => (
                            <tr key={i} className={`transition-colors ${i % 2 === 0 ? 'bg-slate-950/30' : ''} hover:bg-slate-800/30`}>
                              {result.columns?.map(col => (
                                <td key={col} className="px-4 py-2 text-slate-300 border-b border-slate-800/30 whitespace-nowrap">
                                  {row[col] !== null && row[col] !== undefined
                                    ? typeof row[col] === 'number'
                                      ? row[col].toLocaleString(undefined, { maximumFractionDigits: 2 })
                                      : String(row[col])
                                    : <span className="text-slate-700 italic">NULL</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Chart View — simple bar chart using CSS */}
                  {resultTab === 'chart' && result.rows?.length > 0 && (
                    <div className="p-4 space-y-1.5">
                      {(() => {
                        // Auto-detect: first string column as label, first number column as value
                        // Detect columns: string for labels, numeric for values
                        // MySQL often returns numbers as strings, so also check if value is parseable as number
                        const isNumeric = (v) => v !== null && v !== undefined && !isNaN(Number(v)) && typeof v !== 'boolean' && String(v).trim() !== '';
                        const labelCol = result.columns?.find(c => { const v = result.rows[0]?.[c]; return typeof v === 'string' && !isNumeric(v); });
                        const valueCol = result.columns?.find(c => { const v = result.rows[0]?.[c]; return isNumeric(v); });
                        if (!labelCol || !valueCol) return <div className="text-xs text-slate-500">No chartable data (need at least one text and one numeric column)</div>;
                        const maxVal = Math.max(...result.rows.map(r => Number(r[valueCol]) || 0));
                        return (
                          <>
                            <div className="text-[10px] text-slate-500 mb-2">{valueCol} by {labelCol}</div>
                            {result.rows.slice(0, 20).map((row, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px]">
                                <span className="w-36 text-slate-400 truncate text-right flex-shrink-0">{row[labelCol]}</span>
                                <div className="flex-1 h-6 bg-slate-900 rounded overflow-hidden">
                                  <div className="h-full rounded bg-gradient-to-r from-orange-600 to-amber-500 transition-all" style={{ width: `${maxVal > 0 ? (Number(row[valueCol]) / maxVal) * 100 : 0}%` }}/>
                                </div>
                                <span className="w-28 text-slate-500 font-mono text-right flex-shrink-0">{Number(row[valueCol] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!result && !querying && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center max-w-md py-16">
                <div className="w-16 h-16 rounded-full bg-orange-600/10 border border-orange-600/20 flex items-center justify-center mx-auto mb-4">
                  <Database size={28} className="text-orange-400"/>
                </div>
                <h2 className="text-lg font-semibold text-slate-200 mb-2">Explore Your Data</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Ask questions in plain English and get instant SQL-powered answers.
                </p>
                <div className="text-[10px] text-slate-600">
                  {schema ? `Connected: ${schema.database} · ${schema.tableCount} tables · ${schema.totalColumns} columns`
                    : sources.length === 0 ? 'Add a MySQL connector to a project and run discovery to begin.'
                    : 'Select a source to begin querying.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
