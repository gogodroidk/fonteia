import { ArrowLeft } from "lucide-react";

export type LegalKind = "privacidade" | "cookies" | "termos";

interface LegalPageProps {
  kind: LegalKind;
  onHome: () => void;
}

const updated = "Atualizado em junho de 2026";

export function LegalPage({ kind, onHome }: LegalPageProps) {
  return (
    <div className="legal-page">
      <header className="legal-nav">
        <button className="brand brand-button" onClick={onHome} type="button">
          <div className="brand-mark">f</div>
          <div>
            <strong>Fonte.ia</strong>
            <span>by Olli</span>
          </div>
        </button>
        <button className="ghost-button" onClick={onHome} type="button">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar ao site
        </button>
      </header>

      <article className="legal-content">
        {kind === "privacidade" && <Privacidade />}
        {kind === "cookies" && <Cookies />}
        {kind === "termos" && <Termos />}
      </article>

      <footer className="legal-footer">
        <p>© {new Date().getFullYear()} Olli · Fonte.ia — dados públicos com evidência rastreável.</p>
      </footer>
    </div>
  );
}

function Privacidade() {
  return (
    <>
      <span className="legal-eyebrow">{updated}</span>
      <h1>Política de Privacidade</h1>
      <p>
        Esta política explica como a Olli, controladora do Fonte.ia, trata dados pessoais, em
        conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>
      <h2>1. Dados que coletamos</h2>
      <p>
        Coletamos os dados que você fornece ao criar conta (nome e e-mail), dados de uso da
        plataforma e dados públicos oficiais (como CNPJ e editais) necessários para o serviço.
      </p>
      <h2>2. Para que usamos</h2>
      <p>
        Para autenticar seu acesso, operar os módulos contratados, gerar análises com evidência
        rastreável, enviar alertas que você configurar e melhorar o produto.
      </p>
      <h2>3. Bases legais</h2>
      <p>
        Tratamos dados com base na execução do contrato, no consentimento (quando aplicável) e no
        legítimo interesse, sempre respeitando seus direitos.
      </p>
      <h2>4. Compartilhamento</h2>
      <p>
        Não vendemos seus dados. Compartilhamos apenas com operadores necessários ao serviço
        (ex.: provedores de nuvem e processamento), sob obrigação de confidencialidade.
      </p>
      <h2>5. Seus direitos</h2>
      <p>
        Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, além de
        revogar consentimentos. Responderemos em até 15 dias.
      </p>
      <h2>6. Contato do encarregado</h2>
      <p>
        Para exercer direitos ou tirar dúvidas, escreva para <a href="mailto:privacidade@olli.com.br">privacidade@olli.com.br</a>.
      </p>
    </>
  );
}

function Cookies() {
  return (
    <>
      <span className="legal-eyebrow">{updated}</span>
      <h1>Política de Cookies</h1>
      <p>
        Cookies são pequenos arquivos que ajudam a plataforma a funcionar e a melhorar sua
        experiência. Seguimos o Guia Orientativo da ANPD sobre cookies.
      </p>
      <h2>Categorias</h2>
      <p>
        <strong>Necessários</strong> — essenciais para login e segurança; sempre ativos.{" "}
        <strong>Funcionais</strong> — lembram preferências como idioma e filtros.{" "}
        <strong>Analíticos</strong> — medem o uso para melhorarmos o produto.{" "}
        <strong>Publicidade</strong> — personalizam comunicações; desativados por padrão.
      </p>
      <h2>Seu controle</h2>
      <p>
        No primeiro acesso você escolhe quais categorias aceitar. Nenhum cookie não essencial é
        ativado antes do seu consentimento. Você pode rever sua escolha a qualquer momento em
        Conta → Gerenciar cookies.
      </p>
      <h2>Dúvidas</h2>
      <p>
        Fale com <a href="mailto:privacidade@olli.com.br">privacidade@olli.com.br</a>.
      </p>
    </>
  );
}

function Termos() {
  return (
    <>
      <span className="legal-eyebrow">{updated}</span>
      <h1>Termos de Uso</h1>
      <p>Ao usar o Fonte.ia, você concorda com estes termos. Leia com atenção.</p>
      <h2>1. O serviço</h2>
      <p>
        O Fonte.ia organiza dados públicos oficiais e gera análises com evidência rastreável. As
        análises são apoio à decisão, não recomendação jurídica ou financeira definitiva.
      </p>
      <h2>2. Sua conta</h2>
      <p>
        Você é responsável por manter suas credenciais seguras e pelo uso da conta. Notifique-nos
        sobre qualquer uso não autorizado.
      </p>
      <h2>3. Uso aceitável</h2>
      <p>
        É proibido usar a plataforma para fins ilícitos, sobrecarregar a infraestrutura ou
        extrair dados de forma automatizada sem autorização.
      </p>
      <h2>4. Planos e pagamento</h2>
      <p>
        Planos pagos são cobrados de forma recorrente. Você pode cancelar quando quiser; o acesso
        permanece até o fim do período vigente.
      </p>
      <h2>5. Limitação de responsabilidade</h2>
      <p>
        Empregamos esforços para a exatidão dos dados, mas eles dependem das fontes oficiais. As
        decisões tomadas com base nas análises são de sua responsabilidade.
      </p>
      <h2>6. Contato</h2>
      <p>
        Dúvidas? <a href="mailto:contato@olli.com.br">contato@olli.com.br</a>.
      </p>
    </>
  );
}
