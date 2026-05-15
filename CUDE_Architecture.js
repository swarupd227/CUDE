const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Nous Infosystems";
pres.title = "CUDE Enterprise — Technical Architecture";

// ── Color Palette ──────────────────────────────────────────────────────────
const C = {
  bg: "0F172A",        // Deep navy background
  bgCard: "1E293B",    // Card background
  bgLight: "334155",   // Lighter card
  accent: "3B82F6",    // Blue accent
  accent2: "8B5CF6",   // Purple accent
  accent3: "10B981",   // Green
  accent4: "F59E0B",   // Amber
  accent5: "EF4444",   // Red
  accent6: "06B6D4",   // Cyan
  text: "F8FAFC",      // White text
  textMuted: "94A3B8",  // Muted text
  textDim: "64748B",   // Dim text
  border: "475569",    // Border
};

const FONT = "Calibri";
const FONT_MONO = "Consolas";

// Helper: create fresh shadow
const mkShadow = () => ({ type: "outer", blur: 8, offset: 2, angle: 135, color: "000000", opacity: 0.3 });

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 1: Title
// ═══════════════════════════════════════════════════════════════════════════
let s1 = pres.addSlide();
s1.background = { color: C.bg };
// Accent bar top
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
// Icon placeholder
s1.addShape(pres.shapes.RECTANGLE, { x: 4.1, y: 1.2, w: 0.8, h: 0.8, fill: { color: C.accent }, rectRadius: 0.15 });
s1.addText("⚙", { x: 4.1, y: 1.2, w: 0.8, h: 0.8, fontSize: 28, color: "FFFFFF", align: "center", valign: "middle", fontFace: FONT });
// Title
s1.addText("CUDE Enterprise", { x: 0.5, y: 2.3, w: 9, h: 1, fontSize: 44, fontFace: FONT, color: C.text, bold: true, align: "center" });
s1.addText("Technical Architecture", { x: 0.5, y: 3.1, w: 9, h: 0.6, fontSize: 28, fontFace: FONT, color: C.accent, align: "center" });
s1.addText("Configurable Universal Discovery Engine  |  Agentic Data Governance Platform", { x: 0.5, y: 3.9, w: 9, h: 0.5, fontSize: 13, fontFace: FONT, color: C.textMuted, align: "center" });
// Bottom bar
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: C.bgCard } });
s1.addText("Nous Infosystems  |  April 2026  |  Confidential", { x: 0.5, y: 5.2, w: 9, h: 0.425, fontSize: 10, fontFace: FONT, color: C.textDim, align: "center", valign: "middle" });

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 2: Platform Overview
// ═══════════════════════════════════════════════════════════════════════════
let s2 = pres.addSlide();
s2.background = { color: C.bg };
s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
s2.addText("Platform Overview", { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: FONT, color: C.text, bold: true });
s2.addText("7 containerized services orchestrated via single docker-compose up", { x: 0.5, y: 0.7, w: 9, h: 0.35, fontSize: 12, fontFace: FONT, color: C.textMuted });

const services = [
  { name: "PostgreSQL 16\n+ pgvector", color: C.accent, desc: "Primary store\nVector embeddings" },
  { name: "Redis 7", color: C.accent5, desc: "Job queue\nSSE pub/sub" },
  { name: "Elasticsearch 8", color: C.accent4, desc: "Full-text search\nFaceted filtering" },
  { name: "Neo4j 5", color: C.accent3, desc: "Knowledge graph\nRelationships" },
  { name: "MinIO", color: C.accent6, desc: "S3-compatible\nObject store" },
  { name: "Python Worker", color: C.accent2, desc: "Enhanced PDF\nPPTX parsing" },
  { name: "Node.js API\nServer", color: C.accent, desc: "70+ endpoints\nReact SPA" },
];

services.forEach((svc, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const x = 0.5 + col * 2.35;
  const y = 1.3 + row * 2.0;
  s2.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.1, h: 1.7, fill: { color: C.bgCard }, line: { color: svc.color, width: 1.5 }, shadow: mkShadow() });
  s2.addText(svc.name, { x, y: y + 0.15, w: 2.1, h: 0.7, fontSize: 12, fontFace: FONT, color: C.text, bold: true, align: "center", valign: "middle" });
  s2.addText(svc.desc, { x, y: y + 0.85, w: 2.1, h: 0.7, fontSize: 9, fontFace: FONT, color: C.textMuted, align: "center", valign: "top" });
});

