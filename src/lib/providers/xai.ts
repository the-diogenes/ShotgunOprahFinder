import type { LLMProviderAdapter } from './types'
import { SYSTEM_PROMPT, buildUserMessage, parseAgentJson, fetchWithRetry } from './types'
import { calcCostUsd } from '../costs'
import { logger } from '../logger'
import { resolveGenerationCaps } from '../providerCaps'
import type { AgentRequest, AgentResponse } from '../../types'

export const xaiAdapter: LLMProviderAdapter = {
  id: 'xai',
  displayName: 'xAI / Grok',
  defaultModels: ['grok-3-mini', 'grok-3', 'grok-2-1212'],

  async callAgent(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    logger.info('api', `xAI → ${request.model} | page: "${request.gameState.currentPage.title}" | key: ${apiKey ? apiKey.slice(0,8)+'…' : 'MISSING'}`)
    const caps = resolveGenerationCaps('xai', request.model, request.maxTokens)
    const body = {
      model: request.model,
      temperature: request.temperature,
      max_tokens: caps.outputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(request) },
      ],
    }

    const res = await fetchWithRetry('xAI', 'https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.error('api', `xAI ${res.status} error`, err)
      throw new Error(`xAI error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const raw: string = data.choices[0]?.message?.content ?? ''
    const inputTokens: number = data.usage?.prompt_tokens ?? 0
    const outputTokens: number = data.usage?.completion_tokens ?? 0
    const costUsd = calcCostUsd(request.model, inputTokens, outputTokens)
    logger.info('api', `xAI ✓ ${request.model} | in:${inputTokens} out:${outputTokens}`)

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
