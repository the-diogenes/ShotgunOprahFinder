import type { ApiKeys } from '../types'

const STORAGE_KEY = 'sof_api_keys'

export function loadSavedKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyKeys()
    const parsed = JSON.parse(raw)
    return {
      openai: String(parsed.openai ?? ''),
      anthropic: String(parsed.anthropic ?? ''),
      google: String(parsed.google ?? ''),
      xai: String(parsed.xai ?? ''),
    }
  } catch {
    return emptyKeys()
  }
}

export function saveKeys(keys: ApiKeys): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // storage full or blocked — fail silently
  }
}

export function clearSavedKeys(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function hasSavedKeys(keys: ApiKeys): boolean {
  return Object.values(keys).some((v) => v.length > 0)
}

function emptyKeys(): ApiKeys {
  return { openai: '', anthropic: '', google: '', xai: '' }
}