s2.addText("docker-compose up --build", { x: 3, y: 5.1, w: 4, h: 0.4, fontSize: 12, fontFace: FONT_MONO, color: C.accent3, align: "center", valign: "middle", fill: { color: C.bgCard } });

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 3: Six-Layer Architecture
// ═══════════════════════════════════════════════════════════════════════════
let s3 = pres.addSlide();
s3.background = { color: C.bg };
s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent2 } });
s3.addText("Six-Layer Architecture", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 28, fontFace: FONT, color: C.text, bold: true });

const layers = [
  { label: "L1  Presentation", tech: "React 18 + Vite + Tailwind CSS + Recharts + Lucide Icons", color: C.accent },
  { label: "L2  API Gateway", tech: "Node.js/Express  |  JWT Auth + RBAC  |  70+ REST Endpoints  |  SSE Real-time", color: C.accent6 },
  { label: "L3  Application Services", tech: "Project  |  Scan  |  Classification  |  Approval  |  Report  |  Audit  |  Notification", color: C.accent3 },
  { label: "L4  Agentic Intelligence", tech: "10 AI Agents  |  Claude Sonnet  |  ReAct Pattern  |  5-Category Context Engineering", color: C.accent2 },
  { label: "L5  Parser & Connectors", tech: "5 Live Connectors (FS, OneDrive, SharePoint, Azure, S3)  |  Real Parsers (PDF, Office, EDA, Audio, Video)", color: C.accent4 },
  { label: "L6  Data Persistence", tech: "PostgreSQL + pgvector  |  Elasticsearch  |  Neo4j  |  Redis  |  MinIO", color: C.accent5 },
];

layers.forEach((l, i) => {
  const y = 0.85 + i * 0.78;
  s3.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 9, h: 0.65, fill: { color: C.bgCard }, line: { color: l.color, width: 1 } });
  s3.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.06, h: 0.65, fill: { color: l.color } });
  s3.addText(l.label, { x: 0.7, y, w: 2.3, h: 0.65, fontSize: 11, fontFace: FONT, color: l.color, bold: true, valign: "middle", margin: 0 });
  s3.addText(l.tech, { x: 3.1, y, w: 6.3, h: 0.65, fontSize: 9.5, fontFace: FONT, color: C.textMuted, valign: "middle", margin: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 4: 10 AI Agents
// ═══════════════════════════════════════════════════════════════════════════
let s4 = pres.addSlide();
s4.background = { color: C.bg };
s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent2 } });
s4.addText("10 AI Agents — Agentic Architecture", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });
s4.addText("Each agent uses Claude Sonnet API with ReAct (Reason + Act) pattern and 5-category context packages", { x: 0.5, y: 0.6, w: 9, h: 0.3, fontSize: 10, fontFace: FONT, color: C.textMuted });

const agents = [
  { id: "A1", name: "Pipeline Orchestrator", desc: "Coordinates discovery pipeline, routes files to domain scanners", color: C.accent },
  { id: "A2a", name: "Circuit Scanner", desc: "EDA: GDSII, Verilog, SPICE, SDC, KiCad", color: C.accent2 },
  { id: "A2b", name: "PDF Scanner", desc: "Text extraction, OCR, table detection, NER", color: C.accent2 },
  { id: "A2c", name: "Office Scanner", desc: "DOCX, XLSX, PPTX — tracked changes, hidden content", color: C.accent2 },
  { id: "A2d", name: "Audio Scanner", desc: "Duration, codec, Whisper ASR transcription", color: C.accent2 },
  { id: "A2e", name: "Video Scanner", desc: "Resolution, ffprobe, Claude Vision OCR", color: C.accent2 },
  { id: "A3", name: "Relationship Investigator", desc: "Cross-domain link discovery via Neo4j graph", color: C.accent4 },
  { id: "A4", name: "Classification Arbiter", desc: "Resolves ambiguity with rich 5-category context", color: C.accent5 },
  { id: "A5", name: "Governance Monitor", desc: "SLA checks, compliance alerts, retention review", color: C.accent4 },
  { id: "A6", name: "Compliance Reporter", desc: "Audit-ready report generation with evidence", color: C.accent3 },
];

