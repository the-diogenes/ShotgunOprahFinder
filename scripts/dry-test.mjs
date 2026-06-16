/**
 * Dry test — exercises the REAL Wikipedia engine + ShotgunBot against live
 * Wikipedia, running a full turn-based race to Oprah. No API keys needed.
 *
 * Usage: node scripts/dry-test.mjs
 */
import { getRandomPage, fetchPage, isOprah } from '../src/lib/wikipedia.ts'
import { shotgunBotAdapter } from '../src/lib/providers/shotgunbot.ts'
import { runRacerTurn, makeRacerRun } from '../src/lib/raceEngine.ts'

const MAX_CLICKS = 8
let pass = 0
let fail = 0
const check = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  cond ? pass++ : fail++
}

console.log('\n=== TEST 1: Wikipedia random page ===')
const start = await getRandomPage()
check('random page has a title', !!start.canonicalTitle)
check('random page returned links', Array.isArray(start.links))
console.log(`  start page: "${start.canonicalTitle}" (${start.links.length} links)`)

console.log('\n=== TEST 2: Fetch a known hub (Television) ===')
const tv = await fetchPage('Television')
check('Television page fetched', tv.canonicalTitle === 'Television')
check('Television has many links', tv.links.length > 50)

console.log('\n=== TEST 3: Oprah detection ===')
check('isOprah("Oprah Winfrey") true', isOprah('Oprah Winfrey'))
check('isOprah("Television") false', !isOprah('Television'))

console.log('\n=== TEST 4: ShotgunBot picks a valid link ===')
const botResp = await shotgunBotAdapter.callAgent({
  model: 'shotgunbot-v1',
  systemPrompt: '', hostPrompt: '',
  gameState: {
    goal: 'Reach Oprah', rules: [], clicksUsed: 0, clicksRemaining: 8,
    visitedPages: [],
    currentPage: { title: 'Television', summary: '', availableLinks: tv.links.slice(0, 200) },
  },
  temperature: 0, maxTokens: 0,
}, '')
check('bot returned a chosen link', !!botResp.chosenLink)
check('bot chose a real link', tv.links.includes(botResp.chosenLink))
check('bot cost is zero', botResp.costUsd === 0)
console.log(`  bot chose: "${botResp.chosenLink}"`)
console.log(`  reasoning: ${botResp.publicScratchpad}`)

console.log('\n=== TEST 5: Full ShotgunBot race to Oprah ===')
const config = { id: 'bot', providerId: 'shotgunbot', modelId: 'shotgunbot-v1', displayName: 'ShotgunBot', temperature: 0, maxTokens: 0, enabled: true }
let racer = makeRacerRun(config, start.canonicalTitle)
racer.status = 'running'

for (let turn = 0; turn < MAX_CLICKS && racer.status === 'running'; turn++) {
  await runRacerTurn(
    racer, config, racer.startPageTitle, 'Find Oprah fast.', MAX_CLICKS,
    { openai: '', anthropic: '', google: '', xai: '' }, true,
    (_id, t) => {
      racer.turns.push(t)
      if (t.validationStatus === 'ok') racer.clicks++
      else racer.invalidAttempts++
    },
    (_id, status) => { racer.status = status },
  )
}

const path = [start.canonicalTitle, ...racer.turns.filter(t => t.validationStatus === 'ok').map(t => t.resultingPageTitle)]
console.log('  PATH: ' + path.join(' -> '))
console.log(`  status: ${racer.status} | clicks: ${racer.clicks}`)
check('race terminated (not stuck running)', racer.status !== 'running')
check('race produced a path', racer.turns.length > 0)

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
process.exit(fail > 0 ? 1 : 0)
