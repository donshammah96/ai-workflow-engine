import { prisma } from '../client.js';
import type { Prisma, ToolExecutionAudit } from '@prisma/client';

export interface RecordToolAuditInput {
  threadId?: string;
  stepId?: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR' | 'AWAITING_APPROVAL' | 'REJECTED';
  requiresApproval?: boolean;
  approvedBy?: string;
}

export class AuditRepository {
  private static inMemoryAudits: ToolExecutionAudit[] = [];

  async recordToolAudit(input: RecordToolAuditInput): Promise<ToolExecutionAudit> {
    const memoryRecord: ToolExecutionAudit = {
      id: 'aud_' + Math.random().toString(36).substring(2, 10),
      threadId: input.threadId ?? null,
      stepId: input.stepId ?? null,
      toolName: input.toolName,
      args: input.args as Prisma.JsonValue,
      result: (input.result ?? null) as Prisma.JsonValue,
      latencyMs: input.latencyMs,
      status: input.status,
      requiresApproval: input.requiresApproval ?? false,
      approvedBy: input.approvedBy ?? null,
      createdAt: new Date(),
    };

    AuditRepository.inMemoryAudits.push(memoryRecord);

    if (process.env.DATABASE_URL) {
      try {
        return await prisma.toolExecutionAudit.create({
          data: {
            id: memoryRecord.id,
            threadId: input.threadId,
            stepId: input.stepId,
            toolName: input.toolName,
            args: input.args as Prisma.InputJsonValue,
            result: (input.result ?? null) as Prisma.InputJsonValue,
            latencyMs: input.latencyMs,
            status: input.status,
            requiresApproval: input.requiresApproval ?? false,
            approvedBy: input.approvedBy,
          },
        });
      } catch {}
    }

    return memoryRecord;
  }

  async listAuditsForThread(threadId: string): Promise<ToolExecutionAudit[]> {
    if (process.env.DATABASE_URL) {
      try {
        return await prisma.toolExecutionAudit.findMany({
          where: { threadId },
          orderBy: { createdAt: 'desc' },
        });
      } catch {}
    }

    return AuditRepository.inMemoryAudits
      .filter((a) => a.threadId === threadId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export const auditRepository = new AuditRepository();
