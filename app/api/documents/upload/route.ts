import { NextRequest, NextResponse } from 'next/server'
import { insforgeAdmin } from '@/lib/insforge-admin'

const BUCKET = 'customs-docs'
const MAX_BYTES = 15 * 1024 * 1024

interface UploadRequest {
  fileBase64: string
  mimeType: string
  filename: string
}

function toBuffer(dataUrl: string, mimeType: string): Buffer {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl
  return Buffer.from(base64, 'base64')
}

export async function POST(req: NextRequest) {
  try {
    const { fileBase64, mimeType, filename } = (await req.json()) as UploadRequest
    if (!fileBase64 || !filename) {
      return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
    }

    const bytes = new Uint8Array(toBuffer(fileBase64, mimeType))
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 })
    }

    const ext = filename.includes('.') ? filename.split('.').pop() : 'bin'
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' })

    const { data, error } = await insforgeAdmin.storage
      .from(BUCKET)
      .upload(key, blob)

    if (error || !data) {
      console.error('[documents/upload] storage error:', error)
      return NextResponse.json({ error: error?.message ?? 'Storage upload failed' }, { status: 500 })
    }

    return NextResponse.json({
      url: data.url,
      key: data.key,
      logs: [`✓ Uploaded ${filename} → customs-docs/${data.key}`],
    })
  } catch (err) {
    console.error('[documents/upload]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
