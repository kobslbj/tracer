'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { downloadWorkspaceFile, blobUrlForPreview, isImageBlob } from '@/lib/storage'
import { ExternalLink, Loader2 } from 'lucide-react'

interface DocumentPreviewDialogProps {
  title: string
  storageKey: string | null
  open: boolean
  onClose: () => void
}

export function DocumentPreviewDialog({ title, storageKey, open, onClose }: DocumentPreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isImage, setIsImage] = useState(false)

  useEffect(() => {
    if (!open || !storageKey) return

    let objectUrl: string | null = null
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setPreviewUrl(null)
      try {
        const blob = await downloadWorkspaceFile(storageKey!)
        if (cancelled) return
        objectUrl = blobUrlForPreview(blob)
        setPreviewUrl(objectUrl)
        setIsImage(isImageBlob(blob, storageKey!))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, storageKey])

  function handleClose() {
    setPreviewUrl(null)
    setError(null)
    setLoading(false)
    onClose()
  }

  if (!storageKey) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col border-border bg-card p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Open in new tab
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
          {loading && (
            <div className="flex h-[50vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
          {previewUrl && !loading && !error && (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={title}
                className="mx-auto max-h-[75vh] w-auto rounded-lg border border-border object-contain"
              />
            ) : (
              <iframe
                src={previewUrl}
                title={title}
                className="h-[75vh] w-full rounded-lg border border-border bg-background"
              />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
