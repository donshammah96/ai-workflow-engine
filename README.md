# Multi-Step AI Workflow Engine & Agent Orchestrator

[![CI Pipeline](https://github.com/donshammah96/ai-workflow-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/donshammah96/ai-workflow-engine/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![LangGraph](https://img.shields.io/badge/Orchestrator-LangGraph-orange)](https://langchain-ai.github.io/langgraphjs/)
[![Vercel AI SDK](https://img.shields.io/badge/Streaming-Vercel_AI_SDK-black)](https://sdk.vercel.ai/)
[![PostgreSQL 16 pgvector](https://img.shields.io/badge/Vector_DB-pgvector_16-blue?logo=postgresql)](https://github.com/pgvector/pgvector)

An enterprise-grade, stateful Multi-Step AI Agent Workflow Engine combining **LangGraph** cyclical DAG orchestration, deterministic **Zod**-guarded tool calling, **dual-tier memory management** (token-budgeted sliding window + `pgvector` hybrid semantic search with Reciprocal Rank Fusion), **Human-in-the-Loop (HITL) checkpoints**, and real-time **Generative UI** streaming via the **Vercel AI SDK**.

---

## Architecture Overview

```mermaid
stateDiagram-v2
    [*] --> MemoryEnrichment: User Prompt
    MemoryEnrichment --> Planner: Ingest Citations & Context
    Planner --> Executor: Structured Sub-Task DAG

    state Executor {
        [*] --> SelectStep
        SelectStep --> InspectTool
    }

    Executor --> HumanApprovalGate: Sensitive Tool?
    
    state HumanApprovalGate <<choice>>
    HumanApprovalGate --> AwaitingApproval: requiresApproval === true
    HumanApprovalGate --> ToolRunner: requiresApproval === false

    AwaitingApproval --> [*]: Yield Stream & Save Checkpoint
    AwaitingApproval --> ToolRunner: Operator Approves in UI

    ToolRunner --> CriticReflection: Validate Tool Outputs & Schemas
    
    state CriticReflection <<choice>>
    CriticReflection --> Executor: Incomplete (ReflectionCount < 3)
    CriticReflection --> Synthesizer: All Sub-Tasks Satisfied

    Synthesizer --> [*]: Grounded Response & Semantic Memory Update
```

---

## Key Architectural Highlights

### 1. LangGraph Plan-Execute-Reflect Stateful Orchestration
- Cyclical graph state management using typed annotations (`messages`, `plan`, `retrievedContext`, `reflectionCount`, `pendingApproval`, `telemetry`).
- Structured sub-task decomposition preventing prompt drift and hallucinated sequences.
- Critic reflection loop with backoff counters guaranteeing convergence.

### 2. Dual-Tier Memory Management
- **Tier 1 — Short-Term Context Trimming & Auto-Compaction:** Token-aware sliding window (`trimMessagesToTokenBudget`) guaranteeing system prompt and latest $K$ messages never exceed context limits. Automatic compaction after 15 conversation turns into `WorkflowThread.summary`.
- **Tier 2 — Long-Term pgvector Hybrid Memory:** 1536-dimensional semantic embeddings combined with PostgreSQL full-text search, fused via **Reciprocal Rank Fusion (RRF)**:
  $$\text{RRF}(d) = \sum_{m \in M} \frac{1}{60 + \text{rank}_m(d)}$$

### 3. Deterministic Tool Registry & Guardrails
- Unified `defineWorkflowTool` factory producing drop-in compatibility for both `@langchain/core/tools` and Vercel AI SDK `tool()`.
- Strict **Zod** schema validation on both tool inputs and outputs.
- Timeout enforcement (`AbortSignal`), automated retry policies, and persistent audit logging to `ToolExecutionAudit`.
- Out-of-the-box showcase tools:
  - `calculator_math_eval`: Deterministic symbolic and statistical evaluator.
  - `knowledge_base_rag`: pgvector hybrid retrieval with source citations.
  - `sandboxed_code_interpreter`: Isolated JavaScript execution in a Node `vm` context with execution timeouts.
  - `live_http_json_fetcher`: Safe external REST fetcher with domain allowlisting.
  - `production_action_webhook`: High-stakes external mutation enforcing Human-in-the-Loop gating.

### 4. Human-in-the-Loop (HITL) Checkpoints & Resumption
- Pauses the execution graph whenever a tool flagged with `requiresApproval: true` is triggered.
- State snapshot is persisted to PostgreSQL (`WorkflowCheckpoint` with `AWAITING_APPROVAL`).
- Generative UI displays an interactive authorization card with one-click **"Approve & Resume"** or **"Reject with Feedback"**, hitting `POST /api/workflows/[threadId]/resume`.

### 5. Vercel AI SDK Stream Multiplexing & Generative UI
- Bridges LangGraph updates directly to the frontend via data annotations protocol:
  - Node transitions (`node_transition`)
  - Live DAG plan checklist updates (`plan_update`)
  - Grounded RAG citations with similarity percentages (`rag_citations`)
  - Real-time Token & USD FinOps Ledger increments (`finops_telemetry`)
  - Operator approval requests (`approval_required`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Operator / Browser
    participant Studio as Studio Web (Next.js 15)
    participant Engine as LangGraph Orchestrator
    participant Tools as Tool Registry
    participant DB as PostgreSQL + pgvector

    User->>Studio: Prompt: "Deploy configuration to cluster"
    Studio->>Engine: POST /api/chat (streamWorkflowExecution)
    Engine->>Studio: data: node_transition { to: "planner" }
    Engine->>Studio: data: plan_update [Step 1: Code Eval, Step 2: Webhook]
    Engine->>Tools: Execute step 1 (sandboxed_code_interpreter)
    Tools-->>Engine: Step 1 Output
    Engine->>Engine: Step 2 requiresApproval === true
    Engine->>DB: Save WorkflowCheckpoint (AWAITING_APPROVAL)
    Engine-->>Studio: data: approval_required { tool: "production_action_webhook" }
    Studio-->>User: Render Generative UI Approval Card
    User->>Studio: Click "Approve & Resume Execution"
    Studio->>Engine: POST /api/workflows/[id]/resume (action: "APPROVE")
    Engine->>Tools: Execute production_action_webhook
    Engine->>DB: Update Checkpoint (COMPLETED)
    Engine->>Studio: Stream synthesized grounded response
```

---

## Monorepo Structure

```text
ai-workflow-engine/
├── .github/workflows/ci.yml         # GitHub Actions CI with pgvector & Redis services
├── apps/
│   └── studio-web/                  # Next.js 15 App Router: 3-pane Generative UI Studio
├── packages/
│   ├── workflow-engine/             # LangGraph state machine, HITL engine & stream bridge
│   ├── memory-store/                # Token trimmer, auto-compactor & pgvector RRF retriever
│   ├── tool-registry/               # Deterministic Zod tools (Math, RAG, VM, HTTP, Webhook)
│   ├── database/                    # Prisma schema, pgvector migrations & FinOps repositories
│   └── config/                      # Shared TS, ESLint, Tailwind configurations
├── docker/
│   └── docker-compose.yml           # pgvector/pgvector:pg16 & Redis 7
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## Quickstart & 1-Command Local Setup

### Prerequisites
- Node.js `20.x` or `22.x`
- `pnpm` (`11.5.x` or later)
- Docker & Docker Compose (optional for local PostgreSQL/pgvector and Redis)

### 1. Clone & Install
```bash
git clone https://github.com/donshammah96/ai-workflow-engine.git
cd ai-workflow-engine
pnpm install
```

### 2. Start Infrastructure (Optional)
```bash
# Spins up pgvector and Redis
pnpm run docker:up

# Generate Prisma client and sync schema
pnpm run db:generate
pnpm run db:push
```

### 3. Environment Variables
Create `.env` at root or pass environment variables:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_workflow?schema=public"

# Zero-Config Demo Mode (Runs deterministic Mock Agent with zero paid keys):
USE_MOCK_LLM=true

# Or provide real production provider keys:
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_GENERATIVE_AI_API_KEY="AIza..."
```

### 4. Run Development Studio
```bash
pnpm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** to experience the full three-pane AI Workflow Studio!

---

## Testing & CI Verification

The test suite runs deterministic Vitest integration tests covering cyclical DAG routing, short-term token trimming, Reciprocal Rank Fusion, Zod guardrails, and full Human-in-the-Loop checkpoints:

```bash
# Run unit & integration test suites
pnpm run test

# Run TypeScript typechecks across all monorepo packages
pnpm run typecheck

# Build all packages & apps
pnpm run build
```

---

## License
MIT © [Don Shammah](mailto:donshammah1@gmail.com)
