import { ArrowLeft } from "lucide-react";
import { LogoMark } from "../../components/ui/logo-mark";

export type LegalKind = "privacidade" | "cookies" | "termos";

interface LegalPageProps {
  kind: LegalKind;
  onHome: () => void;
}

const UPDATED = "Última atualização: 12 de junho de 2026 · Versão 1.0";
/* ---------- Shared doc primitives ---------- */
function DocHeader({ tag, title }: { tag: string; title: string }) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        paddingBottom: "32px",
        marginBottom: "40px",
      }}
    >
      <span className="eyebrow" style={{ display: "block", marginBottom: "14px" }}>
        {tag}
      </span>
      <h1 className="h1 legal-doc-h1" style={{ fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "12px" }}>
        {title}
      </h1>
      <p className="muted small" style={{ margin: 0 }}>{UPDATED}</p>
    </div>
  );
}

interface TocEntry { id: string; label: string }
function TableOfContents({ entries }: { entries: TocEntry[] }) {
  return (
    <div
      className="panel"
      style={{ padding: "22px 26px", marginBottom: "40px" }}
    >
      <p
        className="small"
        style={{
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--t-mid)",
          marginBottom: "12px",
        }}
      >
        Nesta página
      </p>
      <nav aria-label="Índice do documento">
        {entries.map((e) => (
          <a
            key={e.id}
            href={`#${e.id}`}
            className="link"
            style={{ display: "block", fontSize: "14px", padding: "4px 0" }}
          >
            {e.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
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

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--danger) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--danger) 18%, transparent)",
        borderRadius: "12px",
        padding: "18px 22px",
        marginBottom: "20px",
      }}
    >
      {children}
    </div>
  );
}

