/**
 * raiox/page.tsx — Raio-X 360° de empresa.
 *
 * Rotas: /app/raiox (busca vazia) e /app/raiox/:cnpj (relatório).
 * Consome a edge function `dossie` (GET /functions/v1/dossie?cnpj=...) via
 * `features/raiox/raiox-api.ts`, programado contra o contrato combinado com o
 * backend. Em dev, se a function ainda não responder, cai num mock local
 * (features/raiox/mock-dossie.ts), claramente identificado na tela.
 *
 * Hierarquia visual (mobile-first, 375px):
 *   1. Busca (CompanySearch) — nome OU CNPJ.
 *   2. Acima da dobra: HeaderCard (empresa) + FlagStrip (semáforo de red flags).
 *   3. Seções na ordem que vende: Sanções → Contratos → Licitações → Leilões
 *      arrematados → CEAP → Marcas → Transferências → Ambiental → Fiscal →
 *      Jurídico. Cada uma com estados distintos (ok/vazio/evidência insuficiente/erro).
 *
 * Gate visual: free vê no máximo 3 itens por seção (o SERVIDOR já corta —
 * aqui só apresentamos + banner de upgrade). O plano vem de `usePlan()`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FlaskConical, ScanSearch } from "lucide-react";
import { CompanySearch, EmptyState } from "../../components/ui";
import { usePlan } from "../../lib/use-plan";
import { usePathname } from "../../lib/use-pathname";
import {
  fetchDossie,
  DossieNotFoundError,
  sanitizeCnpj,
  formatCnpj,
} from "../../features/raiox/raiox-api";
import { HeaderCard } from "../../features/raiox/HeaderCard";
import { FlagStrip } from "../../features/raiox/FlagStrip";
import { SectionCard } from "../../features/raiox/SectionCard";
import { RaioXSkeleton } from "../../features/raiox/RaioXSkeleton";
import { SECTION_ORDER, type DossiePayload, type SectionKey } from "../../features/raiox/types";

/** Extrai o CNPJ (14 chars, se houver) do caminho /app/raiox/:cnpj. */
function cnpjFromPath(path: string): string {
  const match = /^\/app\/raiox\/([^/?#]+)/.exec(path);
  if (!match?.[1]) return "";
  return sanitizeCnpj(decodeURIComponent(match[1]));
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: DossiePayload; isMock: boolean }
  | { kind: "not-found"; cnpj: string }
  | { kind: "error"; message: string };

export default function RaioXPage() {
  const { path, navigate } = usePathname();
  const { isPro } = usePlan();
  const cnpj = useMemo(() => cnpjFromPath(path), [path]);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  // Refs das seções, para os chips do header rolarem até elas.
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});

  useEffect(() => {
    if (cnpj === "") {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    void fetchDossie(cnpj)
      .then(({ data, isMock }) => {
        if (cancelled) return;
        setState({ kind: "ready", data, isMock });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DossieNotFoundError) {
          setState({ kind: "not-found", cnpj });
          return;
        }
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Não foi possível carregar o Raio-X agora.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [cnpj]);

  function goToCnpj(nextCnpj: string) {
    navigate(`/app/raiox/${encodeURIComponent(nextCnpj)}`);
  }

  function jumpToSection(key: SectionKey) {
    const el = sectionRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
    }
  }

  function goToUpgrade() {
    navigate("/app/planos");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980, margin: "0 auto" }}>
      <div>
        <span className="eyebrow">Raio-X 360°</span>
        <h1 className="h2" style={{ margin: "6px 0 4px" }}>
          Consulte qualquer empresa em segundos
        </h1>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5 }}>
          Sanções, contratos, licitações, leilões, marcas e muito mais — tudo com fonte oficial e data de coleta.
        </p>
        <CompanySearch
          id="raiox-search"
          label="Buscar empresa"
          placeholder="Digite o CNPJ de um concorrente ou fornecedor"
          initialValue={cnpj ? formatCnpj(cnpj) : ""}
          onSelect={(selectedCnpj) => goToCnpj(selectedCnpj)}
          autoFocus={cnpj === ""}
        />
      </div>

      {state.kind === "idle" && (
        <div className="panel" style={{ padding: 0 }}>
          <EmptyState
            icon={ScanSearch}
            tone="info"
            title="Nenhuma empresa selecionada"
            description="Busque pelo nome ou cole o CNPJ acima para ver o Raio-X 360° completo: sanções, contratos, licitações, leilões, marcas, jurídico e mais."
          />
        </div>
      )}

      {state.kind === "loading" && <RaioXSkeleton />}

      {state.kind === "not-found" && (
        <div className="panel" style={{ padding: 0 }}>
          <EmptyState
            icon={AlertTriangle}
            tone="warning"
            title="CNPJ não encontrado nas fontes"
            description={`Não encontramos registros para ${formatCnpj(state.cnpj)} nas bases consultadas até o momento.`}
            action={{ label: "Buscar outra empresa", onClick: () => goToCnpj("") }}
          />
        </div>
      )}

      {state.kind === "error" && (
        <div className="panel" style={{ padding: 0 }}>
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            title="Não foi possível carregar o Raio-X"
            description={state.message}
            action={{ label: "Tentar de novo", onClick: () => goToCnpj(cnpj) }}
          />
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {state.isMock && (
            <div
              role="status"
              className="inset"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))",
                color: "var(--t-mid)",
                fontSize: 12.5,
              }}
            >
              <FlaskConical size={15} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden="true" />
              Dados de exemplo (mock) — a função de backend do Raio-X ainda não está disponível neste ambiente.
            </div>
          )}

          <HeaderCard
            cnpj={state.data.cnpj}
            header={state.data.header}
            sections={state.data.sections}
            onJumpToSection={jumpToSection}
          />

          <FlagStrip flags={state.data.flags} onUpgrade={goToUpgrade} />

          {!isPro && (
            <div
              className="panel"
              style={{
                padding: 16,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "linear-gradient(135deg,color-mix(in srgb,var(--accent) 10%,var(--surface)),var(--surface))",
                borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))",
              }}
            >
              <div>
                <strong style={{ fontSize: 14, color: "var(--t-hi)" }}>
                  Ver tudo com o plano Pro — R$197/mês
                </strong>
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                  No plano gratuito, cada seção mostra até 3 registros e os alertas de risco ficam bloqueados.
                </p>
              </div>
              <button type="button" className="btn btn--accent" onClick={goToUpgrade}>
                Assinar agora
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {SECTION_ORDER.map(({ key, title }) => (
              <SectionCard
                key={key}
                id={`raiox-section-${key}`}
                title={title}
                section={state.data.sections[key]}
                gated={!isPro}
                onUpgrade={goToUpgrade}
                ref={(el) => {
                  sectionRefs.current[key] = el;
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
