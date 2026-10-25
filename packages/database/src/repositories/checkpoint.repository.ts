import { prisma } from '../client.js';
import { CheckpointStatus } from '@prisma/client';
import type { Prisma, WorkflowCheckpoint } from '@prisma/client';

export interface CreateCheckpointInput {
  threadId: string;
  stepNumber: number;
  nodeName: string;
  stateSnapshot: Record<string, unknown>;
  status?: CheckpointStatus;
}

export class CheckpointRepository {
  private static inMemoryCheckpoints: WorkflowCheckpoint[] = [];

  async saveCheckpoint(input: CreateCheckpointInput): Promise<WorkflowCheckpoint> {
    const memoryRecord: WorkflowCheckpoint = {
      id: 'chk_' + Math.random().toString(36).substring(2, 10),
      threadId: input.threadId,
      stepNumber: input.stepNumber,
      nodeName: input.nodeName,
      stateSnapshot: input.stateSnapshot as Prisma.JsonValue,
      status: input.status ?? CheckpointStatus.RUNNING,
      createdAt: new Date(),
    };

    CheckpointRepository.inMemoryCheckpoints.push(memoryRecord);

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowCheckpoint.create({
          data: {
            threadId: input.threadId,
            stepNumber: input.stepNumber,
            nodeName: input.nodeName,
            stateSnapshot: input.stateSnapshot as Prisma.InputJsonValue,
            status: input.status ?? CheckpointStatus.RUNNING,
          },
        });
      }
    } catch {}

    return memoryRecord;
  }

  async getLatestCheckpoint(threadId: string): Promise<WorkflowCheckpoint | null> {
    try {
      if (process.env.DATABASE_URL) {
        const res = await prisma.workflowCheckpoint.findFirst({
          where: { threadId },
          orderBy: { stepNumber: 'desc' },
        });
        if (res) return res;
      }
    } catch {}

    const matches = CheckpointRepository.inMemoryCheckpoints
      .filter((c) => c.threadId === threadId)
      .sort((a, b) => b.stepNumber - a.stepNumber);
    return matches[0] || null;
  }

  async getLatestAwaitingApproval(threadId: string): Promise<WorkflowCheckpoint | null> {
    try {
      if (process.env.DATABASE_URL) {
        const res = await prisma.workflowCheckpoint.findFirst({
          where: {
            threadId,
            status: CheckpointStatus.AWAITING_APPROVAL,
          },
          orderBy: { stepNumber: 'desc' },
        });
        if (res) return res;
      }
    } catch {}

    const matches = CheckpointRepository.inMemoryCheckpoints
      .filter((c) => c.threadId === threadId && c.status === CheckpointStatus.AWAITING_APPROVAL)
      .sort((a, b) => b.stepNumber - a.stepNumber);
    return matches[0] || null;
  }

  async updateCheckpointStatus(
    id: string,
    status: CheckpointStatus
  ): Promise<WorkflowCheckpoint> {
    const inMem = CheckpointRepository.inMemoryCheckpoints.find((c) => c.id === id);
    if (inMem) {
      inMem.status = status;
    }

    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowCheckpoint.update({
          where: { id },
          data: { status },
        });
      }
    } catch {}

    return inMem || {
      id,
      threadId: 'default',
      stepNumber: 1,
      nodeName: 'unknown',
      stateSnapshot: {},
      status,
      createdAt: new Date(),
    };
  }

  async listCheckpoints(threadId: string): Promise<WorkflowCheckpoint[]> {
    try {
      if (process.env.DATABASE_URL) {
        return await prisma.workflowCheckpoint.findMany({
          where: { threadId },
          orderBy: { stepNumber: 'asc' },
        });
      }
    } catch {}

    return CheckpointRepository.inMemoryCheckpoints
      .filter((c) => c.threadId === threadId)
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }

  static clearInMemory(): void {
    CheckpointRepository.inMemoryCheckpoints = [];
  }
}

export const checkpointRepository = new CheckpointRepository();