interface SectionProps { id: string; title: string; children: React.ReactNode }
function Section({ id, title, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      style={{ marginBottom: "42px", scrollMarginTop: "30px" }}
    >
      <h2
        id={`${id}-heading`}
        className="h2"
        style={{ marginBottom: "14px", color: "var(--t-hi)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sub({ title }: { title: string }) {
  return (
    <h3 className="h3" style={{ marginBottom: "10px", color: "var(--t-mid)", marginTop: "18px" }}>
      {title}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="muted" style={{ fontSize: "14.5px", marginBottom: "12px", lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ paddingLeft: "22px", marginBottom: "12px" }}>
      {children}
    </ul>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="muted" style={{ fontSize: "14.5px", marginBottom: "7px", lineHeight: 1.7 }}>
      {children}
    </li>
  );
}

/* ---------- PRIVACIDADE ---------- */
const privacidadeToc: TocEntry[] = [
  { id: "p1", label: "1. Quem somos" },
  { id: "p2", label: "2. Quais dados coletamos" },
  { id: "p3", label: "3. Como usamos seus dados" },
  { id: "p4", label: "4. Base legal (LGPD)" },
  { id: "p5", label: "5. Compartilhamento de dados" },
  { id: "p6", label: "6. Retenção e exclusão" },
  { id: "p7", label: "7. Seus direitos (LGPD)" },
  { id: "p8", label: "8. Segurança" },
  { id: "p9", label: "9. Cookies e rastreamento" },
  { id: "p10", label: "10. Contato e DPO" },
];

function Privacidade() {
  return (
    <>
      <DocHeader tag="Fonte.ia by Olli" title="Política de Privacidade" />

      <Highlight>
        <P>
          <strong style={{ color: "var(--t-hi)" }}>Resumo em linguagem simples:</strong>{" "}
          a Fonte.ia coleta apenas o necessário para que você use a plataforma. Não vendemos seus
          dados. Você pode solicitar acesso, correção ou exclusão a qualquer momento. Os dados
          públicos que consultamos na plataforma são governamentais — não são seus dados pessoais.
        </P>
      </Highlight>

      <TableOfContents entries={privacidadeToc} />

      <Section id="p1" title="1. Quem somos">
        <P>
          A <strong style={{ color: "var(--t-hi)" }}>Fonte.ia by Olli</strong> é uma plataforma
          SaaS de inteligência de dados públicos brasileiros. Operamos como controlador de dados
          pessoais dos nossos usuários, conforme definido pela Lei Geral de Proteção de Dados
          Pessoais (LGPD — Lei nº 13.709/2018).
        </P>
        <P>
          Nosso produto transforma dados públicos governamentais — editais, lotes de leilão e
          fontes oficiais — em informação estruturada e rastreável. Esses dados já são de domínio
          público; a Fonte.ia apenas os organiza, enriquece e entrega com rastreabilidade.
        </P>
      </Section>

      <Section id="p2" title="2. Quais dados coletamos">
        <Sub title="2.1 Dados que você nos fornece" />
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Cadastro:</strong> nome, e-mail, empresa (opcional) e senha (armazenada em hash).</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Pagamento:</strong> processado por gateway externo (Stripe ou similar). Não armazenamos dados de cartão.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Comunicações:</strong> mensagens enviadas ao suporte.</Li>
        </Ul>
        <Sub title="2.2 Dados coletados automaticamente" />
        <Ul>
          <Li>Endereço IP e geolocalização aproximada.</Li>
          <Li>Tipo de navegador, sistema operacional e dispositivo.</Li>
          <Li>Páginas acessadas, lotes consultados e funcionalidades utilizadas (logs de uso).</Li>
          <Li>Cookies de sessão e autenticação (ver seção 9).</Li>
        </Ul>
        <Sub title="2.3 Dados que NÃO coletamos" />
        <Ul>
          <Li>CPF, RG ou qualquer documento de identificação nacional — não solicitamos.</Li>
          <Li>Dados biométricos ou sensíveis conforme art. 5º, II da LGPD.</Li>
        </Ul>
      </Section>

      <Section id="p3" title="3. Como usamos seus dados">
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Prestação do serviço:</strong> autenticação, exibição de análises e personalização da experiência.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Comunicações transacionais:</strong> confirmação de cadastro, alertas de editais que você configurar, faturas.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Comunicações de marketing:</strong> apenas se você consentiu no cadastro ou posteriormente; cancelável a qualquer momento.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Segurança e antifraude:</strong> detecção de acesso não autorizado e proteção da conta.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Melhoria do produto:</strong> análise agregada e anonimizada de uso para desenvolvimento de funcionalidades.</Li>
        </Ul>
      </Section>

      <Section id="p4" title="4. Base legal (LGPD)">
        <P>Processamos seus dados com base nas seguintes hipóteses legais do art. 7º da LGPD:</P>
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Execução de contrato</strong> (art. 7º, V): dados necessários para prestar o serviço ao qual você se inscreveu.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Consentimento</strong> (art. 7º, I): para comunicações de marketing, coletamos consentimento expresso no cadastro.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Legítimo interesse</strong> (art. 7º, IX): segurança da plataforma, prevenção a fraudes e melhoria do produto, sempre com salvaguardas adequadas.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Cumprimento de obrigação legal</strong> (art. 7º, II): quando exigido por autoridade competente.</Li>
        </Ul>
      </Section>

      <Section id="p5" title="5. Compartilhamento de dados">
        <P>Não vendemos dados pessoais. Compartilhamos estritamente com:</P>
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Processadores de pagamento</strong> (Stripe ou similar): dados de cobrança, sem armazenamento de cartão na Fonte.ia.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Infraestrutura de nuvem</strong> (Cloudflare/AWS): hospedagem e entrega de conteúdo, com contratos de DPA adequados.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Ferramentas de analytics</strong> (dados anonimizados e agregados): para melhoria do produto.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Autoridades competentes</strong>: quando exigido por lei, ordem judicial ou regulamento.</Li>
        </Ul>
      </Section>

      <Section id="p6" title="6. Retenção e exclusão">
        <Ul>
          <Li>Dados de cadastro: mantidos enquanto a conta estiver ativa.</Li>
          <Li>Logs de uso: retidos por até 12 meses para fins de segurança.</Li>
          <Li>Dados de pagamento: retidos conforme obrigação fiscal (5 anos).</Li>
          <Li>Após solicitação de exclusão: dados removidos em até 30 dias, exceto os retidos por obrigação legal.</Li>
        </Ul>
      </Section>

      <Section id="p7" title="7. Seus direitos (LGPD)">
        <P>Conforme o art. 18 da LGPD, você tem direito a:</P>
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Confirmação e acesso:</strong> saber quais dados temos sobre você e receber uma cópia.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Correção:</strong> corrigir dados incompletos, inexatos ou desatualizados.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Anonimização, bloqueio ou eliminação:</strong> de dados desnecessários ou tratados em desconformidade.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Portabilidade:</strong> receber seus dados em formato interoperável.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Revogação do consentimento:</strong> para fins de marketing, a qualquer momento.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Exclusão da conta:</strong> remoção de todos os seus dados pessoais.</Li>
        </Ul>
        <P>
          Para exercer qualquer direito, envie e-mail para{" "}
          <a href="mailto:privacidade@olli.com.br" className="link">privacidade@olli.com.br</a>{" "}
          com assunto "Direitos LGPD". Respondemos em até 15 dias úteis.
        </P>
      </Section>

      <Section id="p8" title="8. Segurança">
        <Ul>
          <Li>Senhas armazenadas com hash bcrypt — nunca em texto puro.</Li>
          <Li>Comunicação via HTTPS/TLS 1.3 em todas as requisições.</Li>
          <Li>Acesso interno restrito por princípio de menor privilégio.</Li>
          <Li>Autenticação em dois fatores disponível para todas as contas.</Li>
        </Ul>
        <P>
          Em caso de incidente que afete dados pessoais, notificaremos os usuários e a ANPD
          conforme previsto na LGPD.
        </P>
      </Section>

      <Section id="p9" title="9. Cookies e rastreamento">
        <P>
          Utilizamos cookies essenciais para autenticação e funcionamento da plataforma. Cookies
          analíticos são usados de forma anonimizada. Você pode gerenciar suas preferências nas
          configurações do navegador; desabilitar cookies essenciais pode impedir o login.
        </P>
        <P>
          Veja a <strong style={{ color: "var(--t-hi)" }}>Política de Cookies</strong> completa
          para detalhes sobre cada categoria.
        </P>
      </Section>

      <Section id="p10" title="10. Contato e DPO">
        <P>Dúvidas, solicitações de direitos ou reporte de incidentes:</P>
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>E-mail geral:</strong> <a href="mailto:contato@olli.com.br" className="link">contato@olli.com.br</a></Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Encarregado de Proteção de Dados (DPO):</strong> <a href="mailto:privacidade@olli.com.br" className="link">privacidade@olli.com.br</a></Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Prazo de resposta:</strong> até 15 dias úteis para solicitações de direitos.</Li>
        </Ul>
        <P>
          Você também pode registrar reclamação na{" "}
          <strong style={{ color: "var(--t-hi)" }}>
            Autoridade Nacional de Proteção de Dados (ANPD)
          </strong>
          :{" "}
          <a
            href="https://www.gov.br/anpd"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            gov.br/anpd
          </a>
          .
        </P>
      </Section>
    </>
  );
}

/* ---------- COOKIES ---------- */
const cookiesToc: TocEntry[] = [
  { id: "c1", label: "1. O que são cookies" },
  { id: "c2", label: "2. Categorias de cookies" },
  { id: "c3", label: "3. Cookies de terceiros" },
  { id: "c4", label: "4. Seu controle" },
  { id: "c5", label: "5. Cookies e LGPD/ANPD" },
  { id: "c6", label: "6. Contato" },
];

function Cookies() {
  return (
    <>
      <DocHeader tag="Fonte.ia by Olli" title="Política de Cookies" />

      <Highlight>
        <P>
          <strong style={{ color: "var(--t-hi)" }}>Em resumo:</strong> usamos apenas os cookies
          necessários para o funcionamento seguro da plataforma por padrão. Cookies analíticos e
          de preferências só são ativados após o seu consentimento expresso, conforme o Guia
          Orientativo da ANPD.
        </P>
      </Highlight>

      <TableOfContents entries={cookiesToc} />

      <Section id="c1" title="1. O que são cookies">
        <P>
          Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita
          um site. Eles permitem que a plataforma reconheça seu dispositivo, mantenha sua sessão
          ativa e lembre suas preferências entre visitas.
        </P>
      </Section>

      <Section id="c2" title="2. Categorias de cookies">
        <Sub title="Necessários (sempre ativos)" />
        <P>
          Essenciais para autenticação, segurança e funcionamento básico da plataforma. Sem eles,
          o login e as funções principais não operam. Não requerem consentimento prévio.
        </P>
        <Ul>
          <Li>Cookie de sessão autenticada (JWT / token de acesso).</Li>
          <Li>Token CSRF para proteção contra ataques de falsificação de requisição.</Li>
          <Li>Preferência de tema (escuro/claro) escolhida por você.</Li>
        </Ul>

        <Sub title="Funcionais (requerem consentimento)" />
        <P>
          Melhoram a experiência ao lembrar preferências e configurações entre sessões.
        </P>
        <Ul>
          <Li>Filtros e colunas salvas nos painéis de busca.</Li>
          <Li>Configurações de alertas e notificações.</Li>
        </Ul>

        <Sub title="Analíticos (requerem consentimento)" />
        <P>
          Nos ajudam a entender como a plataforma é usada, de forma anonimizada e agregada.
          Nenhum dado pessoal identificável é coletado ou compartilhado.
        </P>
        <Ul>
          <Li>Páginas e funcionalidades mais acessadas.</Li>
          <Li>Tempo de sessão e fluxos de navegação (anonimizados).</Li>
        </Ul>

        <Sub title="Publicidade (desativados por padrão)" />
        <P>
          A Fonte.ia não exibe anúncios de terceiros. Cookies de publicidade estão desativados
          por padrão e só seriam utilizados com consentimento expresso e finalidade comunicada.
        </P>
      </Section>

      <Section id="c3" title="3. Cookies de terceiros">
        <P>
          Alguns serviços que integramos podem definir seus próprios cookies:
        </P>
        <Ul>
          <Li><strong style={{ color: "var(--t-hi)" }}>Stripe:</strong> para processamento seguro de pagamentos.</Li>
          <Li><strong style={{ color: "var(--t-hi)" }}>Cloudflare:</strong> para segurança da rede (proteção contra bots e DDoS).</Li>
        </Ul>
        <P>
          Esses terceiros têm suas próprias políticas de privacidade e são responsáveis pelos
          cookies que definem.
        </P>
      </Section>

      <Section id="c4" title="4. Seu controle">
        <P>
          No primeiro acesso, você escolhe quais categorias aceitar. Nenhum cookie não essencial
          é ativado antes do seu consentimento. Você pode rever ou revogar suas escolhas a
          qualquer momento em{" "}
          <strong style={{ color: "var(--t-hi)" }}>Conta → Gerenciar cookies</strong>.
        </P>
        <P>
          Você também pode configurar seu navegador para bloquear ou excluir cookies. Lembre-se
          de que bloquear cookies essenciais pode impedir o funcionamento do login.
        </P>
      </Section>

      <Section id="c5" title="5. Cookies e LGPD/ANPD">
        <P>
          Seguimos o{" "}
          <strong style={{ color: "var(--t-hi)" }}>
            Guia Orientativo sobre Cookies da ANPD (2023)
          </strong>{" "}
          e as disposições da LGPD (Lei nº 13.709/2018). Cookies não essenciais são tratados como
          dados pessoais e exigem base legal válida — no nosso caso, consentimento expresso e
          informado.
        </P>
      </Section>

      <Section id="c6" title="6. Contato">
        <P>
          Dúvidas sobre nossa política de cookies:{" "}
          <a href="mailto:privacidade@olli.com.br" className="link">privacidade@olli.com.br</a>.
        </P>
      </Section>
    </>
  );
}

/* ---------- TERMOS ---------- */
const termosToc: TocEntry[] = [
  { id: "t1", label: "1. Aceitação dos termos" },
  { id: "t2", label: "2. O que é a Fonte.ia" },
  { id: "t3", label: "3. Cadastro e conta" },
  { id: "t4", label: "4. Planos e pagamento" },
  { id: "t5", label: "5. Uso permitido e proibido" },
  { id: "t6", label: "6. Propriedade intelectual" },
  { id: "t7", label: "7. Limitação de responsabilidade" },
  { id: "t8", label: "8. Dados públicos e fontes oficiais" },
  { id: "t9", label: "9. Suspensão e cancelamento" },
  { id: "t10", label: "10. Alterações nos termos" },
  { id: "t11", label: "11. Foro e lei aplicável" },
];

function Termos() {
  return (
    <>
      <DocHeader tag="Fonte.ia by Olli" title="Termos de Uso" />

      <Highlight>
        <P>
          <strong style={{ color: "var(--t-hi)" }}>Versão simplificada:</strong> a Fonte.ia
          fornece inteligência sobre dados públicos — não assessoria jurídica, financeira ou de
          investimentos. O dado é rastreável e oficial, mas a decisão de participar de qualquer
          leilão é exclusivamente sua.
        </P>
      </Highlight>

      <TableOfContents entries={termosToc} />

      <Section id="t1" title="1. Aceitação dos termos">
        <P>
          Ao criar uma conta, acessar ou utilizar a plataforma Fonte.ia, você declara ter lido,
          compreendido e concordado com estes Termos de Uso e com a Política de Privacidade. Se
          não concordar, não utilize o serviço.
        </P>
      </Section>

      <Section id="t2" title="2. O que é a Fonte.ia">
        <P>
          A Fonte.ia é uma plataforma SaaS de{" "}
          <strong style={{ color: "var(--t-hi)" }}>
            inteligência de dados públicos governamentais
          </strong>
          . Atualmente cobre os leilões da Receita Federal (Sistema de Leilão Eletrônico — SLE),
          coletando, estruturando e apresentando as informações da fonte oficial de forma clara e
          rastreável. A integração com outros órgãos (como PGFN e SPU) está no roteiro e será
          liberada gradualmente.
        </P>
        <Warn>
          <p
            style={{
              fontSize: "14.5px",
              lineHeight: 1.7,
              margin: 0,
              color: "color-mix(in srgb, var(--danger) 80%, var(--t-hi))",
            }}
          >
            <strong style={{ color: "inherit" }}>Importante:</strong> a Fonte.ia não é uma
            plataforma de leilão, não executa lances em seu nome, não presta assessoria jurídica
            nem financeira. As análises e scores gerados são ferramentas informativas — a decisão
            de arrematar qualquer lote é de responsabilidade exclusiva do usuário.
          </p>
        </Warn>
      </Section>

      <Section id="t3" title="3. Cadastro e conta">
        <Ul>
          <Li>Você deve ter pelo menos 18 anos para criar uma conta.</Li>
          <Li>As informações de cadastro devem ser verdadeiras e mantidas atualizadas.</Li>
          <Li>Você é responsável pela confidencialidade de sua senha e por todas as atividades realizadas sob sua conta.</Li>
          <Li>
            Notifique imediatamente a Fonte.ia em caso de uso não autorizado:{" "}
            <a href="mailto:contato@olli.com.br" className="link">contato@olli.com.br</a>.
          </Li>
          <Li>É proibido criar múltiplas contas para contornar limitações do plano gratuito.</Li>
        </Ul>
      </Section>

      <Section id="t4" title="4. Planos e pagamento">
        <Sub title="4.1 Plano de Avaliação (gratuito)" />
        <P>
          Inclui análises de demonstração sem cartão de crédito. As análises são vinculadas à
          conta. Não é permitida a criação de múltiplas contas para acumular benefícios gratuitos.
        </P>
        <Sub title="4.2 Planos pagos" />
        <P>
          O plano Profissional (R$ 197/mês) e o Corporativo (R$ 597/mês) são cobrados
          mensalmente via cartão ou Pix; o plano Avaliação é gratuito. O cancelamento pode ser
          feito a qualquer momento no painel da conta, sem multa ou fidelidade.
        </P>
        <Sub title="4.3 Teste gratuito de 7 dias" />
        <P>
          Os planos pagos começam com 7 dias de teste gratuito: você não é cobrado nos primeiros
          7 dias e pode cancelar a qualquer momento durante esse período, sem nenhum custo. Após o
          teste, a cobrança mensal é iniciada automaticamente. Dúvidas:{" "}
          <a href="mailto:financeiro@olli.com.br" className="link">financeiro@olli.com.br</a>.
        </P>
        <Sub title="4.4 Alterações de preço" />
        <P>
          Eventuais ajustes de preço serão comunicados com 30 dias de antecedência por e-mail.
          Você pode cancelar antes da vigência do novo preço sem ônus.
        </P>
      </Section>

      <Section id="t5" title="5. Uso permitido e proibido">
        <Sub title="Permitido:" />
        <Ul>
          <Li>Consultar, analisar e baixar relatórios de lotes para uso próprio ou profissional.</Li>
          <Li>Integrar a API da Fonte.ia em sistemas próprios conforme o plano Corporativo.</Li>
          <Li>Compartilhar relatórios gerados com clientes dentro do contexto profissional.</Li>
        </Ul>
        <Sub title="Proibido:" />
        <Ul>
          <Li>Revender acesso à plataforma ou à API sem autorização escrita.</Li>
          <Li>Automatizar acessos em escala que excedam os limites do plano contratado.</Li>
          <Li>Utilizar dados da plataforma para construir produto concorrente sem licença.</Li>
          <Li>Tentar comprometer a segurança, disponibilidade ou integridade da plataforma.</Li>
          <Li>Criar contas fictícias ou utilizar informações falsas.</Li>
        </Ul>
      </Section>

      <Section id="t6" title="6. Propriedade intelectual">
        <P>
          O software, design, algoritmos, marca e identidade visual da Fonte.ia são propriedade
          da Olli. Os dados públicos consultados são de domínio público — a Fonte.ia detém os
          direitos sobre a forma como esses dados são estruturados, enriquecidos e apresentados
          (compilação e banco de dados).
        </P>
        <P>
          Os relatórios gerados pela plataforma podem ser utilizados pelo usuário para fins
          profissionais, com a devida atribuição à fonte.
        </P>
      </Section>

      <Section id="t7" title="7. Limitação de responsabilidade">
        <P>
          A Fonte.ia emprega esforços razoáveis para manter a precisão e atualização dos dados.
          No entanto:
        </P>
        <Ul>
          <Li>Não nos responsabilizamos por imprecisões nos dados originados pelos órgãos oficiais.</Li>
          <Li>Não garantimos que os scores e análises gerados levem a decisões financeiras bem-sucedidas.</Li>
          <Li>Não nos responsabilizamos por perdas decorrentes de decisões tomadas com base nas análises.</Li>
          <Li>A responsabilidade total da Fonte.ia está limitada ao valor pago pelo usuário nos últimos 3 meses.</Li>
        </Ul>
      </Section>

      <Section id="t8" title="8. Dados públicos e fontes oficiais">
        <P>
          Os dados exibidos são coletados de fontes governamentais públicas. A Fonte.ia não os
          cria ou altera — os apresenta estruturados e com rastreabilidade. Links para os
          documentos originais estão disponíveis em cada análise.
        </P>
        <P>
          Divergências entre os dados apresentados e os documentos originais devem ser reportadas
          a{" "}
          <a href="mailto:contato@olli.com.br" className="link">contato@olli.com.br</a>. O dado
          oficial do órgão prevalece.
        </P>
      </Section>

      <Section id="t9" title="9. Suspensão e cancelamento">
        <P>
          A Fonte.ia reserva-se o direito de suspender ou encerrar contas que violem estes
          Termos, mediante notificação prévia por e-mail — exceto em casos de violação grave de
          segurança, onde a suspensão pode ser imediata.
        </P>
        <P>
          O usuário pode cancelar a conta a qualquer momento pelo painel de configurações ou via
          e-mail para{" "}
          <a href="mailto:contato@olli.com.br" className="link">contato@olli.com.br</a>.
        </P>
      </Section>

      <Section id="t10" title="10. Alterações nos termos">
        <P>
          Podemos atualizar estes Termos periodicamente. Alterações materiais serão comunicadas
          por e-mail com pelo menos 15 dias de antecedência. O uso continuado da plataforma após
          a vigência das alterações implica aceitação.
        </P>
      </Section>

      <Section id="t11" title="11. Foro e lei aplicável">
        <P>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de
          São Paulo — SP para dirimir quaisquer controvérsias, com renúncia a qualquer outro,
          por mais privilegiado que seja.
        </P>
      </Section>
    </>
  );
}

/* ---------- MAIN PAGE ---------- */
export function LegalPage({ kind, onHome }: LegalPageProps) {
  const titles: Record<LegalKind, string> = {
    privacidade: "Política de Privacidade",
    cookies: "Política de Cookies",
    termos: "Termos de Uso",
  };

  return (
    <div
      className="legal-root"
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--t-hi)",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      {/* ── Scoped styles: visually-hidden helper + mobile polish ── */}
      <style>{`
        .legal-root .visually-hidden {
          position: absolute !important;
          width: 1px; height: 1px;
          padding: 0; margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
        .legal-root .legal-doc-h1 { font-size: clamp(26px, 6vw, 36px); }
        @media (max-width: 720px) {
          .legal-header, .legal-footer { padding-left: 20px !important; padding-right: 20px !important; }
          .legal-main { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <header
        className="legal-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <button
          type="button"
          onClick={onHome}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--t-hi)",
            fontFamily: "var(--font)",
          }}
          aria-label="Ir para o site"
        >
          <LogoMark size={26} />
          <div style={{ textAlign: "left" }}>
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
        </button>

        {/* Back button */}
        <button
          type="button"
          onClick={onHome}
          className="btn btn--ghost btn--sm"
          aria-label="Voltar ao site"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Voltar ao site
        </button>
      </header>

      {/* ── CONTENT ── */}
      <main
        className="legal-main"
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "60px 28px 100px",
        }}
      >
        {/* hidden doc title for screen readers / SEO */}
        <h1 className="visually-hidden" aria-hidden="true">{titles[kind]}</h1>

        {kind === "privacidade" && <Privacidade />}
        {kind === "cookies" && <Cookies />}
        {kind === "termos" && <Termos />}
      </main>

      {/* ── FOOTER ── */}
      <footer
        className="legal-footer"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "24px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <button
          type="button"
          onClick={onHome}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--t-hi)",
            fontFamily: "var(--font)",
          }}
          aria-label="Ir para o site"
        >
          <LogoMark size={20} />
          <span style={{ fontSize: "15px", fontWeight: 700 }}>
            Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
          </span>
        </button>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <a href="mailto:privacidade@olli.com.br" className="link small">
            privacidade@olli.com.br
          </a>
        </div>

        <span className="tiny" style={{ color: "var(--t-low)" }}>
          © {new Date().getFullYear()} Fonte.ia · by Olli
        </span>
      </footer>
    </div>
  );
}
