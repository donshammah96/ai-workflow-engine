import { describe, it, expect } from 'vitest';
import { calculatorMathTool } from '../tools/calculator.js';
import { sandboxedCodeInterpreterTool } from '../tools/sandbox.js';
import { productionActionWebhookTool } from '../tools/webhook.js';
import { toolRegistry } from '../registry.js';

describe('Tool Registry & Deterministic Guardrails Suite', () => {
  describe('Calculator Math Tool', () => {
    it('should evaluate deterministic mathematical expressions accurately', async () => {
      const output = await calculatorMathTool.execute({
        expression: '12 * (5 + 15) / 4',
      });
      expect(output.result).toBe(60);
      expect(output.formatted).toContain('60');
    });

    it('should evaluate statistical mean helper correctly', async () => {
      const output = await calculatorMathTool.execute({
        expression: 'mean([10, 20, 30, 40])',
      });
      expect(output.result).toBe(25);
    });

    it('should reject expressions with malicious or forbidden syntax', async () => {
      await expect(
        calculatorMathTool.execute({
          expression: 'process.exit(1)',
        })
      ).rejects.toThrow();
    });
  });

  describe('Sandboxed Code Interpreter Tool', () => {
    it('should execute isolated JavaScript code and capture results and logs', async () => {
      const output = await sandboxedCodeInterpreterTool.execute({
        code: `
          console.log("Starting analysis");
          const sum = data.values.reduce((a, b) => a + b, 0);
          return { sum, length: data.values.length };
        `,
        inputData: { values: [10, 20, 30] },
      });

      expect(output.success).toBe(true);
      expect(output.logs).toContain('Starting analysis');
      expect((output.result as { sum: number }).sum).toBe(60);
      expect(output.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should safely enforce execution timeout on infinite loops', async () => {
      const output = await sandboxedCodeInterpreterTool.execute({
        code: 'while (true) {}',
      });

      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });
  });

  describe('Zod Guardrails & HITL Webhook Flag', () => {
    it('should mark productionActionWebhookTool with requiresApproval = true', () => {
      expect(productionActionWebhookTool.requiresApproval).toBe(true);
    });

    it('should reject invalid tool inputs that violate the Zod schema', async () => {
      await expect(
        // @ts-expect-error Testing invalid schema rejection
        productionActionWebhookTool.execute({
          actionType: 'INVALID_ACTION_NOT_IN_ENUM',
          target: 'prod',
        })
      ).rejects.toThrow(/Input schema validation failed/);
    });
  });

  describe('Unified Tool Registry', () => {
    it('should register showcase tools and convert to LangChain and AI SDK formats', () => {
      const all = toolRegistry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(5);

      const langChainTools = toolRegistry.getLangChainTools();
      expect(langChainTools.length).toBeGreaterThanOrEqual(5);

      const aiSdkTools = toolRegistry.getAiSdkTools();
      expect(Object.keys(aiSdkTools).length).toBeGreaterThanOrEqual(5);
    });
  });
});
