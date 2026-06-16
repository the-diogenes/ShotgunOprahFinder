import type { LLMProviderAdapter } from './types'
import { SYSTEM_PROMPT, buildUserMessage, parseAgentJson, fetchWithRetry } from './types'
import { calcCostUsd } from '../costs'
import { logger } from '../logger'
import { resolveGenerationCaps } from '../providerCaps'
import type { AgentRequest, AgentResponse } from '../../types'

const AGENT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    chosen_link: { type: 'STRING' },
    public_scratchpad: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['chosen_link', 'public_scratchpad', 'confidence'],
}

function buildGoogleBody(request: AgentRequest, strictRetry: boolean) {
  const caps = resolveGenerationCaps('google', request.model, request.maxTokens)
  const userText = strictRetry
    ? `${buildUserMessage(request)}\n\nIMPORTANT: Return ONLY a JSON object with keys chosen_link, public_scratchpad, confidence. No preamble, no markdown.`
    : buildUserMessage(request)

  const generationConfig: Record<string, unknown> = {
    temperature: request.temperature,
    maxOutputTokens: caps.outputTokens,
    responseMimeType: 'application/json',
    responseSchema: AGENT_RESPONSE_SCHEMA,
  }
  if (caps.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = { thinkingBudget: caps.thinkingBudget }
  }

  return {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig,
  }
}

function extractGoogleText(candidate: { content?: { parts?: Array<{ text?: string; thought?: boolean }> } }): string {
  const parts = candidate.content?.parts ?? []
  // Prefer non-thought text parts; join if multiple
  const texts = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text as string)
  if (texts.length > 0) return texts.join('\n')
  return parts.find((p) => p.text)?.text ?? ''
}

async function callGoogleOnce(
  request: AgentRequest,
  apiKey: string,
  strictRetry: boolean,
): Promise<{ raw: string; inputTokens: number; outputTokens: number; finishReason: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`
  const body = buildGoogleBody(request, strictRetry)

  const res = await fetchWithRetry('Google', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    logger.error('api', `Google ${res.status} error`, err)
    throw new Error(`Google error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const raw: string = extractGoogleText(candidate ?? {})
  const finishReason: string = candidate?.finishReason ?? 'UNKNOWN'
  const inputTokens: number = data.usageMetadata?.promptTokenCount ?? 0
  const outputTokens: number = data.usageMetadata?.candidatesTokenCount ?? 0
  const thoughts: number = data.usageMetadata?.thoughtsTokenCount ?? 0

  if (finishReason !== 'STOP') {
    logger.warn('api', `Google ${request.model} finishReason=${finishReason} out=${outputTokens} thoughts=${thoughts}`, raw.slice(0, 200))
  }

  return { raw, inputTokens, outputTokens, finishReason }
}

export const googleAdapter: LLMProviderAdapter = {
  id: 'google',
  displayName: 'Google',
  defaultModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],

  async callAgent(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    logger.info('api', `Google → ${request.model} | page: "${request.gameState.currentPage.title}" | key: ${apiKey ? apiKey.slice(0,8)+'…' : 'MISSING'}`)

    let totalIn = 0
    let totalOut = 0
    let lastRaw = ''

    for (let attempt = 0; attempt < 2; attempt++) {
      const strictRetry = attempt === 1
      const { raw, inputTokens, outputTokens, finishReason } = await callGoogleOnce(request, apiKey, strictRetry)
      totalIn += inputTokens
      totalOut += outputTokens
      lastRaw = raw

      try {
        const costUsd = calcCostUsd(request.model, totalIn, totalOut)
        const result = parseAgentJson(
          raw,
          request.gameState.currentPage.availableLinks,
          request.model,
          totalIn,
          totalOut,
          costUsd,
        )
        logger.info('api', `Google ✓ ${request.model} | in:${totalIn} out:${totalOut} | chose: "${result.chosenLink}"${attempt ? ' (retry)' : ''}`)
        return result
      } catch (err) {
        if (attempt === 0) {
          logger.warn('api', `Google ${request.model} parse failed (${finishReason}) — retrying`, raw.slice(0, 200))
          continue
        }
        throw err
      }
    }

    throw new Error(`Invalid JSON from ${request.model}: ${lastRaw.slice(0, 200)}`)
  },
}
