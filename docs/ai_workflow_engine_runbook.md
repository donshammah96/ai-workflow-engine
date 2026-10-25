# AGENT EXECUTION RUNBOOK: Multi-Step AI Workflow Engine & Agent Orchestrator

**Target Repository:** `https://github.com/donshammah96/ai-workflow-engine`  
**Objective:** Architect, implement, test, and document a production-grade AI Workflow Engine combining LangChain / LangGraph stateful multi-step orchestration, deterministic tool calling, dual-tier memory management (short-term sliding window + long-term pgvector semantic memory), human-in-the-loop interrupts, and real-time generative UI streaming via the Vercel AI SDK.

---

## 1. Architectural Standards & Tech Stack

You must strictly adhere to the following stack and engineering constraints:

- **Monorepo Management:** `pnpm` workspaces + `Turborepo`.
- **Language & Framework:** TypeScript 5.x (`strict: true`), Next.js 15 (App Router, Server Actions, Edge/Node Route Handlers), React 19.
- **Orchestration & LLM Pipeline:**
  - `@langchain/langgraph` & `@langchain/core` for cyclical/DAG stateful graph orchestration, conditional routing, and state checkpointing.
  - **Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`)** for unified model switching, `createDataStreamResponse`, real-time token + tool-call state streaming, and Generative UI components.
- **Database & Vector Memory:** PostgreSQL 16 with `pgvector` extension + Prisma ORM (storing conversation threads, LangGraph state checkpoints, token cost ledgers, and 1536-dim/768-dim semantic embeddings).
- **Caching & Rate Limiting:** Redis (sliding-window token bucket rate limiter + semantic prompt cache).
- **Validation & Guardrails:** Zod for strict deterministic tool input/output schemas and structured output parsing.
- **Observability:** OpenTelemetry + LangSmith-compatible trace hooks + built-in Token & Cost FinOps Ledger.
- **Testing:** Vitest for deterministic graph node unit tests (with mocked LLM responses) and Playwright for streaming UI tests.

---

## 2. Target Monorepo Directory Structure

Initialize and scaffold the exact structure below:

```text
ai-workflow-engine/
├── .github/workflows/ci.yml
├── apps/
│   └── studio-web/              # Next.js 15 App Router UI: Workflow Canvas, Streaming Chat, Trace Inspector
├── packages/
│   ├── workflow-engine/         # LangGraph state machines, node runners, HITL checkpointing, Vercel AI stream bridge
│   ├── memory-store/            # Short-term token trimmer, semantic auto-summarizer, pgvector RAG retriever
│   ├── tool-registry/           # Deterministic Zod-validated tools (WebSearch, SandboxedJS, SQLQuery, HTTPFetch)
│   ├── database/                # Prisma schema + pgvector migrations + checkpoint & FinOps repositories
│   └── config/                  # Shared TS, ESLint, Tailwind configurations
├── docker/
│   └── docker-compose.yml       # pgvector/pgvector:pg16, Redis 7
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 3. Step-by-Step Implementation Phases

### Phase 1: Workspace Initialization & Vector Infrastructure (`docker/` & `packages/database`)

1. Initialize Git, `pnpm-workspace.yaml`, and `turbo.json`.
2. Create `docker/docker-compose.yml` running:
   - `pgvector/pgvector:pg16` (Port `5432`)
   - `redis:7-alpine` (Port `6379`)
3. Initialize `packages/database` with Prisma (`previewFeatures = ["postgresqlExtensions"]`) and enable `extensions = [vector]`.
4. Define the core Prisma models:
   - `WorkflowThread`: `id`, `title`, `workflowType`, `metadata (Json)`, `summary (String?)`, `totalTokens (Int)`, `totalCostUsd (Float)`, `createdAt`, `updatedAt`.
   - `WorkflowCheckpoint`: `id`, `threadId`, `stepNumber`, `nodeName`, `stateSnapshot (Json)`, `status (RUNNING | AWAITING_APPROVAL | COMPLETED | FAILED)`, `createdAt`.
   - `MemoryChunk`: `id`, `threadId`, `Namespace`, `content`, `metadata (Json)`, `embedding Unsupported("vector(1536)")`, `createdAt`.
   - `ToolExecutionAudit`: `id`, `threadId`, `stepId`, `toolName`, `args (Json)`, `result (Json)`, `latencyMs`, `status`, `requiresApproval (Boolean)`, `approvedBy (String?)`, `createdAt`.
