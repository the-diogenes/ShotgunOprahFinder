import type { ApiKeys } from '../types'

// Encrypted API keys — safe to commit. AES-256-GCM, PBKDF2 200k rounds.
// Regenerate with: node scripts/encrypt-keys.mjs
export const VAULT = {
  "salt": "mDvY4BBx/nt4lX18bxzmBg==",
  "iv": "DByQrPint7PbDIYJ",
  "tag": "KcYxn60aC8/gFepfTiV/sw==",
  "ct": "MxJ3UrG+HC3bpqPDczHbxaR//0ecQgcYjF8JnhSuX/gmaP0jRQinys/C6+oM473Bzn4jc49m1tl1TVNgdx0XI+R7vbH4I9eR2I+Bz94ACDG4LY7IryZCPw=="
} as const

function b64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export async function decryptVault(password: string): Promise<ApiKeys> {
  const enc = new TextEncoder()

  const rawKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64(VAULT.salt),
      iterations: 200_000,
      hash: 'SHA-256',
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  // AES-GCM expects ciphertext + auth tag concatenated
  const ct  = b64(VAULT.ct)
  const tag = b64(VAULT.tag)
  const ctWithTag = new Uint8Array(ct.length + tag.length)
  ctWithTag.set(ct)
  ctWithTag.set(tag, ct.length)

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64(VAULT.iv) },
    aesKey,
    ctWithTag,
  )

  const plain = new TextDecoder().decode(plainBuf)
  return JSON.parse(plain) as ApiKeys
}
