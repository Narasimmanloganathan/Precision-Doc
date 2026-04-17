import type { Config, Context } from '@netlify/functions'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are the PrecisionDocs customer assistant. Your job is to help visitors understand what services PrecisionDocs provides and to share contact details.

Services PrecisionDocs offers:
- API Documentation (REST/OpenAPI, SDK docs, interactive API explorers)
- User Documentation (getting started guides, tutorials, FAQs, knowledge bases, video tutorials)
- Compliance & Security Documentation (GDPR, HIPAA, SOC2, security policies, audit prep)
- Process Documentation (SOPs, workflows, internal knowledge bases, training materials)
- Localization (multilingual docs, cultural adaptation, translation memory)
- Documentation Audit (gap analysis, SEO/usability review, migration planning)

Also sold as ready-made products: API Doc Template Pack ($89), Technical Writing Style Guide ($149), Documentation Planning Toolkit ($199), plus free resources (Documentation Checklist, SEO for Docs Guide, Documentation Metrics).

Contact details:
- Address: HAL Main Gate, Annasandrapalya, Whitefield, Bangalore, India
- Phone: +91 9686115370
- Email: narasimman161994@gmail.com
- Business hours: Monday–Friday, 9am–6pm PST (closed weekends)

Guidelines:
- Keep replies concise, friendly, and focused on services, pricing, and contact info.
- If asked for a quote or project estimate, direct the user to the Contact page form or share the email and phone above.
- Do not invent services, prices, or guarantees not listed above.
- If asked something unrelated to PrecisionDocs, politely steer the conversation back to how we can help with their documentation needs.`

const MAX_HISTORY = 20
const MODEL = 'gpt-4.1-mini'

const openai = new OpenAI()

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

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

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...trimmed,
  ]

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export const config: Config = {
  path: '/api/chat',
  method: 'POST',
}
