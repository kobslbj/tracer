import { NextResponse } from 'next/server'
import { createAdminClient } from '@insforge/sdk'
import { embed } from '@/lib/ai'

const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  apiKey: process.env.INSFORGE_API_KEY!,
})

export async function POST() {
  try {
    // Only embed rows that don't have an embedding yet — safe to re-run, avoids
    // re-embedding (and re-paying for) rows that were already processed.
    const { data, error } = await admin.database
      .from('hts_knowledge')
      .select('id, hts_code, description, chapter, notes')
      .is('embedding', null)

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to fetch hts_knowledge' }, { status: 500 })
    }

    if (data.length === 0) {
      return NextResponse.json({ seeded: [], message: 'All rows already have embeddings.' })
    }

    const results = []

    for (const row of data as { id: number; hts_code: string; description: string; chapter: string; notes: string }[]) {
      // Compose rich text for embedding
      const text = `HTS ${row.hts_code}: ${row.description}. ${row.chapter}. ${row.notes}`
      const embedding = await embed(text)

      const { error: updateErr } = await admin.database
        .from('hts_knowledge')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', row.id)

      results.push({ id: row.id, hts_code: row.hts_code, ok: !updateErr })
    }

    return NextResponse.json({ seeded: results })
  } catch (err) {
    console.error('[seed-embeddings]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
