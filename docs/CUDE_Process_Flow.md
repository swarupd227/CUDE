# CUDE Platform — Discovery to Knowledge Graph Process Flow

## Architecture Overview

CUDE operates as a **7-service Docker platform** with an AI-augmented, evidence-driven discovery pipeline. Data flows through 8 processing stages — from raw file/database discovery to a navigable knowledge graph with semantic relationships.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUDE Platform Architecture                      │
│                                                                         │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌────────┐ │
│  │PostgreSQL│   │   Neo4j  │   │Elastic   │   │ Redis  │   │ MySQL  │ │
│  │+ pgvector│   │Knowledge │   │search    │   │Events &│   │Demo DB │ │
│  │Metadata  │   │Graph     │   │Full-text │   │Cache   │   │Adventur│ │
│  │Store     │   │Store     │   │Index     │   │        │   │eWorks  │ │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └───┬────┘   └───┬────┘ │
│       │              │              │              │             │      │
│  ┌────┴──────────────┴──────────────┴──────────────┴─────────────┴───┐ │
│  │                     Node.js API Gateway                           │ │
│  │  Connectors │ Parsers │ Policy Engine │ AI Agents │ Graph Service │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│       │                                                                │
│  ┌────┴──────────────────────────────────────────────────────────────┐ │
│  │                      React Frontend                               │ │
│  │  Dashboard │ Catalog │ Knowledge Graph │ Data Explorer │ Glossary │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Connector Configuration

**What happens:** A data steward configures one or more data source connectors within a governance project.

**Components involved:**
- **Frontend:** ProjectDetail.jsx — Connector configuration cards with type-specific fields
- **Backend:** projects.js — Stores connector config in PostgreSQL `connectors` table
- **Database:** PostgreSQL — Persists connection credentials, scan paths, authentication tokens

**Supported sources:**
| Category | Connectors |
|----------|-----------|
| File Systems | Local Filesystem, NAS/SMB |
| Microsoft 365 | OneDrive, SharePoint |
| Cloud Storage | AWS S3, Azure Blob Storage |
| Databases | MySQL, PostgreSQL, Snowflake*, Databricks* |
| Collaboration | Atlassian Confluence* |

Each connector has a per-project **ON/OFF toggle** for selective discovery — only enabled connectors participate when "Run Discovery" is triggered.

---

## Stage 2: Data Discovery (Scan)

**What happens:** The Pipeline Orchestrator walks each configured data source, identifies files/tables, and dispatches them to domain-specific parsers.

**Components involved:**
- **Frontend:** ProjectDetail.jsx — "Run Discovery" button, real-time SSE progress feed
- **Backend:** connectors.js — Per-connector scan endpoints, file system walker
- **Services:** connectorService.js — `scanDirectory()` with recursive traversal, delta detection
- **Infrastructure:** Redis — Event bus for real-time Server-Sent Events (SSE)

**Key mechanism — Incremental Scanning:**
```
For each file found:
  SHA-256 hash of content → first 16 chars as content_hash
  Check: does this hash already exist in catalog?
    YES → Skip (file unchanged since last scan)
    NO  → Process as new/modified asset
```

This ensures re-scans are 10-100x faster — only new or modified files are processed.

**For structured data (MySQL/PostgreSQL):**
```
Query INFORMATION_SCHEMA.TABLES → discover all tables
Query INFORMATION_SCHEMA.COLUMNS → discover all columns, types, PKs
Query INFORMATION_SCHEMA.KEY_COLUMN_USAGE → discover foreign keys
Each table becomes an asset with STRUCTURED_DATA domain
```

---

## Stage 3: Content Parsing

**What happens:** Each discovered file is parsed by a domain-specific parser that extracts structured metadata, text content, and entities.

**Components involved:**
- **Backend:** domainParsers.js — 15+ parsers across 6 content domains
- **Libraries:** pdf-parse, mammoth, xlsx, adm-zip, music-metadata, gdsii, dxf-parser

**Domain parsing pipeline:**

| Domain | Parser | Metadata Extracted |
|--------|--------|--------------------|
| PDF Document | pdf-parse | Page count, text content, OCR detection, entity extraction |
| Office Document | mammoth + xlsx + ZIP/XML | Author, word count, tracked changes, hidden slides, formulas |
| Electronic Circuit | gdsii + text parsers | Cell hierarchy, module names, device counts, technology node |
| Audio Recording | music-metadata | Duration, format, bitrate, sample rate, artist/title |
| Video Content | ffprobe | Duration, codec, resolution, frame rate |
| Database Table | INFORMATION_SCHEMA | Columns, types, PKs, FKs, row count, data quality scores |

