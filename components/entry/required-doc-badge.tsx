'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { UploadedDocs } from '@/lib/types'
import { isUploadedDoc, uploadedDocKey } from '@/lib/doc-links'
import { DocumentPreviewDialog } from './document-preview-dialog'
import { cn } from '@/lib/utils'
import { FileCheck } from 'lucide-react'

interface RequiredDocBadgeProps {
  name: string
  uploadedDocs?: UploadedDocs
}

export function RequiredDocBadge({ name, uploadedDocs }: RequiredDocBadgeProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const storageKey = uploadedDocKey(name, uploadedDocs)
  const uploaded = isUploadedDoc(name, uploadedDocs)

  if (!uploaded) {
    return (
      <Badge variant="outline" className="border-border bg-muted/50 text-xs text-foreground">
        {name}
      </Badge>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
          'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
        )}
      >
        <FileCheck className="h-3 w-3" />
        {name}
      </button>
      <DocumentPreviewDialog
        title={name}
        storageKey={storageKey ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  )
}
