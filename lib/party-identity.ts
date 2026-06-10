/**
 * Shared identity normalization for trade parties (suppliers, importers).
 * Supplier and importer profiles must key identically for the same company
 * string, so both sides normalize through this single function.
 */

/** Identity key for cross-shipment matching — exact after normalization, no fuzzy match. */
export function normalizePartyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '')
    .toLowerCase()
}
