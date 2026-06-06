// Generate embeddings via OpenRouter (text-embedding-ada-002, 1536 dims)
export async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://traceer.app',
      'X-Title': 'Traceer Customs Operations',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-ada-002',
      input: text,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.data[0].embedding as number[]
}
