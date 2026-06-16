import type { ProviderId } from '../types'

/** Per-provider generation limits — adapters read these instead of hard-coding. */
export interface GenerationCaps {
  /** Floor for max output tokens (avoids truncated JSON). */
  minOutputTokens: number
  /** Ceiling even if UI asks for more. */
  maxOutputTokens: number
  /** Google Gemini only: 0 = disable thinking tokens stealing the output budget. */
  thinkingBudget?: number
}

export interface ResolvedGenerationCaps extends GenerationCaps {
  outputTokens: number
}

const DEFAULTS: Record<ProviderId, GenerationCaps> = {
  openai:    { minOutputTokens: 256, maxOutputTokens: 1024 },
  anthropic: { minOutputTokens: 256, maxOutputTokens: 1024 },
  google:    { minOutputTokens: 512, maxOutputTokens: 2048, thinkingBudget: 0 },
  xai:       { minOutputTokens: 256, maxOutputTokens: 1024 },
  shotgunbot:{ minOutputTokens: 0,   maxOutputTokens: 0 },
}

/** Model-id patterns → cap overrides (first match wins). Add new models here. */
const MODEL_OVERRIDES: Array<{ test: (modelId: string) => boolean; caps: Partial<GenerationCaps> }> = [
  // Gemini 2.5+ thinking models — never let thinking eat the JSON budget
  { test: (m) => /^gemini-2\.5/.test(m), caps: { minOutputTokens: 512, thinkingBudget: 0 } },
  { test: (m) => /^gemini-3/.test(m), caps: { minOutputTokens: 512, thinkingBudget: 0 } },
  { test: (m) => m === 'gemini-flash-latest' || m === 'gemini-pro-latest', caps: { minOutputTokens: 512, thinkingBudget: 0 } },
  // OpenAI reasoning / o-series — need more headroom for structured output
  { test: (m) => /^o[0-9]/.test(m), caps: { minOutputTokens: 512, maxOutputTokens: 2048 } },
  { test: (m) => /^gpt-5/.test(m), caps: { minOutputTokens: 384, maxOutputTokens: 1536 } },
  // xAI reasoning variants
  { test: (m) => m.includes('reasoning'), caps: { minOutputTokens: 512, maxOutputTokens: 2048 } },
  // Anthropic opus — larger outputs OK
  { test: (m) => m.includes('opus'), caps: { minOutputTokens: 384, maxOutputTokens: 1536 } },
]

export function resolveGenerationCaps(
  providerId: ProviderId,
  modelId: string,
  userMaxTokens: number,
): ResolvedGenerationCaps {
  let caps: GenerationCaps = { ...DEFAULTS[providerId] }

  for (const rule of MODEL_OVERRIDES) {
    if (rule.test(modelId)) {
      caps = { ...caps, ...rule.caps }
    }
  }

  const requested = userMaxTokens > 0 ? userMaxTokens : caps.minOutputTokens
  const outputTokens = Math.min(
    caps.maxOutputTokens,
    Math.max(caps.minOutputTokens, requested),
  )

  return { ...caps, outputTokens }
}