5. Create a raw SQL helper in `packages/database` for cosine similarity search (`1 - (embedding <=> $1::vector) AS similarity`) with metadata filtering.

### Phase 2: Dual-Tier Memory Architecture (`packages/memory-store`)

1. **Tier 1 — Short-Term Context Window Manager:**
   - Implement a token-aware sliding window trimmer (`trimMessagesToTokenBudget`) that guarantees the system prompt and the latest $K$ messages never exceed the configured model context budget.
   - Implement **Automatic Context Compaction**: When a thread exceeds 15 turns, asynchronously invoke a lightweight LLM summarizer to compress older messages into `WorkflowThread.summary` while preserving key entities and decisions.
2. **Tier 2 — Long-Term Semantic & Episodic Memory (`pgvector`):**
   - Implement `SemanticMemoryManager` with `remember(threadId, text, metadata)` and `recall(query, topK, threshold)` using embeddings.
   - Implement a **Hybrid Retriever** combining dense vector cosine similarity with PostgreSQL full-text keyword search (`tsvector`), fused via Reciprocal Rank Fusion (RRF).

### Phase 3: Deterministic Tool Registry & Guardrails (`packages/tool-registry`)

1. Build a unified `defineWorkflowTool` factory that wraps tools so they are simultaneously compatible with `@langchain/core/tools` (`StructuredTool`) and the Vercel AI SDK (`tool()`).
2. Every tool must include:
   - Strict Zod `inputSchema` and `outputSchema`.
   - `requiresApproval: boolean` flag (for Human-in-the-Loop gating on sensitive side effects).
   - Timeout enforcement (`AbortSignal.timeout(ms)`), retry policy, and automatic audit logging to `ToolExecutionAudit`.
3. Implement 5 showcase tools out-of-the-box:
   - `calculator_math_eval`: Deterministic symbolic & statistical expression evaluator.
   - `knowledge_base_rag`: Queries the `pgvector` hybrid retriever with source citations.
   - `sandboxed_code_interpreter`: Executes isolated JavaScript snippets in a Node `vm` context with strict memory/time limits to analyze JSON/CSV data.
   - `live_http_json_fetcher`: Fetches external REST APIs with domain allowlisting and schema extraction.
   - `production_action_webhook` (`requiresApproval: true`): Simulates a high-stakes external mutation (e.g., deploying a config or issuing a refund) that pauses the graph until the user clicks "Approve" in the UI.

### Phase 4: LangGraph Multi-Step Orchestration Engine (`packages/workflow-engine`)

1. Define the typed LangGraph `Annotation.Root` state (`WorkflowState`):
   - `messages`: Append-only message reducer.
   - `plan`: Array of structured sub-tasks (`id`, `description`, `assignedAgent`, `status`, `result`).
   - `retrievedContext`: Citations from `pgvector`.
   - `reflectionCount`: Counter preventing infinite self-correction loops (max 3).
   - `pendingApproval`: Nullable tool call awaiting human sign-off.
   - `telemetry`: Per-node latency and token usage metrics.
2. Implement the **Plan-Execute-Reflect Stateful Graph** with the following nodes and conditional edges:
   - `memory_enrichment_node`: Recalls relevant episodic memories and compacts history if needed.
   - `planner_node`: Uses structured output (`generateObject` / `.withStructuredOutput(PlanSchema)`) to decompose complex prompts into a multi-step execution DAG.
   - `executor_node`: Invokes the LLM with bound tools from `packages/tool-registry` to execute the current step.
   - `human_approval_gate`: Conditional edge that inspects if the requested tool has `requiresApproval === true`. If so, persists a `WorkflowCheckpoint` with `AWAITING_APPROVAL` and yields control to the client stream.
   - `tool_runner_node`: Executes approved/safe tools in parallel, captures outputs, and validates schemas.
   - `critic_reflection_node`: Evaluates tool outputs against the user's goal. Routes back to `executor_node` if results are incomplete (up to `reflectionCount === 3`), or forwards to `synthesizer_node`.
   - `synthesizer_node`: Streams the final grounded response with inline citations and persists newly learned facts to `pgvector`.
