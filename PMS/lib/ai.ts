import Anthropic from '@anthropic-ai/sdk'

const globalForAI = globalThis as unknown as { anthropic: Anthropic }
export const anthropic = globalForAI.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
if (process.env.NODE_ENV !== 'production') globalForAI.anthropic = anthropic

export const AI_MODEL = 'claude-sonnet-4-6'

/** Streams Claude delta text events as a plain-text ReadableStream for Next.js App Router. */
export function streamResponse(stream: AsyncIterable<Anthropic.MessageStreamEvent>): Response {
  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(enc.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })
  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
