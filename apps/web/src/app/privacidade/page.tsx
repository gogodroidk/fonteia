import { useState } from "react";
import { LogoMark } from "../../components/ui/logo-mark";
import {
  useSeo,
  breadcrumbJsonLd,
  SITE_URL,
} from "../../lib/seo";
import {
  ShieldCheck,
  FileSearch,
  UserCheck,
  RefreshCw,
  Trash2,
  Eye,
  CheckCircle2,
  Database,
  Link2,
  AlertCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   Primitivos de texto
───────────────────────────────────────────────────────────── */
function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "clamp(15px, 2vw, 17px)",
        lineHeight: 1.75,
        color: "var(--t-mid)",
        marginBottom: "16px",
        maxWidth: "68ch",
      }}
    >
      {children}
    </p>
  );
}

function SectionTitle({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "clamp(20px, 4vw, 26px)",
        fontWeight: 800,
        letterSpacing: "-0.025em",
        marginBottom: "16px",
        color: "var(--t-hi)",
      }}
    >
      {children}
    </h2>
  );
}

/* ─────────────────────────────────────────────────────────────
   Card de destaque (box azul suave)
───────────────────────────────────────────────────────────── */
function Destaque({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--accent) 7%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
        borderRadius: "12px",
        padding: "18px 22px",
        marginBottom: "32px",
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Card de um dado público
───────────────────────────────────────────────────────────── */
function DadoPublicoCard({
  icon,
  titulo,
  descricao,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <div
      className="card card--pad"
      style={{ display: "flex", gap: "14px", padding: "18px 20px", alignItems: "flex-start" }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-ink)",
          flexShrink: 0,
          marginTop: "1px",
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--t-hi)", margin: "0 0 5px" }}>
          {titulo}
        </p>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
          {descricao}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Card de direito LGPD
───────────────────────────────────────────────────────────── */
function DireitoCard({
  icon,
  titulo,
  descricao,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <div
      className="card card--pad"
      style={{
        display: "flex",
        gap: "14px",
        padding: "18px 20px",
        alignItems: "flex-start",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <div
        style={{
          color: "var(--accent-ink)",
          flexShrink: 0,
          marginTop: "2px",
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--t-hi)", margin: "0 0 4px" }}>
          {titulo}
        </p>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--t-mid)", margin: 0 }}>
          {descricao}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tipo da solicitação
───────────────────────────────────────────────────────────── */
type TipoSolicitacao = "revisao" | "correcao" | "anonimizacao" | "remocao" | "";

const TIPOS: { value: TipoSolicitacao; label: string }[] = [
  { value: "revisao", label: "Revisão — quero entender a origem de um dado" },
  { value: "correcao", label: "Correção — dado está incorreto ou desatualizado" },
  { value: "anonimizacao", label: "Anonimização — quero que minha identificação seja ocultada" },
  { value: "remocao", label: "Remoção — quero que o dado seja removido, quando aplicável" },
];

/* ─────────────────────────────────────────────────────────────
   Formulário de solicitação LGPD
───────────────────────────────────────────────────────────── */
function FormularioSolicitacao() {
  const [tipo, setTipo] = useState<TipoSolicitacao>("");
  const [identificador, setIdentificador] = useState("");
  const [descricao, setDescricao] = useState("");
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);

  function buildMailtoHref() {
    const assunto = encodeURIComponent(
      `[LGPD] ${TIPOS.find((t) => t.value === tipo)?.label ?? tipo} — Fonte.ia`,
    );
    const corpo = encodeURIComponent(
      [
        `Tipo de solicitação: ${TIPOS.find((t) => t.value === tipo)?.label ?? tipo}`,
        `Identificador (CNPJ / URL do dado): ${identificador.trim() || "não informado"}`,
        ``,
        `Descrição:`,
        descricao.trim(),
        ``,
        `E-mail para retorno: ${email.trim()}`,
        ``,
        `---`,
        `Enviado via Central de Privacidade — Fonte.ia`,
        `Data: ${new Date().toLocaleString("pt-BR")}`,
      ].join("\n"),
    );
    return `mailto:privacidade@olli.com.br?subject=${assunto}&body=${corpo}`;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.location.href = buildMailtoHref();
    setEnviado(true);
  }

  const isValid = tipo !== "" && descricao.trim().length >= 10 && email.trim().length > 0;

  if (enviado) {
    return (
      <div
        style={{
          background: "color-mix(in srgb, var(--accent) 7%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
          borderRadius: "14px",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          textAlign: "center",
        }}
        role="alert"
        aria-live="polite"
      >
        <CheckCircle2 size={40} style={{ color: "var(--accent-ink)" }} aria-hidden="true" />
        <p
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "var(--t-hi)",
            margin: 0,
          }}
        >
          Solicitação preparada
        </p>
        <p
          style={{
            fontSize: "14.5px",
            lineHeight: 1.7,
            color: "var(--t-mid)",
            margin: 0,
            maxWidth: "50ch",
          }}
        >
          Seu cliente de e-mail foi aberto com a mensagem pré-preenchida para{" "}
          <strong style={{ color: "var(--t-hi)" }}>privacidade@olli.com.br</strong>. Basta
          conferir e enviar. Respondemos em até{" "}
          <strong style={{ color: "var(--t-hi)" }}>15 dias úteis</strong>.
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setEnviado(false)}
          style={{ marginTop: "8px" }}
        >
          Fazer nova solicitação
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Formulário de solicitação LGPD"
      style={{ display: "flex", flexDirection: "column", gap: "20px" }}
    >
      {/* Tipo */}
      <div>
        <label
          htmlFor="priv-tipo"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            marginBottom: "8px",
          }}
        >
          Tipo de solicitação <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
        </label>
        <select
          id="priv-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoSolicitacao)}
          required
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: tipo === "" ? "var(--t-low)" : "var(--t-hi)",
            fontSize: "14.5px",
            fontFamily: "var(--font)",
            appearance: "none",
            cursor: "pointer",
          }}
        >
          <option value="" disabled>
            Selecione…
          </option>
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Identificador */}
      <div>
        <label
          htmlFor="priv-identificador"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            marginBottom: "8px",
          }}
        >
          Identificador do dado
        </label>
        <input
          id="priv-identificador"
          type="text"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder="Ex: CNPJ 65.361.266/0001-05 ou https://fontebrasil.online/lotes/abc"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--t-hi)",
            fontSize: "14.5px",
            fontFamily: "var(--font)",
            boxSizing: "border-box",
          }}
        />
        <p
          style={{
            fontSize: "12.5px",
            color: "var(--t-low)",
            marginTop: "6px",
            marginBottom: 0,
          }}
        >
          CNPJ, número do processo, URL da página ou outra referência do dado em questão.
        </p>
      </div>

      {/* Descrição */}
      <div>
        <label
          htmlFor="priv-descricao"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            marginBottom: "8px",
          }}
        >
          Descrição <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
        </label>
        <textarea
          id="priv-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          required
          rows={5}
          placeholder="Descreva o que você identificou e o que deseja que seja feito. Quanto mais detalhes, mais rápido conseguimos responder."
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--t-hi)",
            fontSize: "14.5px",
            fontFamily: "var(--font)",
            resize: "vertical",
            lineHeight: 1.65,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* E-mail */}
      <div>
        <label
          htmlFor="priv-email"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--t-low)",
            marginBottom: "8px",
          }}
        >
          Seu e-mail para retorno <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="priv-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="voce@empresa.com.br"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--t-hi)",
            fontSize: "14.5px",
            fontFamily: "var(--font)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Submit */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="submit"
          disabled={!isValid}
          className="btn btn--accent"
          style={{ minWidth: "200px", opacity: isValid ? 1 : 0.45, cursor: isValid ? "pointer" : "not-allowed" }}
        >
          Enviar solicitação
        </button>
        <p style={{ fontSize: "12.5px", color: "var(--t-low)", margin: 0, flex: 1 }}>
          Será aberto seu cliente de e-mail com a mensagem pré-preenchida para{" "}
          <strong>privacidade@olli.com.br</strong>.
        </p>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página principal