agents.forEach((a, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 0.5 + col * 4.75;
  const y = 1.05 + row * 0.88;
  s4.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.5, h: 0.75, fill: { color: C.bgCard } });
  s4.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.05, h: 0.75, fill: { color: a.color } });
  s4.addText(a.id, { x: x + 0.15, y, w: 0.55, h: 0.75, fontSize: 9, fontFace: FONT_MONO, color: a.color, bold: true, valign: "middle", margin: 0 });
  s4.addText(a.name, { x: x + 0.7, y: y + 0.05, w: 3.6, h: 0.35, fontSize: 10, fontFace: FONT, color: C.text, bold: true, valign: "middle", margin: 0 });
  s4.addText(a.desc, { x: x + 0.7, y: y + 0.38, w: 3.6, h: 0.3, fontSize: 8, fontFace: FONT, color: C.textMuted, valign: "top", margin: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 5: Context Engineering
// ═══════════════════════════════════════════════════════════════════════════
let s5 = pres.addSlide();
s5.background = { color: C.bg };
s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent5 } });
s5.addText("Context Engineering — Classification Arbiter", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });
s5.addText("5-category context package built for every agent invocation (6-15KB of curated intelligence per run)", { x: 0.5, y: 0.65, w: 9, h: 0.3, fontSize: 10, fontFace: FONT, color: C.textMuted });

const contexts = [
  { num: "1", title: "Asset Context", items: "File metadata, domain-specific metadata, extracted text content, detected entities (emails, part numbers)", color: C.accent },
  { num: "2", title: "Project Context", items: "Sensitivity ceiling, SLA config, steward team composition, regulatory scope (ITAR/ECCN/GDPR)", color: C.accent3 },
  { num: "3", title: "Policy Context", items: "Global + project-specific classification rules, priority-ordered, signal → tier mapping", color: C.accent4 },
  { num: "4", title: "Precedent Context", items: "10 most similar human steward decisions from PostgreSQL — what signals, what tier, what rationale", color: C.accent2 },
  { num: "5", title: "Operational Context", items: "Current queue depth, SLA timers for pending items, scan batch size and patterns", color: C.accent5 },
];

contexts.forEach((c, i) => {
  const y = 1.1 + i * 0.88;
  s5.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 9, h: 0.75, fill: { color: C.bgCard } });
  s5.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.5, h: 0.75, fill: { color: c.color } });
  s5.addText(c.num, { x: 0.5, y, w: 0.5, h: 0.75, fontSize: 20, fontFace: FONT, color: "FFFFFF", bold: true, align: "center", valign: "middle" });
  s5.addText(c.title, { x: 1.15, y: y + 0.05, w: 8.2, h: 0.3, fontSize: 12, fontFace: FONT, color: C.text, bold: true, valign: "middle", margin: 0 });
  s5.addText(c.items, { x: 1.15, y: y + 0.35, w: 8.2, h: 0.35, fontSize: 9, fontFace: FONT, color: C.textMuted, valign: "top", margin: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 6: Connector Architecture
// ═══════════════════════════════════════════════════════════════════════════
let s6 = pres.addSlide();
s6.background = { color: C.bg };
s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent3 } });
s6.addText("Connector Architecture", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });
s6.addText("5 live connectors with real SDK integration + Connector Template Library → Project Instance pattern", { x: 0.5, y: 0.65, w: 9, h: 0.3, fontSize: 10, fontFace: FONT, color: C.textMuted });

const connectors = [
  { name: "Local Filesystem", tech: "fs.readdirSync, recursive walk, SHA-256 delta detection", color: C.accent },
  { name: "Microsoft OneDrive", tech: "Graph API, OAuth2 client credentials, folder enumeration, delta sync", color: C.accent6 },
  { name: "Microsoft SharePoint", tech: "Graph API, site/library enumeration, document library scan", color: C.accent6 },
  { name: "Azure Blob Storage", tech: "@azure/storage-blob SDK, container listing, prefix filtering", color: C.accent2 },
  { name: "AWS S3", tech: "@aws-sdk/client-s3, bucket scanning, ETag-based dedup, prefix filtering", color: C.accent4 },
];

