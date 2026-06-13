// data.jsx — Fonte.ia mock domain data — LEILÕES GOVERNAMENTAIS (foco Receita Federal)
const BRL = (n) => 'R$\u00a0' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const BRLc = (n) => 'R$\u00a0' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%';

// Fontes oficiais — todas governamentais
const FONTES = [
  { id: 'rfb', nome: 'Receita Federal do Brasil', sigla: 'RFB', cor: '#1D5FE0' },
  { id: 'pgfn', nome: 'Procuradoria-Geral da Fazenda Nacional', sigla: 'PGFN', cor: '#6D5CE0' },
  { id: 'spu', nome: 'Secretaria de Patrimônio da União', sigla: 'SPU', cor: '#0FB7A0' },
  { id: 'detran', nome: 'Departamento de Trânsito', sigla: 'DETRAN', cor: '#C98A2E' },
  { id: 'compras', nome: 'Compras.gov.br — ComprasNet', sigla: 'GOV', cor: '#C2557D' },
];

// Lotes de leilões públicos. Campos reaproveitados:
// vara → unidade/órgão emissor · processo → nº do edital · praca → fase do leilão
// leiloeiro → órgão responsável · ocupado → retirada complexa · divida → tributos/custos
const LEILOES = [
  {
    id: 'RFB-0042-87', tipo: 'eletronicos', cat: 'Eletrônicos', titulo: 'Lote 42 — Smartphones e notebooks',
    cidade: 'Alfândega do Porto de Santos · SP', vara: 'Receita Federal — DRF Santos', processo: 'Edital RFB 0700100/2026',
    avaliacao: 920000, minimo: 414000, praca: 'Leilão eletrônico', dataFim: '18 jun 2026', hora: '14:00',
    score: 94, risco: 'baixo', fontes: ['rfb', 'compras', 'pgfn'], ocupado: false, divida: 9200,
    desc: 'Mercadoria apreendida por abandono. 320 aparelhos lacrados, laudo técnico anexado ao edital. Retirada no depósito alfandegário de Santos.',
    leiloeiro: 'Receita Federal do Brasil', visitas: 312, fav: 41,
    linkOficial: 'https://www.gov.br/receitafederal/pt-br/servicos/leilao',
  },
  {
    id: 'RFB-0118-31', tipo: 'veiculo', cat: 'Veículo', titulo: 'Lote 118 — Toyota Hilux SW4 2023 (importada)',
    cidade: 'Alfândega de Foz do Iguaçu · PR', vara: 'Receita Federal — ALF Foz do Iguaçu', processo: 'Edital RFB 0810044/2026',
    avaliacao: 385000, minimo: 173250, praca: 'Leilão eletrônico', dataFim: '21 jun 2026', hora: '15:30',
    score: 88, risco: 'baixo', fontes: ['rfb', 'detran', 'compras'], ocupado: false, divida: 14800,
    desc: 'Veículo retido em operação de fronteira. Documentação de regularização para emplacamento detalhada no edital. Vistoria liberada no pátio.',
    leiloeiro: 'Receita Federal do Brasil', visitas: 488, fav: 67,
  },
  {
    id: 'RFB-0207-55', tipo: 'mercadoria', cat: 'Bebidas', titulo: 'Lote 207 — Vinhos e destilados importados',
    cidade: 'Alfândega de São Paulo · SP', vara: 'Receita Federal — DRF São Paulo', processo: 'Edital RFB 0700233/2026',
    avaliacao: 132000, minimo: 52800, praca: 'Leilão eletrônico', dataFim: '14 jun 2026', hora: '11:00',
    score: 71, risco: 'medio', fontes: ['rfb', 'compras'], ocupado: false, divida: 4100,
    desc: '1.240 garrafas com importação irregular. Lote destinado a pessoa jurídica com inscrição estadual. Validade e armazenagem informadas no laudo.',
    leiloeiro: 'Receita Federal do Brasil', visitas: 421, fav: 63,
  },
  {
    id: 'SPU-0331-09', tipo: 'imovel', cat: 'Imóvel da União', titulo: 'Lote 331 — Galpão da União 1.000m²',
    cidade: 'Nova Lima · MG', vara: 'Secretaria de Patrimônio da União — MG', processo: 'Edital SPU 0033190/2026',
    avaliacao: 1640000, minimo: 984000, praca: '2º leilão', dataFim: '27 jun 2026', hora: '10:00',
    score: 62, risco: 'medio', fontes: ['spu', 'pgfn'], ocupado: true, divida: 21800,
    desc: 'Imóvel funcional da União em desafetação. Ocupação parcial a regularizar — prazo de desocupação previsto no edital. Avaliação da SPU vigente.',
    leiloeiro: 'Secretaria de Patrimônio da União', visitas: 96, fav: 12,
  },
  {
    id: 'RFB-0402-14', tipo: 'maquinario', cat: 'Maquinário', titulo: 'Lote 402 — Maquinário industrial CNC',
    cidade: 'Alfândega de Itajaí · SC', vara: 'Receita Federal — ALF Itajaí', processo: 'Edital RFB 0900421/2026',
    avaliacao: 410000, minimo: 184500, praca: 'Leilão eletrônico', dataFim: '30 jun 2026', hora: '16:00',
    score: 79, risco: 'baixo', fontes: ['rfb', 'compras', 'pgfn'], ocupado: false, divida: 12700,
    desc: 'Centros de usinagem importados, baixa quilometragem de uso. Laudo de funcionamento e manuais inclusos. Retirada com transporte especializado.',
    leiloeiro: 'Receita Federal do Brasil', visitas: 144, fav: 19,
  },
  {
    id: 'PGFN-0455-72', tipo: 'mercadoria', cat: 'Dívida ativa', titulo: 'Lote 455 — Bens penhorados (dívida ativa)',
    cidade: 'Guarulhos · SP', vara: 'PGFN — Regional 3ª Região', processo: 'Edital PGFN 0045572/2026',
    avaliacao: 520000, minimo: 234000, praca: '2º leilão', dataFim: '24 jun 2026', hora: '09:30',
    score: 55, risco: 'alto', fontes: ['pgfn', 'compras'], ocupado: false, divida: 71300,
    desc: 'Bens de execução fiscal federal. Lote heterogêneo com ônus tributário a apurar — leia o parecer antes de ofertar. Inscrição em dívida ativa vinculada.',
    leiloeiro: 'Procuradoria-Geral da Fazenda Nacional', visitas: 73, fav: 8,
  },
];