───────────────────────────────────────────────────────────── */
export function PrivacidadeCentralPage() {
  const TITLE = "Central de Privacidade — LGPD | Fonte.ia";
  const DESCRIPTION =
    "A Fonte.ia trabalha com dados públicos oficiais do governo. Entenda nossa metodologia, seus direitos pela LGPD e como solicitar revisão, correção ou remoção de dados.";

  useSeo({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: "/central-privacidade",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Início", url: SITE_URL + "/" },
        { name: "Central de Privacidade", url: SITE_URL + "/central-privacidade" },
      ]),
    ],
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--t-hi)",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .priv-header { padding-left: 20px !important; padding-right: 20px !important; }
          .priv-main   { padding-left: 20px !important; padding-right: 20px !important; }
          .priv-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .priv-dados-grid { grid-template-columns: 1fr !important; }
          .priv-direitos-grid { grid-template-columns: 1fr !important; }
          .priv-form-nota { flex-direction: column !important; }
        }
      `}</style>

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <header
        className="priv-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            color: "var(--t-hi)",
          }}
          aria-label="Fonte.ia — página inicial"
        >
          <LogoMark size={26} />
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
            </div>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--t-low)",
                marginTop: "2px",
              }}
            >
              by Olli
            </div>
          </div>
        </a>

        <nav
          aria-label="Navegação principal"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <a href="/seguranca" className="btn btn--ghost btn--sm">
            Segurança
          </a>
          <a href="/contato" className="btn btn--ghost btn--sm">
            Contato
          </a>
          <a href="/entrar" className="btn btn--accent btn--sm">
            Começar grátis
          </a>
        </nav>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <main
        className="priv-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <a href="/" className="link small" style={{ fontSize: "13px" }}>
            Início
          </a>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }} aria-hidden="true">
            ›
          </span>
          <span style={{ color: "var(--t-low)", fontSize: "13px" }}>Central de Privacidade</span>
        </div>

        {/* Herói */}
        <header style={{ marginBottom: "48px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
            LGPD · Central de Privacidade
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 6vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: "20px",
            }}
          >
            Transparência sobre
            <br />
            os dados que exibimos.
          </h1>
          <P>
            A Fonte.ia não coleta nem comercializa dados pessoais sensíveis. Trabalhamos
            exclusivamente com{" "}
            <strong style={{ color: "var(--t-hi)" }}>dados públicos oficiais</strong> —
            publicados por órgãos do governo e disponíveis por força da Lei de Acesso à
            Informação (Lei 12.527/2011). Esta página explica o que fazemos com esses dados,
            seus direitos pela LGPD e como nos contatar.
          </P>
        </header>

        {/* ── O que são os dados que exibimos ── */}
        <section aria-labelledby="dados-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="dados-heading">
            Dados que a Fonte.ia usa
          </SectionTitle>

          <Destaque>
            <p
              style={{
                fontSize: "14.5px",
                lineHeight: 1.7,
                margin: 0,
                color: "var(--t-mid)",
              }}
            >
              <strong style={{ color: "var(--t-hi)" }}>Regra clara:</strong> a Fonte.ia não
              expõe CPF completo nem dado pessoal sensível. Todos os dados que exibimos são
              públicos, originados de fontes oficiais do governo federal e estadual, com
              finalidade legítima de informação e transparência pública.
            </p>
          </Destaque>

          <P>
            Os dados que estruturamos e apresentamos na plataforma se enquadram em categorias
            de domínio público — exibidos abaixo com a respectiva finalidade e fonte de
            origem:
          </P>

          <div
            className="priv-dados-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <DadoPublicoCard
              icon={<Database size={17} />}
              titulo="CNPJ e dados empresariais"
              descricao="Razão social, situação cadastral, sócios e endereço. Fonte: Receita Federal (dados.gov.br). Finalidade: análise de arrematantes e interessados em licitações."
            />
            <DadoPublicoCard
              icon={<FileSearch size={17} />}
              titulo="Editais e lotes de leilão"
              descricao="Número do processo, descrição do bem, valor mínimo e comitente. Fonte: SLE Receita Federal, PGFN e SPU. Finalidade: análise e acompanhamento de leilões públicos."
            />
            <DadoPublicoCard
              icon={<Link2 size={17} />}
              titulo="Contratos e licitações"
              descricao="Objeto, valor, órgão responsável e vencedor. Fonte: Portal da Transparência, PNCP. Finalidade: inteligência sobre compras públicas."
            />
            <DadoPublicoCard
              icon={<ShieldCheck size={17} />}
              titulo="Processos judiciais públicos"
              descricao="Número de processo, partes (quando públicas) e situação. Fonte: portais dos tribunais. Finalidade: rastreamento de leilões judiciais."
            />
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "18px 22px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--t-low)",
                margin: "0 0 12px",
              }}
            >
              Nossa metodologia de rastreabilidade
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                ["Fonte", "URL do portal oficial de origem, sempre registrada"],
                ["Data de coleta", "Timestamp exato de quando o dado foi coletado"],
                ["Hash de integridade", "Impressão digital do conteúdo original"],
                ["Link original", "Acesso direto ao documento no órgão oficial"],
              ].map(([label, valor]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    gap: "12px",
                    fontSize: "13.5px",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--t-low)",
                      minWidth: "130px",
                      flexShrink: 0,
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ color: "var(--t-mid)", lineHeight: 1.6 }}>{valor}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Seus direitos LGPD ── */}
        <section aria-labelledby="direitos-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="direitos-heading">
            Seus direitos pela LGPD
          </SectionTitle>
          <P>
            A LGPD (Lei 13.709/2018) garante direitos aos titulares de dados. Mesmo tratando
            predominantemente dados públicos, respeitamos o art. 18 e os exercemos integralmente
            para os dados pessoais que coletamos de usuários da plataforma:
          </P>

          <div
            className="priv-direitos-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <DireitoCard
              icon={<Eye size={18} />}
              titulo="Acesso e confirmação"
              descricao="Saiba quais dados pessoais seus guardamos na plataforma e receba uma cópia organizada."
            />
            <DireitoCard
              icon={<RefreshCw size={18} />}
              titulo="Correção"
              descricao="Corrija dados pessoais incompletos, inexatos ou desatualizados na sua conta Fonte.ia."
            />
            <DireitoCard
              icon={<UserCheck size={18} />}
              titulo="Anonimização"
              descricao="Solicite a anonimização de dados desnecessários ou tratados em excesso, quando aplicável pela legislação."
            />
            <DireitoCard
              icon={<Trash2 size={18} />}
              titulo="Remoção"
              descricao="Peça a exclusão dos seus dados pessoais da plataforma. Dados de uso mínimos podem ser mantidos por obrigação legal."
            />
            <DireitoCard
              icon={<FileSearch size={18} />}
              titulo="Ver a fonte original"
              descricao="Todo dado exibido tem link para o documento oficial de origem. Você pode verificar diretamente no portal do órgão."
            />
            <DireitoCard
              icon={<ShieldCheck size={18} />}
              titulo="Entender base e finalidade"
              descricao="Saiba por que exibimos cada tipo de dado, qual a base legal e qual a finalidade específica."
            />
          </div>

          <div
            style={{
              background: "color-mix(in srgb, var(--accent) 5%, var(--surface))",
              border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <AlertCircle
              size={18}
              style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: "2px" }}
              aria-hidden="true"
            />
            <p style={{ fontSize: "13.5px", lineHeight: 1.7, margin: 0, color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>Dados públicos têm limites legais.</strong>{" "}
              Alguns dados exibidos são públicos por obrigação legal (ex.: contratos firmados com
              a administração pública). A remoção desse tipo de dado pode não ser juridicamente
              possível — mas sempre explicamos o motivo em até 15 dias úteis.
            </p>
          </div>
        </section>

        {/* ── Formulário de solicitação ── */}
        <section aria-labelledby="formulario-heading" style={{ marginBottom: "56px" }}>
          <SectionTitle id="formulario-heading">
            Fazer uma solicitação
          </SectionTitle>
          <P>
            Use o formulário abaixo para solicitar revisão, correção, anonimização ou remoção
            de um dado. A solicitação será enviada diretamente para{" "}
            <a href="mailto:privacidade@olli.com.br" className="link">
              privacidade@olli.com.br
            </a>{" "}
            e respondemos em até <strong style={{ color: "var(--t-hi)" }}>15 dias úteis</strong>.
          </P>

          <div
            className="card card--pad"
            style={{ padding: "28px 28px" }}
          >
            <FormularioSolicitacao />
          </div>
        </section>

        {/* ── Contato DPO ── */}
        <section aria-labelledby="contato-dpo-heading" style={{ marginBottom: "40px" }}>
          <SectionTitle id="contato-dpo-heading">
            Contato direto — DPO
          </SectionTitle>
          <P>
            Prefere falar diretamente? Nosso Encarregado de Proteção de Dados (DPO) está
            disponível pelo e-mail abaixo:
          </P>

          <div
            className="card card--pad"
            style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>DPO / Privacidade: </strong>
              <a href="mailto:privacidade@olli.com.br" className="link">
                privacidade@olli.com.br
              </a>
            </p>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>Prazo de resposta: </strong>
              até 15 dias úteis para solicitações de direitos LGPD.
            </p>
            <p style={{ margin: 0, fontSize: "14.5px", color: "var(--t-mid)" }}>
              <strong style={{ color: "var(--t-hi)" }}>Empresa: </strong>
              Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05
            </p>
            <p style={{ margin: 0, fontSize: "13.5px", color: "var(--t-low)", borderTop: "1px solid var(--border)", paddingTop: "10px", marginTop: "2px" }}>
              Você também pode registrar reclamação na{" "}
              <strong style={{ color: "var(--t-mid)" }}>
                Autoridade Nacional de Proteção de Dados (ANPD)
              </strong>:{" "}
              <a
                href="https://www.gov.br/anpd"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                gov.br/anpd
              </a>
              .
            </p>
          </div>
        </section>

        {/* ── Links relacionados ── */}
        <nav
          aria-label="Documentos legais relacionados"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          {[
            { href: "/privacidade", label: "Política de Privacidade completa" },
            { href: "/seguranca", label: "Segurança e infraestrutura" },
            { href: "/cookies", label: "Política de Cookies" },
            { href: "/contato", label: "Outros canais de contato" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="card card--pad"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--t-hi)",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--accent-ink)" }} aria-hidden="true">
                →
              </span>
              {label}
            </a>
          ))}
        </nav>
      </main>

      {/* ── Rodapé institucional ─────────────────────────────────────────── */}
      <footer
        className="priv-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 48px",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "24px",
            }}
          >
            <a
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                color: "var(--t-hi)",
              }}
              aria-label="Ir para a página inicial"
            >
              <LogoMark size={20} />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>
                Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
              </span>
            </a>

            <nav
              style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}
              aria-label="Links do rodapé"
            >
              <a href="/sobre" className="link small">Sobre</a>
              <a href="/seguranca" className="link small">Segurança</a>
              <a href="/contato" className="link small">Contato</a>
              <a href="/privacidade" className="link small" style={{ color: "var(--t-low)" }}>
                Privacidade
              </a>
              <a href="/termos" className="link small" style={{ color: "var(--t-low)" }}>
                Termos
              </a>
            </nav>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              Olli Inteligência Digital Sistemas LTDA · CNPJ 65.361.266/0001-05
            </span>
            <span className="small" style={{ color: "var(--t-low)", fontSize: "12.5px" }}>
              © {new Date().getFullYear()} Fonte.ia · Dados públicos, decisões rastreáveis.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
