'use client';

import React from 'react';
import {
  Activity,
  DollarSign,
  Cpu,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

export interface TelemetryData {
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
  model: string;
  nodeLatencies: Record<string, number>;
}

export interface NodeTransition {
  from: string;
  to: string;
  status: string;
  timestamp: number;
}

const GRAPH_NODES = [
  { id: 'memory_enrichment', label: 'Memory RAG', desc: 'Recalls semantic facts & context' },
  { id: 'planner', label: 'Planner DAG', desc: 'Decomposes prompt into steps' },
  { id: 'executor', label: 'Tool Dispatcher', desc: 'Selects tools & checks gates' },
  { id: 'tool_runner', label: 'Tool Runner', desc: 'Executes sandboxed tools' },
  { id: 'critic_reflection', label: 'Critic Reflection', desc: 'Evaluates goal satisfaction' },
  { id: 'synthesizer', label: 'Synthesizer', desc: 'Grounds response with citations' },
];

export function DagInspector({
  activeNode,
  telemetry,
  transitions,
}: {
  activeNode: string | null;
  telemetry: TelemetryData;
  transitions: NodeTransition[];
}) {
  const totalTokens = (telemetry.promptTokens || 0) + (telemetry.completionTokens || 0);

  return (
    <div className="flex h-full w-84 flex-col border-l border-white/10 bg-slate-950/80 backdrop-blur-xl">
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              DAG & Telemetry Inspector
            </span>
          </div>
          <span className="rounded bg-cyan-950/50 px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-cyan-500/20">
            {telemetry.model || 'gpt-4o'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* FinOps Live Ledger */}
        <div className="rounded-xl border border-emerald-500/20 bg-slate-900/60 p-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              FinOps Cost Ledger
            </span>
            <span className="text-xs font-bold font-mono text-emerald-300">
              ${(telemetry.totalCostUsd || 0).toFixed(5)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-black/40 p-2 border border-white/5">
              <span className="text-[10px] text-slate-500 block uppercase">Prompt Tokens</span>
              <span className="font-mono text-slate-200">{telemetry.promptTokens || 0}</span>
            </div>
            <div className="rounded-lg bg-black/40 p-2 border border-white/5">
              <span className="text-[10px] text-slate-500 block uppercase">Completion</span>
              <span className="font-mono text-slate-200">{telemetry.completionTokens || 0}</span>
            </div>
          </div>
        </div>

        {/* Live LangGraph Node Visualizer */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            LangGraph Execution Pipeline
          </span>

          <div className="space-y-1.5 pt-1">
            {GRAPH_NODES.map((node, idx) => {
              const isActive = activeNode === node.id;
              const hasRun = Object.keys(telemetry.nodeLatencies || {}).includes(node.id);
              const latency = telemetry.nodeLatencies?.[node.id];

              return (
                <div
                  key={node.id}
                  className={`rounded-lg border p-2.5 transition-all ${
                    isActive
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                      : hasRun
                      ? 'border-slate-800 bg-slate-900/40'
                      : 'border-white/5 bg-slate-950/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          isActive
                            ? 'bg-cyan-400 animate-ping'
                            : hasRun
                            ? 'bg-emerald-400'
                            : 'bg-slate-600'
                        }`}
                      />
                      <span className={`text-xs font-medium ${isActive ? 'text-cyan-300 font-semibold' : 'text-slate-200'}`}>
                        {node.label}
                      </span>
                    </div>

                    {latency !== undefined ? (
                      <span className="text-[10px] font-mono text-cyan-400">{latency}ms</span>
                    ) : hasRun ? (
                      <CheckCircle className="h-3 w-3 text-emerald-400" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{node.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transition Trace Timeline */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-violet-400" />
            Live State Machine Trace
          </span>

          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2.5 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[10px]">
            {transitions.length === 0 ? (
              <span className="text-slate-500 italic block py-2 text-center">
                Awaiting workflow start...
              </span>
            ) : (
              transitions.map((t, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-300">
                    {t.from} <span className="text-cyan-400">→</span> {t.to}
                  </span>
                  <span className="text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
