# Catálogo de Consultas — Fonte.ia

> Gerado de `supabase/functions/infosimples-proxy/index.ts` em 2026-06-20.
> **162 consultas** integradas via InfoSimples (motor `infosimples-proxy`),
> todas por **CNPJ**. Hoje o proxy está **dormente** (liga com `INFOSIMPLES_TOKEN` no Vault +
> plano pago + trava de gasto + cache em `external_lookups`). Cada consulta custa por chamada.

## 1. Núcleo (10 consultas hand-written, as mais usadas)

- Cadastro CNPJ (Receita Federal) — `consultas/receita-federal/cnpj`
- Simples Nacional / MEI (Receita Federal) — `consultas/receita-federal/simples`
- Certidão Conjunta PGFN/RFB (débitos federais) — `consultas/receita-federal/pgfn`
- CNDT — Certidão Negativa de Débitos Trabalhistas (TST) — `consultas/tribunal/tst/cndt`
- CRF/FGTS — Regularidade do FGTS (Caixa) — `consultas/caixa/regularidade`
- CEIS — Empresas Inidôneas e Suspensas (sanções) — `consultas/portal-transparencia/ceis`
- CNEP — Empresas Punidas (Lei Anticorrupção) — `consultas/portal-transparencia/cnep`
- CNI — Certidão Negativa de Inidôneos (TCU) — `consultas/tcu/cni`
- Lista Suja do Trabalho Escravo (SIT/MTE) — `consultas/sit/trabalho-escravo`
- Marcas por Titular/CNPJ (INPI) — `consultas/inpi/marcas-titular`

## 2. Catálogo genérico (152 consultas, por CNPJ)

### Tributário estadual (SEFAZ/SINTEGRA/PGE) (49)
- Cadastro Centralizado SEFAZ _(cadastro)_ — `consultas/sefaz/cadastro-centralizado`
- CADIN SEFAZ-MG _(sancao)_ — `consultas/sefaz/mg/cadin`
- CADIN SEFAZ-PR _(sancao)_ — `consultas/sefaz/pr/cadin`
- Certidão de Débitos SEFAZ (Unificada) _(certidao)_ — `consultas/sefaz/certidao-debitos`
- CND SEFAZ-AP _(certidao)_ — `consultas/sefaz/ap/certidao-debitos`
- CND SEFAZ-BA _(certidao)_ — `consultas/sefaz/ba/certidao-debitos`
- CND SEFAZ-CE _(certidao)_ — `consultas/sefaz/ce/certidao-debitos`
- CND SEFAZ-DF _(certidao)_ — `consultas/sefaz/df/certidao-debitos`
- CND SEFAZ-ES _(certidao)_ — `consultas/sefaz/es/certidao-debitos`
- CND SEFAZ-GO _(certidao)_ — `consultas/sefaz/go/certidao-debitos`
- CND SEFAZ-MA _(certidao)_ — `consultas/sefaz/ma/certidao-debitos`
- CND SEFAZ-MG _(certidao)_ — `consultas/sefaz/mg/certidao-debitos`
- CND SEFAZ-MS _(certidao)_ — `consultas/sefaz/ms/certidao-debitos`
- CND SEFAZ-MT _(certidao)_ — `consultas/sefaz/mt/certidao-debitos`
- CND SEFAZ-PA _(certidao)_ — `consultas/sefaz/pa/certidao-debitos`
- CND SEFAZ-PB _(certidao)_ — `consultas/sefaz/pb/certidao-debitos`
- CND SEFAZ-PE _(certidao)_ — `consultas/sefaz/pe/certidao-debitos`
- CND SEFAZ-PR _(certidao)_ — `consultas/sefaz/pr/certidao-debitos`
- CNDT PGE-SP _(certidao)_ — `consultas/pge/sp/cndt`
- Dívida Ativa PGE-SP _(sancao)_ — `consultas/pge/sp/divida-ativa`
- ISS SEFAZ-DF _(cadastro)_ — `consultas/sefaz/df/iss`
- Protesto SEFAZ-MG _(sancao)_ — `consultas/sefaz/mg/protesto`
- SINTEGRA AC _(cadastro)_ — `consultas/sintegra/ac`
- SINTEGRA AL _(cadastro)_ — `consultas/sintegra/al`
- SINTEGRA AM _(cadastro)_ — `consultas/sintegra/am`
- SINTEGRA AP _(cadastro)_ — `consultas/sintegra/ap`
- SINTEGRA BA _(cadastro)_ — `consultas/sintegra/ba`
- SINTEGRA CE _(cadastro)_ — `consultas/sintegra/ce`
- SINTEGRA DF _(cadastro)_ — `consultas/sintegra/df`
- SINTEGRA ES _(cadastro)_ — `consultas/sintegra/es`
- SINTEGRA GO _(cadastro)_ — `consultas/sintegra/go`
- SINTEGRA MA _(cadastro)_ — `consultas/sintegra/ma`
- SINTEGRA MS _(cadastro)_ — `consultas/sintegra/ms`
- SINTEGRA MT _(cadastro)_ — `consultas/sintegra/mt`
- SINTEGRA PA _(cadastro)_ — `consultas/sintegra/pa`
- SINTEGRA PB _(cadastro)_ — `consultas/sintegra/pb`
- SINTEGRA PE _(cadastro)_ — `consultas/sintegra/pe`
- SINTEGRA PR _(cadastro)_ — `consultas/sintegra/pr`
- SINTEGRA RJ _(cadastro)_ — `consultas/sintegra/rj`
- SINTEGRA RN _(cadastro)_ — `consultas/sintegra/rn`
- SINTEGRA RO _(cadastro)_ — `consultas/sintegra/ro`
- SINTEGRA RR _(cadastro)_ — `consultas/sintegra/rr`
- SINTEGRA RS _(cadastro)_ — `consultas/sintegra/rs`
- SINTEGRA SC _(cadastro)_ — `consultas/sintegra/sc`
- SINTEGRA SE _(cadastro)_ — `consultas/sintegra/se`
- SINTEGRA SP _(cadastro)_ — `consultas/sintegra/sp`
- SINTEGRA SUFRAMA _(cadastro)_ — `consultas/sintegra/suframa`
- SINTEGRA TO _(cadastro)_ — `consultas/sintegra/to`
- SINTEGRA Unificado _(cadastro)_ — `consultas/sintegra/unificada`

