/**
 * Agent Daemon
 *
 * Runs the agent cron endpoint on a configurable interval.
 * Keeps going until killed (Ctrl+C).
 *
 * Usage:
 *   node scripts/agent-daemon.mjs
 *   AGENT_INTERVAL_MINUTES=60 node scripts/agent-daemon.mjs
 *
 * Requires the Next.js dev server to be running on NEXTAUTH_URL (default: http://localhost:3000).
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env.local for CRON_SECRET and NEXTAUTH_URL
function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    const vars = {}
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) vars[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '')
    }
    return vars
  } catch {
    return {}
  }
}

const env = loadEnv()
const BASE_URL = env.NEXTAUTH_URL ?? 'http://localhost:3000'
const CRON_SECRET = env.CRON_SECRET ?? ''
const INTERVAL_MINUTES = parseInt(process.env.AGENT_INTERVAL_MINUTES ?? '30', 10)
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000

async function runAgent() {
  const url = `${BASE_URL}/api/cron/agent-run`
  const headers = CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}
  try {
    const res = await fetch(url, { headers })
    const data = await res.json()
    const ts = new Date().toLocaleTimeString()
    if (res.ok) {
      console.log(`[${ts}] Agent ran for ${data.ran ?? 0} manager(s).`, JSON.stringify(data.results ?? []))
    } else {
      console.error(`[${ts}] Agent run failed:`, data)
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Could not reach server:`, err.message)
  }
}

console.log(`Agent daemon starting. Interval: every ${INTERVAL_MINUTES} minute(s). Server: ${BASE_URL}`)
console.log('Press Ctrl+C to stop.\n')

// Run immediately on start, then on interval
runAgent()
const timer = setInterval(runAgent, INTERVAL_MS)

process.on('SIGINT', () => {
  clearInterval(timer)
  console.log('\nAgent daemon stopped.')
  process.exit(0)
})
