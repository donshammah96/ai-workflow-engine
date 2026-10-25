'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Database,
  Layers,
  Send,
  Coins,
  CheckCircle,
  FileText,
} from 'lucide-react';

export interface ThreadItem {
  id: string;
  title: string;
  workflowType: string;
  totalTokens: number;
  totalCostUsd: number;
  createdAt: string;
}

export interface MemoryChunkItem {
  id: string;
  content: string;
  namespace: string;
  createdAt: string;
}

export function ThreadExplorer({
  activeThreadId,
  onSelectThread,
  onNewThread,
}: {
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'threads' | 'memory'>('threads');
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [memories, setMemories] = useState<MemoryChunkItem[]>([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryNamespace, setNewMemoryNamespace] = useState('default');
  const [isSubmittingMemory, setIsSubmittingMemory] = useState(false);
  const [memorySuccess, setMemorySuccess] = useState(false);

  useEffect(() => {
    fetchThreads();
    fetchMemories();
  }, []);

  const fetchThreads = async () => {
    try {
      const res = await fetch('/api/threads');
      const data = await res.json();
      if (data.threads) setThreads(data.threads);
    } catch {}
  };

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories?namespace=default');
      const data = await res.json();
      if (data.chunks) setMemories(data.chunks);
    } catch {}
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;

    setIsSubmittingMemory(true);
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newMemoryText,
          namespace: newMemoryNamespace,
          threadId: activeThreadId,
        }),
      });
      if (res.ok) {
        setNewMemoryText('');
        setMemorySuccess(true);
        setTimeout(() => setMemorySuccess(false), 3000);
        fetchMemories();
      }
    } finally {
      setIsSubmittingMemory(false);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur-xl">
      {/* Studio Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">AI Workflow Studio</h1>
            <p className="text-[10px] text-cyan-400 font-mono">LangGraph & Generative UI</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 bg-slate-900/40 p-1">
        <button
          onClick={() => setActiveTab('threads')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'threads'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Threads
        </button>
        <button
          onClick={() => setActiveTab('memory')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'memory'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          pgvector RAG
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'threads' ? (
          <div className="space-y-2">
            <button
              onClick={onNewThread}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/40 transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)]"
            >
              <Plus className="h-4 w-4" />
              New Workflow Thread
            </button>

            <div className="pt-2 space-y-1">
              {threads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                  No active threads. Start a new workflow above.
                </div>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => onSelectThread(thread.id)}
                      className={`w-full text-left rounded-lg p-2.5 transition-all border ${
                        isActive
                          ? 'border-cyan-500/40 bg-cyan-950/30 text-white shadow-sm'
                          : 'border-transparent hover:border-white/5 hover:bg-slate-900/50 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate flex-1">{thread.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="font-mono">{thread.totalTokens} tokens</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-mono">
                          ${thread.totalCostUsd.toFixed(4)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleCreateMemory} className="space-y-2 rounded-lg border border-white/5 bg-slate-900/50 p-3">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block mb-1">
                Ingest Vector Document
              </span>
              <textarea
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="Insert documentation, policies, or domain knowledge for 1536-dim semantic retrieval..."
                rows={3}
                className="w-full rounded-md border border-white/10 bg-black/40 p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMemoryNamespace}
                  onChange={(e) => setNewMemoryNamespace(e.target.value)}
                  placeholder="namespace"
                  className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmittingMemory || !newMemoryText.trim()}
                  className="flex-1 flex items-center justify-center gap-1 rounded-md bg-indigo-600 py-1 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  Embed & Store
                </button>
              </div>
              {memorySuccess && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-400 pt-1">
                  <CheckCircle className="h-3 w-3" /> Vector memory embedded successfully!
                </div>
              )}
            </form>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Stored Semantic Chunks ({memories.length})
              </span>
              {memories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                  No memory chunks yet. Ingest documents above.
                </div>
              ) : (
                memories.slice(0, 15).map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-white/5 bg-slate-900/40 p-2.5 text-xs hover:border-indigo-500/20 transition-all"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span className="font-mono text-indigo-400">ns: {chunk.namespace}</span>
                      <span>{new Date(chunk.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-300 line-clamp-2">{chunk.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
