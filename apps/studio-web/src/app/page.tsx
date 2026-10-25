'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  ThreadExplorer,
  type ThreadItem,
} from '@/components/ThreadExplorer';
import {
  DagInspector,
  type TelemetryData,
  type NodeTransition,
} from '@/components/DagInspector';
import {
  PlannerChecklistCard,
  CodeInterpreterCard,
  RagCitationCards,
  HitlApprovalCard,
  type PlanStepItem,
} from '@/components/GenerativeUiCards';
import { ModelSelector } from '@/components/ModelSelector';
import {
  Send,
  Sparkles,
  Bot,
  User,
  ShieldAlert,
  Terminal,
  Calculator,
  Database,
  Play,
  RotateCcw,
} from 'lucide-react';

export default function WorkflowStudioPage() {
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeDagNode, setActiveDagNode] = useState<string | null>(null);
  const [dagTransitions, setDagTransitions] = useState<NodeTransition[]>([]);
  const [latestPlan, setLatestPlan] = useState<PlanStepItem[]>([]);
  const [latestCitations, setLatestCitations] = useState<any[]>([]);
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    promptTokens: 0,
    completionTokens: 0,
    totalCostUsd: 0,
    model: 'gpt-4o',
    nodeLatencies: {},
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    data,
  } = useChat({
    api: '/api/chat',
    body: {
      model: selectedModel,
      threadId: activeThreadId,
    },
    onResponse: () => {
      setActiveDagNode('memory_enrichment');
    },
  });

  // Process streaming custom data annotations from Vercel AI SDK stream
  useEffect(() => {
    if (!data || data.length === 0) return;

    data.forEach((item: any) => {
      try {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;
        const type = parsed?.type;
        const payload = parsed?.data;

        if (type === 'thread_init' && payload?.threadId) {
          if (!activeThreadId) setActiveThreadId(payload.threadId);
        } else if (type === 'node_transition') {
          setActiveDagNode(payload.to);
          setDagTransitions((prev) => [
            ...prev,
            {
              from: payload.from,
              to: payload.to,
              status: payload.status,
              timestamp: payload.timestamp || Date.now(),
            },
          ]);
        } else if (type === 'plan_update' && payload?.plan) {
          setLatestPlan(payload.plan);
        } else if (type === 'rag_citations' && payload?.citations) {
          setLatestCitations(payload.citations);
        } else if (type === 'finops_telemetry' && payload?.telemetry) {
          setTelemetry((prev) => ({
            ...prev,
            ...payload.telemetry,
            nodeLatencies: {
              ...prev.nodeLatencies,
              ...(payload.telemetry.nodeLatencies || {}),
            },
          }));
        } else if (type === 'approval_required' && payload?.pendingApproval) {
          setPendingApproval(payload.pendingApproval);
        } else if (type === 'workflow_completed') {
          setActiveDagNode('synthesizer');
        }
      } catch {}
    });
  }, [data, activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, latestPlan, pendingApproval]);

  const handleResumeWorkflow = async (action: 'APPROVE' | 'REJECT', feedback?: string) => {
    if (!activeThreadId) return;

    setPendingApproval(null);
    try {
      const response = await fetch(`/api/workflows/${activeThreadId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          feedback,
          model: selectedModel,
        }),
      });

      if (response.ok && response.body) {
        // Read response stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let resumedText = '';

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('0:')) {
                try {
                  const str = JSON.parse(line.slice(2));
                  resumedText += str;
                } catch {}
              }
            }
          }
        }

        if (resumedText) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'resume_' + Date.now(),
              role: 'assistant',
              content: resumedText,
            },
          ]);
        }
      }
    } catch (err) {
      console.error('Failed to resume workflow:', err);
    }
  };

  const handleQuickPrompt = (promptText: string) => {
    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    handleInputChange({
      target: { value: promptText },
    } as React.ChangeEvent<HTMLInputElement>);

    setTimeout(() => {
      handleSubmit(fakeEvent);
    }, 50);
  };

  const handleNewThread = () => {
    setMessages([]);
    setActiveThreadId(null);
    setLatestPlan([]);
    setLatestCitations([]);
    setPendingApproval(null);
    setDagTransitions([]);
    setActiveDagNode(null);
    setTelemetry({
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      model: selectedModel,
      nodeLatencies: {},
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090D16]">
      {/* 1. Left Pane: Thread & Memory Explorer */}
      <ThreadExplorer
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          handleNewThread();
        }}
        onNewThread={handleNewThread}
      />

      {/* 2. Center Pane: Generative UI Streaming Chat */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-950/40">
        {/* Top Studio Bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Plan-Execute-Reflect Orchestrator
              </span>
            </div>
            {activeThreadId && (
              <span className="rounded bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-400 border border-white/5">
                {activeThreadId}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ModelSelector
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
            />
            <button
              onClick={handleNewThread}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>

        {/* Streaming Messages Viewport */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center max-w-xl mx-auto py-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 text-cyan-400 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mb-2">
                Multi-Step AI Agent Orchestration Studio
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Combines LangGraph cyclical DAG execution, deterministic Zod tool guardrails, pgvector semantic memory, and real-time Human-in-the-Loop decision cards.
              </p>

              {/* Showcase Quick Action Chips */}
              <div className="grid grid-cols-2 gap-2.5 w-full text-left">
                <button
                  onClick={() =>
                    handleQuickPrompt(
                      'Deploy configuration update to production cluster prod-cluster-01 (Trigger HITL Approval Gate)'
                    )
                  }
                  className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 hover:bg-amber-900/20 transition-all text-xs group"
                >
                  <div className="flex items-center gap-2 font-semibold text-amber-300 mb-1">
                    <ShieldAlert className="h-4 w-4" />
                    HITL Production Mutation
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pauses state machine & prompts operator authorization card.
                  </p>
                </button>

                <button
                  onClick={() =>
                    handleQuickPrompt(
                      'Analyze sample dataset with Sandboxed JS: calculate mean, median, and variance of array [15, 28, 42, 67, 89, 104]'
                    )
                  }
                  className="rounded-xl border border-violet-500/30 bg-violet-950/10 p-3 hover:bg-violet-900/20 transition-all text-xs"
                >
                  <div className="flex items-center gap-2 font-semibold text-violet-300 mb-1">
                    <Terminal className="h-4 w-4" />
                    Sandboxed VM Execution
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Executes isolated code in Node.js VM context with timeout limits.
                  </p>
                </button>

                <button
                  onClick={() =>
                    handleQuickPrompt(
                      'Search pgvector memory knowledge base and retrieve documentation for semantic caching and hybrid RRF'
                    )
                  }
                  className="rounded-xl border border-indigo-500/30 bg-indigo-950/10 p-3 hover:bg-indigo-900/20 transition-all text-xs"
                >
                  <div className="flex items-center gap-2 font-semibold text-indigo-300 mb-1">
                    <Database className="h-4 w-4" />
                    pgvector Hybrid RAG
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Fuses dense cosine similarity with sparse full-text search.
                  </p>
                </button>

                <button
                  onClick={() =>
                    handleQuickPrompt(
                      'Evaluate deterministic mathematical expression: 14 * (32 + 18) / sqrt(16) + sum([10, 20, 30])'
                    )
                  }
                  className="rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-3 hover:bg-cyan-900/20 transition-all text-xs"
                >
                  <div className="flex items-center gap-2 font-semibold text-cyan-300 mb-1">
                    <Calculator className="h-4 w-4" />
                    Deterministic Math Tool
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Evaluates symbolic & statistical math with zero hallucination.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === 'user';
              const isLast = index === messages.length - 1;

              return (
                <div
                  key={m.id || index}
                  className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-sm mt-0.5">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-3xl rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-cyan-600 text-white rounded-tr-none'
                        : 'border border-white/10 bg-slate-900/80 text-slate-200 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {/* User or Assistant Message Body */}
                    <div className="whitespace-pre-wrap">{m.content}</div>

                    {/* Generative UI Cards for Assistant Responses */}
                    {!isUser && isLast && (
                      <div className="mt-2 space-y-3">
                        {/* 1. Live Step Plan Checklist */}
                        {latestPlan.length > 0 && (
                          <PlannerChecklistCard steps={latestPlan} />
                        )}

                        {/* 2. RAG Citations */}
                        {latestCitations.length > 0 && (
                          <RagCitationCards citations={latestCitations} />
                        )}

                        {/* 3. Human in the loop approval card */}
                        {pendingApproval && activeThreadId && (
                          <HitlApprovalCard
                            threadId={activeThreadId}
                            pendingApproval={pendingApproval}
                            onResume={handleResumeWorkflow}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 border border-white/10 mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-white/10 p-4 bg-slate-950/60 backdrop-blur-md">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2 focus-within:border-cyan-500/50 shadow-lg"
          >
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              disabled={isLoading}
              placeholder="Ask the AI Workflow Engine to plan, retrieve, compute, or mutate..."
              className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* 3. Right Pane: Live DAG & Telemetry Inspector */}
      <DagInspector
        activeNode={activeDagNode}
        telemetry={telemetry}
        transitions={dagTransitions}
      />
    </div>
  );
}
