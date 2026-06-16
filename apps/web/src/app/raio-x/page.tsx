/**
 * Raio-X de Empresa — página de relatório completo por CNPJ.
 *
 * Rota: /raio-x
 * Auto-contida: sem edições em App.tsx, app/page.tsx ou arquivos compartilhados.
 * O roteamento é adicionado pelo Igor depois.
 */
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Download,
  FileText,
  Loader2,
  MapPin,
  Search,
  ShieldAlert,
  Users,
  X,
  ExternalLink,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  type EmpresaCnpj,
  type SancaoItem,
  type RaioXReportData,
  lookupCnpj,
  fetchSancoesByCnpj,
  sanitizeCnpj,
  formatCnpj,
  formatDate,
  calcIdadeAnos,
  isSituacaoAtiva,
  buildResumo,
  buildCsvBlob,
} from "../../features/raio-x/raio-x-api";
import { FonteSeloBlock } from "../../features/raio-x/FonteSeloBlock";

// ─── Constantes de fonte ───────────────────────────────────────────────────────

const FONTE_RF = [
  { sigla: "RF", cor: "#1D5FE0", nome: "Receita Federal — cadastro de CNPJ (via Minha Receita)" },
];
const FONTE_CGU = [
  { sigla: "CGU", cor: "#D32F2F", nome: "Portal da Transparência — CEIS/CNEP (CGU)" },
];

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function FactItem({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="inset" style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        className="tiny muted"
        style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}
      >
        {icon && <span aria-hidden="true" style={{ display: "flex" }}>{icon}</span>}
        {label}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>{value || "—"}</span>
    </div>
  );
}

function SkeletonBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: i === 0 ? 28 : 18, borderRadius: 8, width: i === 0 ? "60%" : `${70 + (i % 3) * 10}%` }}
        />
      ))}
    </div>
  );
}

