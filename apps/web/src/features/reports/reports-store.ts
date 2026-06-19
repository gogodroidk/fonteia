/**
 * reports-store.ts
 * Generic, localStorage-backed store for SavedReport entries.
 * SSG-safe: every localStorage access is guarded by typeof window check.
 * Key: fonteia.reports.v1  |  Cap: 100 entries  |  Order: newest first
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportField {
  label: string;
  value: string;
}

export interface ReportSource {
  label: string;
  url?: string | undefined;
  collectedAt?: string | undefined;
}

export interface SavedReport {
  /** Stable composite ID: `${kind}:${ref}` — e.g. "empresa:12345678000195" */
  id: string;
  /** Machine kind: "empresa" | "municipio" | "parlamentar" | "lote" | "ambiental" | "marca" | "processo" | ... */
  kind: string;
  /** Human-readable kind label in pt-BR — e.g. "Empresa (CNPJ)" */
  kindLabel: string;
  /** Entity name / primary identifier shown as the report title */
  title: string;
  /** Secondary line under title — e.g. CNPJ formatted, UF, etc. */
  subtitle?: string | undefined;
  /** Ordered key→value pairs that form the report body */
  fields: ReportField[];
  /** Rastreabilidade: every report must carry its sources */
  sources: ReportSource[];
  /** ISO-8601 timestamp when the report was generated */
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "fonteia.reports.v1";
const MAX_ENTRIES = 100;

// ─── Validation guard ─────────────────────────────────────────────────────────

function isSavedReport(x: unknown): x is SavedReport {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["kind"] === "string" &&
    typeof r["kindLabel"] === "string" &&
    typeof r["title"] === "string" &&
    typeof r["createdAt"] === "string" &&
    Array.isArray(r["fields"]) &&
    Array.isArray(r["sources"])
  );
}

// ─── Raw read/write ───────────────────────────────────────────────────────────

function readAll(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedReport);
  } catch {
    return [];
  }
}

function writeAll(reports: SavedReport[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(reports));
  } catch {
    // Quota exceeded or private mode — fail silently
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist a report. If a report with the same id already exists, it is replaced
 * in-place (updated). Otherwise it is prepended. The list is capped at MAX_ENTRIES.
 */
export function saveReport(report: SavedReport): void {
  const existing = readAll().filter((r) => r.id !== report.id);
  const updated = [report, ...existing].slice(0, MAX_ENTRIES);
  writeAll(updated);
}

/** Return all reports newest-first. */
export function listReports(): SavedReport[] {
  return readAll();
}

/** Return a single report by id, or undefined if not found. */
export function getReport(id: string): SavedReport | undefined {
  return readAll().find((r) => r.id === id);
}

/** Remove a single report by id. */
export function deleteReport(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

/** Wipe all reports from localStorage. */
export function clearReports(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}
