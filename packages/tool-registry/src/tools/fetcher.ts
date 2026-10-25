import { z } from 'zod';
import { defineWorkflowTool } from '../define-tool.js';

export const HttpFetcherInputSchema = z.object({
  url: z.string().url().describe('The HTTPS REST API endpoint URL to fetch'),
  method: z.enum(['GET', 'POST']).optional().default('GET').describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('Optional request headers'),
  body: z.record(z.unknown()).optional().describe('Optional JSON payload for POST requests'),
});

export const HttpFetcherOutputSchema = z.object({
  url: z.string(),
  status: z.number(),
  statusText: z.string(),
  data: z.unknown(),
  schemaPreview: z.record(z.string()),
});

// Domain allowlist for safe deterministic fetching
const DEFAULT_ALLOWED_DOMAINS = [
  'jsonplaceholder.typicode.com',
  'api.github.com',
  'httpbin.org',
  'api.open-meteo.com',
  'dummyjson.com',
  'raw.githubusercontent.com',
  'api.coingecko.com',
];

function extractSchemaTypes(obj: unknown): Record<string, string> {
  if (typeof obj !== 'object' || obj === null) {
    return { type: typeof obj };
  }
  const preview: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      preview[k] = `Array<${v.length > 0 ? typeof v[0] : 'unknown'}>`;
    } else if (v === null) {
      preview[k] = 'null';
    } else {
      preview[k] = typeof v;
    }
  }
  return preview;
}

export const liveHttpJsonFetcherTool = defineWorkflowTool({
  name: 'live_http_json_fetcher',
  description: 'Fetches structured JSON data from external public REST APIs with strict domain allowlisting and schema type extraction.',
  inputSchema: HttpFetcherInputSchema,
  outputSchema: HttpFetcherOutputSchema,
  requiresApproval: false,
  timeoutMs: 8000,
  maxRetries: 2,
  execute: async ({ url, method, headers = {}, body }) => {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    const isAllowed = DEFAULT_ALLOWED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );

    if (!isAllowed) {
      throw new Error(
        `Domain '${hostname}' is not in the allowed domain list for security and isolation.`
      );
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Workflow-Engine/1.0',
        ...headers,
      },
      body: method === 'POST' && body ? JSON.stringify(body) : undefined,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = { rawText: await response.text() };
    }

    const schemaPreview = extractSchemaTypes(
      Array.isArray(data) && data.length > 0 ? data[0] : data
    );

    return {
      url,
      status: response.status,
      statusText: response.statusText,
      data,
      schemaPreview,
    };
  },
});
