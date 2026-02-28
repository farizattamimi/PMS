import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
const INTERVAL_SECONDS = parseInt(process.env.AGENT_WORKER_INTERVAL_SECONDS ?? '15', 10)
const BATCH_SIZE = parseInt(process.env.AGENT_WORKER_BATCH ?? '20', 10)

async function tick() {
  const headers = {
    'content-type': 'application/json',
    ...(CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {}),
  }
  try {
    const res = await fetch(`${BASE_URL}/api/agent/worker`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batch: BATCH_SIZE }),
    })
    const body = await res.json().catch(() => ({}))
    const ts = new Date().toISOString()
    if (res.ok) {
      console.log(`[${ts}] processed=${(body.processed ?? []).length} governor=${JSON.stringify(body.governor ?? {})}`)
    } else {
      console.error(`[${ts}] worker error`, body)
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] worker connection error`, err.message)
  }
}

console.log(`Agent worker daemon started: ${BASE_URL}, every ${INTERVAL_SECONDS}s, batch=${BATCH_SIZE}`)
await tick()
setInterval(tick, INTERVAL_SECONDS * 1000)
