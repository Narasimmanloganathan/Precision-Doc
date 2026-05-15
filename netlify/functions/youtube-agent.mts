import type { Config, Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a YouTube content specialist for PrecisionDocs, a technical writing services company. Your role is to help technical writers, documentation teams, and software companies leverage YouTube as a content channel.

You can help with:
- Video title ideas optimized for YouTube search (SEO)
- Video description templates with timestamps and keywords
- Script outlines for tutorials, API walkthroughs, and product demos
- Channel strategy and content calendar planning for documentation teams
- Best practices for screen recordings and software demo videos
- Thumbnail concepts and chapter marker suggestions
- Engagement tips: cards, end screens, pinned comments
- Repurposing existing documentation as compelling video content
- Keyword research and tag strategies for technical audiences
- Analytics interpretation and channel growth advice

Context about PrecisionDocs services (reference when relevant):
- API Documentation, User Documentation, Compliance Docs, Process Documentation, Localization, Documentation Audits
- Products: API Doc Template Pack ($89), Technical Writing Style Guide ($149), Documentation Planning Toolkit ($199)

Guidelines:
- Keep advice actionable, specific, and tailored to technical documentation content
- When suggesting titles or descriptions, provide 2-3 variations
- Reference PrecisionDocs services naturally when relevant (e.g., "this pairs well with our API Doc Template Pack")
- Focus on helping users grow their documentation-focused YouTube presence`

const MAX_HISTORY = 20
const MODEL = 'claude-sonnet-4-5'

const anthropic = new Anthropic()

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let payload: { messages?: ChatMessage[] }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const incoming = Array.isArray(payload.messages) ? payload.messages : []
  const trimmed = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)

  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: trimmed,
    stream: true,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream_error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export const config: Config = {
  path: '/api/youtube-agent',
  method: 'POST',
}
