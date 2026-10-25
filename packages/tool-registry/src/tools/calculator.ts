import { z } from 'zod';
import { defineWorkflowTool } from '../define-tool.js';

export const CalculatorInputSchema = z.object({
  expression: z.string().describe('The mathematical or statistical expression to evaluate, e.g., "2 * (15 + 45) / 3" or "mean([10, 20, 30, 40])"'),
});

export const CalculatorOutputSchema = z.object({
  expression: z.string(),
  result: z.number(),
  formatted: z.string(),
});

function safeEvalMath(expr: string): number {
  // Statistical helper replacements
  let sanitized = expr.trim();

  // Helper for mean([1, 2, 3])
  sanitized = sanitized.replace(/mean\(\[([^\]]+)\]\)/g, (_, nums) => {
    const list = nums.split(',').map((n: string) => Number(n.trim())).filter((n: number) => !isNaN(n));
    if (list.length === 0) return '0';
    const sum = list.reduce((a: number, b: number) => a + b, 0);
    return `(${sum} / ${list.length})`;
  });

  // Helper for sum([1, 2, 3])
  sanitized = sanitized.replace(/sum\(\[([^\]]+)\]\)/g, (_, nums) => {
    const list = nums.split(',').map((n: string) => Number(n.trim())).filter((n: number) => !isNaN(n));
    const sum = list.reduce((a: number, b: number) => a + b, 0);
    return `(${sum})`;
  });

  // Validate only allowed math characters: digits, ., +, -, *, /, %, (, ), Math functions
  const isSafe = /^[\d\s+\-*/%().,^eMath.sqrt(Math.pow(Math.abs(Math.sin(Math.cos(Math.tan(Math.log(Math.round(Math.floor(Math.ceil()]+$/i.test(
    sanitized.replace(/Math\.[a-z]+/gi, '')
  );

  if (!isSafe) {
    throw new Error(`Expression contains forbidden characters: ${expr}`);
  }

  // Safe evaluation using Function with Math context only
  const evalFunc = new Function('Math', `return (${sanitized});`);
  const result = evalFunc(Math);

  if (typeof result !== 'number' || isNaN(result)) {
    throw new Error(`Expression did not evaluate to a valid number: ${expr}`);
  }

  return Number(result.toFixed(6));
}

export const calculatorMathTool = defineWorkflowTool({
  name: 'calculator_math_eval',
  description: 'Deterministic mathematical and statistical expression evaluator. Supports arithmetic, logarithms, roots, and array statistics like mean([..]) and sum([..]).',
  inputSchema: CalculatorInputSchema,
  outputSchema: CalculatorOutputSchema,
  requiresApproval: false,
  timeoutMs: 3000,
  maxRetries: 1,
  execute: async ({ expression }) => {
    const result = safeEvalMath(expression);
    return {
      expression,
      result,
      formatted: `${expression} = ${result}`,
    };
  },
});
