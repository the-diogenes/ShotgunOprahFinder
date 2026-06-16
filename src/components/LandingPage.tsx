import { useState, useRef } from 'react'
import { useRace } from '../context/RaceContext'
import { hasSavedKeys } from '../lib/keyStore'

export default function LandingPage() {
  const { setScreen, apiKeys, unlockAdmin, clearKeys } = useRace()
  const keysReady = hasSavedKeys(apiKeys)
  const keyCount = Object.values(apiKeys).filter(Boolean).length

  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const [password, setPassword] = useState('')
  const [adminError, setAdminError] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdminClick = () => {
    if (keysReady) {
      // Already unlocked — offer to lock
      if (confirm('Clear loaded admin keys?')) clearKeys()
      return
    }
    setShowAdminPrompt(true)
    setPassword('')
    setAdminError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleUnlock = async () => {
    if (!password) return
    setUnlocking(true)
    setAdminError('')
    const ok = await unlockAdmin(password)
    setUnlocking(false)
    if (ok) {
      setShowAdminPrompt(false)
      setPassword('')
    } else {
      setAdminError('WRONG PASSWORD')
      setPassword('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUnlock()
    if (e.key === 'Escape') { setShowAdminPrompt(false); setPassword('') }
  }

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

        {/* Admin unlock prompt */}
        {showAdminPrompt && (
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="border border-white/30 p-6 max-w-sm w-full text-left">
              <div className="text-xs tracking-widest uppercase text-gray-400 mb-4">ADMIN ACCESS</div>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="password"
                className="w-full bg-black border border-white/30 px-3 py-2 text-sm font-mono focus:outline-none focus:border-white mb-3"
              />
              {adminError && (
                <p className="text-xs text-red-400 tracking-widest mb-3">{adminError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleUnlock}
                  disabled={unlocking || !password}
                  className="border border-white px-6 py-2 text-xs tracking-widest uppercase hover:bg-white hover:text-black transition-colors disabled:opacity-30"
                >
                  {unlocking ? 'DECRYPTING...' : 'UNLOCK'}
                </button>
                <button
                  onClick={() => { setShowAdminPrompt(false); setPassword('') }}
                  className="text-xs text-gray-600 hover:text-white tracking-widest uppercase px-3"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Key status */}
        {keysReady && !showAdminPrompt && (
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

        {/* Admin button — subtle, bottom corner */}
        <button
          onClick={handleAdminClick}
          className={`fixed bottom-5 right-5 text-xs tracking-widest uppercase px-3 py-1.5 border transition-colors ${
            keysReady
              ? 'border-green-800 text-green-700 hover:border-red-600 hover:text-red-500'
              : 'border-white/10 text-gray-700 hover:border-white/30 hover:text-gray-500'
          }`}
        >
          {keysReady ? 'ADMIN ✓' : 'ADMIN'}
        </button>
      </div>
    </div>
  )
}
