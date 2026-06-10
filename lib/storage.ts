import { insforge } from './insforge'

const BUCKET = 'customs-docs'
const MAX_BYTES = 15 * 1024 * 1024

export function workspaceStorageKey(
  workspaceId: string,
  entryId: string,
  filename: string,
  subfolder?: string,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (subfolder) {
    return `${workspaceId}/${entryId}/${subfolder}/${safeName}`
  }
  return `${workspaceId}/${entryId}/${safeName}`
}

export async function uploadWorkspaceFile(
  workspaceId: string,
  entryId: string,
  file: File,
  subfolder?: string,
): Promise<{ url: string; key: string }> {
  if (file.size > MAX_BYTES) {
    throw new Error('File too large (max 15MB)')
  }

  const key = workspaceStorageKey(workspaceId, entryId, file.name, subfolder)
  const { data, error } = await insforge.storage
    .from(BUCKET)
    .upload(key, file)

  if (error || !data) {
    throw new Error(error?.message ?? 'Storage upload failed')
  }

  return { url: data.url, key: data.key }
}

export async function downloadWorkspaceFile(key: string): Promise<Blob> {
  const { data, error } = await insforge.storage.from(BUCKET).download(key)
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to download file')
  }
  return data
}

export function blobUrlForPreview(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function isImageBlob(blob: Blob, key?: string): boolean {
  if (blob.type.startsWith('image/')) return true
  if (key && /\.(png|jpe?g|webp|gif)$/i.test(key)) return true
  return false
}