### Trabalhista (CEAT/CNDT TRTs) (27)
- CEAT TRT1 (RJ) _(certidao)_ — `consultas/tribunal/trt1/ceat`
- CEAT TRT10 (DF/TO digital) _(certidao)_ — `consultas/tribunal/trt10/ceat-digital`
- CEAT TRT10 (DF/TO) _(certidao)_ — `consultas/tribunal/trt10/ceat`
- CEAT TRT11 (AM/RR) _(certidao)_ — `consultas/tribunal/trt11/ceat`
- CEAT TRT12 (SC) _(certidao)_ — `consultas/tribunal/trt12/ceat`
- CEAT TRT13 (PB) _(certidao)_ — `consultas/tribunal/trt13/ceat`
- CEAT TRT14 (RO/AC) _(certidao)_ — `consultas/tribunal/trt14/ceat`
- CEAT TRT15 (Campinas) _(certidao)_ — `consultas/tribunal/trt15/ceat`
- CEAT TRT16 (MA) _(certidao)_ — `consultas/tribunal/trt16/ceat`
- CEAT TRT17 (ES) _(certidao)_ — `consultas/tribunal/trt17/ceat`
- CEAT TRT18 (GO) _(certidao)_ — `consultas/tribunal/trt18/ceat`
- CEAT TRT19 (AL) _(certidao)_ — `consultas/tribunal/trt19/ceat`
- CEAT TRT2 (SP digital) _(certidao)_ — `consultas/tribunal/trt2/ceat-digital`
- CEAT TRT2 (SP físico) _(certidao)_ — `consultas/tribunal/trt2/ceat`
- CEAT TRT20 (SE) _(certidao)_ — `consultas/tribunal/trt20/ceat`
- CEAT TRT21 (RN) _(certidao)_ — `consultas/tribunal/trt21/ceat`
- CEAT TRT23 (MT) _(certidao)_ — `consultas/tribunal/trt23/ceat`
- CEAT TRT24 (MS) _(certidao)_ — `consultas/tribunal/trt24/ceat`
- CEAT TRT3 (MG) _(certidao)_ — `consultas/tribunal/trt3/ceat`
- CEAT TRT4 (RS) _(certidao)_ — `consultas/tribunal/trt4/ceat`
- CEAT TRT5 (BA) _(certidao)_ — `consultas/tribunal/trt5/ceat`
- CEAT TRT6 (PE) _(certidao)_ — `consultas/tribunal/trt6/certidao`
- CEAT TRT7 (CE digital) _(certidao)_ — `consultas/tribunal/trt7/ceat-digital`
- CEAT TRT7 (CE) _(certidao)_ — `consultas/tribunal/trt7/ceat`
- CEAT TRT8 (PA/AP) _(certidao)_ — `consultas/tribunal/trt8/ceat`
- CEAT TRT9 (PR) _(certidao)_ — `consultas/tribunal/trt9/ceat`
- CNF Unificada (MPT) _(certidao)_ — `consultas/mpt/cnf/unificada`

