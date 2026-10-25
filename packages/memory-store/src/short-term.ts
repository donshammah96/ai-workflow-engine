import { estimateMessageTokens, estimateMessagesTokens, type MessageLike } from './token-counter.js';
import { threadRepository } from '@ai-workflow/database';

export interface TrimOptions {
  preserveSystemPrompt?: boolean;
  minLatestMessages?: number;
}

/**
 * Trims a sequence of messages so their total token estimate does not exceed budget.
 * Guarantees system prompt (if present) is retained and newest messages take priority.
 */
export function trimMessagesToTokenBudget<T extends MessageLike>(
  messages: T[],
  tokenBudget: number,
  options: TrimOptions = {}
): T[] {
  const { preserveSystemPrompt = true, minLatestMessages = 2 } = options;

  if (messages.length === 0) return [];
  if (estimateMessagesTokens(messages) <= tokenBudget) {
    return [...messages];
  }

  const systemMessage = preserveSystemPrompt && messages[0]?.role === 'system' ? messages[0] : null;
  const nonSystemMessages = systemMessage ? messages.slice(1) : [...messages];

  let currentBudget = tokenBudget;
  if (systemMessage) {
    currentBudget -= estimateMessageTokens(systemMessage);
  }

  // Work backwards from newest messages to older
  const retained: T[] = [];
  let accumulatedTokens = 0;

  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i]!;
    const msgTokens = estimateMessageTokens(msg);

    // Always include at least minLatestMessages if available
    const isWithinMinLatest = nonSystemMessages.length - 1 - i < minLatestMessages;

    if (isWithinMinLatest || accumulatedTokens + msgTokens <= currentBudget) {
      retained.unshift(msg);
      accumulatedTokens += msgTokens;
    } else {
      // Cannot fit older messages
      break;
    }
  }

  const result: T[] = [];
  if (systemMessage) {
    result.push(systemMessage);
  }
  result.push(...retained);
  return result;
}

export type SummarizerFunction = (olderMessages: MessageLike[]) => Promise<string>;

export interface CompactionOptions {
  thresholdTurns?: number;
  preserveLatestTurns?: number;
}

/**
 * Compresses older messages into a thread summary when turn count exceeds threshold.
 */
export async function compactThreadHistory<T extends MessageLike>(
  threadId: string,
  messages: T[],
  summarizer: SummarizerFunction,
  options: CompactionOptions = {}
): Promise<{ compactedMessages: T[]; summary: string | null }> {
  const threshold = options.thresholdTurns ?? 15;
  const preserveLatest = options.preserveLatestTurns ?? 4;

  if (messages.length <= threshold) {
    return { compactedMessages: messages, summary: null };
  }

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
  const chatMessages = systemMessage ? messages.slice(1) : messages;

  const olderCount = Math.max(0, chatMessages.length - preserveLatest);
  if (olderCount === 0) {
    return { compactedMessages: messages, summary: null };
  }

  const olderMessages = chatMessages.slice(0, olderCount);
  const recentMessages = chatMessages.slice(olderCount);

  // Invoke summarizer
  const summary = await summarizer(olderMessages);

  // Persist summary to database thread
  try {
    await threadRepository.updateSummary(threadId, summary);
  } catch (err) {
    console.warn(`[compactThreadHistory] Failed to persist thread summary:`, err);
  }

  // Insert a synthetic context message representing the summary
  const summaryContextMessage = {
    role: 'system',
    content: `[Previous Conversation Summary & Key Context]:\n${summary}`,
  } as unknown as T;

  const compactedMessages: T[] = [];
  if (systemMessage) {
    compactedMessages.push(systemMessage);
  }
  compactedMessages.push(summaryContextMessage);
  compactedMessages.push(...recentMessages);

  return { compactedMessages, summary };
}
