import { useEffect, useState, type ReactNode } from "react";
import type { CamaraDeputado } from "@fonteia/sources";
import {
  CalendarDays,
  ChevronLeft,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Mail,
  Receipt,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from "lucide-react";
import { FonteDots } from "../../components/ui";
import {
  listDespesas,
  listVotacoes,
  type DespesaItem,
  type VotacaoItem,
} from "../../features/politica/politica-api";

// ─── Constants ───────────────────────────────────────────────────────────────

const FONTE_DOTS_CAMARA = [
  { sigla: "CD", cor: "#1F8A4C", nome: "Câmara dos Deputados — Dados Abertos" },
];

type TabId = "identificacao" | "despesas" | "votacoes";

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "identificacao", label: "Identificação", icon: <Landmark size={14} aria-hidden="true" /> },
  { id: "despesas", label: "Despesas (Cota)", icon: <Receipt size={14} aria-hidden="true" /> },
  { id: "votacoes", label: "Votações", icon: <Vote size={14} aria-hidden="true" /> },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeputadoDetailPageProps {
  deputado: CamaraDeputado;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatDate(value: string): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function mesLabel(mes: number): string {
  return [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ][mes - 1] ?? String(mes);
}

function votoColor(voto: string): string {
  const v = voto.toLowerCase();
  if (v === "sim") return "var(--accent, #16a34a)";
  if (v === "não" || v === "nao") return "var(--danger)";
  return "var(--t-mid)";
}

function votoLabel(voto: string): { label: string; color: string } {
  const v = voto.toLowerCase();
  if (v === "sim") return { label: "Sim", color: "var(--accent, #16a34a)" };
  if (v === "não" || v === "nao") return { label: "Não", color: "var(--danger)" };
  if (v === "abstenção" || v === "abstencao") return { label: "Abstenção", color: "var(--t-mid)" };
  if (v === "obstrução" || v === "obstrucao") return { label: "Obstrução", color: "var(--t-low)" };
  return { label: voto || "—", color: "var(--t-low)" };
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: "var(--t-low)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="row between"
      style={{
        gap: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderBottom: "1px solid var(--border)",
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
        {label}
      </span>
      <span
        className="tiny num"
        style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function EmptySection({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--brand-ink) 10%, var(--surface))",
          color: "var(--brand-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <p className="muted small" style={{ margin: 0, maxWidth: 320 }}>
        {subtitle}
      </p>
    </div>
  );
}

function LoadingSection() {
  return (
    <div
      style={{
        padding: "36px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--t-mid)",
        fontSize: 13,
      }}
      aria-live="polite"
      aria-label="Carregando dados…"
    >
      <Loader2 size={18} className="spin" aria-hidden="true" />
      Carregando…
    </div>
  );
}

// ─── Tab: Identificação ───────────────────────────────────────────────────────

function TabIdentificacao({ deputado }: { deputado: CamaraDeputado }) {
  const camaraPerfilUrl = `https://www.camara.leg.br/deputados/${deputado.id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Contato */}
      {deputado.email !== "" && (
        <div className="panel" style={{ padding: "20px 24px" }}>
          <SectionLabel>Contato</SectionLabel>
          <a
            href={`mailto:${deputado.email}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--brand-ink)",
              textDecoration: "none",
            }}
          >
            <Mail size={16} aria-hidden="true" />
            {deputado.email}
          </a>
        </div>
      )}

      {/* Identificação */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <SectionLabel>Identificação</SectionLabel>
        <InfoRow label="ID na Câmara" value={deputado.id} />
        <InfoRow label="Partido" value={deputado.partido || "Não informado"} />
        <InfoRow label="UF" value={deputado.uf || "Não informado"} />
        <div
          className="row between"
          style={{ gap: 12, paddingTop: 10, alignItems: "flex-start", flexWrap: "wrap" }}
        >
          <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
            Fonte
          </span>
          <span
            className="tiny"
            style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
          >
            {deputado.sourceId}
          </span>
        </div>
      </div>

      {/* Links oficiais */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <SectionLabel>Links oficiais</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <FonteDots fontes={FONTE_DOTS_CAMARA} size={32} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>
              Câmara dos Deputados — Dados Abertos
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              dadosabertos.camara.leg.br
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a
            href={camaraPerfilUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-ink)",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Ver perfil na Câmara
          </a>
          {deputado.foto !== "" && (
            <a
              href={deputado.foto}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--brand-ink)",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Ver foto oficial
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Despesas ────────────────────────────────────────────────────────────

function TabDespesas({ deputadoId }: { deputadoId: string }) {
  const [despesas, setDespesas] = useState<DespesaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listDespesas()
      .then((result) => {
        if (cancelled) return;
        // Filtra somente as despesas do deputado atual
        const minhas = result.despesas.filter(
          (d) => String(d.attributes.deputadoId) === String(deputadoId),
        );
        setDespesas(minhas);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar despesas.");
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [deputadoId]);

  if (isLoading) return <LoadingSection />;

  if (error !== null) {
    return (
      <div
        className="panel"
        style={{
          margin: "0 0 8px",
          padding: "12px 16px",
          background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
          border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
          color: "var(--danger)",
          fontSize: 13.5,
          fontWeight: 600,
        }}
        role="alert"
      >
        Erro ao carregar despesas: {error}
      </div>
    );
  }

  if (despesas.length === 0) {
    return (
      <EmptySection
        icon={<Receipt size={22} />}
        title="Nenhuma despesa registrada"
        subtitle="As despesas da cota parlamentar são coletadas periodicamente. Volte em breve."
      />
    );
  }

  // Total gasto (valorLiquido)
  const totalLiquido = despesas.reduce((acc, d) => acc + (d.attributes.valorLiquido ?? 0), 0);
  const totalDocumento = despesas.reduce((acc, d) => acc + (d.attributes.valorDocumento ?? 0), 0);

  // Ordena por data decrescente
  const sorted = [...despesas].sort((a, b) => {
    const da = a.attributes.dataDocumento ?? "";
    const db = b.attributes.dataDocumento ?? "";
    return db.localeCompare(da);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Totalizador */}
      <div
        className="panel"
        style={{
          padding: "16px 20px",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div className="tiny muted" style={{ marginBottom: 4 }}>
            Total líquido (reembolsado)
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(totalLiquido)}
          </div>
        </div>
        <div>
          <div className="tiny muted" style={{ marginBottom: 4 }}>
            Total documentos
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t-mid)", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(totalDocumento)}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
            {despesas.length} {despesas.length === 1 ? "despesa" : "despesas"}
          </span>
        </div>
      </div>

      {/* Lista de despesas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((d) => {
          const a = d.attributes;
          return (
            <article
              key={d.id}
              className="card"
              style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}
            >
              {/* Linha superior: tipo + data + valor */}
              <div className="row between wrap" style={{ gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)", lineHeight: 1.3 }}>
                    {a.tipo || "Tipo não informado"}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                    <CalendarDays size={12} aria-hidden="true" />
                    {a.dataDocumento ? formatDate(a.dataDocumento) : (
                      a.mes && a.ano ? `${mesLabel(a.mes)}/${a.ano}` : "—"
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "var(--t-hi)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCurrency(a.valorLiquido ?? 0)}
                  </div>
                  {a.valorDocumento !== a.valorLiquido && (
                    <div className="tiny muted num" style={{ marginTop: 2, textDecoration: "line-through" }}>
                      {formatCurrency(a.valorDocumento ?? 0)}
                    </div>
                  )}
                </div>
              </div>

              {/* Fornecedor */}
              <div
                className="inset"
                style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 3 }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-hi)" }}>
                  {a.fornecedor || "Fornecedor não informado"}
                </div>
                {a.cnpjFornecedor !== "" && (
                  <div className="tiny muted num" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCnpj(a.cnpjFornecedor)}
                  </div>
                )}
              </div>

              {/* Link ao documento */}
              {a.urlDocumento && a.urlDocumento !== "" && (
                <a
                  href={a.urlDocumento}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tiny"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--brand-ink)",
                    fontWeight: 600,
                    textDecoration: "none",
                    alignSelf: "flex-start",
                  }}
                >
                  <FileText size={13} aria-hidden="true" />
                  Ver documento
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              )}
            </article>
          );
        })}
      </div>

      <div className="tiny muted" style={{ textAlign: "center", paddingBottom: 4 }}>
        Fonte: Dados Abertos da Câmara dos Deputados — Cota para Exercício da Atividade Parlamentar (CEAP)
      </div>
    </div>
  );
}

