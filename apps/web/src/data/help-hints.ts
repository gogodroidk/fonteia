/**
 * Catálogo central de dicas do Modo Ajuda.
 * IDs hierárquicos (ex.: "nav.lotes", "topbar.search") para fácil localização.
 * Textos curtos em pt-BR, linguagem leiga, diretos ao ponto.
 */

export const HELP_HINTS: Record<string, string> = {
  // ── Navegação principal ──────────────────────────────────────────────────
  "nav.painel":
    "Seu painel de controle: veja os lotes mais relevantes, seu score de oportunidades e um resumo do dia.",
  "nav.lotes":
    "Lista todos os lotes disponíveis nos leilões monitorados. Filtre por tipo, valor ou localização.",
  "nav.alertas":
    "Configure avisos automáticos para não perder leilões do seu perfil. Você recebe por e-mail ou push.",
  "nav.relatorios":
    "Relatórios e análises dos leilões que você acompanhou. Útil para comparar e decidir onde investir.",
  "nav.fontes":
    "Mostra de onde vêm os dados (Receita Federal, tribunais etc.) e quando foram atualizados pela última vez.",
  "nav.conta":
    "Gerencie seu perfil, senha e preferências de notificação.",
  "nav.planos":
    "Veja os planos disponíveis e o que cada um desbloqueia — individual, escritório ou corporativo.",

  // ── Topbar ───────────────────────────────────────────────────────────────
  "topbar.search":
    "Busque qualquer lote, órgão ou edital. Atalho rápido: pressione ⌘K (Mac) ou Ctrl+K (Windows).",
  "topbar.theme":
    "Alterna entre modo claro e escuro conforme sua preferência.",
  "topbar.alerts":
    "Atalho direto para seus alertas ativos. O número indica quantos estão aguardando revisão.",
  "topbar.upgrade":
    "Expanda seu acesso: planos com mais consultas, mais módulos e relatórios avançados.",
  "topbar.help":
    "Modo Ajuda ligado. Passe o mouse (ou toque) em qualquer botão para ver uma dica. Clique aqui para desligar.",

  // ── Detalhe do lote ──────────────────────────────────────────────────────
  "lot.raiox":
    "Analisa o lote com IA: resume riscos, pontos de atenção e oportunidades com base no edital e nas fontes públicas.",
  "lot.edital":
    "Baixa o edital oficial do leilão — o documento com todas as regras, valores mínimos e condições de pagamento.",
  "lot.alerta":
    "Cria um alerta para este lote específico: avisa se o lance mínimo mudar ou se houver atualizações no edital.",
};
