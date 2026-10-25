import { z } from 'zod';
import * as vm from 'node:vm';
import { defineWorkflowTool } from '../define-tool.js';

export const SandboxInputSchema = z.object({
  code: z.string().describe('The JavaScript code snippet to execute. Must return a value or set output on `result`'),
  inputData: z.record(z.unknown()).optional().describe('Optional JSON dataset or input variables to inject into the sandbox as `data`'),
});

export const SandboxOutputSchema = z.object({
  success: z.boolean(),
  result: z.unknown(),
  logs: z.array(z.string()),
  executionTimeMs: z.number(),
  error: z.string().optional(),
});

export const sandboxedCodeInterpreterTool = defineWorkflowTool({
  name: 'sandboxed_code_interpreter',
  description: 'Executes isolated JavaScript snippets in a secure, sandboxed Node.js VM context with execution timeouts to transform, compute, and analyze structured JSON or tabular data.',
  inputSchema: SandboxInputSchema,
  outputSchema: SandboxOutputSchema,
  requiresApproval: false,
  timeoutMs: 5000,
  maxRetries: 1,
  execute: async ({ code, inputData = {} }) => {
    const startTime = Date.now();
    const logs: string[] = [];

    // Isolated sandbox context
    const sandbox = {
      data: Object.freeze(JSON.parse(JSON.stringify(inputData))),
      result: undefined,
      console: {
        log: (...args: unknown[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
        error: (...args: unknown[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
        warn: (...args: unknown[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
        info: (...args: unknown[]) => logs.push('[INFO] ' + args.map(String).join(' ')),
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
    };

    const context = vm.createContext(sandbox);

    try {
      // Wrap snippet to allow return statement
      const wrappedScript = new vm.Script(`
        (function() {
          ${code}
        })()
      `);

      const executionValue = wrappedScript.runInContext(context, {
        timeout: 3000,
        displayErrors: true,
      });

      const finalResult = executionValue !== undefined ? executionValue : sandbox.result;
      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        result: finalResult !== undefined ? finalResult : null,
        logs,
        executionTimeMs,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        result: null,
        logs,
        executionTimeMs: Date.now() - startTime,
        error: errorMsg,
      };
    }
  },
});
