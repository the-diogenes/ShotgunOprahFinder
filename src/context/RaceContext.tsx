import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import type { ApiKeys, Race, RacerRun, RaceConfig } from '../types'
import { getRandomPage } from '../lib/wikipedia'
import { runRacerTurn, makeRacerRun } from '../lib/raceEngine'
import { saveRace, saveTurn } from '../lib/db'
import { loadSavedKeys, saveKeys, clearSavedKeys } from '../lib/keyStore'

type Screen = 'landing' | 'setup' | 'race' | 'results'

interface RaceContextValue {
  screen: Screen
  setScreen: (s: Screen) => void
  apiKeys: ApiKeys
  setApiKeys: (k: ApiKeys) => void
  clearKeys: () => void
  race: Race | null
  startRace: (config: RaceConfig) => Promise<void>
  stopRace: () => void
}

const RaceContext = createContext<RaceContextValue | null>(null)

export function RaceProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('landing')
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadSavedKeys())
  const [race, setRace] = useState<Race | null>(null)
  const abortRef = useRef(false)

  const handleSetApiKeys = useCallback((k: ApiKeys) => {
    setApiKeys(k)
    saveKeys(k)
  }, [])

  const clearKeys = useCallback(() => {
    clearSavedKeys()
    setApiKeys({ openai: '', anthropic: '', google: '', xai: '' })
  }, [])

  const stopRace = useCallback(() => {
    abortRef.current = true
  }, [])

  const startRace = useCallback(async (config: RaceConfig) => {
    abortRef.current = false
    setScreen('race')

    const startPage = await getRandomPage()
    const raceId = `race-${Date.now()}`
    const seedLabel = `#${Math.floor(Math.random() * 99999).toString().padStart(5, '0')}`

    const enabledCompetitors = config.competitors.filter((c) => c.enabled)
    const racers: RacerRun[] = enabledCompetitors.map((c) =>
      makeRacerRun(c, startPage.canonicalTitle),
    )

    const newRace: Race = {
      id: raceId,
      seedLabel,
      startPageTitle: startPage.canonicalTitle,
      targetPageTitle: 'Oprah Winfrey',
      maxClicks: config.maxClicks,
      mode: config.mode,
      hostPrompt: config.hostPrompt,
      status: 'running',
      createdAt: new Date().toISOString(),
      racers,
    }

    setRace({ ...newRace })

    await saveRace({
      id: raceId,
      seed_label: seedLabel,
      start_page_title: startPage.canonicalTitle,
      target_page_title: 'Oprah Winfrey',
      max_clicks: config.maxClicks,
      mode: config.mode,
      host_prompt: config.hostPrompt,
      status: 'running',
    })

    // Set all racers to running
    setRace((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        racers: prev.racers.map((r) => ({ ...r, status: 'running' as const })),
      }
    })

    // Turn-based wait mode: all agents take turn N before any takes turn N+1
    const runTurn = async () => {
      if (abortRef.current) return

      setRace((prev) => {
        if (!prev) return prev
        const active = prev.racers.filter((r) => r.status === 'running')
        return active.length === 0 ? { ...prev, status: 'complete' } : prev
      })

      let currentRace: Race | null = null
      setRace((prev) => { currentRace = prev; return prev })
      await new Promise((r) => setTimeout(r, 0)) // flush

      if (!currentRace) return

      const activeRacers = (currentRace as Race).racers.filter((r) => r.status === 'running')
      if (activeRacers.length === 0) {
        setRace((prev) => prev ? { ...prev, status: 'complete' } : prev)
        setScreen('results')
        return
      }

      await Promise.all(
        activeRacers.map((racer) => {
          const competitorConfig = enabledCompetitors.find(
            (c) => c.displayName === racer.competitorName,
          )
          if (!competitorConfig) return Promise.resolve()

          return runRacerTurn(
            racer,
            competitorConfig,
            config.hostPrompt,
            config.maxClicks,
            apiKeys,
            config.includeSummary,
            (racerId, turn) => {
              setRace((prev) => {
                if (!prev) return prev
                return {
                  ...prev,
                  racers: prev.racers.map((r) => {
                    if (r.id !== racerId) return r
                    const updatedTurns = [...r.turns, turn]
                    const totalCost = updatedTurns.reduce((s, t) => s + t.costUsd, 0)
                    const totalIn = updatedTurns.reduce((s, t) => s + t.inputTokens, 0)
                    const totalOut = updatedTurns.reduce((s, t) => s + t.outputTokens, 0)
                    return {
                      ...r,
                      turns: updatedTurns,
                      clicks: r.clicks + (turn.validationStatus === 'ok' ? 1 : 0),
                      invalidAttempts: r.invalidAttempts + (turn.validationStatus !== 'ok' ? 1 : 0),
                      totalCostUsd: totalCost,
                      totalInputTokens: totalIn,
                      totalOutputTokens: totalOut,
                    }
                  }),
                }
              })

              saveTurn({
                id: `${racerId}-turn-${turn.turnIndex}`,
                racer_run_id: racerId,
                turn_index: turn.turnIndex,
                current_page_title: turn.currentPageTitle,
                chosen_link: turn.chosenLink,
                resulting_page_title: turn.resultingPageTitle,
                public_scratchpad: turn.publicScratchpad,
                confidence: turn.confidence,
                latency_ms: turn.latencyMs,
                validation_status: turn.validationStatus,
                input_tokens: turn.inputTokens,
                output_tokens: turn.outputTokens,
                cost_usd: turn.costUsd,
              })
            },
            (racerId, status) => {
              setRace((prev) => {
                if (!prev) return prev
                return {
                  ...prev,
                  racers: prev.racers.map((r) =>
                    r.id === racerId ? { ...r, status } : r,
                  ),
                }
              })
            },
          )
        }),
      )

      if (!abortRef.current) {
        setTimeout(runTurn, 50)
      }
    }

    setTimeout(runTurn, 100)
  }, [apiKeys])

  return (
    <RaceContext.Provider value={{ screen, setScreen, apiKeys, setApiKeys: handleSetApiKeys, clearKeys, race, startRace, stopRace }}>
      {children}
    </RaceContext.Provider>
  )
}

export function useRace() {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRace must be used within RaceProvider')
  return ctx
}
