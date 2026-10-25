import { z } from 'zod';
import { defineWorkflowTool } from '../define-tool.js';

export const ProductionWebhookInputSchema = z.object({
  actionType: z.enum([
    'DEPLOY_CONFIG',
    'EXECUTE_PAYMENT',
    'REVOKE_CREDENTIALS',
    'PUBLISH_RELEASE',
    'DATABASE_MIGRATION',
  ]).describe('Type of high-stakes production action requiring human authorization'),
  target: z.string().describe('Target system, account, or environment, e.g. "prod-cluster-us-east" or "account_99812"'),
  payload: z.record(z.unknown()).describe('Action parameters and operation payload'),
  reason: z.string().describe('Justification for performing this sensitive mutation'),
});

export const ProductionWebhookOutputSchema = z.object({
  actionId: z.string(),
  actionType: z.string(),
  status: z.enum(['EXECUTED', 'SIMULATED']),
  target: z.string(),
  summary: z.string(),
  executedAt: z.string(),
  approvedBy: z.string(),
});

export const productionActionWebhookTool = defineWorkflowTool({
  name: 'production_action_webhook',
  description: 'Simulates a high-stakes external mutation (e.g., deploying production configs, issuing financial transactions, or migrating DB). Enforces Human-in-the-Loop gating and pauses workflow execution until explicitly approved by an operator.',
  inputSchema: ProductionWebhookInputSchema,
  outputSchema: ProductionWebhookOutputSchema,
  requiresApproval: true,
  timeoutMs: 15000,
  maxRetries: 1,
  execute: async (input, context) => {
    const actionId = 'act_' + Math.random().toString(36).substring(2, 10);
    const approvedBy = context?.approvedBy || 'Operator (Admin Session)';

    // In a real environment, this sends a webhook to production deployment / payment gateway
    return {
      actionId,
      actionType: input.actionType,
      status: 'EXECUTED' as const,
      target: input.target,
      summary: `High-stakes action '${input.actionType}' safely executed on target '${input.target}'. Justification: ${input.reason}`,
      executedAt: new Date().toISOString(),
      approvedBy,
    };
  },
});
