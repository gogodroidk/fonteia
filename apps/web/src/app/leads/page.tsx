/**
 * leads/page.tsx — Fonte.ia
 *
 * Painel de Leads com Motivo: cada contrato público recente = empresa que ganhou
 * dinheiro = lead qualificado. Fonte: entities onde kind='public_contract'.
 *
 * Exporta `LeadsPage` para ser roteada em /app/leads.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import { listLeads, type Lead } from "../../features/leads/leads-api";
import { inferServicos, inferSetor } from "../../features/leads/leads-heuristics";
import { gerarMensagens } from "../../features/leads/leads-templates";
import { navigateSpa } from "../_nav";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type RecenciaFilter = "todas" | "7d" | "30d" | "90d";
type ValorFilter = "todos" | "10k" | "100k" | "500k" | "1m";

const RECENCIA_OPTIONS: ReadonlyArray<readonly [RecenciaFilter, string]> = [
  ["todas", "Qualquer data"],
  ["7d", "Últimos 7 dias"],
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
];

const VALOR_OPTIONS: ReadonlyArray<readonly [ValorFilter, string]> = [
  ["todos", "Qualquer valor"],
  ["10k", "Acima de R$ 10 mil"],
  ["100k", "Acima de R$ 100 mil"],
  ["500k", "Acima de R$ 500 mil"],
  ["1m", "Acima de R$ 1 milhão"],
];

const VALOR_MIN: Record<ValorFilter, number> = {
  todos: 0,
  "10k": 10_000,
  "100k": 100_000,
  "500k": 500_000,
  "1m": 1_000_000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function formatBRLFull(n: number): string {
  if (n <= 0) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function formatDataCurta(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function isWithinDays(isoDate: string, days: number): boolean {
  if (!isoDate) return false;
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() <= days * 86_400_000;
  } catch {
    return false;
  }
}

function buildPncpUrl(numeroControlePNCP: string): string {
  if (!numeroControlePNCP) return "https://pncp.gov.br/app/contratos";
  // Formato esperado: CNPJ-TIPO-SEQ/ANO → URL pública do PNCP
  return `https://pncp.gov.br/app/contratos/${encodeURIComponent(numeroControlePNCP)}`;
}

function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true;
  const query = normalizeForSearch(q);
  const haystack = normalizeForSearch(
    [lead.razaoSocial, lead.cnpj, lead.orgao, lead.objeto, lead.municipio, lead.uf].join(" "),
  );
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card card--pad" aria-hidden="true">
      <div className="skeleton" style={{ height: 11, width: "25%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 15, width: "75%", marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 13, width: "40%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 12, width: "90%", marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 12, width: "70%", marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <div className="skeleton" style={{ height: 32, flex: 1, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 32, flex: 1, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 32, width: 80, borderRadius: 8 }} />
      </div>
    </div>
  );
}

// ─── Serviço sugerível chip ───────────────────────────────────────────────────

function ServicoChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      className="badge badge--neutral"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      className="btn btn--ghost btn--sm"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
      onClick={handleCopy}
      type="button"
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
    >
      {copied ? (
        <Check size={13} style={{ color: "var(--ok)" }} aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      {copied ? "Copiado!" : `Copiar ${label}`}
    </button>
  );
}

// ─── Mensagens drawer (inline expand) ────────────────────────────────────────

interface MensagensDrawerProps {
  lead: Lead;
  servicoLabel: string;
}

function MensagensDrawer({ lead, servicoLabel }: MensagensDrawerProps) {
  const [tab, setTab] = useState<"whatsapp" | "email">("whatsapp");
  const msgs = gerarMensagens(lead, servicoLabel);

  const textoAtual =
    tab === "whatsapp" ? msgs.whatsapp : `${msgs.email.assunto}\n\n${msgs.email.corpo}`;

  return (
    <div
      className="panel inset"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* Tabs */}
      <div className="row" style={{ gap: 6 }}>
        <button
          className={`chip${tab === "whatsapp" ? " chip--on" : ""}`}
          style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("whatsapp")}
          type="button"
        >
          <MessageCircle size={13} aria-hidden="true" />
          WhatsApp
        </button>
        <button
          className={`chip${tab === "email" ? " chip--on" : ""}`}
          style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("email")}
          type="button"
        >
          <Mail size={13} aria-hidden="true" />
          E-mail
        </button>
      </div>

      {/* Assunto (só no e-mail) */}
      {tab === "email" && (
        <div style={{ fontSize: 12.5, color: "var(--t-mid)" }}>
          <span style={{ fontWeight: 700, color: "var(--t-hi)" }}>Assunto: </span>
          {msgs.email.assunto}
        </div>
      )}

      {/* Texto da mensagem */}
      <pre
        style={{
          margin: 0,
          fontFamily: "inherit",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--t-mid)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {tab === "whatsapp" ? msgs.whatsapp : msgs.email.corpo}
      </pre>

      {/* Ações */}
      <div className="row wrap" style={{ gap: 8 }}>
        <CopyButton text={textoAtual} label={tab === "whatsapp" ? "mensagem WhatsApp" : "e-mail completo"} />
      </div>
    </div>
  );
}