// ─── Tab: Votações ────────────────────────────────────────────────────────────

function TabVotacoes({ deputadoId }: { deputadoId: string }) {
  const [votacoes, setVotacoes] = useState<VotacaoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listVotacoes()
      .then((result) => {
        if (cancelled) return;
        setVotacoes(result.votacoes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar votações.");
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <LoadingSection />;

  if (error !== null) {
    return (
      <div
        className="panel"
        style={{
          padding: "12px 16px",
          background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
          border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
          color: "var(--danger)",
          fontSize: 13.5,
          fontWeight: 600,
        }}
        role="alert"
      >
        Erro ao carregar votações: {error}
      </div>
    );
  }

  // Filtra votações nas quais este deputado participou
  const comVoto = votacoes
    .map((v) => {
      const votoDeputado = v.attributes.votos?.find(
        (vt) => String(vt.deputadoId) === String(deputadoId),
      );
      return votoDeputado ? { votacao: v, voto: votoDeputado.voto } : null;
    })
    .filter((x): x is { votacao: VotacaoItem; voto: string } => x !== null);

  if (comVoto.length === 0) {
    if (votacoes.length === 0) {
      return (
        <EmptySection
          icon={<Vote size={22} />}
          title="Nenhuma votação disponível"
          subtitle="As votações do plenário são coletadas periodicamente. Volte em breve."
        />
      );
    }
    return (
      <EmptySection
        icon={<Vote size={22} />}
        title="Nenhum voto registrado para este deputado"
        subtitle="Pode ser que as votações disponíveis sejam de período anterior ao mandato atual."
      />
    );
  }

  // Ordena por data decrescente
  const sorted = [...comVoto].sort((a, b) => {
    const da = a.votacao.attributes.data ?? "";
    const db = b.votacao.attributes.data ?? "";
    return db.localeCompare(da);
  });

  // Estatísticas rápidas do deputado neste conjunto
  const simCount = comVoto.filter((x) => x.voto.toLowerCase() === "sim").length;
  const naoCount = comVoto.filter((x) => ["não", "nao"].includes(x.voto.toLowerCase())).length;
  const outroCount = comVoto.length - simCount - naoCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Resumo de votos */}
      <div
        className="panel"
        style={{ padding: "14px 20px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <ThumbsUp size={15} style={{ color: "var(--accent, #16a34a)" }} aria-hidden="true" />
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
            {simCount}
          </span>
          <span className="tiny muted">Sim</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <ThumbsDown size={15} style={{ color: "var(--danger)" }} aria-hidden="true" />
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--t-hi)", fontVariantNumeric: "tabular-nums" }}>
            {naoCount}
          </span>
          <span className="tiny muted">Não</span>
        </div>
        {outroCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--t-mid)", fontVariantNumeric: "tabular-nums" }}>
              {outroCount}
            </span>
            <span className="tiny muted">Outros</span>
          </div>
        )}
        <div style={{ marginLeft: "auto" }}>
          <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
            {comVoto.length} {comVoto.length === 1 ? "votação" : "votações"}
          </span>
        </div>
      </div>

      {/* Lista de votações */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map(({ votacao, voto }) => {
          const a = votacao.attributes;
          const { label: votoLbl, color: votoClr } = votoLabel(voto);
          const aprovada = a.aprovacao;

          return (
            <article
              key={votacao.id}
              className="card"
              style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}
            >
              {/* Linha superior: data + órgão + aprovação */}
              <div className="row between wrap" style={{ gap: 8, alignItems: "center" }}>
                <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <CalendarDays size={12} aria-hidden="true" />
                  {a.data ? formatDate(a.data) : "—"}
                  {a.siglaOrgao ? (
                    <span
                      className="badge badge--neutral"
                      style={{ marginLeft: 4, fontSize: 11, fontWeight: 700 }}
                    >
                      {a.siglaOrgao}
                    </span>
                  ) : null}
                </div>
                <span
                  className="badge"
                  style={{
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: 11,
                    color: aprovada ? "var(--accent-ink, #0a7d4b)" : "var(--danger)",
                    background: aprovada
                      ? "color-mix(in srgb, var(--accent, #16a34a) 14%, var(--surface))"
                      : "color-mix(in srgb, var(--danger) 12%, var(--surface))",
                    border: `1px solid ${aprovada ? "color-mix(in srgb, var(--accent, #16a34a) 28%, transparent)" : "color-mix(in srgb, var(--danger) 28%, transparent)"}`,
                  }}
                >
                  {aprovada ? "Aprovada" : "Rejeitada"}
                </span>
              </div>

              {/* Ementa da proposição */}
              {a.proposicao?.ementa && (
                <p
                  className="small"
                  style={{
                    margin: 0,
                    color: "var(--t-hi)",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {a.proposicao.sigla && a.proposicao.numero ? (
                    <strong style={{ marginRight: 6 }}>
                      {a.proposicao.sigla} {a.proposicao.numero}/{a.proposicao.ano}
                    </strong>
                  ) : null}
                  {a.proposicao.ementa}
                </p>
              )}

              {/* Placar + voto do deputado */}
              <div className="row between wrap" style={{ gap: 10, alignItems: "center" }}>
                {/* Placar */}
                <div className="tiny muted" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>
                    <span style={{ color: "var(--accent, #16a34a)", fontWeight: 700 }}>
                      {a.placarSim ?? 0} Sim
                    </span>
                  </span>
                  <span>
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                      {a.placarNao ?? 0} Não
                    </span>
                  </span>
                  {(a.placarAbstencoes ?? 0) > 0 && (
                    <span>
                      <span style={{ color: "var(--t-mid)", fontWeight: 600 }}>
                        {a.placarAbstencoes} Abs.
                      </span>
                    </span>
                  )}
                </div>

                {/* Voto do deputado */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: `color-mix(in srgb, ${votoClr} 12%, var(--surface))`,
                    border: `1px solid color-mix(in srgb, ${votoClr} 28%, transparent)`,
                  }}
                >
                  <span className="tiny" style={{ fontWeight: 800, color: votoClr }}>
                    Votou: {votoLbl}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="tiny muted" style={{ textAlign: "center", paddingBottom: 4 }}>
        Fonte: Dados Abertos da Câmara dos Deputados — Votações do Plenário
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeputadoDetailPage({ deputado, onBack }: DeputadoDetailPageProps) {
  const [imgError, setImgError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("identificacao");

  const hasPhoto = deputado.foto !== "" && !imgError;
  const hasPartido = deputado.partido !== "";
  const hasUf = deputado.uf !== "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800 }}>
      {/* Voltar */}
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Voltar a Política
      </button>

      {/* Hero */}
      <div className="panel" style={{ padding: "24px 28px" }}>
        <span className="eyebrow">Política — Câmara dos Deputados</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Avatar */}
          {hasPhoto ? (
            <img
              src={deputado.foto}
              alt=""
              onError={() => setImgError(true)}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                border: "2px solid var(--border)",
                background: "var(--surface-2, var(--surface))",
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 26,
                color: "var(--brand-ink)",
                background: "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))",
                border: "2px solid var(--border)",
              }}
            >
              {initialsOf(deputado.nome)}
            </div>
          )}

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                margin: "0 0 10px",
                color: "var(--t-hi)",
                lineHeight: 1.2,
              }}
            >
              {deputado.nome || "Nome não informado"}
            </h1>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {hasPartido && (
                <span className="badge badge--neutral" style={{ fontWeight: 700 }}>
                  {deputado.partido}
                </span>
              )}
              {hasUf && (
                <span className="badge badge--neutral">{deputado.uf}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Seções do deputado"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid var(--border)",
          paddingBottom: 0,
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.id}`}
              id={`tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                fontSize: 13.5,
                fontWeight: isActive ? 700 : 600,
                color: isActive ? "var(--brand-ink)" : "var(--t-mid)",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid var(--brand-ink)" : "2px solid transparent",
                marginBottom: -2,
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
                borderRadius: 0,
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div
        role="tabpanel"
        id={`tab-panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "identificacao" && <TabIdentificacao deputado={deputado} />}
        {activeTab === "despesas" && <TabDespesas deputadoId={deputado.id} />}
        {activeTab === "votacoes" && <TabVotacoes deputadoId={deputado.id} />}
      </div>
    </div>
  );
}