connectors.forEach((c, i) => {
  const y = 1.1 + i * 0.72;
  s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 9, h: 0.6, fill: { color: C.bgCard } });
  s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.06, h: 0.6, fill: { color: c.color } });
  s6.addText(c.name, { x: 0.75, y, w: 2.5, h: 0.6, fontSize: 11, fontFace: FONT, color: c.color, bold: true, valign: "middle", margin: 0 });
  s6.addText(c.tech, { x: 3.3, y, w: 6, h: 0.6, fontSize: 9, fontFace: FONT, color: C.textMuted, valign: "middle", margin: 0 });
});

// Template flow
s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.8, w: 9, h: 0.6, fill: { color: C.bgCard }, line: { color: C.accent2, width: 1 } });
s6.addText("Connector Library (Templates)  →  Save Config  →  Add to Project (Instance)  →  Customize per Project  →  Run Discovery", {
  x: 0.7, y: 4.8, w: 8.6, h: 0.6, fontSize: 10, fontFace: FONT, color: C.accent2, align: "center", valign: "middle"
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 7: Real Parser Pipeline
// ═══════════════════════════════════════════════════════════════════════════
let s7 = pres.addSlide();
s7.background = { color: C.bg };
s7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent4 } });
s7.addText("Real Parser Pipeline", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });

const parsers = [
  { domain: "PDF", lib: "pdf-parse", output: "Page count, text extraction, author/title, NER (emails, phones, dates, part numbers), SHA-256 hash", color: C.accent5 },
  { domain: "Office", lib: "mammoth, xlsx, adm-zip", output: "Author, tracked changes, hidden content, comments, embedded objects, slide text + speaker notes", color: C.accent },
  { domain: "Audio", lib: "music-metadata", output: "Duration, codec, bitrate, sample rate. Optional: Whisper ASR via OpenAI API", color: C.accent3 },
  { domain: "Video", lib: "ffprobe", output: "Duration, resolution, frame rate, codec. Optional: Claude Vision OCR for slides", color: C.accent6 },
  { domain: "EDA (10 formats)", lib: "regex + gdsii npm", output: "Verilog modules, SPICE subcircuits, SDC clocks, LEF/DEF cells, KiCad components, GDSII hierarchy", color: C.accent2 },
];

parsers.forEach((p, i) => {
  const y = 0.75 + i * 0.92;
  s7.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 9, h: 0.78, fill: { color: C.bgCard } });
  s7.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.06, h: 0.78, fill: { color: p.color } });
  s7.addText(p.domain, { x: 0.75, y: y + 0.03, w: 1.8, h: 0.35, fontSize: 12, fontFace: FONT, color: p.color, bold: true, valign: "middle", margin: 0 });
  s7.addText(p.lib, { x: 0.75, y: y + 0.38, w: 1.8, h: 0.3, fontSize: 8, fontFace: FONT_MONO, color: C.textDim, valign: "top", margin: 0 });
  s7.addText(p.output, { x: 2.7, y, w: 6.6, h: 0.78, fontSize: 9, fontFace: FONT, color: C.textMuted, valign: "middle", margin: 0 });
});

s7.addText("SHA-256 content hashing for deduplication and incremental scanning across all formats", {
  x: 0.5, y: 5.35, w: 9, h: 0.25, fontSize: 9, fontFace: FONT, color: C.accent4, align: "center"
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 8: Classification & Governance Engine
// ═══════════════════════════════════════════════════════════════════════════
let s8 = pres.addSlide();
s8.background = { color: C.bg };
s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent5 } });
s8.addText("Classification & Governance Engine", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });

// Confidence scoring
s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.75, w: 4.3, h: 2.2, fill: { color: C.bgCard }, shadow: mkShadow() });
s8.addText("Evidence-Based Confidence", { x: 0.7, y: 0.8, w: 4, h: 0.35, fontSize: 12, fontFace: FONT, color: C.accent, bold: true });
const factors = ["Real content parsing (+12%)", "Signal strength (+7-18%)", "Policy rules matched (+8-13%)", "Filename keywords (+4-8%)", "Entity evidence (+4-8%)", "Parse quality score (+2-5%)"];
s8.addText(factors.map((f, i) => ({ text: f, options: { bullet: true, breakLine: i < factors.length - 1, fontSize: 9, color: C.textMuted } })), { x: 0.7, y: 1.2, w: 4, h: 1.6, fontFace: FONT });