### Junta Comercial (14)
- CLI JUCESP (SP) _(certidao)_ — `consultas/junta-comercial/sp/cli`
- Dados Completos JUCESP (SP) _(info)_ — `consultas/junta-comercial/sp/completa`
- Ficha Completa JUCEB (BA) _(cadastro)_ — `consultas/junta-comercial/ba/ficha-completa`
- Ficha Completa JUCEES (ES) _(cadastro)_ — `consultas/junta-comercial/es/ficha-completa`
- Ficha Completa JUCEG (GO) _(cadastro)_ — `consultas/junta-comercial/go/ficha-completa`
- Ficha Completa JUCEMG (MG) _(cadastro)_ — `consultas/junta-comercial/mg/ficha-completa`
- Ficha Completa JUCEMS (MS) _(cadastro)_ — `consultas/junta-comercial/ms/ficha-completa`
- Ficha Completa JUCEPAR (PR) _(cadastro)_ — `consultas/junta-comercial/pr/ficha-completa`
- Ficha Completa JUCEPE (PE) _(cadastro)_ — `consultas/junta-comercial/pe/ficha-completa`
- Ficha Completa JUCERGS (RS) _(cadastro)_ — `consultas/junta-comercial/rs/ficha-completa`
- Ficha Completa JUCERJA (RJ) _(cadastro)_ — `consultas/junta-comercial/rj/ficha-completa`
- Ficha Completa JUCESC (SC) _(cadastro)_ — `consultas/junta-comercial/sc/ficha-completa`
- Ficha Completa JUCESP (SP) _(cadastro)_ — `consultas/junta-comercial/sp/ficha-completa`
- Registro (DREI) _(cadastro)_ — `consultas/drei/registro`

### Certidões estaduais (TJ) (13)
- Certidão 1º Grau TJBA _(certidao)_ — `consultas/tribunal/tjba/primeiro-grau`
- Certidão 1º Grau TJRS _(certidao)_ — `consultas/tribunal/tjrs/primeiro-grau`
- Certidão Cível 1º Grau TJSP _(certidao)_ — `consultas/tribunal/tjsp/pedido-civel`
- Certidão Judicial TJTO _(certidao)_ — `consultas/tribunal/tjto/cert-judicial`
- Nada Consta TJGO _(certidao)_ — `consultas/tribunal/tjgo/nada-consta`
- Nada Consta TJMA _(certidao)_ — `consultas/tribunal/tjma/nada-consta`
- Pedido de Certidão TJMS _(certidao)_ — `consultas/tribunal/tjms/pedido-cert`
- Pedido de Certidão TJRJ _(certidao)_ — `consultas/tribunal/tjrj/pedido-cert`
- Pedido de Certidão TJSC _(certidao)_ — `consultas/tribunal/tjsc/pedido-certidao`
- Pedido de Certidão TJSP _(certidao)_ — `consultas/tribunal/tjsp/pedido-certidao`
- Processos 1º Grau TJSP _(info)_ — `consultas/tribunal/tjsp/primeiro-grau`
- Processos 2º Grau TJSP _(info)_ — `consultas/tribunal/tjsp/segundo-grau`
- Processos TJPR _(info)_ — `consultas/tribunal/tjpr/processo`

