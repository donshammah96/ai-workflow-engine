import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Workflow Engine Studio | LangGraph & Generative UI',
  description: 'Production-grade Multi-Step AI Workflow Engine combining LangGraph stateful orchestration, pgvector memory, deterministic tool guardrails, and real-time Generative UI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-[#090D16] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