// Classification tiers
s8.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 0.75, w: 4.3, h: 2.2, fill: { color: C.bgCard }, shadow: mkShadow() });
s8.addText("5-Tier Classification", { x: 5.4, y: 0.8, w: 4, h: 0.35, fontSize: 12, fontFace: FONT, color: C.accent2, bold: true });
const tiers = [
  { name: "PUBLIC", color: C.accent3 }, { name: "INTERNAL", color: C.accent },
  { name: "CONFIDENTIAL", color: C.accent4 }, { name: "RESTRICTED", color: "F97316" },
  { name: "TRADE SECRET", color: C.accent5 },
];
tiers.forEach((t, i) => {
  s8.addShape(pres.shapes.RECTANGLE, { x: 5.5 + i * 0.8, y: 1.3, w: 0.7, h: 1.5, fill: { color: t.color, transparency: 70 } });
  s8.addText(t.name.split(' ').join('\n'), { x: 5.5 + i * 0.8, y: 1.3, w: 0.7, h: 1.5, fontSize: 7, fontFace: FONT, color: C.text, bold: true, align: "center", valign: "bottom" });
});

// Zones
s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.15, w: 9, h: 1.1, fill: { color: C.bgCard }, shadow: mkShadow() });
s8.addText("4 Governance Zones", { x: 0.7, y: 3.2, w: 3, h: 0.3, fontSize: 12, fontFace: FONT, color: C.accent4, bold: true });
const zones = [
  { name: "AUTONOMOUS", rule: "≥90% confidence", color: C.accent3 },
  { name: "SUPERVISED", rule: "70-89% confidence", color: C.accent4 },
  { name: "GATED", rule: "TRADE SECRET tier", color: C.accent5 },
  { name: "PENDING REVIEW", rule: "<70% confidence", color: "F97316" },
];
zones.forEach((z, i) => {
  const x = 0.7 + i * 2.25;
  s8.addShape(pres.shapes.RECTANGLE, { x, y: 3.55, w: 2.0, h: 0.55, fill: { color: z.color, transparency: 75 }, line: { color: z.color, width: 1 } });
  s8.addText(z.name, { x, y: 3.55, w: 2.0, h: 0.3, fontSize: 9, fontFace: FONT, color: C.text, bold: true, align: "center" });
  s8.addText(z.rule, { x, y: 3.8, w: 2.0, h: 0.25, fontSize: 8, fontFace: FONT, color: C.textMuted, align: "center" });
});

// Additional governance
s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.45, w: 2.9, h: 0.9, fill: { color: C.bgCard } });
s8.addText("Export Control", { x: 0.6, y: 4.5, w: 2.7, h: 0.3, fontSize: 10, fontFace: FONT, color: C.accent5, bold: true });
s8.addText("EAR ECCN: 3E001, 3E002, EAR99\nITAR applicability flagging", { x: 0.6, y: 4.8, w: 2.7, h: 0.5, fontSize: 8, fontFace: FONT, color: C.textMuted });

s8.addShape(pres.shapes.RECTANGLE, { x: 3.6, y: 4.45, w: 2.8, h: 0.9, fill: { color: C.bgCard } });
s8.addText("Retention Policy", { x: 3.7, y: 4.5, w: 2.6, h: 0.3, fontSize: 10, fontFace: FONT, color: C.accent4, bold: true });
s8.addText("Auto-assigned per tier:\n7yr / 5yr / 3yr / 2yr / indefinite", { x: 3.7, y: 4.8, w: 2.6, h: 0.5, fontSize: 8, fontFace: FONT, color: C.textMuted });

s8.addShape(pres.shapes.RECTANGLE, { x: 6.6, y: 4.45, w: 2.9, h: 0.9, fill: { color: C.bgCard } });
s8.addText("PII Detection", { x: 6.7, y: 4.5, w: 2.7, h: 0.3, fontSize: 10, fontFace: FONT, color: C.accent6, bold: true });
s8.addText("Regex NER + Claude AI analysis\nGDPR/CCPA flagging", { x: 6.7, y: 4.8, w: 2.7, h: 0.5, fontSize: 8, fontFace: FONT, color: C.textMuted });

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 9: Data Model
// ═══════════════════════════════════════════════════════════════════════════
let s9 = pres.addSlide();
s9.background = { color: C.bg };
s9.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
s9.addText("Project-Centric Data Model", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });
s9.addText("PostgreSQL 16 — 13 tables with pgvector embeddings + HMAC-signed audit trail", { x: 0.5, y: 0.6, w: 9, h: 0.3, fontSize: 10, fontFace: FONT, color: C.textMuted });

