import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

export type SupportedModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'claude-3-7-sonnet'
  | 'claude-3-5-sonnet'
  | 'gemini-2.5-pro'
  | 'gemini-1.5-flash'
  | 'mock-ai';

export function getLanguageModel(modelName: string = 'gpt-4o'): {
  model: LanguageModelV1 | null;
  isMock: boolean;
  name: string;
} {
  const isMockExplicit = process.env.USE_MOCK_LLM === 'true' || modelName === 'mock-ai';

  if (isMockExplicit) {
    return { model: null, isMock: true, name: 'mock-ai' };
  }

  try {
    switch (modelName) {
      case 'claude-3-7-sonnet':
      case 'claude-3-5-sonnet':
        if (process.env.ANTHROPIC_API_KEY) {
          return { model: anthropic(modelName), isMock: false, name: modelName };
        }
        break;

      case 'gemini-2.5-pro':
      case 'gemini-1.5-flash':
        if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          return { model: google(modelName), isMock: false, name: modelName };
        }
        break;

      case 'gpt-4o-mini':
      case 'gpt-4o':
      default:
        if (process.env.OPENAI_API_KEY) {
          return { model: openai(modelName), isMock: false, name: modelName };
        }
        break;
    }
  } catch (err) {
    console.warn(`[getLanguageModel] Model initialization failed for '${modelName}', falling back to mock:`, err);
  }

  // Graceful fallback to mock LLM if no API keys are present
  return { model: null, isMock: true, name: 'mock-ai' };
}
