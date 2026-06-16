import type { ApiKeys } from '../types'

// Encrypted API keys — safe to commit. AES-256-GCM, PBKDF2 200k rounds.
// Regenerate with: node scripts/encrypt-keys.mjs
export const VAULT = {
  "salt": "PMpjl9/UfWQAkBXHRsPR5g==",
  "iv": "SC9/6PmWUWSelKI7",
  "tag": "i1TTSrhFEBM8LmVcbD1Fvw==",
  "ct": "OoIekwYn7GMQdTQW6u/uRlPuVxwB5Yxt+Rg73BL1dovmxcoxAUjT+kjipWdm0WNQ0KARihrFgPMKpWkO+BiYpo07WP0lCmASE4Ejuqo7a9H++fn5AJSE4qCgLpi9nEFNR3s9QNgTOKLrMfhcnzUAlTPsuoHoDS0i26aaBQKbuzUY8OHVgXH7KmOu3A46Z6oS6f+xI5btWmc609qQ6/xgtwvb+Mbggg3sWsfg9I1vWxa2v9i97vV071tmZOlVOHCvfopVOTfUVw9Hfaz1x6Ocgw4k3g3vMOhK17222k+JxQ0YNkLplSF6yGlX7JEfrlA2lXkQKAZkgGpT96EO6GScpY3fbhMwL96/EpCvYCZxWBqfAuPDhg8+4bB3u9RsYOtoAVhVgIfBx/aqNumek/EG2cC2ihLRkrxMRmYz3avgn3yW+cWx7dorbWjKE/9FNEFPf3z7kRk2AXcpo+31qzhfSx/1nKcZwp/Q18Qm05DUOch2m5IwG6piyzLZqyPYzqlHB18JaZtWbCmLX2NTboyaAPZDJSjeKrY/wWoHVsoklhR/YdQ+Vk4aDXbYxrgetRjAQdkGixkwKJpAkR3O"
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
