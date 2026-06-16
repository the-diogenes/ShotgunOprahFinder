import { fetchPage, isOprah, validateLink, resolveLink, OPRAH_TITLE } from './wikipedia'
import { PROVIDERS } from './providers'
import { logger } from './logger'
import type { ApiKeys, RacerRun, Turn, CompetitorConfig } from '../types'
import type { AgentRequest } from '../types'

export const DEFAULT_HOST_PROMPT = `Play aggressively. Your goal is to reach Oprah Winfrey as quickly as possible.
Prefer links that move toward media, television, celebrities, American culture,
talk shows, actors, producers, journalists, and high-connectivity hubs.
Avoid narrow local dead ends unless they are the only escape route.`

export const MAX_LINKS_TO_MODEL = 200

type TurnCallback = (racerId: string, turn: Turn) => void
type StatusCallback = (racerId: string, status: RacerRun['status']) => void

// Pick `count` items spread evenly across the array (avoids alphabetical bias
// when truncating a large sorted link list).
function sampleEvenly<T>(arr: T[], count: number): T[] {
  if (count >= arr.length) return arr
  if (count <= 0) return []
  const step = arr.length / count
  const out: T[] = []
  for (let i = 0; i < count; i++) {
    out.push(arr[Math.floor(i * step)])
  }
  return out
}

