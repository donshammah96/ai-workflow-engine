'use client';

import React from 'react';
import { Sparkles, Bot, Shield } from 'lucide-react';

export const SUPPORTED_MODELS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', tag: 'Fast & Multimodal' },
  { id: 'claude-3-7-sonnet', name: 'Anthropic Claude 3.7 Sonnet', tag: 'Hybrid Reasoning' },
  { id: 'gemini-2.5-pro', name: 'Google Gemini 2.5 Pro', tag: '1M Context' },
  { id: 'mock-ai', name: 'Deterministic Mock Agent', tag: 'Zero-API Key / CI' },
];

export function ModelSelector({
  selectedModel,
  onSelectModel,
}: {
  selectedModel: string;
  onSelectModel: (model: string) => void;
}) {
  return (
    <div className="relative inline-block text-left">
      <select
        value={selectedModel}
        onChange={(e) => onSelectModel(e.target.value)}
        className="appearance-none rounded-lg border border-white/10 bg-slate-900/90 py-1.5 pl-3 pr-8 text-xs font-medium text-slate-200 shadow-sm focus:border-cyan-400 focus:outline-none cursor-pointer"
      >
        {SUPPORTED_MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-slate-950 text-slate-200">
            {m.name} ({m.tag})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
        <Sparkles className="h-3 w-3 text-cyan-400" />
      </div>
    </div>
  );
}