const tables = [
  ["users", "projects", "project_members", "connectors"],
  ["connector_templates", "assets + embedding", "classification_decisions", "approval_queue"],
  ["policy_rules", "agent_runs", "audit_log (HMAC)", "event_log"],
  ["asset_relationships"],
];

tables.forEach((row, ri) => {
  row.forEach((t, ci) => {
    const x = 0.5 + ci * 2.35;
    const y = 1.05 + ri * 0.65;
    const isAudit = t.includes('audit');
    const isAsset = t.includes('asset') && !t.includes('relationship');
    s9.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.1, h: 0.5, fill: { color: isAudit ? C.accent5 : isAsset ? C.accent : C.bgCard, transparency: isAudit || isAsset ? 70 : 0 }, line: { color: C.border, width: 0.5 } });
    s9.addText(t, { x, y, w: 2.1, h: 0.5, fontSize: 9, fontFace: FONT_MONO, color: C.text, align: "center", valign: "middle" });
  });
});

// Lifecycle state machine
s9.addText("Asset Lifecycle State Machine", { x: 0.5, y: 3.8, w: 9, h: 0.35, fontSize: 12, fontFace: FONT, color: C.accent2, bold: true });
const states = ["DISCOVERED", "PARSING", "CLASSIFIED", "PENDING\nREVIEW", "APPROVED", "PUBLISHED"];
states.forEach((st, i) => {
  const x = 0.5 + i * 1.55;
  s9.addShape(pres.shapes.RECTANGLE, { x, y: 4.25, w: 1.3, h: 0.55, fill: { color: C.bgCard }, line: { color: C.accent2, width: 1 } });
  s9.addText(st, { x, y: 4.25, w: 1.3, h: 0.55, fontSize: 8, fontFace: FONT, color: C.text, align: "center", valign: "middle" });
  if (i < states.length - 1) {
    s9.addText("→", { x: x + 1.3, y: 4.25, w: 0.25, h: 0.55, fontSize: 14, color: C.accent2, align: "center", valign: "middle" });
  }
});

s9.addText("Immutable audit log: HMAC-SHA256 chain — each record's signature depends on the previous, creating tamper-evident history", {
  x: 0.5, y: 5.05, w: 9, h: 0.4, fontSize: 9, fontFace: FONT, color: C.accent5, align: "center"
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 10: Search & Intelligence
// ═══════════════════════════════════════════════════════════════════════════
let s10 = pres.addSlide();
s10.background = { color: C.bg };
s10.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent6 } });
s10.addText("Search & Intelligence Layer", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });

const intel = [
  { title: "Elasticsearch 8", desc: "Full-text search across extracted content\nFaceted filtering by domain, classification, zone\nHighlighted search results", color: C.accent4 },
  { title: "pgvector (1536-dim)", desc: "Semantic similarity search via cosine distance\nOpenAI embeddings or local TF-IDF vectors\nHNSW index for fast nearest-neighbor", color: C.accent },
  { title: "Neo4j 5 Knowledge Graph", desc: "Persistent cross-domain relationships\nCypher traversal queries (depth 1-4 hops)\nAuto-created SAME_PROJECT edges", color: C.accent3 },
  { title: "Claude NLQ", desc: "Natural language queries:\n\"show me all confidential PDFs from last week\"\nTranslates to structured filters automatically", color: C.accent2 },
  { title: "BullMQ Async Processing", desc: "5 queues: scan, parse, enrich, index, analyze\n4 worker types with configurable concurrency\nRetry with exponential backoff", color: C.accent5 },
];

intel.forEach((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 0.5 + col * 3.1;
  const y = 0.85 + row * 2.35;
  s10.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.85, h: 2.1, fill: { color: C.bgCard }, shadow: mkShadow() });
  s10.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.85, h: 0.05, fill: { color: item.color } });
  s10.addText(item.title, { x: x + 0.15, y: y + 0.15, w: 2.55, h: 0.35, fontSize: 11, fontFace: FONT, color: item.color, bold: true });
  s10.addText(item.desc, { x: x + 0.15, y: y + 0.55, w: 2.55, h: 1.4, fontSize: 9, fontFace: FONT, color: C.textMuted });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 11: Security & Auth