**Entity extraction** from parsed content identifies:
- Email addresses
- Part numbers / model numbers
- Dates and time references
- Cross-reference hints (citations, references)

These entities are critical for relationship discovery in Stage 7.

---

## Stage 4: AI-Powered Classification

**What happens:** Each asset is classified into one of 5 sensitivity tiers using an evidence-based scoring system that combines content signals, policy rules, and business glossary terms.

**Components involved:**
- **Backend:** policyEngine.js — Signal inference, rule evaluation, confidence scoring
- **Backend:** policyEngine.js → `matchGlossaryTerms()` — Business glossary signal injection
- **Database:** PostgreSQL — `policy_rules` table (global + project-specific rules)
- **Database:** PostgreSQL — `business_terms` table (glossary with related_signals)

**Classification pipeline:**

```
Step 1: SIGNAL INFERENCE
  Filename patterns → signals (e.g., "tapeout" → tapeout_schedule)
  Content patterns  → signals (e.g., "confidential" → product_roadmap)
  Domain defaults   → signals (e.g., AUDIO → internal_procedure)
  Table name patterns → signals (e.g., "customer_sales" → internal_pricing)

Step 2: GLOSSARY SIGNAL INJECTION
  For each business glossary term:
    If term/synonyms found in asset content:
      Inject term's related_signals into signal list
  Example: Glossary term "Tapeout" (related_signal: tapeout_schedule)
           → File containing "tapeout" gets tapeout_schedule signal injected

Step 3: POLICY RULE EVALUATION
  13 global rules + N project-specific rules, sorted by priority
  Each rule: IF signals INCLUDE [signal_list] → RECOMMEND tier
  Highest-tier match wins
  Example: R-01: [die_cost_data] → TRADE_SECRET
           R-14: [tapeout_schedule + customer_nda] → RESTRICTED

Step 4: CONFIDENCE SCORING (6 evidence factors)
  +0.50 base (file exists and was parsed)
  +0.12 if real parser used (not metadata-only)
  +0.18 if 3+ classification signals matched
  +0.13 if multiple policy rules triggered
  +0.08 if strong filename keyword match
  +0.05 if high parse quality score
  Result: 0.45 to 0.97 range (never reaches 1.0)

Step 5: GOVERNANCE ZONE ASSIGNMENT
  TRADE_SECRET         → GATED (always requires legal approval)
  Confidence ≥ 90%     → AUTONOMOUS (auto-approved)
  Confidence 70-89%    → SUPERVISED (data steward review within 48h SLA)
  Confidence < 70%     → PENDING_REVIEW (escalated for manual classification)
```

**Key principle:** The system is AI-ASSISTED, not AI-AUTONOMOUS. High-sensitivity classifications always require human approval.

---

## Stage 5: Multi-Store Persistence

**What happens:** Each classified asset is persisted to 4 storage systems simultaneously, each optimized for a different query pattern.

**Components involved:**
- **PostgreSQL** — Full asset record with 30+ fields (source of truth)
- **Neo4j** — Graph node with domain, classification, confidence (relationship queries)
- **Elasticsearch** — Full-text index with extracted content (search & discovery)
- **pgvector** — 1536-dimensional semantic embedding (similarity search)

```
Asset Created
  │
  ├──→ PostgreSQL: INSERT INTO assets (...) — Full metadata record
  │
  ├──→ Neo4j: MERGE (a:Asset {id}) SET properties — Graph node
  │    └──→ MERGE (a)-[:BELONGS_TO]->(p:Project) — Project edge
  │
  ├──→ Elasticsearch: indexAsset() — Full-text searchable
  │    (file_name^3, extracted_text^2, ai_summary, entities, topics)
  │
  └──→ pgvector: embedAsset() — Semantic vector
       (fileName + domain + project + textPreview → 1536-dim vector)
```

**For structured data (SQL tables):**
- Same 4-store persistence
- Additionally: FK relationships auto-created as `FOREIGN_KEY` edges in Neo4j

---

## Stage 6: Approval Workflow

**What happens:** Assets in SUPERVISED or GATED zones are queued for human review. Data stewards approve, reject, or escalate classifications.

