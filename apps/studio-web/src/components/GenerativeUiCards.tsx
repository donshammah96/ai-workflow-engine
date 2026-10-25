'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Code2,
  Database,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// 1. Planner Checklist Card
export interface PlanStepItem {
  id: string;
  description: string;
  assignedAgent: string;
  toolNeeded?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
}

export function PlannerChecklistCard({ steps }: { steps: PlanStepItem[] }) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="my-3 rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Multi-Step Execution DAG Plan
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {steps.filter((s) => s.status === 'completed').length} / {steps.length} Steps
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isInProgress = step.status === 'in_progress';
          const isExpanded = expandedStep === step.id;

          return (
            <div
              key={step.id || idx}
              className={`rounded-lg border p-2.5 transition-all ${
                isCompleted
                  ? 'border-emerald-500/20 bg-emerald-950/10'
                  : isInProgress
                  ? 'border-cyan-500/30 bg-cyan-950/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                  : 'border-white/5 bg-slate-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : isInProgress ? (
                      <Clock className="h-4 w-4 text-cyan-400 animate-spin" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-slate-600 flex items-center justify-center text-[10px] text-slate-400">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{step.description}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
                        @{step.assignedAgent}
                      </span>
                      {step.toolNeeded && (
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-slate-300">
                          {step.toolNeeded}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {Boolean(step.result) && (
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    className="text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {isExpanded && Boolean(step.result) && (
                <div className="mt-2.5 rounded bg-black/40 p-2 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40 border border-white/5">
                  <pre>{JSON.stringify(step.result, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 2. Sandboxed Code Interpreter Card
export function CodeInterpreterCard({
  code,
  result,
  logs,
  executionTimeMs,
}: {
  code?: string;
  result?: unknown;
  logs?: string[];
  executionTimeMs?: number;
}) {
  const [showCode, setShowCode] = useState(true);

  return (
    <div className="my-3 rounded-xl border border-violet-500/20 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
            Sandboxed JS Interpreter
          </span>
        </div>
        {executionTimeMs !== undefined && (
          <span className="text-[11px] font-mono text-slate-400">{executionTimeMs}ms</span>
        )}
      </div>

      {code && (
        <div className="mt-2.5">
          <button
            onClick={() => setShowCode(!showCode)}
            className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 mb-1"
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>
          {showCode && (
            <div className="rounded-lg bg-black/50 p-2.5 font-mono text-xs text-violet-200 border border-violet-500/10 overflow-x-auto">
              <pre>{code}</pre>
            </div>
          )}
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="mt-2 rounded bg-slate-950/80 p-2 text-[11px] font-mono text-slate-400 border border-white/5">
          <div className="text-[10px] uppercase text-slate-500 mb-1">Console Output:</div>
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}

      {result !== undefined && (
        <div className="mt-2.5 rounded-lg bg-slate-950/60 p-2.5 border border-white/5">
          <div className="text-[10px] uppercase text-emerald-400 mb-1 font-semibold">Evaluation Output:</div>
          <pre className="font-mono text-xs text-slate-200 overflow-x-auto">
            {typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}
          </pre>
        </div>
      )}
    </div>
  );
}

// 3. RAG Citation Badges
export function RagCitationCards({
  citations,
}: {
  citations: Array<{
    id: string;
    content: string;
    score: number;
    source: string;
    metadata: Record<string, unknown>;
  }>;
}) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="my-3 rounded-xl border border-indigo-500/20 bg-slate-900/60 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2 pb-2.5 border-b border-white/5">
        <Database className="h-4 w-4 text-indigo-400" />
        <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
          pgvector Hybrid Retrieval Citations ({citations.length})
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {citations.map((c, i) => (
          <div
            key={c.id || i}
            className="rounded-lg border border-white/5 bg-slate-800/40 p-2.5 text-xs hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span className="font-semibold text-indigo-300">Citation [{i + 1}]</span>
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400 uppercase text-[9px] font-mono">
                  {c.source}
                </span>
                <span className="font-mono text-cyan-400">{(c.score * 100).toFixed(1)}% match</span>
              </div>
            </div>
            <p className="text-slate-300 text-xs line-clamp-3 italic">"{c.content}"</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4. Human-In-The-Loop Approval Card
export function HitlApprovalCard({
  threadId,
  pendingApproval,
  onResume,
}: {
  threadId: string;
  pendingApproval: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    stepId?: string;
    reason?: string;
  };
  onResume: (action: 'APPROVE' | 'REJECT', feedback?: string) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action: 'APPROVE' | 'REJECT') => {
    setIsSubmitting(true);
    try {
      await onResume(action, feedback);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="my-4 rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.15)]">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-amber-300">
              Human-in-the-Loop Operator Authorization Required
            </h4>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-300">
              AWAITING_APPROVAL
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {pendingApproval.reason || 'A sensitive production mutation requires manual verification before proceeding.'}
          </p>

          <div className="mt-3 rounded-lg bg-black/40 p-3 border border-amber-500/10">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span>Target Tool: <strong className="text-amber-300">{pendingApproval.toolName}</strong></span>
              <span>Step: {pendingApproval.stepId}</span>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-36">
              {JSON.stringify(pendingApproval.args, null, 2)}
            </pre>
          </div>

          <div className="mt-3">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional audit comment or rejection feedback..."
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={() => handleAction('REJECT')}
              disabled={isSubmitting}
              className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-900/50 transition-colors disabled:opacity-50"
            >
              Reject with Feedback
            </button>
            <button
              onClick={() => handleAction('APPROVE')}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-semibold text-black hover:from-amber-400 hover:to-amber-500 transition-all shadow-md disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Approve & Resume Execution
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