### Certidões federais (9)
- Certidão de Distribuição TRF3 _(certidao)_ — `consultas/tribunal/trf3/certidao-distr`
- Certidão Negativa STJ _(certidao)_ — `consultas/tribunal/stj/certidao-negativa`
- Certidão Negativa TRF1 _(certidao)_ — `consultas/tribunal/trf1/certidao`
- Certidão Negativa TRF2 _(certidao)_ — `consultas/tribunal/trf2/certidao`
- Certidão Negativa TRF4 _(certidao)_ — `consultas/tribunal/trf4/certidao`
- Certidão Negativa TRF5 _(certidao)_ — `consultas/tribunal/trf5/certidao`
- Certidão Negativa TRF6 _(certidao)_ — `consultas/tribunal/trf6/certidao`
- Certidão Unificada Justiça Federal (TRF) _(certidao)_ — `consultas/tribunal/trf/cert-unificada`
- Devedores PGFN (Receita Federal) _(sancao)_ — `consultas/receita-federal/pgfn/devedores`

### Sanções e idoneidade (9)
- CEPIM (Portal da Transparência) _(sancao)_ — `consultas/portal-transparencia/cepim`
- Certidão de Apenados TCE-SP _(sancao)_ — `consultas/tce/sp/certidao-apenados`
- Certidão Negativa de Processo (TCU) _(certidao)_ — `consultas/tcu/cnp`
- CNC Tipo 1 (CGU) _(certidao)_ — `consultas/cgu/cnc-tipo1`
- Consulta Consolidada PJ (TCU/APF) _(info)_ — `consultas/tcu/consolidada-pj`
- Improbidade Administrativa (CNJ) _(sancao)_ — `consultas/cnj/improbidade`
- Inabilitados (TCU) _(sancao)_ — `consultas/tcu/inabilitados`
- Inidôneos (TCU) _(sancao)_ — `consultas/tcu/inidoneos`
- Processos (CADE) _(sancao)_ — `consultas/cade/processos`

### Financeiro/Mercado (7)
- Administradores (SUSEP) _(cadastro)_ — `consultas/susep/administradores`
- Cheques sem Fundo (BCB) _(info)_ — `consultas/bcb/cheques-sem-fundo`
- Participante (CVM) _(cadastro)_ — `consultas/cvm/participante`
- Participantes (B3) _(cadastro)_ — `consultas/b3/participantes`
- Processo Administrativo (CVM) _(sancao)_ — `consultas/cvm/processo-administrativo`
- Protestos CENPROT (SP) _(sancao)_ — `consultas/cenprot-sp/protestos`
- Sancionadores (CVM) _(sancao)_ — `consultas/cvm/sancionadores`

### Tributário federal (4)
- FAP (Dataprev) _(info)_ — `consultas/dataprev/fap`
- Processo Administrativo (CARF) _(info)_ — `consultas/carf/processo`
- Processo COMPROT _(info)_ — `consultas/comprot/processo`
- SPED (Fazenda) _(cadastro)_ — `consultas/fazenda/sped`

### Tributário municipal (4)
- CADIN Municipal SP _(sancao)_ — `consultas/pref/sp/sao-paulo/cadin`
- CCM (Prefeitura SP) _(cadastro)_ — `consultas/pref/sp/sao-paulo/ccm`
- CPOM (Prefeitura SP) _(cadastro)_ — `consultas/pref/sp/sao-paulo/cpom`
- CTM Municipal SP _(certidao)_ — `consultas/pref/sp/sao-paulo/ctm`

### Ambiental/Energético (ANP) (3)
- Certificados (ANP) _(certidao)_ — `consultas/anp/certificados`
- Postos (ANP) _(cadastro)_ — `consultas/anp/postos`
- Revendas (ANP) _(cadastro)_ — `consultas/anp/revendas`

