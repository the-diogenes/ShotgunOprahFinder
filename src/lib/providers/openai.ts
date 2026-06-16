import type { LLMProviderAdapter } from './types'
import { SYSTEM_PROMPT, buildUserMessage, parseAgentJson, fetchWithRetry } from './types'
import { calcCostUsd } from '../costs'
import { logger } from '../logger'
import { resolveGenerationCaps } from '../providerCaps'
import type { AgentRequest, AgentResponse } from '../../types'

export const openaiAdapter: LLMProviderAdapter = {
  id: 'openai',
  displayName: 'OpenAI',
  defaultModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],

  async callAgent(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    logger.info('api', `OpenAI → ${request.model} | page: "${request.gameState.currentPage.title}" | links: ${request.gameState.currentPage.availableLinks.length} | key: ${apiKey ? apiKey.slice(0,8)+'…' : 'MISSING'}`)
    const caps = resolveGenerationCaps('openai', request.model, request.maxTokens)
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

    const res = await fetchWithRetry('OpenAI', 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.error('api', `OpenAI ${res.status} error`, err)
      throw new Error(`OpenAI error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const raw: string = data.choices[0]?.message?.content ?? ''
    const inputTokens: number = data.usage?.prompt_tokens ?? 0
    const outputTokens: number = data.usage?.completion_tokens ?? 0
    const costUsd = calcCostUsd(request.model, inputTokens, outputTokens)
    logger.info('api', `OpenAI ✓ ${request.model} | in:${inputTokens} out:${outputTokens} | chose: "${JSON.parse(raw.replace(/^```json?\s*/i,'').replace(/```\s*$/i,'').trim()).chosen_link ?? '?'}"`)

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
