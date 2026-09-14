import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  if (!client) client = new Anthropic();
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