// ─── Lead card ───────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead;
}

function LeadCard({ lead }: LeadCardProps) {
  const [showMensagens, setShowMensagens] = useState(false);
  const servicos = inferServicos(lead.objeto);
  const setor = inferSetor(lead.objeto);
  const local =
    lead.municipio && lead.uf
      ? `${lead.municipio}/${lead.uf}`
      : lead.uf
        ? lead.uf
        : lead.municipio
          ? lead.municipio
          : "Brasil";

  const cnpjDisplay = lead.cnpj ? formatCnpj(lead.cnpj) : null;
  const dataDisplay = formatDataCurta(lead.dataVigenciaInicio);

  // Para a mensagem usamos o primeiro serviço sugerido como padrão
  const servicoLabel = servicos[0]?.label ?? "serviços especializados";

  // Link PNCP
  const pncpUrl = buildPncpUrl(lead.numeroControlePNCP);

  // Link Raio-X
  const raiox = lead.cnpj
    ? `/app/raio-x?cnpj=${encodeURIComponent(lead.cnpj)}`
    : null;

  return (
    <article className="card card--hover" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>

        {/* Top: setor badge */}
        <div className="row between" style={{ gap: 8, alignItems: "center" }}>
          <span
            className="badge badge--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}
          >
            <TrendingUp size={12} aria-hidden="true" />
            {setor}
          </span>
          {dataDisplay && (
            <span className="tiny muted" style={{ flexShrink: 0 }}>
              {dataDisplay}
            </span>
          )}
        </div>

        {/* Empresa */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 7,
              fontWeight: 800,
              fontSize: 15,
              color: "var(--t-hi)",
              lineHeight: 1.3,
            }}
          >
            <Building2 size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--t-low)" }} aria-hidden="true" />
            <span style={{ minWidth: 0 }}>{lead.razaoSocial}</span>
          </div>
          {cnpjDisplay && (
            <div className="tiny muted" style={{ marginTop: 3, marginLeft: 22 }}>
              CNPJ {cnpjDisplay}
            </div>
          )}
        </div>

        {/* Evento/motivo — destaque */}
        <div
          className="panel inset"
          style={{
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
            borderRadius: "var(--r-md)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            className="tiny"
            style={{ fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Motivo do lead
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-hi)", lineHeight: 1.4 }}>
            Ganhou contrato
            {lead.valorGlobal > 0 && (
              <> de <span className="num" style={{ color: "var(--accent)", fontWeight: 800 }}>{formatBRLFull(lead.valorGlobal)}</span></>
            )}
            {" — "}
            {lead.orgao}
            {dataDisplay && ` (${dataDisplay})`}
          </div>
        </div>

        {/* Objeto (truncado) */}
        {lead.objeto && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--t-mid)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={lead.objeto}
          >
            {lead.objeto}
          </div>
        )}

        {/* Localização */}
        <div
          className="tiny muted"
          style={{ display: "flex", alignItems: "center", gap: 5 }}
        >
          <MapPin size={12} aria-hidden="true" />
          {local}
          {lead.modalidade && (
            <>
              <span aria-hidden="true">·</span>
              {lead.modalidade}
            </>
          )}
        </div>

        {/* Serviços sugeríveis */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            className="tiny"
            style={{
              fontWeight: 700,
              color: "var(--t-low)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Sparkles size={11} aria-hidden="true" />
            Você pode oferecer
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {servicos.map((s) => (
              <ServicoChip key={s.label} icon={s.icon} label={s.label} />
            ))}
          </div>
        </div>

        {/* Mensagem pronta (toggle) */}
        <div>
          <button
            className="btn btn--soft btn--sm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              width: "100%",
              justifyContent: "center",
            }}
            onClick={() => setShowMensagens((v) => !v)}
            type="button"
            aria-expanded={showMensagens}
          >
            <MessageCircle size={13} aria-hidden="true" />
            {showMensagens ? "Fechar mensagem" : "Ver mensagem pronta"}
            {showMensagens ? (
              <ChevronUp size={13} aria-hidden="true" />
            ) : (
              <ChevronDown size={13} aria-hidden="true" />
            )}
          </button>

          {showMensagens && (
            <div style={{ marginTop: 10 }}>
              <MensagensDrawer lead={lead} servicoLabel={servicoLabel} />
            </div>
          )}
        </div>

        {/* Rodapé: Raio-X + PNCP */}
        <div className="row between wrap" style={{ gap: 8, marginTop: "auto", paddingTop: 4 }}>
          {raiox ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              style={{
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => navigateSpa(raiox)}
            >
              <Search size={13} aria-hidden="true" />
              Ver Raio-X
            </button>
          ) : (
            <span />
          )}

          {lead.numeroControlePNCP && (
            <a
              href={pncpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tiny"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "var(--t-low)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              PNCP
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Filter select ────────────────────────────────────────────────────────────

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
}) {
  return (
    <label className="chip" style={{ gap: 8, paddingRight: 10 }}>
      <span style={{ color: "var(--t-low)", fontWeight: 600 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--t-hi)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 200,
        }}
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Empty source state ───────────────────────────────────────────────────────

function EmptySourceState() {
  return (
    <div
      className="panel"
      style={{
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TrendingUp size={28} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Contratos sendo coletados</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 380 }}>
        A integração com o PNCP está sendo ligada. Em breve cada contrato assinado vai gerar um lead
        automático aqui. Volte em alguns minutos.
      </p>
    </div>
  );
}

// ─── Empty filter state ───────────────────────────────────────────────────────

function EmptyFilterState({ onClear }: { onClear: () => void }) {
  return (
    <div
      className="panel"
      style={{
        padding: 48,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
          color: "var(--brand-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Search size={24} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum lead com esses filtros</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 340 }}>
        Tente ampliar a busca, trocar a UF ou a faixa de valor.
      </p>
      <button className="btn btn--ghost btn--sm" onClick={onClear} type="button">
        Limpar filtros
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LeadsPage() {
  // ── Data state ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState("");

  // ── Filters ──
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("todas");
  const [valor, setValor] = useState<ValorFilter>("todos");
  const [recencia, setRecencia] = useState<RecenciaFilter>("todas");

  // ── Pagination ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Load ──
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    listLeads()
      .then((result) => {
        if (cancelled) return;
        setLeads(result.leads);
        setSourceMessage(result.message);
        if (result.errors && result.errors.length > 0 && result.source === "empty") {
          setErrorMessage(result.errors[0] ?? null);
        }
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Erro ao carregar leads.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── UF options (derived) ──
  const ufOptions = useMemo<ReadonlyArray<readonly [string, string]>>(() => {
    const distinct = Array.from(
      new Set(leads.map((l) => l.uf).filter((u): u is string => typeof u === "string" && u.length > 0)),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [["todas", "Todas UF"], ...distinct.map((u) => [u, u] as const)];
  }, [leads]);

  // ── Filtered ──
  const filtered = useMemo<Lead[]>(() => {
    return leads.filter((l) => {
      if (!matchesSearch(l, query)) return false;
      if (uf !== "todas" && l.uf !== uf) return false;
      if (valor !== "todos" && l.valorGlobal < VALOR_MIN[valor]) return false;
      if (recencia !== "todas") {
        const days = recencia === "7d" ? 7 : recencia === "30d" ? 30 : 90;
        if (!isWithinDays(l.createdAt, days)) return false;
      }
      return true;
    });
  }, [leads, query, uf, valor, recencia]);

  // Reinicia paginação ao mudar filtros
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, uf, valor, recencia]);

  // Infinite scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  function clearFilters() {
    setQuery("");
    setUf("todas");
    setValor("todos");
    setRecencia("todas");
  }

  const hasActiveFilters =
    query !== "" || uf !== "todas" || valor !== "todos" || recencia !== "todas";

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Prospecção inteligente</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Leads com Motivo
        </h2>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 580 }}>
          Cada empresa aqui <strong>acabou de assinar um contrato público</strong> — ela tem dinheiro
          novo, demandas novas e está aberta a fornecedores. Chegue na hora certa com a oferta certa.
        </p>
      </div>

      {/* Error banner */}
      {errorMessage !== null && (
        <div
          className="panel"
          role="alert"
          style={{
            padding: "14px 18px",
            background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            color: "var(--danger)",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          Erro ao carregar dados: {errorMessage}
        </div>
      )}

      {/* Filter bar */}
      <div
        className="panel"
        style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Search */}
        <div className="searchbar">
          <Search size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por empresa, CNPJ, órgão ou objeto…"
            aria-label="Buscar leads"
          />
          {query !== "" && (
            <button
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 28, height: 28, flexShrink: 0 }}
              onClick={() => setQuery("")}
              type="button"
              aria-label="Limpar busca"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Selects */}
        <div className="row wrap" style={{ gap: 10 }}>
          {ufOptions.length > 1 && (
            <FilterSelect label="UF" value={uf} options={ufOptions} onChange={setUf} />
          )}
          <FilterSelect label="Valor" value={valor} options={VALOR_OPTIONS} onChange={setValor} />
          <FilterSelect label="Recência" value={recencia} options={RECENCIA_OPTIONS} onChange={setRecencia} />
        </div>
      </div>

      {/* Count row */}
      {!isLoading && errorMessage === null && leads.length > 0 && (
        <div className="row between wrap" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--t-mid)" }}>
            <b className="num" style={{ color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length}
            </b>{" "}
            {filtered.length === 1 ? "lead encontrado" : "leads encontrados"}
            {filtered.length > visible.length ? ` · mostrando ${visible.length}` : ""}
          </span>
          {hasActiveFilters && (
            <button className="btn btn--ghost btn--sm" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid / states */}
      {isLoading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}
          aria-busy="true"
          aria-label="Carregando leads…"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : errorMessage !== null ? null : leads.length === 0 ? (
        <EmptySourceState />
      ) : filtered.length === 0 ? (
        <EmptyFilterState onClear={clearFilters} />
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}
          >
            {visible.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
          {hasMore && (
            <div
              ref={sentinelRef}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 20,
                color: "var(--t-mid)",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <Loader2 size={16} className="spin" />
              Carregando mais leads…
            </div>
          )}
        </>
      )}

      {/* Source attribution (discreto, rodapé) */}
      {!isLoading && leads.length > 0 && sourceMessage && (
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
          {sourceMessage} · Fonte: PNCP (Portal Nacional de Contratações Públicas)
        </p>
      )}
    </div>
  );
}
