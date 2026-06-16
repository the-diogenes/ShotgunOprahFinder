import { useState } from 'react'
import { useRace } from '../context/RaceContext'
import type { CompetitorConfig, RaceConfig, ProviderId } from '../types'
import { DEFAULT_HOST_PROMPT } from '../lib/raceEngine'
import { PROVIDERS } from '../lib/providers'
import { hasSavedKeys } from '../lib/keyStore'

const PROMPT_PRESETS: Record<string, string> = {
  'Aggressive Media': DEFAULT_HOST_PROMPT,
  Bloodhound: `You are a bloodhound trained to find Oprah. Smell for television, celebrities, American media, talk shows, actors, producers, Chicago, and mass culture. Choose the link that most increases the probability of reaching Oprah quickly.`,
  'Country Funnel': `If stuck, move toward countries, then toward the United States, then toward television, then talk shows, then Oprah Winfrey.`,
  'Person Graph': `Wikipedia is dense with biographies. Prefer notable people, occupations, actors, writers, journalists, hosts, producers, and entertainers when they appear.`,
  Speedrunner: `Think like a Wikipedia speedrunner. Avoid narrow pages. Escape to high-degree hubs. Take routes that increase global connectivity, not local relevance.`,
  Minimal: `Choose the best link. Keep the public scratchpad under 20 words.`,
}

const MODEL_OPTIONS: Record<ProviderId, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  anthropic: ['claude-haiku-3-5', 'claude-3-5-haiku-20241022', 'claude-sonnet-4-5', 'claude-3-5-sonnet-20241022'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  xai: ['grok-3-mini', 'grok-3', 'grok-2-1212'],
  shotgunbot: ['shotgunbot-v1'],
}