**Components involved:**
- **Frontend:** ApprovalQueue.jsx — Priority-sorted queue with reasoning display
- **Backend:** api.js — Queue endpoints with SLA tracking
- **Database:** PostgreSQL — `approval_queue` table with status tracking

```
AUTONOMOUS zone assets → Auto-approved, no human action needed
SUPERVISED zone assets → Queued for data steward (48h SLA)
GATED zone assets      → Queued for legal team (24h SLA, CRITICAL priority)
PENDING_REVIEW assets  → Escalated, requires manual classification
```

Each queue item includes:
- The AI's classification rationale (ReAct reasoning steps)
- Matched policy rules with descriptions
- Confidence score breakdown
- One-click approve/reject/escalate actions

---

## Stage 7: Knowledge Graph Construction

**What happens:** Three layers of relationships are discovered and persisted to build the knowledge graph — the core differentiator of the platform.

**Components involved:**
- **Backend:** graphService.js — Neo4j operations
- **Backend:** claudeService.js → `investigate()` — AI relationship discovery
- **Backend:** connectors.js → `runPostScanDiscovery()` — Automated post-scan pipeline
- **Database:** Neo4j — Graph storage, Cypher queries
- **Database:** PostgreSQL — `asset_relationships` table (dual-write for durability)

**Three relationship discovery layers:**

### Layer 1: Entity-Based Relationships (Automatic)
```
Build entity index from all assets:
  - Extract part numbers, emails, dates, cross-references
  - For each entity appearing in 2+ assets:
    → Create SHARES_ENTITY relationship (confidence: 0.7)
    → Write to both Neo4j AND PostgreSQL

Example: Part number "XYZ-123" found in both "spec.pdf" and "schematic.gds"
         → SHARES_ENTITY edge with evidence "Shared: XYZ-123"
```

### Layer 2: AI Semantic Relationships (Claude Investigator)
```
For up to 5 assets per scan (2 per domain):
  - Claude analyzes target asset + 12 candidate assets from same project
  - Claude proposes relationship type, confidence, and rationale
  - Relationship types: DOCUMENTS_CIRCUIT, DISCUSSES_DESIGN,
    PRESENTS_DESIGN, REFERENCES_IP, DERIVED_FROM
  - Dual-write to Neo4j + PostgreSQL

Example: Claude determines "Q2_Roadmap.pptx" PRESENTS_DESIGN for "alu_top.v"
         → PRESENTS_DESIGN edge (confidence: 0.85)
```

### Layer 3: Structural Relationships (Schema-Derived)
```
For SQL database connectors:
  - Foreign key constraints → FOREIGN_KEY edges (confidence: 1.0)
  - All table assets linked to same project via BELONGS_TO

For all connectors:
  - SAME_PROJECT edges between cross-domain assets
  - TAGGED_WITH edges linking assets to glossary :Concept nodes
```

**Resulting graph structure:**
```
(:Asset)-[:DOCUMENTS_CIRCUIT]->(:Asset)     — semantic (AI-discovered)
(:Asset)-[:SHARES_ENTITY]->(:Asset)         — entity co-occurrence
(:Asset)-[:FOREIGN_KEY]->(:Asset)           — schema-derived (SQL)
(:Asset)-[:TAGGED_WITH]->(:Concept)         — glossary linkage
(:Asset)-[:BELONGS_TO]->(:Project)          — organizational
```

---

## Stage 8: Knowledge Graph Exploration

**What happens:** Users interact with the knowledge graph through a 3-panel explorer with real-time statistics, path finding, and impact analysis.

**Components involved:**
- **Frontend:** Investigation.jsx — Force-directed SVG graph with circle nodes
- **Backend:** graphService.js — 15 Neo4j query functions
- **Backend:** api.js — 8 graph API endpoints
- **Database:** Neo4j — Graph traversal queries

**Visualization features:**
- Force-directed layout engine (pure JavaScript, 120 iterations, 15000 repulsion)
- Circle nodes colored by domain (6 colors from ontology schema)
- Edge curves with auto-rotating labels and abbreviations
- Depth selector: 1 (hubs only) → 2 (all connected) → 3 (everything)

**Graph intelligence (left panel):**
- **Statistics:** Node count, edge count, density, average degree, orphan count
- **Hub Assets:** Most connected nodes ranked by degree centrality
- **Orphaned Assets:** Assets with no semantic relationships (candidates for investigation)

