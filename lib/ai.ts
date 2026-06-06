// ── InsForge Model Gateway ───────────────────────────────────────────────────
//
// All LLM + embedding calls run through InsForge's managed model gateway.
// InsForge provisions the project's OpenRouter key (via `npx @insforge/cli ai
// setup`, which writes OPENROUTER_API_KEY to .env.local), so a single sponsor
// platform backs our database, vector store, realtime AND model access.
//
// Model IDs are overridable per-environment via OPENROUTER_CHAT_MODEL /
// OPENROUTER_EMBEDDING_MODEL.

const GATEWAY_URL = 'https://openrouter.ai/api/v1'

export const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? 'anthropic/claude-sonnet-4-5'
export const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-ada-002'

function gatewayHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://traceer.app',
    'X-Title': 'Traceer Customs Operations',
  }
}

interface ChatOptions {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
}

/**
 * Run a chat completion through the InsForge Model Gateway and return the raw
 * assistant text. Throws on transport/HTTP errors.
 */
export async function chatComplete({ system, user, maxTokens = 512, temperature = 0.1 }: ChatOptions): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Model gateway error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? '') as string
}

/**
 * Run a chat completion and parse the response as JSON. Strips markdown code
 * fences the model may wrap around the object.
 */
export async function chatJSON<T = Record<string, unknown>>(opts: ChatOptions): Promise<T> {
  const text = await chatComplete(opts)
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  return JSON.parse(cleaned) as T
}

/**
 * Generate an embedding vector (1536-dim for text-embedding-ada-002) through
 * the InsForge Model Gateway. The dimension must match the pgvector column.
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${GATEWAY_URL}/embeddings`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Embedding gateway error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return data.data[0].embedding as number[]
}
