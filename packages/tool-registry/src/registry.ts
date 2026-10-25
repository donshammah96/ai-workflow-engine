import { type WorkflowTool } from './define-tool.js';
import { calculatorMathTool } from './tools/calculator.js';
import { knowledgeBaseRagTool } from './tools/rag.js';
import { sandboxedCodeInterpreterTool } from './tools/sandbox.js';
import { liveHttpJsonFetcherTool } from './tools/fetcher.js';
import { productionActionWebhookTool } from './tools/webhook.js';

export class ToolRegistry {
  private tools = new Map<string, WorkflowTool>();

  constructor() {
    this.register(calculatorMathTool as unknown as WorkflowTool);
    this.register(knowledgeBaseRagTool as unknown as WorkflowTool);
    this.register(sandboxedCodeInterpreterTool as unknown as WorkflowTool);
    this.register(liveHttpJsonFetcherTool as unknown as WorkflowTool);
    this.register(productionActionWebhookTool as unknown as WorkflowTool);
  }

  register(tool: WorkflowTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): WorkflowTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): WorkflowTool[] {
    return Array.from(this.tools.values());
  }

  getLangChainTools() {
    return this.getAll().map((t) => t.toLangChain());
  }

  getAiSdkTools() {
    const record: Record<string, ReturnType<WorkflowTool['toAiSdk']>> = {};
    for (const tool of this.getAll()) {
      record[tool.name] = tool.toAiSdk();
    }
    return record;
  }
}

export const toolRegistry = new ToolRegistry();