const series = (seed, n, base, amp) => Array.from({ length: n }, (_, i) => {
  const x = Math.sin(seed + i * 0.7) * amp + Math.cos(seed * 1.3 + i * 0.4) * amp * 0.5;
  return Math.max(2, Math.round(base + x + i * (amp * 0.18)));
});

const OVERVIEW_STATS = {
  oportunidades: { label: 'Lotes públicos disponíveis', value: 1284, delta: +12.4, spark: series(2, 14, 60, 18) },
  economia: { label: 'Economia potencial mapeada', value: 8.6, suffix: 'M', prefix: 'R$ ', delta: +23.1, spark: series(5, 14, 50, 22) },
  rastreadas: { label: 'Órgãos oficiais monitorados', value: 47, delta: +4, spark: series(9, 14, 40, 12) },
  watchlist: { label: 'Acompanhando agora', value: 9, delta: +2, spark: series(1, 14, 30, 8) },
};

const DEPOIMENTOS = [
  { nome: 'Mariana Alencar', papel: 'Importadora · 8 anos no mercado', txt: 'Acompanho leilões da Receita há anos. A Fonte.ia me entrega o lote já cruzado com o edital e o laudo — decido em minutos o que antes levava uma tarde inteira.', avatar: 'MA', ganho: 'R$ 506 mil em economia/ano' },
  { nome: 'Dr. Rafael Tavares', papel: 'Advogado tributarista', txt: 'A rastreabilidade até a fonte oficial é o que faltava. Anexo o relatório direto no parecer com segurança jurídica. Virou ferramenta padrão do escritório.', avatar: 'RT', ganho: '11h economizadas/semana' },
  { nome: 'Carlos Bittencourt', papel: 'Despachante aduaneiro', txt: 'Os alertas de novos editais da Receita mudaram minha operação. Não perco mais prazo de leilão eletrônico e fecho lotes com margem que antes passava batido.', avatar: 'CB', ganho: '3× mais lotes arrematados' },
];

const PLANOS = [
  {
    id: 'free', nome: 'Avaliação', preco: 0, periodo: '', tagline: 'Conheça a profundidade da análise',
    destaque: false, cta: 'Começar avaliação',
    feats: ['5 análises completas de lote', 'Score de risco e rastreabilidade', 'Acesso a todas as fontes oficiais', 'Sem cartão de crédito'],
    limite: '5 análises',
  },
  {
    id: 'pro', nome: 'Profissional', preco: 197, periodo: '/mês', tagline: 'Para quem opera no mercado',
    destaque: true, cta: 'Assinar o Profissional',
    feats: ['Análises ilimitadas', 'Alertas de novos editais em tempo real', 'Relatórios PDF com selo de fonte oficial', 'Watchlist e comparador de lotes', 'Suporte prioritário'],
    limite: 'Ilimitado',
  },
  {
    id: 'escritorio', nome: 'Corporativo', preco: 597, periodo: '/mês', tagline: 'Para times, escritórios e operações',
    destaque: false, cta: 'Falar com vendas',
    feats: ['Tudo do Profissional', 'Acesso à API de dados oficiais', 'Até 8 usuários e exportação em lote', 'Selo de auditoria nos relatórios', 'Gerente de conta dedicado'],
    limite: 'Time inteiro',
  },
];

const fonteById = (id) => FONTES.find(f => f.id === id) || FONTES[0];
const catIcon = (t) => t === 'veiculo' ? 'car' : t === 'imovel' ? 'building' : t === 'maquinario' ? 'settings' : 'layers';
const FonteDots = ({ ids, size = 22 }) => {
  return React.createElement('div', { style: { display: 'flex' } },
    ids.map((id, i) => {
      const f = fonteById(id);
      return React.createElement('div', { key: id, title: f.nome, style: { width: size, height: size, borderRadius: 7, marginLeft: i ? -6 : 0, background: f.cor, color: '#fff', fontSize: size * .34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)', boxShadow: 'var(--shadow-sm)', fontVariantNumeric: 'tabular-nums' } }, f.sigla[0]);
    })
  );
};
Object.assign(window, { BRL, BRLc, pct, FONTES, LEILOES, OVERVIEW_STATS, DEPOIMENTOS, PLANOS, dseries: series, fonteById, catIcon, FonteDots });
