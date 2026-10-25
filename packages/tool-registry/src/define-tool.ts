import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { tool as aiTool } from 'ai';
import { auditRepository } from '@ai-workflow/database';

export interface ToolExecutionContext {
  threadId?: string;
  stepId?: string;
  signal?: AbortSignal;
  approvedBy?: string;
}

export interface WorkflowToolConfig<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
> {
  name: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  requiresApproval?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  execute: (
    input: z.infer<TInputSchema>,
    context?: ToolExecutionContext
  ) => Promise<z.infer<TOutputSchema>>;
}

export interface WorkflowTool<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny
> {
  name: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  requiresApproval: boolean;
  timeoutMs: number;
  maxRetries: number;
  execute: (
    input: z.infer<TInputSchema>,
    context?: ToolExecutionContext
  ) => Promise<z.infer<TOutputSchema>>;
  toLangChain: () => StructuredTool;
  toAiSdk: () => any;
}

export function defineWorkflowTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
>(config: WorkflowToolConfig<TInputSchema, TOutputSchema>): WorkflowTool<TInputSchema, TOutputSchema> {
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    requiresApproval = false,
    timeoutMs = 10000,
    maxRetries = 2,
    execute,
  } = config;

  const executeWithGuardrails = async (
    rawInput: unknown,
    context?: ToolExecutionContext
  ): Promise<z.infer<TOutputSchema>> => {
    const startTime = Date.now();

    // 1. Strict Zod Input Validation
    const parsedInput = inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      const errorMsg = `Input schema validation failed for tool '${name}': ${parsedInput.error.message}`;
      const latency = Date.now() - startTime;
      try {
        await auditRepository.recordToolAudit({
          threadId: context?.threadId,
          stepId: context?.stepId,
          toolName: name,
          args: (rawInput as Record<string, unknown>) ?? {},
          result: { error: errorMsg },
          latencyMs: latency,
          status: 'ERROR',
          requiresApproval,
          approvedBy: context?.approvedBy,
        });
      } catch {}
      throw new Error(errorMsg);
    }

    // 2. Execution with Retries & Timeout Enforcement
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // Merge context signal if provided
      if (context?.signal) {
        context.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const result = await Promise.race([
          execute(parsedInput.data, { ...context, signal: controller.signal }),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new Error(`Tool '${name}' timed out after ${timeoutMs}ms`))
            );
          }),
        ]);

        clearTimeout(timer);

        // 3. Strict Zod Output Validation
        const parsedOutput = outputSchema.safeParse(result);
        if (!parsedOutput.success) {
          throw new Error(
            `Output schema validation failed for tool '${name}': ${parsedOutput.error.message}`
          );
        }

        const latency = Date.now() - startTime;
        try {
          await auditRepository.recordToolAudit({
            threadId: context?.threadId,
            stepId: context?.stepId,
            toolName: name,
            args: parsedInput.data as Record<string, unknown>,
            result: parsedOutput.data,
            latencyMs: latency,
            status: 'SUCCESS',
            requiresApproval,
            approvedBy: context?.approvedBy,
          });
        } catch {}

        return parsedOutput.data;
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) {
          const latency = Date.now() - startTime;
          try {
            await auditRepository.recordToolAudit({
              threadId: context?.threadId,
              stepId: context?.stepId,
              toolName: name,
              args: parsedInput.data as Record<string, unknown>,
              result: { error: lastError.message },
              latencyMs: latency,
              status: 'ERROR',
              requiresApproval,
              approvedBy: context?.approvedBy,
            });
          } catch {}
          throw lastError;
        }
      }
    }

    throw lastError || new Error(`Tool execution failed for '${name}'`);
  };

  const toLangChain = (): StructuredTool => {
    class CustomStructuredTool extends StructuredTool {
      name = name;
      description = description;
      schema = inputSchema;

      protected async _call(
        arg: z.infer<TInputSchema>
      ): Promise<string> {
        const res = await executeWithGuardrails(arg);
        return typeof res === 'string' ? res : JSON.stringify(res);
      }
    }
    return new CustomStructuredTool();
  };

  const toAiSdk = (): any => {
    return aiTool({
      description,
      parameters: inputSchema,
      execute: async (args) => {
        return executeWithGuardrails(args);
      },
    });
  };

  return {
    name,
    description,
    inputSchema,
    outputSchema,
    requiresApproval,
    timeoutMs,
    maxRetries,
    execute: executeWithGuardrails,
    toLangChain,
    toAiSdk,
  };
}