### Ambiental (IBAMA) (3)
- Cadastro Técnico Federal (IBAMA) _(certidao)_ — `consultas/ibama/cr`
- Embargos (IBAMA) _(sancao)_ — `consultas/ibama/embargos`
- Infrações Ambientais (IBAMA) _(sancao)_ — `consultas/ibama/infracoes`

### Jurídico (3)
- Banco de Falências (TST) _(info)_ — `consultas/tribunal/tst/banco-falencias`
- Certidão Negativa (MPF) _(certidao)_ — `consultas/mpf/certidao-negativa`
- Processos SEEU (CNJ) _(info)_ — `consultas/cnj/seeu/processos`

### Saúde (ANVISA/Vigilância) (2)
- Alvará Vigilância Sanitária (SIVISA/SP) _(certidao)_ — `consultas/sivisa/sp`
- Empresas (ANVISA) _(cadastro)_ — `consultas/anvisa/empresas`

### Transportes (ANTT) (2)
- Lista de Autos SIFAMA (ANTT) _(sancao)_ — `consultas/antt/sifama/lista-autos`
- Transportador (ANTT) _(cadastro)_ — `consultas/antt/transportador`

### Cadastro federal (1)
- Situação Fiscal (Receita Federal) _(info)_ — `consultas/receita-federal/situacao`

### Comércio exterior (1)
- Radar de Habilitação (Receita Federal) _(info)_ — `consultas/receita-federal/radar`

### Contratos públicos (1)
- Contratos Federais (Portal da Transparência) _(info)_ — `consultas/portal-transparencia/contratos`

## 3. Fontes externas avaliadas (links enviados) — para EXPANDIR

> Nível de capacidade (confirmar endpoints/contrato/preço antes de integrar).

- **Assertiva** (assertiva.com.br) — bureau de dados. Produtos: *Localize* (CPF/CNPJ → cadastral), *Dossiê* (investigação patrimonial/jurídica), *Veículos* (placa → histórico), *Análise 360* (CPF/CNPJ → crédito/score). ⚠️ CPF/placa/crédito = **dado pessoal** (ver §5).
- **AutoConsulta / consultas.us** (consultas.us/api-docs) — revenda de consultas (veicular/placa, CPF, etc.). A página de docs é renderizada por JS e não expôs o catálogo via fetch — **pegar o catálogo logado** ou pedir a doc oficial. NÃO fazer scraping do site; usar a API oficial deles.
- **gov.br Conecta — WSDenatran** (catálogo Conecta) — dados de **veículos/condutores (DENATRAN/SENATRAN)**. Acesso **restrito** (convênio/credenciamento gov). Caminho: credenciamento oficial, não scraping.
- **integrador.sp.gov.br** — barramento de APIs do **Estado de SP**. Vários serviços estaduais; exige cadastro/credenciamento no integrador.

## 4. Visão "busca completa do Brasil" — o que dá pra fazer

- **Já dá (empresa/CNPJ):** as 162 consultas acima cobrem cadastro, certidões (federal/estadual/municipal/trabalhista), sanções/idoneidade, junta comercial, ambiental, financeiro. É um **dossiê de CNPJ muito forte** — basta ligar o token e o gating de plano.
- **Falta (pessoa/PII):** CPF, placa/veicular, telefone, score de crédito. Isso vem de **provedores contratados** (Assertiva, Serpro, bureaus) — não de scraping. Entra na §5.

## 5. ⚠️ Compliance LGPD (gate obrigatório)

Sua escolha registrada: **"CNPJ agora, pessoa depois"**. Dado de **empresa/CNPJ** é majoritariamente público → seguir.
Dado **pessoal** (CPF, nome de pessoa, placa, telefone, crédito) só com:
1. **Base legal documentada** anexada ao projeto (você citou autorização como consultoria de crédito — precisa estar registrada);
2. **Provedor oficial contratado** (Assertiva/Serpro/bureau) — **nunca** scraping de site de terceiro;
3. Finalidade, retenção mínima e trilha de auditoria por consulta.

Sem (1)+(2), não implemento busca de pessoa — catalogado aqui, parado por decisão sua.
