import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, XCircle, Sparkles, Cpu } from 'lucide-react';
import { Spinner, ZoneBadge, ConfBar, DomainBadge, ReasoningTrace } from '../components/UI';
import { API, DOMAIN_META, formatBytes } from '../utils/helpers';



const STAGE_ICONS = { magic_byte_verify:'🔍', oasis_header_read:'🔍', text_layer_extract:'📄', audio_normalize_16k:'🔊', keyframe_sample:'🎬', slide_parse:'📊', mdos_normalize:'📋', ner_pipeline:'🧠', whisper_transcribe:'🎙️', clip_frame_classify:'👁️', default:'⚙️' };

const DEFAULT_PROJECTS = ['UNASSIGNED','LOCAL_SCAN'];

function PipelineViz({ steps, totalMs }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs transition-all ${s.status === 'SUCCESS' ? 'border-green-800/40 bg-green-950/20' : 'border-red-800/40 bg-red-950/20'}`}>
          <span>{STAGE_ICONS[s.stage] || STAGE_ICONS.default}</span>
          <div className="flex-1 min-w-0">
            <div className="text-slate-300 font-medium">{s.stage.replace(/_/g,' ')}</div>
            {s.detail && <div className="text-slate-500 truncate">{s.detail}</div>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-slate-600 font-mono">{s.ms}ms</span>
            {s.status === 'SUCCESS' ? <CheckCircle size={13} className="text-green-400"/> : <XCircle size={13} className="text-red-400"/>}
          </div>
        </div>
      ))}
      {totalMs && <div className="text-right text-xs text-slate-600 font-mono">Total: {totalMs}ms</div>}
    </div>
  );
}

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ projectCode:'', designer:'', ipTier:'FIRST_PARTY' });
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);

  const onDrop = useCallback(([f]) => { if (f) { setFile(f); setResult(null); setError(null); setEnrichResult(null); } }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple:false });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta).forEach(([k, v]) => v && fd.append(k, v));
    try {
      const d = await fetch(`${API}/upload`, { method:'POST', body:fd }).then(r => r.json());
      if (d.error) throw new Error(d.error);
      setResult(d);
    } catch(e) { setError(e.message); }
    setUploading(false);
  };

  const handleEnrich = async () => {
    if (!result?.asset?.id) return;
    setEnriching(true);
    const d = await fetch(`${API}/enrich/${result.asset.id}`, { method:'POST' }).then(r => r.json());
    setEnrichResult(d.enrichment);
    setResult(prev => ({ ...prev, asset: d.asset }));
    setEnriching(false);
  };

  const domMeta = result?.asset?.content_domain ? DOMAIN_META[result.asset.content_domain] : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Upload & Parse</h1>
        <p className="text-slate-500 text-sm mt-1">Upload any file across all 5 domains — CUDE auto-detects format and routes to the correct discovery agent.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left */}
        <div className="lg:col-span-2 space-y-4">
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragActive ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'} ${result ? 'opacity-60 pointer-events-none' : ''}`}>
            <input {...getInputProps()}/>
            <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? 'text-blue-400' : 'text-slate-600'}`}/>
            {file ? (
              <div><div className="text-sm font-medium text-slate-200 break-all">{file.name}</div><div className="text-xs text-slate-500 mt-1">{formatBytes(file.size/1024/1024)}</div></div>
            ) : (
              <div>
                <div className="text-sm font-medium text-slate-300">{isDragActive ? 'Drop it!' : 'Drop any file type'}</div>
                <div className="text-xs text-slate-600 mt-1 leading-relaxed">GDSII · OASIS · Verilog · SPICE · PDF · DOCX · XLSX · PPTX · MP3 · MP4 · WEBM · DXF · KiCad…</div>
              </div>
            )}
          </div>

          <div className="card p-4 space-y-2">
            <div className="label">Metadata</div>
            <select className="input w-full" value={meta.projectCode} onChange={e=>setMeta(p=>({...p,projectCode:e.target.value}))}>
              <option value="">Select Project…</option>
              {DEFAULT_PROJECTS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <input className="input w-full" placeholder="Designer email (optional)" value={meta.designer} onChange={e=>setMeta(p=>({...p,designer:e.target.value}))}/>
            <select className="input w-full" value={meta.ipTier} onChange={e=>setMeta(p=>({...p,ipTier:e.target.value}))}>
              {['FIRST_PARTY','LICENSED_3P','OPEN_SOURCE'].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {!result
            ? <button onClick={handleUpload} disabled={!file||uploading} className="btn-primary w-full justify-center">{uploading?<><Spinner size={14}/>Processing…</>:<><Upload size={14}/>Run Discovery Pipeline</>}</button>
            : <button onClick={() => { setFile(null); setResult(null); setEnrichResult(null); }} className="btn-secondary w-full justify-center">Upload Another File</button>
          }

          {/* Supported domains */}
          <div className="card p-4">
            <div className="label mb-2">Auto-Detected Domains</div>
            <div className="space-y-1.5 text-xs text-slate-500">
              {Object.entries(DOMAIN_META).map(([d, m]) => (
                <div key={d} className="flex items-center gap-2"><span>{m.icon}</span><span className="text-slate-400 font-medium">{m.label}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-3 space-y-4">
          {/* Pipeline */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Cpu size={15} className="text-blue-400"/>Discovery Pipeline</h3>
              {result && <span className="text-xs text-slate-500 font-mono">{result.parse_result?.total_ms}ms</span>}
            </div>
            {result?.parse_result?.steps
              ? <PipelineViz steps={result.parse_result.steps} totalMs={result.parse_result.total_ms}/>
              : (
                <div className="space-y-2 opacity-30">
                  {['Format Detection','Domain Dispatch','Content Extraction','AI Enrichment','MUAS Normalization','Catalog Index'].map(s => (
                    <div key={s} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-800 bg-slate-800/20 text-xs">
                      <span>⚙️</span><span className="text-slate-500">{s}</span><div className="ml-auto w-4 h-4 rounded border border-slate-700"/>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Parse Result */}
          {result?.asset && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Parse Result</h3>
                <DomainBadge domain={result.asset.content_domain}/>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['Format', result.asset.asset_type], ['Parser', result.parse_result?.parser_used], ['Classification', result.asset.data_classification], ['Size', formatBytes(result.asset.file_size_mb)], ['Quality', `${Math.round((result.asset.quality_score||0)*100)}%`]].map(([k,v]) => (
                  <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="text-slate-200 font-medium text-xs mt-0.5 truncate">{v||'—'}</div></div>
                ))}
                <div><div className="text-xs text-slate-500">Zone</div><div className="mt-0.5"><ZoneBadge zone={result.asset.classification_zone}/></div></div>
              </div>
              <div><div className="text-xs text-slate-500 mb-1">Classification Confidence</div><ConfBar conf={result.asset.classification_confidence}/></div>

              {/* Domain-specific metadata */}
              {(() => {
                const ext = result.asset[`muas_${result.asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','')}`] || {};
                return Object.keys(ext).length > 0 && (
                  <div>
                    <div className="label mb-2">{domMeta?.label} Metadata</div>
                    <pre className="font-mono text-xs text-slate-400 bg-slate-950 rounded p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(ext, null, 2)}</pre>
                  </div>
                );
              })()}

              {!enrichResult
                ? <button onClick={handleEnrich} disabled={enriching} className="btn-primary w-full justify-center">{enriching?<><Spinner size={14}/>Classification Arbiter Running…</>:<><Sparkles size={14}/>Run Classification Arbiter</>}</button>
                : (
                  <div className="border border-purple-800/40 rounded-lg p-4 bg-purple-950/20 space-y-3">
                    <div className="text-sm font-semibold text-purple-300 flex items-center gap-2"><Sparkles size={14}/>Classification Arbiter — Classification Result</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-slate-500">Final Tier: </span><span className="font-bold text-slate-200">{enrichResult.final_tier}</span></div>
                      <div><span className="text-slate-500">Zone: </span><ZoneBadge zone={enrichResult.zone}/></div>
                      <div><span className="text-slate-500">Confidence: </span><span className="text-slate-200">{Math.round((enrichResult.final_confidence||0)*100)}%</span></div>
                      <div><span className="text-slate-500">Human Review: </span><span className={enrichResult.requires_human?'text-red-400 font-medium':'text-green-400'}>{enrichResult.requires_human?'Required':'Not needed'}</span></div>
                    </div>
                    {enrichResult.rationale && <p className="text-xs text-slate-400 leading-relaxed">{enrichResult.rationale}</p>}
                    {enrichResult.policy_rules_matched?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {enrichResult.policy_rules_matched.map(r => <span key={r} className="badge bg-purple-900/40 text-purple-300 border border-purple-700/40 font-mono">{r}</span>)}
                      </div>
                    )}
                    <ReasoningTrace steps={enrichResult.reasoning_steps} collapsed/>
                    {enrichResult.mock && <div className="text-xs text-amber-500/60 italic">⚠ Mock reasoning (set ANTHROPIC_API_KEY for live Claude)</div>}
                  </div>
                )
              }
            </div>
          )}

          {error && <div className="card border-red-800/50 p-4"><div className="text-red-400 text-sm font-medium flex items-center gap-2"><XCircle size={14}/>Upload Failed</div><div className="text-red-400/70 text-xs mt-1">{error}</div></div>}
        </div>
      </div>
    </div>
  );
}
