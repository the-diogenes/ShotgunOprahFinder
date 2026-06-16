import type { LLMProviderAdapter } from './types'
import { SYSTEM_PROMPT, buildUserMessage, parseAgentJson, fetchWithRetry } from './types'
import { calcCostUsd } from '../costs'
import { logger } from '../logger'
import { resolveGenerationCaps } from '../providerCaps'
import type { AgentRequest, AgentResponse } from '../../types'

export const anthropicAdapter: LLMProviderAdapter = {
  id: 'anthropic',
  displayName: 'Anthropic',
  defaultModels: ['claude-haiku-3-5', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-5', 'claude-3-5-sonnet-20241022'],

  async callAgent(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    logger.info('api', `Anthropic → ${request.model} | page: "${request.gameState.currentPage.title}" | key: ${apiKey ? apiKey.slice(0,16)+'…' : 'MISSING'}`)
    const caps = resolveGenerationCaps('anthropic', request.model, request.maxTokens)
    const body = {
      model: request.model,
      temperature: request.temperature,
      max_tokens: caps.outputTokens,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserMessage(request) },
      ],
    }

    const res = await fetchWithRetry('Anthropic', 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.error('api', `Anthropic ${res.status} error`, err)
      throw new Error(`Anthropic error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const raw: string = data.content[0]?.text ?? ''
    const inputTokens: number = data.usage?.input_tokens ?? 0
    const outputTokens: number = data.usage?.output_tokens ?? 0
    const costUsd = calcCostUsd(request.model, inputTokens, outputTokens)
    logger.info('api', `Anthropic ✓ ${request.model} | in:${inputTokens} out:${outputTokens}`)

    return parseAgentJson(
      raw,
      request.gameState.currentPage.availableLinks,
      request.model,
      inputTokens,
      outputTokens,
      costUsd,
    )
  },
}
