import { UploadedDocs } from './types'

/** Map required-doc label → uploaded file URL when the broker uploaded it. */
const DOC_URL_GETTERS: Record<string, (docs: UploadedDocs) => string | undefined> = {
  'Packing List': d => d.packingListUrl,
  'Commercial Invoice': d => d.commercialInvoiceUrl,
}

const DOC_KEY_GETTERS: Record<string, (docs: UploadedDocs) => string | undefined> = {
  'Packing List': d => d.packingListKey,
  'Commercial Invoice': d => d.commercialInvoiceKey,
}

export function uploadedDocUrl(docName: string, docs?: UploadedDocs): string | undefined {
  if (!docs) return undefined
  return DOC_URL_GETTERS[docName]?.(docs)
}

export function uploadedDocKey(docName: string, docs?: UploadedDocs): string | undefined {
  if (!docs) return undefined
  return DOC_KEY_GETTERS[docName]?.(docs)
}

export function isUploadedDoc(docName: string, docs?: UploadedDocs): boolean {
  return !!uploadedDocKey(docName, docs) || !!uploadedDocUrl(docName, docs)
}

export function docFileMetaToUploaded(meta: {
  packingListUrl?: string
  packingListKey?: string
  invoiceUrl?: string
  invoiceKey?: string
}): UploadedDocs {
  return {
    packingListUrl: meta.packingListUrl,
    packingListKey: meta.packingListKey,
    commercialInvoiceUrl: meta.invoiceUrl,
    commercialInvoiceKey: meta.invoiceKey,
  }
}
