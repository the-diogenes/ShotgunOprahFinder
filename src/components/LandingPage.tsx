import { useRace } from '../context/RaceContext'
import { hasSavedKeys } from '../lib/keyStore'

export default function LandingPage() {
  const { setScreen, apiKeys } = useRace()
  const keysReady = hasSavedKeys(apiKeys)
  const keyCount = Object.values(apiKeys).filter(Boolean).length

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-4xl md:text-6xl font-bold tracking-widest mb-4 uppercase">
          SHOTGUN OPRAH FINDER
        </h1>
        <p className="text-lg md:text-xl tracking-widest mb-2 text-gray-400">
          REPEAT UNTIL OPRAH OR FAILURE
        </p>

        <div className="my-10 border-t border-white/20" />

        <p className="text-sm leading-relaxed text-gray-300 max-w-xl mx-auto mb-2">
          A benchmark for evaluating LLM reasoning through constrained navigation
          of the Wikipedia graph. Multiple agents race from the same random article
          to <span className="text-white font-bold">Oprah Winfrey</span>. Lowest
          click count wins.
        </p>
        <p className="text-xs text-gray-500 mb-10">
          Par is 8. Glory is lower.
        </p>

        {keysReady && (
          <p className="text-xs text-green-400 tracking-wider mb-6">
            ✓ {keyCount} API KEY{keyCount !== 1 ? 'S' : ''} LOADED
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => setScreen('setup')}
            className="border border-white px-8 py-3 text-sm tracking-widest uppercase hover:bg-white hover:text-black transition-colors"
          >
            RUN RACE
          </button>
        </div>

        <div className="mt-16 text-xs text-gray-600 space-y-1">
          <p>Find Oprah. No backtracking. No mercy.</p>
          <p>Some models reason. Some models die in Slovenia.</p>
          <p>The graph is dark and full of detours.</p>
        </div>
      </div>
    </div>
  )
}
