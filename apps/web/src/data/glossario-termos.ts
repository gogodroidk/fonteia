/**
 * Glossário de termos jurídicos e tributários usados em leilões públicos.
 * Chaves em slug minúsculo; valores com definição curta em linguagem leiga (pt-BR).
 */

export interface TermoDefinicao {
  termo: string;
  definicao: string;
}

export const GLOSSARIO_TERMOS: Record<string, TermoDefinicao> = {
  edle: {
    termo: "EDLE",
    definicao:
      "Edital de Leilão Eletrônico — o documento oficial que contém todas as regras do leilão: quais bens estão à venda, valores mínimos, datas e condições de pagamento.",
  },
  sle: {
    termo: "SLE",
    definicao:
      "Sistema de Leilão Eletrônico da Receita Federal. É o site ou plataforma onde os lances são feitos pela internet, sem precisar ir até um local físico.",
  },
  darf: {
    termo: "DARF",
    definicao:
      "Documento de Arrecadação de Receitas Federais — o boleto usado para pagar impostos e taxas ao governo federal. No leilão, pode ser necessário para quitar tributos associados à arrematação.",
  },
  pf: {
    termo: "PF",
    definicao:
      "Pessoa Física — ou seja, um indivíduo comum, não uma empresa. Quando o edital diz 'somente PF', só cidadãos podem participar; empresas ficam de fora.",
  },
  pj: {
    termo: "PJ",
    definicao:
      "Pessoa Jurídica — empresa ou organização com CNPJ. Quando o edital exige 'somente PJ', apenas empresas podem dar lances.",
  },
  "pf-e-pj": {
    termo: "PF e PJ",
    definicao:
      "Tanto pessoas físicas (indivíduos) quanto pessoas jurídicas (empresas) podem participar deste leilão.",
  },
  habilitacao: {
    termo: "Habilitação",
    definicao:
      "Processo de cadastro e aprovação antes de dar lances. É como uma pre-inscrição em que você comprova identidade, regularidade fiscal e, às vezes, capacidade financeira.",
  },
  "no-estado": {
    termo: "No estado em que se encontra",
    definicao:
      "O bem é vendido como está, sem garantia de funcionamento ou conservação. O comprador aceita as condições atuais e não pode reclamar de defeitos após a compra.",
  },
  arrematacao: {
    termo: "Arrematação",
    definicao:
      "Quando seu lance vence o leilão. Nesse momento, você se torna o comprador e assume as obrigações de pagamento e retirada do bem.",
  },
  "lance-minimo": {
    termo: "Lance mínimo",
    definicao:
      "O menor valor aceito para participar do leilão. Nenhum lance abaixo desse valor é considerado válido.",
  },
  edital: {
    termo: "Edital",
    definicao:
      "Documento oficial que descreve as regras completas do leilão — bens, preços, datas, condições de pagamento e obrigações do arrematante. Leia sempre antes de dar um lance.",
  },
  "valor-avaliado": {
    termo: "Valor avaliado",
    definicao:
      "Estimativa oficial do valor de mercado do bem, feita por um perito ou pelo órgão responsável. Serve como referência, mas o lance pode ser menor ou maior.",
  },
  comitente: {
    termo: "Comitente",
    definicao:
      "Quem está vendendo o bem no leilão — pode ser a Receita Federal, um tribunal, um banco ou outra entidade. É o 'dono' que autoriza a venda.",
  },
  leiloeiro: {
    termo: "Leiloeiro",
    definicao:
      "Profissional habilitado pelo governo para conduzir o leilão. Ele organiza os lances, anuncia o vencedor e assina o auto de arrematação.",
  },
  "auto-de-arrematacao": {
    termo: "Auto de arrematação",
    definicao:
      "Documento formal que registra que você ganhou o leilão e comprou o bem. É como o recibo oficial da sua compra.",
  },
  "debito-exequendo": {
    termo: "Débito exequendo",
    definicao:
      "Dívida que originou o leilão. Quando alguém não paga impostos ou dívidas judiciais, o governo pode leiloar seus bens para recuperar esse valor.",
  },
  inalienavel: {
    termo: "Inalienável",
    definicao:
      "Bem que não pode ser vendido ou transferido. Se um bem for declarado inalienável, ele não pode aparecer em leilões — geralmente associado a proteções legais ou familiares.",
  },
  sucata: {
    termo: "Sucata",
    definicao:
      "Bem sem valor de uso, destinado apenas ao aproveitamento do material. No leilão, significa que o item será comprado pelo peso ou para reciclagem, não para uso.",
  },
};
