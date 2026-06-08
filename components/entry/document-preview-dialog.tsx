'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExternalLink } from 'lucide-react'

interface DocumentPreviewDialogProps {
  title: string
  url: string | null
  open: boolean
  onClose: () => void
}

function isImage(url: string) {
  return /\.(png|jpe?g|webp|gif)($|\?)/i.test(url)
}

export function DocumentPreviewDialog({ title, url, open, onClose }: DocumentPreviewDialogProps) {
  if (!url) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col border-border bg-card p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open in new tab
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
          {isImage(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={title}
              className="mx-auto max-h-[75vh] w-auto rounded-lg border border-border object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={title}
              className="h-[75vh] w-full rounded-lg border border-border bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
