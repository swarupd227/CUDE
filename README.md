# CUDE Enterprise

**Configurable Universal Discovery Engine** — An AI-powered, agentic data governance platform that unifies structured and unstructured data discovery across the enterprise.

[![Platform](https://img.shields.io/badge/platform-docker-blue)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-20-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19-61dafb)](https://react.dev/)
[![Claude AI](https://img.shields.io/badge/AI-Claude%20Sonnet-purple)](https://www.anthropic.com/)
[![License](https://img.shields.io/badge/license-Enterprise-orange)](#)

---

## What is CUDE?

CUDE turns disconnected data silos into a **machine-navigable, AI-ready intelligence fabric**. It discovers data across files, cloud storage, databases, and collaboration tools — then classifies, links, and governs it through a living knowledge graph.

Unlike traditional data catalogs that focus on structured data, CUDE provides:
- **Cross-domain intelligence** linking your Snowflake tables to SharePoint presentations to circuit designs
- **AI-powered classification** with evidence-based confidence scoring and human-in-the-loop governance
- **Configurable ontology** that evolves with your business
- **Natural language exploration** — "Show me documents related to the Tapeout schedule"

---

## Key Features

### Discovery
- **10 connector types**: Local Filesystem, OneDrive, SharePoint, AWS S3, Azure Blob, MySQL, PostgreSQL, Snowflake, Databricks, Confluence
- **15+ real domain parsers** across 6 content domains (PDF, Office, Audio, Video, Electronic Circuit/EDA, Database Tables)
- **Incremental scanning** with SHA-256 delta detection — 10-100x faster on re-scans

### Intelligence
- **10 specialized AI agents** with ReAct (Reason + Act) reasoning pattern
- **Living Knowledge Graph** powered by Neo4j with auto-discovered semantic relationships
- **Force-directed graph visualization** with path finding, impact analysis, and N-hop neighborhood exploration
- **Natural Language Queries** for both unstructured search and SQL generation

### Governance
- **5-tier sensitivity classification** (PUBLIC → INTERNAL → CONFIDENTIAL → RESTRICTED → TRADE_SECRET)
- **4 governance zones** (AUTONOMOUS, SUPERVISED, GATED, PENDING_REVIEW) with SLA tracking
- **Evidence-based confidence scoring** across 6 factors — never autonomous on TRADE_SECRET
- **Tamper-evident audit trail** with HMAC-SHA256 chain verification
- **ITAR/ECCN export control** and **PII detection** built-in

### Configurability
- **Ontology Schema Editor** — define custom entity types and relationship types via UI
- **Industry templates** — pre-built configurations for Semiconductor, Pharmaceutical, Financial Services
- **AI-generated Business Glossary** with company/industry context
- **Project-scoped policy rules** with global rule inheritance

### Data Explorer
- **Schema browser** with table/column metadata, PKs, FKs, data quality scores
- **NLQ-to-SQL** powered by Claude — type plain English, get optimized SQL with results
- **Interactive results** — sortable tables, auto-generated charts, CSV/JSON export
- **Edit & Re-run** SQL with syntax highlighting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (React 19 + Vite)                     │
│  Dashboard │ Catalog │ Knowledge Graph │ Data Explorer │ Glossary   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                  Node.js API Gateway (Express)                      │
│   Connectors · Parsers · Policy Engine · AI Agents · Graph Service  │
└─┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────┘
  │          │          │          │          │          │
┌─▼────┐  ┌──▼────┐  ┌──▼────┐  ┌──▼────┐  ┌──▼────┐  ┌──▼─────┐
│Postgr│  │ Neo4j │  │Elastic│  │ Redis │  │ MinIO │  │ MySQL  │
│eSQL +│  │Knowle │  │search │  │Events │  │S3-API │  │AdvWrks │
│pgvect│  │dge    │  │Search │  │& Cache│  │Storage│  │Demo DB │
│      │  │Graph  │  │       │  │       │  │       │  │        │
└──────┘  └───────┘  └───────┘  └───────┘  └───────┘  └────────┘
```

---

## Quick Start

### Prerequisites
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- 8 GB RAM minimum (16 GB recommended)
- Optional: Anthropic API key for AI features

### Run with Docker Compose

```bash
# Clone the repository
git clone https://github.com/swarupd227/CUDE.git
cd CUDE

# Create environment file (optional — defaults work for local demo)
cp .env.example .env
# Edit .env to add ANTHROPIC_API_KEY for AI features

# Start the platform
docker compose up -d

# Wait ~60 seconds for all services to be healthy
# Open http://localhost:3001 in your browser
```

### First-Time Setup
1. Register an account on the login page (first user becomes Admin)
2. Navigate to **Projects** → Create a new project (or use the demo project)
3. Go to **Connector Library** → Add a MySQL connector → Use the "AdventureWorks (Demo MySQL)" template
4. Open the project → Click **Run Discovery**
5. Explore the discovered assets in **Asset Catalog**, **Knowledge Graph**, and **Data Explorer**

---

## Tech Stack

**Backend**
- Node.js 20 + Express
- PostgreSQL 16 with pgvector extension (metadata + semantic embeddings)
- Neo4j 5 (knowledge graph)
- Elasticsearch 8 (full-text search)
- Redis 7 (event bus + cache)
- MinIO (S3-compatible object storage)
- BullMQ (job queue)
- Anthropic Claude Sonnet 4 (AI agents)

**Frontend**
- React 19 + Vite
- Tailwind CSS
- Lucide Icons
- Custom force-directed graph layout (no external graph libraries)

**Connectors**
- `@aws-sdk/client-s3`, `@azure/storage-blob` (cloud storage)
- `mssql`, `mysql2`, `pg` (databases)
- Microsoft Graph API (OneDrive, SharePoint)
- `pdf-parse`, `mammoth`, `xlsx`, `music-metadata`, `adm-zip` (file parsing)

---

## Process Flow

```
Connector Config → Discovery → Parsing → Classification → Persistence
                                                              │
                                                              ▼
                                                    Knowledge Graph
                                                    ↓ ↓ ↓
                                       Entity-Based · AI Semantic · Structural
                                                              │
                                                              ▼
                                              Interactive Exploration
                                          (Path Finding, Impact Analysis, NLQ)
```

See [docs/CUDE_Process_Flow.md](docs/CUDE_Process_Flow.md) for the complete end-to-end technical trace.

---

## Use Cases

- **Semiconductor / EDA**: Discover Tapeout documents, classify IP cores, link circuit designs to specifications and customer NDAs
- **Pharmaceutical**: Track clinical trial data, regulatory filings, FDA submissions across documents and databases
- **Financial Services**: Govern trading algorithms, KYC documents, risk reports with cross-domain lineage
- **General Enterprise**: Unified catalog for SharePoint + S3 + Snowflake + Databricks with semantic search

---

## Key Differentiators

| vs. Traditional Data Catalogs | CUDE |
|---|---|
| Structured data only | Structured + unstructured + cross-domain graph |
| Manual tagging | AI-powered classification with confidence scoring |
| Fixed taxonomy | Configurable ontology + AI-generated glossary |
| Lineage limited to ETL | Semantic + entity-based + AI-discovered relationships |
| Cloud-specific | Docker — runs anywhere (on-prem, any cloud) |
| Per-seat licensing | Self-hosted, infrastructure cost only |

---

## Roadmap

**Completed**
- ✅ 10 connector types with project-scoped governance
- ✅ AI-powered classification with evidence scoring
- ✅ Living knowledge graph with semantic relationships
- ✅ Configurable ontology schema + industry templates
- ✅ Natural language queries (unstructured + SQL)
- ✅ Data Explorer with schema browser + auto-charting
- ✅ Approval queue with SLA tracking
- ✅ HMAC-chained audit trail

**Phase 4 — Enterprise Hardening**
- 🔲 Kubernetes deployment with horizontal auto-scaling
- 🔲 Credential encryption at rest (AES-256-GCM)
- 🔲 PostgreSQL row-level security
- 🔲 SSO/SAML 2.0 integration
- 🔲 Prometheus metrics + Grafana dashboards
- 🔲 OpenTelemetry distributed tracing

**Phase 5 — Advanced Analytics**
- 🔲 Column-level data lineage
- 🔲 ML-powered link prediction
- 🔲 Community detection (Louvain algorithm)
- 🔲 Real-time WebSocket graph updates

---

## Documentation

- [Architecture & Process Flow](docs/CUDE_Process_Flow.md) — Complete end-to-end technical trace
- [Deployment Guide](DEPLOY.md) — Production deployment instructions

---

## License

Enterprise — Contact for licensing details.

---

*CUDE Platform v3.0 — Agentic Data Governance · Powered by Claude AI*
