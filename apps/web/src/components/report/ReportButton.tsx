/**
 * ReportButton.tsx
 * Reusable "Gerar relatório" button for any entity detail page.
 *
 * Usage:
 *   <ReportButton report={buildReport(entity)} />
 *   <ReportButton report={buildReport(entity)} label="Ver relatório" />
 *
 * On click: saves the report to localStorage and navigates to /app/relatorios.
 * Self-contained; detail pages only need to build the SavedReport object.
 */

import { useState } from "react";
import { FileText } from "lucide-react";
import { saveReport, type SavedReport } from "../../features/reports/reports-store";
import { navigateSpa } from "../../app/_nav";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ReportButtonProps {
  /** The fully-formed report to save. Build it with the entity's data before passing. */
  report: SavedReport;
  /** Button label; defaults to "Gerar relatório" */
  label?: string | undefined;
  /** Extra CSS className for the button element */
  className?: string | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportButton({
  report,
  label = "Gerar relatório",
  className,
}: ReportButtonProps) {
  const [saved, setSaved] = useState(false);

  function handleClick() {
    saveReport(report);
    setSaved(true);
    // Brief visual confirmation before navigating
    setTimeout(() => {
      navigateSpa("/app/relatorios");
    }, 380);
  }

  return (
    <button
      type="button"
      className={["btn btn--soft btn--sm", className].filter(Boolean).join(" ")}
      onClick={handleClick}
      disabled={saved}
      aria-label={saved ? "Relatório salvo, redirecionando…" : label}
      style={{ transition: "opacity .2s" }}
    >
      <FileText size={13} aria-hidden="true" />
      {saved ? "Salvo…" : label}
    </button>
  );
}
