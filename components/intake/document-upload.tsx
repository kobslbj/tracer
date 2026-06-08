'use client'

import { useRef, useState, DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DocType, DOC_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FileText, UploadCloud, X, ScanLine, Package, Receipt } from 'lucide-react'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf'
const MAX_BYTES = 15 * 1024 * 1024 // 15MB POC cap

interface DocumentUploadProps {
  onAnalyze: (files: Record<DocType, File>) => void
  disabled: boolean
}

const slotMeta: Record<DocType, { icon: React.ReactNode; hint: string }> = {
  packing_list: { icon: <Package className="h-4 w-4" />, hint: 'Cartons · weights · quantities · SKUs' },
  commercial_invoice: { icon: <Receipt className="h-4 w-4" />, hint: 'Importer · supplier · value · currency' },
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DropSlot({
  docType,
  file,
  disabled,
  onPick,
  onClear,
  error,
}: {
  docType: DocType
  file: File | null
  disabled: boolean
  onPick: (file: File) => void
  onClear: () => void
  error: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onPick(dropped)
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
        <span className="text-muted-foreground">{slotMeta[docType].icon}</span>
        {DOC_LABELS[docType]}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'group relative flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-5 text-center backdrop-blur-sm transition-colors',
          dragging ? 'border-primary/70 bg-primary/5' : 'border-border hover:border-primary/40',
          file && 'border-solid border-emerald-500/30 bg-emerald-950/10',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onPick(f)
            e.target.value = ''
          }}
        />

        {file ? (
          <>
            <FileText className="h-6 w-6 text-emerald-400" />
            <p className="mt-2 max-w-full truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onClear() }}
                className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
            <p className="mt-2 text-sm text-foreground">
              Drop file or <span className="text-primary">browse</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/70">PDF, PNG or JPG · {slotMeta[docType].hint}</p>
          </>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function DocumentUpload({ onAnalyze, disabled }: DocumentUploadProps) {
  const [files, setFiles] = useState<Record<DocType, File | null>>({
    packing_list: null,
    commercial_invoice: null,
  })
  const [errors, setErrors] = useState<Record<DocType, string | null>>({
    packing_list: null,
    commercial_invoice: null,
  })

  function pick(docType: DocType, file: File) {
    const okType = /pdf$|image\/(png|jpe?g)$/i.test(file.type) || /\.(pdf|png|jpe?g)$/i.test(file.name)
    if (!okType) {
      setErrors(p => ({ ...p, [docType]: 'Unsupported file type. Use PDF, PNG or JPG.' }))
      return
    }
    if (file.size > MAX_BYTES) {
      setErrors(p => ({ ...p, [docType]: 'File too large (max 15MB for this POC).' }))
      return
    }
    setErrors(p => ({ ...p, [docType]: null }))
    setFiles(p => ({ ...p, [docType]: file }))
  }

  function clear(docType: DocType) {
    setFiles(p => ({ ...p, [docType]: null }))
    setErrors(p => ({ ...p, [docType]: null }))
  }

  const ready = !!files.packing_list && !!files.commercial_invoice

  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        {(['packing_list', 'commercial_invoice'] as DocType[]).map(docType => (
          <DropSlot
            key={docType}
            docType={docType}
            file={files[docType]}
            disabled={disabled}
            error={errors[docType]}
            onPick={f => pick(docType, f)}
            onClear={() => clear(docType)}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5 text-primary/70" />
          Vision OCR · cross-document reconciliation
        </span>
        <Button
          onClick={() => ready && onAnalyze(files as Record<DocType, File>)}
          disabled={!ready || disabled}
          size="lg"
          className="gap-1.5 bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] hover:bg-primary/90"
        >
          <ScanLine className="h-4 w-4" />
          Analyze documents
        </Button>
      </div>
    </div>
  )
}