**Interactive analysis (right panel — appears on node selection):**
- **Path Finder:** Shortest path between any two assets via semantic edges
- **Impact Analysis:** "If this asset changes, what's affected?" — multi-hop downstream traversal
- **Investigate:** Trigger Claude AI to discover new relationships for selected asset
- **Create Relationship:** Manual relationship creation with type selector and confidence

**NLQ integration:**
- "What are the related assets for tapeout.pdf?" → queries Neo4j for semantic relationships
- "Show all database tables" → filters catalog by STRUCTURED_DATA domain
- "Top 10 products by revenue" → routes to SQL NLQ engine for live query execution

---

## Technical Component Summary

| Component | Technology | Role in Pipeline |
|-----------|-----------|-----------------|
| **Pipeline Orchestrator** | Node.js + Express | Coordinates scan → parse → classify → persist flow |
| **Domain Parsers** | pdf-parse, mammoth, xlsx, gdsii | Extract structured metadata from raw files |
| **Policy Engine** | Custom rule engine | Signal inference → rule evaluation → confidence scoring |
| **Business Glossary** | PostgreSQL + AI generation | Domain vocabulary that influences classification signals |
| **Classification Arbiter** | Claude Sonnet + rule fallback | AI-assisted classification with human-in-the-loop governance |
| **Relationship Investigator** | Claude Sonnet + entity matching | Discovers semantic cross-domain relationships |
| **Knowledge Graph** | Neo4j + force-directed SVG | Stores and visualizes asset relationships |
| **Search Engine** | Elasticsearch 8 | Full-text search with faceted filtering |
| **Semantic Search** | pgvector (PostgreSQL) | Vector similarity for "find similar assets" |
| **Event Bus** | Redis pub/sub + SSE | Real-time progress streaming to frontend |
| **Audit System** | PostgreSQL + HMAC-SHA256 | Tamper-evident logging of all governance actions |
| **NLQ Engine** | Claude Sonnet | Natural language → structured query translation |
| **SQL Connector** | mysql2 + INFORMATION_SCHEMA | Schema discovery + NLQ-to-SQL for structured data |
| **Ontology Schema** | PostgreSQL + dynamic UI | Configurable entity types and relationship types |

---

## Data Flow Diagram — Single Asset Journey

```
File: "Q2_2026_Tapeout_Schedule.pdf" (2.4 MB)
│
├─ Stage 1: DISCOVER
│  Connector: Local Filesystem → /data/scan/Test/
│  SHA-256: a7f2c9... (new file, not in catalog)
│
├─ Stage 2: PARSE
│  Parser: pdf-parse (real extraction)
│  Extracted: 12 pages, 4,200 words, text layer present
│  Entities: ["tapeout", "Q2 2026", "DDR5 PHY", "john@company.com"]
│  Quality: 0.87
│
├─ Stage 3: CLASSIFY
│  Signals: [tapeout_schedule, product_roadmap] (from filename + content)
│  Glossary: "Tapeout" matched → injected tapeout_schedule signal
│  Rules matched: R-14 (RESTRICTED), R-30 (CONFIDENTIAL)
│  Highest tier: RESTRICTED
│  Confidence: 0.92 (real parser + 2 signals + 2 rules + strong keyword)
│  Zone: AUTONOMOUS (≥ 0.90)
│
├─ Stage 4: PERSIST
│  PostgreSQL: Asset record with 30+ fields
│  Neo4j: :Asset node with 9 properties
│  Elasticsearch: Indexed (text_preview, entities, topics)
│  pgvector: 1536-dim embedding computed
│
├─ Stage 5: AUTO-TAG
│  Glossary terms matched: ["Tapeout", "DDR5 PHY"]
│  Tags applied: 2 (tag_type: glossary)
│  Neo4j: (Asset)-[:TAGGED_WITH]->(Concept:Tapeout)
│
├─ Stage 6: RELATIONSHIP DISCOVERY
│  Entity match: "DDR5 PHY" also in "phy_spec.docx"
│    → SHARES_ENTITY edge (confidence: 0.7)
│  Claude Investigator: Proposes REFERENCES_IP to "ip_core_v3.gds"
│    → REFERENCES_IP edge (confidence: 0.82)
│
└─ Stage 7: KNOWLEDGE GRAPH
   Node: Orange circle "Q2_2026_Tape..." in graph
   Edges: 2 semantic relationships visible
   Stats: +1 node, +2 edges, density recalculated
   Searchable: "tapeout" → highlights this node + neighbors
```

---

*CUDE Platform v3.0 — Agentic Data Governance · Powered by Claude AI*
