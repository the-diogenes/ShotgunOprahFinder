/**
 * Run once to encrypt API keys with a password.
 * Outputs a JSON vault blob to paste into src/lib/adminVault.ts
 *
 * Usage: node scripts/encrypt-keys.mjs
 *
 * Reads from .env, encrypts with ADMIN_PASSWORD, prints vault JSON.
 */

import { createRequire } from 'module'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env')

// ── Parse .env ───────────────────────────────────────────────────────────────
const envLines = fs.readFileSync(envPath, 'utf8').split('\n')
const env = {}
for (const line of envLines) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const keys = {
  openai:    env.OPENAI_API_KEY    ?? '',
  anthropic: env.ANTHROPIC_API_KEY ?? '',
  google:    env.GOOGLE_API_KEY    ?? '',
  xai:       env.XAI_API_KEY       ?? '',
}

const password = process.env.ADMIN_PASSWORD ?? 'HotDogIceCream69'
const plaintext = JSON.stringify(keys)

// ── Encrypt ──────────────────────────────────────────────────────────────────
const salt    = crypto.randomBytes(16)
const iv      = crypto.randomBytes(12)
const keyMat  = crypto.pbkdf2Sync(password, salt, 200_000, 32, 'sha256')
const cipher  = crypto.createCipheriv('aes-256-gcm', keyMat, iv)
const enc     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
const tag     = cipher.getAuthTag()

const vault = {
  salt: salt.toString('base64'),
  iv:   iv.toString('base64'),
  tag:  tag.toString('base64'),
  ct:   enc.toString('base64'),
}

console.log('\n// ── paste this into src/lib/adminVault.ts ──────────────────────────────────')
console.log(`export const VAULT = ${JSON.stringify(vault, null, 2)} as const`)
console.log()