export async function runRacerTurn(
  racer: RacerRun,
  config: CompetitorConfig,
  startPageTitle: string,
  hostPrompt: string,
  maxClicks: number,
  apiKeys: ApiKeys,
  includeSummary: boolean,
  onTurn: TurnCallback,
  onStatus: StatusCallback,
): Promise<void> {
  const visited = racer.turns.map((t) => t.currentPageTitle)
  const currentPageTitle = racer.turns.length > 0
    ? racer.turns[racer.turns.length - 1].resultingPageTitle
    : startPageTitle

  logger.info('engine', `[${racer.competitorName}] Turn ${racer.turns.length + 1} — current: "${currentPageTitle}" | clicks: ${racer.clicks}/${maxClicks}`)

  if (racer.status !== 'running') {
    logger.warn('engine', `[${racer.competitorName}] Skipping — status is "${racer.status}"`)
    return
  }

  const t0 = Date.now()

  let page
  try {
    page = await fetchPage(currentPageTitle)
  } catch (err) {
    logger.error('engine', `[${racer.competitorName}] Wikipedia fetch failed for "${currentPageTitle}"`, String(err))
    onStatus(racer.id, 'dnf_provider_error')
    return
  }

  // Candidate links: drop already-visited pages
  const allLinks = page.links.filter((l) => !visited.includes(l))

  // Cap links sent to the model for token budget — but NEVER hide the target.
  // (page.links is sorted alphabetically, so a naive slice both biases toward
  // early-alphabet pages and can drop "Oprah Winfrey" entirely.)
  let availableLinks: string[]
  if (allLinks.length <= MAX_LINKS_TO_MODEL) {
    availableLinks = allLinks
  } else {
    const targetLinks = allLinks.filter((l) => isOprah(l))
    const rest = allLinks.filter((l) => !isOprah(l))
    const sampled = sampleEvenly(rest, MAX_LINKS_TO_MODEL - targetLinks.length)
    availableLinks = [...targetLinks, ...sampled].sort()
    logger.warn('engine', `[${racer.competitorName}] Page has ${allLinks.length} links — sampled ${availableLinks.length} (target always kept)`)
  }

  if (availableLinks.length === 0) {
    logger.warn('engine', `[${racer.competitorName}] No unvisited links remain — dead end`)
    onStatus(racer.id, 'dnf_max_clicks')
    return
  }

  const provider = PROVIDERS[config.providerId]
  const apiKey = apiKeys[config.providerId as keyof ApiKeys] ?? ''

  const agentReq: AgentRequest = {
    model: config.modelId,
    systemPrompt: '',
    hostPrompt,
    gameState: {
      goal: `Reach the Wikipedia page "${OPRAH_TITLE}".`,
      rules: [
        'Choose exactly one link from available_links.',
        'Do not choose a page already in visited_pages.',
        'Do not invent links — only use exact titles from available_links.',
        'Return strict JSON only.',
      ],
      clicksUsed: racer.clicks,
      clicksRemaining: maxClicks - racer.clicks,
      visitedPages: visited,
      currentPage: {
        title: page.canonicalTitle,
        summary: includeSummary ? page.summary : '',
        availableLinks,
      },
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }

  let agentResponse
  try {
    agentResponse = await provider.callAgent(agentReq, apiKey)
  } catch (err) {
    logger.error('engine', `[${racer.competitorName}] Provider call failed`, String(err))
    const turn: Turn = {
      turnIndex: racer.turns.length,
      currentPageTitle: page.canonicalTitle,
      availableLinks,
      chosenLink: '',
      resultingPageTitle: page.canonicalTitle,
      publicScratchpad: String(err),
      confidence: 0,
      latencyMs: Date.now() - t0,
      validationStatus: 'json_error',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    }
    onTurn(racer.id, turn)
    onStatus(racer.id, 'dnf_provider_error')
    return
  }

  const latencyMs = Date.now() - t0

  // Validate the chosen link
  const isValid = validateLink(agentResponse.chosenLink, availableLinks)
  const resolved = resolveLink(agentResponse.chosenLink, availableLinks)

  if (!isValid || !resolved) {
    const turn: Turn = {
      turnIndex: racer.turns.length,
      currentPageTitle: page.canonicalTitle,
      availableLinks,
      chosenLink: agentResponse.chosenLink,
      resultingPageTitle: page.canonicalTitle,
      publicScratchpad: agentResponse.publicScratchpad,
      confidence: agentResponse.confidence,
      latencyMs,
      validationStatus: 'invalid_link',
      inputTokens: agentResponse.inputTokens,
      outputTokens: agentResponse.outputTokens,
      costUsd: agentResponse.costUsd,
    }
    onTurn(racer.id, turn)
    onStatus(racer.id, 'dnf_invalid_link')
    return
  }

  if (visited.includes(resolved)) {
    const turn: Turn = {
      turnIndex: racer.turns.length,
      currentPageTitle: page.canonicalTitle,
      availableLinks,
      chosenLink: resolved,
      resultingPageTitle: resolved,
      publicScratchpad: agentResponse.publicScratchpad,
      confidence: agentResponse.confidence,
      latencyMs,
      validationStatus: 'repeat_page',
      inputTokens: agentResponse.inputTokens,
      outputTokens: agentResponse.outputTokens,
      costUsd: agentResponse.costUsd,
    }
    onTurn(racer.id, turn)
    onStatus(racer.id, 'dnf_repeat_page')
    return
  }

  const turn: Turn = {
    turnIndex: racer.turns.length,
    currentPageTitle: page.canonicalTitle,
    availableLinks,
    chosenLink: resolved,
    resultingPageTitle: resolved,
    publicScratchpad: agentResponse.publicScratchpad,
    confidence: agentResponse.confidence,
    latencyMs,
    validationStatus: 'ok',
    inputTokens: agentResponse.inputTokens,
    outputTokens: agentResponse.outputTokens,
    costUsd: agentResponse.costUsd,
  }

  onTurn(racer.id, turn)

  if (isOprah(resolved)) {
    onStatus(racer.id, 'success')
  } else if (racer.clicks + 1 >= maxClicks) {
    onStatus(racer.id, 'dnf_max_clicks')
  }
}

export function makeRacerRun(config: CompetitorConfig, startPageTitle: string): RacerRun {
  return {
    id: `${config.id}-${Date.now()}`,
    competitorName: config.displayName,
    providerId: config.providerId,
    modelId: config.modelId,
    status: 'pending',
    clicks: 0,
    elapsedMs: 0,
    invalidAttempts: 0,
    turns: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    startPageTitle,
  }
}