// ═══════════════════════════════════════════════════════════════════════════
let s11 = pres.addSlide();
s11.background = { color: C.bg };
s11.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent5 } });
s11.addText("Security & Authentication", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });

const secItems = [
  { title: "JWT Authentication", desc: "24-hour token expiry, refresh tokens, first user auto-Admin bootstrap", color: C.accent },
  { title: "5 RBAC Roles", desc: "Admin → Owner → Steward → Auditor → Viewer\nProject-level role assignment", color: C.accent2 },
  { title: "Role-Based UI", desc: "Sidebar navigation filtered by active role\nRole switcher dropdown for demo/testing", color: C.accent3 },
  { title: "HMAC Audit Trail", desc: "SHA-256 signed, append-only\nEvery action logged with actor, before/after state", color: C.accent5 },
  { title: "Webhook Notifications", desc: "Slack and Teams webhook integration\nSLA alerts, scan completion, GATED detection", color: C.accent4 },
  { title: "Credential Storage", desc: "PostgreSQL JSONB for connector configs\npgcrypto extension available for encryption", color: C.accent6 },
];

secItems.forEach((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 0.5 + col * 3.1;
  const y = 0.85 + row * 2.3;
  s11.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.85, h: 2.05, fill: { color: C.bgCard }, shadow: mkShadow() });
  s11.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: 2.05, fill: { color: item.color } });
  s11.addText(item.title, { x: x + 0.2, y: y + 0.15, w: 2.5, h: 0.35, fontSize: 12, fontFace: FONT, color: item.color, bold: true });
  s11.addText(item.desc, { x: x + 0.2, y: y + 0.55, w: 2.5, h: 1.3, fontSize: 9, fontFace: FONT, color: C.textMuted });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 12: Technology Stack
// ═══════════════════════════════════════════════════════════════════════════
let s12 = pres.addSlide();
s12.background = { color: C.bg };
s12.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
s12.addText("Technology Stack Summary", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 24, fontFace: FONT, color: C.text, bold: true });

const stackData = [
  ["AI / LLM", "Claude Sonnet 4 (Anthropic)", "Agent reasoning, NLQ, OCR, content analysis"],
  ["ASR", "OpenAI Whisper API", "Audio transcription (optional)"],
  ["Frontend", "React 18 + Vite + Tailwind", "SPA with real-time SSE events"],
  ["Backend", "Node.js 20 + Express", "70+ REST API endpoints"],
  ["Database", "PostgreSQL 16 + pgvector", "Primary store + 1536-dim vector embeddings"],
  ["Search", "Elasticsearch 8", "Full-text search + faceted filtering"],
  ["Graph", "Neo4j 5 Community", "Knowledge graph + Cypher traversal"],
  ["Queue", "BullMQ + Redis 7", "5 async queues, 4 worker types"],
  ["Storage", "MinIO (S3-compatible)", "Object store for files and artifacts"],
  ["Cloud SDKs", "AWS, Azure, Graph API", "OneDrive, SharePoint, S3, Blob connectors"],
  ["Parsers", "pdf-parse, mammoth, gdsii, xlsx", "Real content extraction across 5 domains"],
  ["Container", "Docker Compose", "7-service orchestration, single command"],
];

// Header
const headerRow = [
  { text: "Category", options: { bold: true, color: "FFFFFF", fill: { color: C.accent }, fontSize: 9, fontFace: FONT } },
  { text: "Technology", options: { bold: true, color: "FFFFFF", fill: { color: C.accent }, fontSize: 9, fontFace: FONT } },
  { text: "Purpose", options: { bold: true, color: "FFFFFF", fill: { color: C.accent }, fontSize: 9, fontFace: FONT } },
];

const tableRows = [headerRow, ...stackData.map((r, i) => r.map(cell => ({
  text: cell, options: { fontSize: 8, fontFace: FONT, color: C.text, fill: { color: i % 2 === 0 ? C.bgCard : C.bg } }
})))];

s12.addTable(tableRows, { x: 0.5, y: 0.7, w: 9, colW: [1.5, 3.5, 4], border: { pt: 0.5, color: C.border } });

// ═══════════════════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════════════════
pres.writeFile({ fileName: "C:\\Users\\swarupd\\Downloads\\CUDE_Technical_Architecture.pptx" })
  .then(() => console.log("✅ Presentation saved: CUDE_Technical_Architecture.pptx"))
  .catch(err => console.error("❌ Error:", err));
