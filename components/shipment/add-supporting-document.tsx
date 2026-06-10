'use client'

import { useRef, useState } from 'react'
import { SupplementaryDoc, ShipmentTimelineEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SUPPORTING_DOC_TYPES,
  createSupplementaryDoc,
  supportingDocumentAddedEvent,
  supplementaryDocLabel,
} from '@/lib/supplementary-docs'
import { saveSupplementaryDoc } from '@/lib/insforge-db'
import { useAuth } from '@/lib/auth'
import { uploadWorkspaceFile } from '@/lib/storage'
import { DocumentPreviewDialog } from '@/components/entry/document-preview-dialog'
import { cn } from '@/lib/utils'
import { ChevronDown, FileText, Plus, Upload } from 'lucide-react'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf'
const MAX_BYTES = 15 * 1024 * 1024


interface AddSupportingDocumentProps {
  entryId: string
  docs: SupplementaryDoc[]
  timeline: ShipmentTimelineEvent[]
  waitingOn: string[]
  onUpdated: (docs: SupplementaryDoc[], timeline: ShipmentTimelineEvent[]) => void
}

export function AddSupportingDocument({
  entryId,
  docs,
  timeline,
  waitingOn,
  onUpdated,
}: AddSupportingDocumentProps) {
  const [open, setOpen] = useState(false)
  const [docType, setDocType] = useState<string>(SUPPORTING_DOC_TYPES[0])
  const [customLabel, setCustomLabel] = useState('')
  const [resolvesItem, setResolvesItem] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { workspaceId } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (docType === 'Other' && !customLabel.trim()) {
      setError('Describe what this document is.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File too large (max 15MB).')
      return
    }

    if (!workspaceId) {
      setError('Workspace not ready — please sign in again.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { url, key } = await uploadWorkspaceFile(
        workspaceId,
        entryId,
        file,
        'supplementary',
      )

      const doc = createSupplementaryDoc({
        docType,
        customLabel: docType === 'Other' ? customLabel : undefined,
        filename: file.name,
        fileUrl: url,
        fileKey: key,
        note: note || undefined,
        resolvesItem: resolvesItem || undefined,
      })
      const event = supportingDocumentAddedEvent(doc)
      const result = await saveSupplementaryDoc(entryId, docs, timeline, doc, event)
      onUpdated(result.docs, result.timeline)
      setDocType(SUPPORTING_DOC_TYPES[0])
      setCustomLabel('')
      setResolvesItem('')
      setNote('')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {docs.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/5 px-3 py-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Supporting documents ({docs.length})
          </p>
          <ul className="space-y-1.5">
            {docs.map(doc => (
              <li key={doc.id} className="flex items-start gap-2 text-xs">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewTitle(supplementaryDocLabel(doc))
                      setPreviewKey(doc.fileKey)
                    }}
                    className="font-medium text-foreground hover:text-primary text-left"
                  >
                    {supplementaryDocLabel(doc)}
                  </button>
                  <p className="text-muted-foreground truncate">{doc.filename}</p>
                  {doc.resolvesItem && (
                    <p className="text-emerald-400/80">Resolves: {doc.resolvesItem}</p>
                  )}
                  {doc.note && <p className="text-muted-foreground/80">{doc.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-dashed border-border/70 bg-muted/5 px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add supporting document
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-muted/5 px-3 py-3 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Upload docs the AI didn&apos;t flag — label what they are for complete shipment memory.
            </p>

            <label className="block text-xs">
              <span className="text-muted-foreground">Document type</span>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {SUPPORTING_DOC_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            {docType === 'Other' && (
              <label className="block text-xs">
                <span className="text-muted-foreground">Describe document</span>
                <input
                  type="text"
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder="e.g. Fumigation certificate"
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </label>
            )}

            {waitingOn.length > 0 && (
              <label className="block text-xs">
                <span className="text-muted-foreground">Resolves waiting item (optional)</span>
                <select
                  value={resolvesItem}
                  onChange={e => setResolvesItem(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">— None —</option>
                  {waitingOn.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-xs">
              <span className="text-muted-foreground">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder='e.g. "Received from supplier via email"'
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={e => {
                  setFile(e.target.files?.[0] ?? null)
                  setError(null)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {file ? file.name : 'Choose file'}
              </Button>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving || !file}>
              {saving ? 'Uploading…' : 'Save document'}
            </Button>
          </form>
        </CollapsibleContent>
      </Collapsible>

      <DocumentPreviewDialog
        title={previewTitle}
        storageKey={previewKey}
        open={!!previewKey}
        onClose={() => setPreviewKey(null)}
      />
    </div>
  )
}
