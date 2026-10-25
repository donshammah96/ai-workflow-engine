export interface MessageLike {
  role: string;
  content: string | unknown;
  name?: string;
}

/**
 * Estimates token count for a string or object.
 * Standard heuristic: ~4 characters per token for English text and code,
 * plus per-message overhead in chat formats.
 */
export function estimateTokens(input: string | unknown): number {
  if (input === null || input === undefined) return 0;
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  if (!text) return 0;
  // Standard token count approximation: roughly 1 token per 3.7 - 4 characters + word boundary factor
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  const estimated = Math.max(Math.ceil(chars / 3.8), words);
  return estimated;
}

export function estimateMessageTokens(message: MessageLike): number {
  // 4 tokens overhead per message (role, delimiters, etc.)
  let tokens = 4;
  tokens += estimateTokens(message.role);
  tokens += estimateTokens(message.content);
  if (message.name) {
    tokens += estimateTokens(message.name);
  }
  return tokens;
}

export function estimateMessagesTokens(messages: MessageLike[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 3); // +3 tokens for assistant reply prompt
}