3. Build the **LangGraph-to-Vercel AI SDK Stream Bridge**:
   - Use Vercel AI SDK's `createDataStreamResponse` (or `UIMessageStream`) to multiplex LangGraph `.streamEvents({ version: 'v2' })` directly to the frontend.
   - Stream custom data annotations (`writeData` / `writeMessageAnnotation`) for:
     - Active Graph Node transitions (`planner -> executor -> tool_runner -> critic -> synthesizer`).
     - Live Step Plan checklists.
     - RAG source citations and similarity scores.
     - Real-time Token & USD Cost increments.

### Phase 5: Next.js 15 Studio & Generative UI (`apps/studio-web`)

1. Build a three-pane AI Engineering Studio interface using Next.js 15 App Router and `@ai-sdk/react` (`useChat`):
   - **Left Pane — Thread & Memory Explorer:** Manage conversation threads, upload documents to the `pgvector` knowledge base, and inspect stored semantic memories.
   - **Center Pane — Generative UI Streaming Chat:**
     - Consumes the Vercel AI SDK stream.
     - Renders rich **Generative UI cards** inline for tool calls: interactive Planner Checklists, Code Interpreter execution sandboxes, RAG citation badges, and **Human-in-the-Loop Approval Cards** (with "Approve & Resume" / "Reject with Feedback" buttons that hit `POST /api/workflows/[threadId]/resume`).
     - Model selector dropdown allowing live switching between OpenAI (`gpt-4o`), Anthropic (`claude-3-7-sonnet`), and Google (`gemini-2.5-pro`).
   - **Right Pane — Live DAG & Telemetry Inspector:**
     - Real-time visual state machine highlighting which LangGraph node is currently executing (`Planner`, `Memory`, `Tool Executor`, `Critic`, `Synthesizer`).
     - Step-by-step trace timeline showing raw prompt inputs, structured JSON tool arguments, execution latency in ms, and a live FinOps ledger calculating exact input/output token costs.

### Phase 6: Testing, Evaluation & Documentation

1. **Deterministic Graph & Memory Tests:**
   - Write Vitest suites testing the `Plan-Execute-Reflect` graph transitions using a deterministic `MockChatModel` so CI runs fast without requiring paid API keys.
   - Write unit tests for `trimMessagesToTokenBudget`, Reciprocal Rank Fusion (RRF), and Zod tool guardrail rejections.
   - Write an end-to-end test verifying the Human-in-the-Loop interrupt: trigger `production_action_webhook`, assert checkpoint state is `AWAITING_APPROVAL`, dispatch the approval payload, and assert the workflow resumes and completes.
2. **CI/CD & Portfolio Documentation:**
   - Create `.github/workflows/ci.yml` with `pgvector/pgvector:pg16` and `redis:7` service containers.
   - Author a flagship `README.md` featuring Mermaid state-machine diagrams of the LangGraph workflow, sequence diagrams of the Vercel AI SDK stream multiplexing protocol, memory architecture breakdown, and a 1-command local setup.

---

## 4. Final Agent Acceptance Criteria

Before completing your run, verify and ensure:

- [ ] `pnpm build` and `pnpm typecheck` complete with zero errors across all packages.
- [ ] `pnpm test` passes all graph routing, memory trimming, and HITL checkpoint tests.
- [ ] A Demo Mode / Mock LLM provider fallback (`USE_MOCK_LLM=true`) is included alongside real provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) so anyone cloning the repo can test the full streaming graph and UI immediately.
- [ ] All code is committed with clean conventional commits and pushed to `github.com/donshammah96/ai-workflow-engine`.
