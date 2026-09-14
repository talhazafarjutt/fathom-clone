import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Two interchangeable LLM providers.
 *
 *   groq      — free/cheap, fast. Default when GROQ_API_KEY is present.
 *   anthropic — higher quality summaries, paid.
 *
 * Pick explicitly with LLM_PROVIDER; otherwise whichever key exists wins,
 * preferring Groq because it costs nothing to run a demo on.
 */
export type LlmProvider = "groq" | "anthropic";

export function llmProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "groq" || explicit === "anthropic") return explicit;
  if (process.env.GROQ_API_KEY) return "groq";
  return "anthropic";
}

// gpt-oss-120b is the Groq model that supports strict JSON-schema decoding,
// which is what keeps the summary pipeline from having to parse free text.
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export function activeModel() {
  return llmProvider() === "groq" ? GROQ_MODEL : ANTHROPIC_MODEL;
}

let groqClient: Groq | null = null;
let anthropicClient: Anthropic | null = null;

export function groq() {
  if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

/**
 * Groq strict mode requires every object to list all of its properties as
 * required and to forbid extras. Zod's JSON Schema output is close but not
 * exact, so normalise it here rather than hand-maintaining a second schema.
 */
export function toStrictJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictJsonSchema);
  if (!schema || typeof schema !== "object") return schema;

  const node = { ...(schema as Record<string, unknown>) };
  delete node.$schema;

  for (const key of Object.keys(node)) {
    node[key] = toStrictJsonSchema(node[key]);
  }

  if (node.type === "object" && node.properties && typeof node.properties === "object") {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties as Record<string, unknown>);
  }
  return node;
}