const DEFAULT_COMPETITORS: CompetitorConfig[] = [
  { id: 'openai-1', providerId: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', temperature: 0.7, maxTokens: 300, enabled: true },
  { id: 'anthropic-1', providerId: 'anthropic', modelId: 'claude-haiku-3-5', displayName: 'Claude Haiku', temperature: 0.7, maxTokens: 300, enabled: true },
  { id: 'google-1', providerId: 'google', modelId: 'gemini-2.5-flash', displayName: 'Gemini Flash', temperature: 0.7, maxTokens: 300, enabled: true },
  { id: 'xai-1', providerId: 'xai', modelId: 'grok-3-mini', displayName: 'Grok Mini', temperature: 0.7, maxTokens: 300, enabled: true },
  { id: 'shotgunbot-1', providerId: 'shotgunbot', modelId: 'shotgunbot-v1', displayName: 'ShotgunBot', temperature: 0, maxTokens: 0, enabled: false },
]

export default function RaceSetup() {
  const { setScreen, apiKeys, setApiKeys, clearKeys, startRace } = useRace()
  const [maxClicks, setMaxClicks] = useState(8)
  const [hostPrompt, setHostPrompt] = useState(DEFAULT_HOST_PROMPT)
  const [competitors, setCompetitors] = useState<CompetitorConfig[]>(DEFAULT_COMPETITORS)
  const [selectedPreset, setSelectedPreset] = useState('Aggressive Media')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [showKeys, setShowKeys] = useState(!hasSavedKeys(apiKeys))
  const [launching, setLaunching] = useState(false)

  const keysAreSaved = hasSavedKeys(apiKeys)

  const toggleCompetitor = (id: string) => {
    setCompetitors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    )
  }

  const updateModel = (id: string, modelId: string) => {
    setCompetitors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, modelId } : c)),
    )
  }

  const handlePreset = (name: string) => {
    setSelectedPreset(name)
    setHostPrompt(PROMPT_PRESETS[name] ?? hostPrompt)
  }

  const handleLaunch = async () => {
    setLaunching(true)
    const config: RaceConfig = {
      mode: 'wait',
      maxClicks,
      hostPrompt,
      competitors: competitors.filter((c) => c.enabled),
      includeSummary,
      maxLinksPerPage: 200,
    }
    await startRace(config)
    setLaunching(false)
  }

  const enabledCount = competitors.filter((c) => c.enabled).length

  return (
    <div className="min-h-screen px-4 py-12 max-w-4xl mx-auto">
      <button onClick={() => setScreen('landing')} className="text-xs text-gray-500 hover:text-white mb-8 tracking-widest uppercase">
        ← BACK
      </button>

      <h2 className="text-3xl font-bold tracking-widest uppercase mb-2">RACE SETUP</h2>
      <p className="text-xs text-gray-500 mb-10 tracking-wider">Configure competitors, prompt, and race rules</p>

      {/* API Keys */}
      <section className="mb-10">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setShowKeys((v) => !v)}
            className="text-xs tracking-widest uppercase border border-white/30 px-4 py-2 hover:border-white"
          >
            {showKeys ? '▼' : '▶'} API KEYS
          </button>
          {keysAreSaved && (
            <span className="text-xs text-green-400 tracking-wider">
              ✓ KEYS SAVED ({Object.values(apiKeys).filter(Boolean).length}/4)
            </span>
          )}
          {keysAreSaved && (
            <button
              onClick={() => { clearKeys(); setShowKeys(true) }}
              className="text-xs text-gray-600 hover:text-red-400 tracking-widest uppercase ml-auto"
            >
              CLEAR SAVED KEYS
            </button>
          )}
        </div>
        {showKeys && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border border-white/20">
            {(['openai', 'anthropic', 'google', 'xai'] as const).map((p) => (
              <label key={p} className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-gray-400">{PROVIDERS[p].displayName}</span>
                <input
                  type="password"
                  placeholder={`${p.toUpperCase()}_API_KEY`}
                  value={apiKeys[p]}
                  onChange={(e) => setApiKeys({ ...apiKeys, [p]: e.target.value })}
                  className="bg-black border border-white/30 px-3 py-2 text-xs font-mono focus:outline-none focus:border-white"
                />
              </label>
            ))}
            <p className="col-span-full text-xs text-gray-600 mt-1">
              Keys save automatically to this browser. Never sent anywhere except the LLM provider directly.
            </p>
          </div>
        )}
      </section>

      {/* Competitors */}
      <section className="mb-10">
        <h3 className="text-sm tracking-widest uppercase mb-4 text-gray-400">COMPETITORS</h3>
        <div className="space-y-3">
          {competitors.map((c) => (
            <div key={c.id} className={`flex flex-wrap items-center gap-3 p-3 border ${c.enabled ? 'border-white/50' : 'border-white/15'}`}>
              <button
                onClick={() => toggleCompetitor(c.id)}
                className={`w-5 h-5 border flex items-center justify-center text-xs shrink-0 ${c.enabled ? 'border-white bg-white text-black' : 'border-white/30 text-gray-600'}`}
              >
                {c.enabled ? '✓' : ''}
              </button>
              <span className={`text-sm font-bold tracking-wider flex-1 min-w-24 ${c.enabled ? 'text-white' : 'text-gray-600'}`}>
                {c.displayName}
              </span>
              <span className="text-xs text-gray-500 w-20">{PROVIDERS[c.providerId].displayName}</span>
              {c.providerId !== 'shotgunbot' && (
                <select
                  value={c.modelId}
                  onChange={(e) => updateModel(c.id, e.target.value)}
                  disabled={!c.enabled}
                  className="bg-black border border-white/30 text-xs px-2 py-1 font-mono disabled:opacity-30 focus:outline-none"
                >
                  {MODEL_OPTIONS[c.providerId].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
              {!apiKeys[c.providerId as keyof typeof apiKeys] && c.providerId !== 'shotgunbot' && c.enabled && (
                <span className="text-xs text-yellow-500">⚠ no key</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Race Config */}
      <section className="mb-10">
        <h3 className="text-sm tracking-widest uppercase mb-4 text-gray-400">RACE CONFIG</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs tracking-widest uppercase text-gray-400">Max Clicks (Par)</span>
            <input
              type="number"
              min={2} max={20}
              value={maxClicks}
              onChange={(e) => setMaxClicks(Number(e.target.value))}
              className="bg-black border border-white/30 px-3 py-2 text-sm font-mono w-24 focus:outline-none focus:border-white"
            />
          </label>
          <label className="flex items-center gap-3">
            <button
              onClick={() => setIncludeSummary((v) => !v)}
              className={`w-5 h-5 border flex items-center justify-center text-xs shrink-0 ${includeSummary ? 'border-white bg-white text-black' : 'border-white/30'}`}
            >
              {includeSummary ? '✓' : ''}
            </button>
            <span className="text-xs tracking-widest uppercase text-gray-400">Include Page Summaries</span>
          </label>
        </div>
      </section>

      {/* Host Prompt */}
      <section className="mb-10">
        <h3 className="text-sm tracking-widest uppercase mb-4 text-gray-400">HOST PROMPT</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.keys(PROMPT_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => handlePreset(name)}
              className={`text-xs px-3 py-1 border tracking-wider ${selectedPreset === name ? 'border-white bg-white text-black' : 'border-white/30 hover:border-white'}`}
            >
              {name}
            </button>
          ))}
        </div>
        <textarea
          value={hostPrompt}
          onChange={(e) => { setHostPrompt(e.target.value); setSelectedPreset('Custom') }}
          rows={4}
          className="w-full bg-black border border-white/30 px-3 py-2 text-xs font-mono focus:outline-none focus:border-white resize-y"
        />
      </section>

      {/* Launch */}
      <div className="flex items-center gap-6">
        <button
          onClick={handleLaunch}
          disabled={enabledCount === 0 || launching}
          className="border border-white px-10 py-3 text-sm tracking-widest uppercase hover:bg-white hover:text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {launching ? 'LAUNCHING...' : `LAUNCH RACE (${enabledCount} competitor${enabledCount !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  )
}