function AlertBanner({ tipo, children }: { tipo: "warn" | "danger" | "ok" | "info"; children: ReactNode }) {
  const map = {
    warn:   { color: "var(--warn)",   bg: "color-mix(in srgb, var(--warn)   12%, var(--surface))", border: "color-mix(in srgb, var(--warn)   30%, transparent)", Icon: AlertTriangle },
    danger: { color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 10%, var(--surface))", border: "color-mix(in srgb, var(--danger) 28%, transparent)", Icon: ShieldAlert },
    ok:     { color: "var(--ok)",     bg: "color-mix(in srgb, var(--ok)     10%, var(--surface))", border: "color-mix(in srgb, var(--ok)     25%, transparent)", Icon: CheckCircle2 },
    info:   { color: "var(--brand-ink)", bg: "color-mix(in srgb, var(--brand) 8%, var(--surface))", border: "color-mix(in srgb, var(--brand) 20%, transparent)", Icon: Info },
  };
  const { color, bg, border, Icon } = map[tipo];
  return (
    <div
      role={tipo === "danger" || tipo === "warn" ? "alert" : undefined}
      style={{
        padding: "11px 15px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <Icon size={17} style={{ color, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span style={{ fontSize: 13.5, fontWeight: 600, color, lineHeight: 1.45 }}>{children}</span>
    </div>
  );
}

// ─── Seção: Dados Cadastrais ──────────────────────────────────────────────────

function SecaoCadastral({ empresa, fetchedAt }: { empresa: EmpresaCnpj; fetchedAt: string }) {
  const ativa = isSituacaoAtiva(empresa.situacao);
  const idadeAnos = calcIdadeAnos(empresa.abertura);

  return (
    <FonteSeloBlock
      titulo="Dados Cadastrais"
      icone={<Building2 size={15} />}
      fontes={FONTE_RF}
      dataColeta={fetchedAt}
      confianca="alta"
    >
      {/* Cabeçalho: razão social + badge situação */}
      <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--t-hi)", lineHeight: 1.25, wordBreak: "break-word" }}>
            {empresa.razaoSocial}
          </div>
          {empresa.nomeFantasia !== "" && (
            <div className="muted small" style={{ marginTop: 3 }}>
              {empresa.nomeFantasia}
            </div>
          )}
          <div className="tiny muted num" style={{ marginTop: 6 }}>
            CNPJ {formatCnpj(empresa.cnpj)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span
            className="badge"
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: ativa ? "var(--accent-ink)" : "var(--t-mid)",
              background: ativa
                ? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
                : "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            {empresa.situacao}
          </span>
          {idadeAnos !== null && (
            <span className="tiny muted">
              {ativa ? "Ativa há" : "Aberta há"} {idadeAnos} {idadeAnos === 1 ? "ano" : "anos"}
            </span>
          )}
        </div>
      </div>

      {/* Grade de fatos */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}
      >
        {empresa.cnaePrincipal !== "" && (
          <FactItem
            label="Atividade principal (CNAE)"
            value={
              empresa.cnaeCodigo !== ""
                ? `${empresa.cnaePrincipal} · ${empresa.cnaeCodigo}`
                : empresa.cnaePrincipal
            }
          />
        )}
        {(empresa.municipio !== "" || empresa.uf !== "") && (
          <FactItem
            icon={<MapPin size={12} />}
            label="Localização"
            value={[empresa.municipio, empresa.uf].filter(Boolean).join("/")}
          />
        )}
        {empresa.abertura !== "" && (
          <FactItem
            icon={<CalendarDays size={12} />}
            label="Abertura"
            value={formatDate(empresa.abertura)}
          />
        )}
        {empresa.naturezaJuridica !== "" && (
          <FactItem label="Natureza jurídica" value={empresa.naturezaJuridica} />
        )}
        {empresa.porte !== "" && <FactItem label="Porte" value={empresa.porte} />}
        {empresa.endereco !== "" && <FactItem label="Endereço" value={empresa.endereco} />}
        {empresa.capitalSocial > 0 && (
          <FactItem
            label="Capital social"
            value={empresa.capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          />
        )}
        {empresa.email !== "" && <FactItem label="E-mail" value={empresa.email} />}
        {empresa.telefone !== "" && <FactItem label="Telefone" value={empresa.telefone} />}
      </div>

      {/* Quadro societário */}
      {empresa.socios.length > 0 && (
        <div>
          <div
            className="tiny"
            style={{ fontWeight: 700, color: "var(--t-hi)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
          >
            <Users size={13} aria-hidden="true" />
            Quadro societário — {empresa.socios.length} {empresa.socios.length === 1 ? "sócio" : "sócios"}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {empresa.socios.map((socio, i) => (
              <li
                key={`${socio.nome}-${i}`}
                className="inset"
                style={{ padding: "9px 13px", display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span style={{ fontWeight: 700, color: "var(--t-hi)", fontSize: 13.5 }}>{socio.nome}</span>
                <span className="tiny muted">
                  {[socio.qualificacao, socio.faixaEtaria, socio.entrada ? `desde ${formatDate(socio.entrada)}` : ""].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Link para fonte oficial */}
      {empresa.sourceUrl && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <a
            href={empresa.sourceUrl}
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
            }}
          >
            Ver na fonte oficial
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
      )}
    </FonteSeloBlock>
  );
}

// ─── Seção: Sanções CEIS/CNEP ─────────────────────────────────────────────────

function SecaoSancoes({ sancoes, fetchedAt, syncedAt }: {
  sancoes: SancaoItem[];
  fetchedAt: string;
  syncedAt?: string | undefined;
}) {
  const temSancoes = sancoes.length > 0;

  return (
    <FonteSeloBlock
      titulo="Sanções CEIS / CNEP"
      icone={<ShieldAlert size={15} />}
      fontes={FONTE_CGU}
      dataColeta={fetchedAt}
      confianca={temSancoes ? "alta" : "alta"}
    >
      {temSancoes ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AlertBanner tipo="danger">
            ⚠️ Sinal de atenção: {sancoes.length}{" "}
            {sancoes.length === 1 ? "registro de sanção" : "registros de sanção"} encontrado
            {sancoes.length === 1 ? "" : "s"} para este CNPJ no CEIS/CNEP.
          </AlertBanner>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {sancoes.map((sancao) => (
              <li
                key={sancao.id}
                className="card card--pad"
                style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 6 }}
              >
                {/* Cabeçalho da sanção */}
                <div className="row between wrap" style={{ gap: 8, alignItems: "flex-start" }}>
                  <div>
                    {sancao.attributes.tipoSancao && (
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-hi)" }}>
                        {sancao.attributes.tipoSancao}
                      </div>
                    )}
                    {sancao.attributes.orgaoSancionador && (
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        {sancao.attributes.orgaoSancionador}
                      </div>
                    )}
                  </div>
                  {sancao.attributes.origem && (
                    <span
                      className="badge"
                      style={{
                        flexShrink: 0,
                        background: "color-mix(in srgb, var(--danger) 14%, var(--surface))",
                        color: "var(--danger)",
                        border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {sancao.attributes.origem}
                    </span>
                  )}
                </div>

                {/* Período */}
                {(sancao.attributes.dataInicioSancao ?? sancao.attributes.dataFimSancao) && (
                  <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CalendarDays size={11} aria-hidden="true" />
                    {[
                      sancao.attributes.dataInicioSancao ? `Início: ${formatDate(sancao.attributes.dataInicioSancao)}` : null,
                      sancao.attributes.dataFimSancao ? `Fim: ${formatDate(sancao.attributes.dataFimSancao)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}

                {/* Fundamentação */}
                {sancao.attributes.fundamentacaoLegal && (
                  <div className="tiny muted" style={{ fontStyle: "italic" }}>
                    Base legal: {sancao.attributes.fundamentacaoLegal}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {syncedAt && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Base CEIS/CNEP sincronizada em {formatDate(syncedAt)}.
            </p>
          )}
        </div>
      ) : (
        <AlertBanner tipo="ok">
          Nenhum registro de sanção encontrado para este CNPJ no CEIS/CNEP.
        </AlertBanner>
      )}
    </FonteSeloBlock>
  );
}

// ─── Seção: Resumo Honesto ─────────────────────────────────────────────────────

function SecaoResumo({ data }: { data: RaioXReportData }) {
  const linhas = buildResumo(data);
  const temAtencao = data.sancoes.length > 0 || !isSituacaoAtiva(data.empresa.situacao);

  return (
    <div
      className="card card--pad"
      style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 2 }}>
        <FileText size={15} style={{ color: "var(--brand-ink)" }} aria-hidden="true" />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t-hi)" }}>Resumo</span>
        {temAtencao && (
          <span
            className="badge"
            style={{
              background: "color-mix(in srgb, var(--warn) 16%, var(--surface))",
              color: "var(--warn)",
              border: "1px solid color-mix(in srgb, var(--warn) 25%, transparent)",
              fontSize: 11,
            }}
          >
            Atenção necessária
          </span>
        )}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {linhas.map((linha, i) => (
          <li
            key={i}
            style={{
              fontSize: 13.5,
              color: "var(--t-mid)",
              lineHeight: 1.5,
              paddingLeft: 14,
              borderLeft: `3px solid ${linha.startsWith("⚠️") ? "var(--warn)" : "var(--border-2)"}`,
            }}
          >
            {linha}
          </li>
        ))}
      </ul>
      <p className="tiny muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>
        Resumo gerado automaticamente a partir dos dados oficiais. Não substitui análise jurídica.
      </p>
    </div>
  );
}

// ─── Seção: Fontes não vinculadas (placeholder honesto) ───────────────────────

function SecaoFontesNaoVinculadas() {
  const fontes = [
    { nome: "Contratos PNCP", descricao: "Portal Nacional de Contratações Públicas" },
    { nome: "Processos CNJ", descricao: "Conselho Nacional de Justiça" },
    { nome: "Marcas INPI", descricao: "Instituto Nacional da Propriedade Industrial" },
  ];

  return (
    <div
      className="panel"
      style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <Info size={14} style={{ color: "var(--t-low)" }} aria-hidden="true" />
        <span className="tiny" style={{ fontWeight: 700, color: "var(--t-mid)" }}>
          Fontes ainda não vinculadas a este CNPJ
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {fontes.map((f) => (
          <span
            key={f.nome}
            className="badge badge--neutral"
            title={f.descricao}
            style={{ fontSize: 11.5, borderRadius: 7 }}
          >
            {f.nome}
          </span>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        Estas bases armazenam por órgão/processo, não por CNPJ do fornecedor. Vinculação futura disponível quando a integração estiver pronta.
      </p>
    </div>
  );
}

// ─── Barra de ações de exportação ─────────────────────────────────────────────

function BarraExportacao({ data }: { data: RaioXReportData }) {
  function handlePrint() {
    window.print();
  }

  function handleCsv() {
    const blob = buildCsvBlob(data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raio-x-${sanitizeCnpj(data.empresa.cnpj)}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="row wrap" style={{ gap: 10, justifyContent: "flex-end" }}>
      <button
        className="btn btn--ghost btn--sm no-print"
        onClick={handleCsv}
        title="Baixar dados em CSV (Excel)"
        type="button"
      >
        <Download size={14} aria-hidden="true" />
        Exportar CSV
      </button>
      <button
        className="btn btn--ghost btn--sm no-print"
        onClick={handlePrint}
        title="Abrir diálogo de impressão / salvar PDF"
        type="button"
      >
        <FileText size={14} aria-hidden="true" />
        Exportar PDF
      </button>
    </div>
  );
}

// ─── Relatório completo ────────────────────────────────────────────────────────

function RaioXRelatorio({ data }: { data: RaioXReportData }) {
  const geradoEm = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <>
      {/* Layout de impressão — oculto na tela, visível ao imprimir */}
      <div className="print-report" aria-hidden="true">
        <div className="report-header">
          <div>
            <div className="report-title">Raio-X de Empresa — Fonte.ia</div>
            <div className="report-sub">
              {data.empresa.razaoSocial} · CNPJ {formatCnpj(data.empresa.cnpj)}
            </div>
          </div>
          <div style={{ fontSize: "9pt", color: "#5A6B82", textAlign: "right" }}>
            Gerado em {geradoEm}
          </div>
        </div>

        <div className="report-section">
          <div className="report-section-title">Dados Cadastrais — Receita Federal</div>
          {[
            ["Razão Social", data.empresa.razaoSocial],
            ["Nome Fantasia", data.empresa.nomeFantasia],
            ["Situação", data.empresa.situacao],
            ["CNAE Principal", data.empresa.cnaePrincipal],
            ["Abertura", formatDate(data.empresa.abertura)],
            ["Município/UF", [data.empresa.municipio, data.empresa.uf].filter(Boolean).join("/")],
            ["Porte", data.empresa.porte],
            ["Natureza Jurídica", data.empresa.naturezaJuridica],
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="report-row">
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
        </div>

        {data.empresa.socios.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">Quadro Societário</div>
            {data.empresa.socios.map((s, i) => (
              <div key={i} className="report-row">
                <span>{s.nome}</span>
                <b>{s.qualificacao}</b>
              </div>
            ))}
          </div>
        )}

        <div className="report-section">
          <div className="report-section-title">Sanções CEIS/CNEP — Portal da Transparência (CGU)</div>
          {data.sancoes.length === 0 ? (
            <div className="report-row"><span>Nenhum registro encontrado</span><b>—</b></div>
          ) : (
            data.sancoes.map((s) => (
              <div key={s.id} className="report-row">
                <span>{s.attributes.origem ?? ""} · {s.attributes.tipoSancao ?? ""}</span>
                <b>{s.attributes.orgaoSancionador ?? ""}</b>
              </div>
            ))
          )}
        </div>

        <div className="report-section">
          <div className="report-section-title">Resumo</div>
          {buildResumo(data).map((linha, i) => (
            <div key={i} className="report-row">
              <span>{linha}</span>
            </div>
          ))}
        </div>

        <div className="report-footer">
          <span>Fonte.ia · Dados de fontes oficiais do governo brasileiro</span>
          <span>Gerado em {geradoEm}</span>
        </div>
      </div>

      {/* Layout de tela */}
      <div
        className="rise"
        style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}
      >
        {/* Barra de exportação + título */}
        <div className="row between wrap" style={{ gap: 10, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Raio-X de Empresa</div>
            <h2 className="h2" style={{ margin: 0 }}>{data.empresa.razaoSocial}</h2>
            <div className="tiny muted num" style={{ marginTop: 4 }}>
              CNPJ {formatCnpj(data.empresa.cnpj)} · Gerado em {geradoEm}
            </div>
          </div>
          <BarraExportacao data={data} />
        </div>

        {/* Resumo no topo quando há sinais de atenção */}
        {(data.sancoes.length > 0 || !isSituacaoAtiva(data.empresa.situacao)) && (
          <SecaoResumo data={data} />
        )}

        {/* Blocos principais */}
        <SecaoCadastral empresa={data.empresa} fetchedAt={data.cadastralFetchedAt} />
        <SecaoSancoes
          sancoes={data.sancoes}
          fetchedAt={data.sancoesFetchedAt}
          syncedAt={data.sancoesSyncedAt}
        />

        {/* Resumo honesto ao final quando tudo ok */}
        {data.sancoes.length === 0 && isSituacaoAtiva(data.empresa.situacao) && (
          <SecaoResumo data={data} />
        )}

        {/* Fontes não vinculadas — placeholder honesto */}
        <SecaoFontesNaoVinculadas />
      </div>
    </>
  );
}

// ─── Loading skeleton do relatório ────────────────────────────────────────────

function RaioXSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[6, 4, 3].map((rows, i) => (
        <div key={i} className="panel" style={{ padding: "14px 18px" }}>
          <SkeletonBlock rows={rows} />
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function RaioXPage() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<RaioXReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const digits = sanitizeCnpj(input);
  const canSearch = digits !== "" && status !== "loading";

  async function handleSearch() {
    const cnpj = sanitizeCnpj(input);
    if (cnpj === "") {
      setErrorMsg("CNPJ inválido: digite os 14 números (com ou sem máscara).");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg(null);
    setReport(null);

    const cadastralFetchedAt = new Date().toISOString();
    const sancoesFetchedAt = new Date().toISOString();

    try {
      // Busca cadastral e sanções em paralelo
      const [empresaResult, sancoesResult] = await Promise.allSettled([
        lookupCnpj(cnpj),
        fetchSancoesByCnpj(cnpj),
      ]);

      if (empresaResult.status === "rejected") {
        throw empresaResult.reason instanceof Error
          ? empresaResult.reason
          : new Error("Falha ao consultar dados cadastrais.");
      }

      const empresa = empresaResult.value;
      const sancoesData =
        sancoesResult.status === "fulfilled"
          ? sancoesResult.value
          : { sancoes: [] as SancaoItem[], lastSyncedAt: undefined };

      const reportData: RaioXReportData = {
        empresa,
        sancoes: sancoesData.sancoes,
        cadastralFetchedAt,
        sancoesFetchedAt,
      };
      if (sancoesData.lastSyncedAt !== undefined) {
        reportData.sancoesSyncedAt = sancoesData.lastSyncedAt;
      }
      setReport(reportData);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao consultar o CNPJ.");
      setStatus("error");
    }
  }

  function handleClear() {
    setInput("");
    setReport(null);
    setErrorMsg(null);
    setStatus("idle");
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Cabeçalho da página */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="eyebrow">Fonte.ia</span>
        <h1 className="h1" style={{ fontSize: 26 }}>Raio-X de Empresa</h1>
        <p className="muted small" style={{ margin: 0, maxWidth: 560 }}>
          Relatório completo com dados cadastrais, sanções CEIS/CNEP e resumo a partir de fontes
          oficiais do governo brasileiro.
        </p>
      </div>

      {/* Caixa de busca */}
      <div className="panel" style={{ padding: "16px 18px 18px" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="row wrap" style={{ gap: 10, alignItems: "stretch" }}>
            <div className="searchbar" style={{ flex: "1 1 240px", minWidth: 0 }}>
              <Building2 size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite o CNPJ (ex.: 00.000.000/0001-91)"
                inputMode="numeric"
                aria-label="CNPJ para consulta Raio-X"
                autoComplete="off"
                disabled={status === "loading"}
              />
              {input !== "" && (
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  style={{ width: 28, height: 28, flexShrink: 0 }}
                  onClick={handleClear}
                  type="button"
                  aria-label="Limpar"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!canSearch}
              style={{ flexShrink: 0 }}
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={15} className="spin" aria-hidden="true" />
                  Consultando…
                </>
              ) : (
                <>
                  <Search size={15} aria-hidden="true" />
                  Gerar Raio-X
                </>
              )}
            </button>
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            Consulta dados da Receita Federal e Portal da Transparência. Gratuito, sem cadastro.
          </p>
        </form>
      </div>

      {/* Erro */}
      {status === "error" && errorMsg !== null && (
        <AlertBanner tipo="danger">{errorMsg}</AlertBanner>
      )}

      {/* Loading skeleton */}
      {status === "loading" && <RaioXSkeleton />}

      {/* Relatório */}
      {status === "done" && report !== null && <RaioXRelatorio data={report} />}
    </main>
  );
}
