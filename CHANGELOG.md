# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

> Nota: este projeto não usa versionamento semântico formal nem tags de release. As
> entradas abaixo reconstroem o histórico a partir das **migrations aplicadas** e da
> documentação existente. Datas em formato ISO (AAAA-MM-DD).

## [Não versionado]

### Adicionado
- Documentação técnica e funcional completa em `/docs` (ARCHITECTURE, SCHEMA, DATABASE,
  ROUTES, MODULES, DATA_FLOW, BUSINESS_RULES, API, SECURITY, DEPLOYMENT, TESTING, TODO).
- `README.md`, `CHANGELOG.md`, `.env.example` e `CLAUDE.md` na raiz.
- **Emitir AF para itens de ATA** (Controle de Entregas): modal dedicado `#modal-ata-af`
  (`abrirModalAtaAF`/`salvarAtaAF`) que gera nº de AF + data + previsão de entrega,
  espelhando o fluxo de AF da aquisição. Requer a coluna `atas_execucao.af_numero`
  (migration `20260628141120_atas_execucao_af_numero`).
- **Nova emenda com itens inline**: o modal "Nova emenda" passou a cadastrar a emenda e
  seus itens no mesmo modal (item + valor unitário + status + unidades/qtde por item),
  com cálculo do valor por unidade = unitário × qtde e resumo de comprometido/saldo
  (`neInitItens`, `neAddItem`, `neAddUnidade`, `neRecalc`).

### Corrigido
- **AF de ATA com prazo herdado**: o modal de emissão agora busca o vínculo `ata_item_id`,
  herda o prazo da ATA/licitação, calcula `prev_entrega` automaticamente e bloqueia a
  emissão quando a origem não possui prazo cadastrado. Ao salvar, o avanço também é refletido
  na aba **Emendas** via `atas_execucao`/`emenda_itens`.
- **Fluxo de AF no Controle de Entregas/Prazos**: o botão **Emitir AF** não remove mais
  o item da subaba; o item permanece com os botões **Receber** e **Prazo** até que o
  recebimento interno seja confirmado. O item só aparece em **Confirmação de Entrega na
  Unidade** após o recebimento (`qtde_recebida > 0` ou `data_recebimento` preenchida).
- **Nomenclatura padronizada**: todos os botões, mensagens e textos da interface agora
  usam **Emitir AF** (antes havia mistura com "Emitir Ordem de Entrega").
- **Filtro de visibilidade robusto**: o filtro de itens em Controle de Entregas/Prazos
  agora verifica explicitamente `recebido === true` antes de ocultar o item, evitando
  que itens recém-emitidos desapareçam por inconsistência no `saldo_af`.
- **Confirmação pós-recebimento**: `salvarRecebimento` agora recarrega a subaba de
  Confirmação de Entrega automaticamente após o recebimento interno.
- **Salvaguarda anti-desaparecimento**: adicionado quarto caminho em `loadItensEntregas`
  que captura registros de `itens_entregas` com AF emitida que não foram incluídos por
  nenhum dos três caminhos principais (ex.: falha de join no select aninhado do
  Supabase). Item com `af_numero` preenchido nunca mais fica invisível.

### Alterado
- **Aba Emendas como painel consolidado do ciclo do item**: agora o dashboard deriva status,
  AF, empenho, NF, patrimônio e data de entrega a partir de `itens`, `itens_entregas`,
  `itens_entregas_unidades`, `empenho_itens` e `nota_fiscal_itens`, em vez de depender
  somente dos campos manuais de `emenda_itens`.
- **Planilha de Emendas**: adicionada a coluna **Vl. unit. exec.** e renomeada a coluna
  total executada para **Vl. total exec.**, separando melhor planejado vs. executado.
- **Fluxo AF de aquisição no Controle de Entregas**: item com AF emitida deixa
  **Controle de Entregas / Prazos** e passa para **Confirmação de Entrega na Unidade**;
  itens sem AF continuam como "aguardando AF".
- **Status dos modais de emenda/item** agora vêm da mesma fonte da aba *Licitações em
  andamento* (`status_opcoes` com `contexto='licitacao'`, opções manuais) via
  `popularStatusLicitacao()`, em vez de lista fixa no HTML.
- **Modelo de cadastro de nova emenda**: passou a criar **1 linha em `emendas`**
  (valor cedido global) em vez de 1 linha por unidade com o valor dividido igualmente.
  A distribuição por unidade vive nos `emenda_itens`. Emendas antigas (multi-linha)
  permanecem válidas.

### Corrigido
- **Emendas não refletia avanço real do item**: itens com AF/confirmacão na unidade podiam
  continuar mostrando status antigo de licitação ("Em andamento") e campos vazios. O status
  derivado do fluxo agora prevalece quando há AF, recebimento ou confirmação.
- **Empenho vazio em confirmação/Emendas**: quando `itens_entregas.empenho` estava vazio,
  o sistema passa a herdar o empenho vinculado via `empenho_itens`/`empenhos`.
- **"Emitir AF" da ATA não abria** no Controle de Entregas: o modal `#modal-edit-exec`
  estava aninhado em `#panel-atas` (invisível em outras abas) e dependia do array
  `atasExec` não carregado fora da aba Atas. Agora o modal é reparentado ao `body` ao
  abrir e a execução é buscada do banco quando necessário.
- **Lista de status cortada em Licitações em andamento**: o dropdown do select com busca
  (`enhanceSelect`) era `position:absolute` e era recortado pelo `overflow:hidden` do
  bloco da licitação. Passou a usar `position:fixed`, escapando de qualquer ancestral
  com `overflow`.

## Histórico de banco (migrations) — 2026-06

> Reconstruído de `list_migrations` (produção). Ver
> [docs/DATABASE.md](docs/DATABASE.md#migrations-aplicadas-em-produção).

### 2026-06-26
- `recebimento_por_unidade` / `recebimento_por_unidade_search_path`: tabela
  `itens_entregas_unidades` (recebimento por unidade física; NF referenciada sem valor,
  evitando duplicidade) + trigger de agregação `_sync_entrega_agregado`.
- `fase5_drop_inventario_ac_contrato_morto`: limpeza de coluna morta no inventário.
- `fase4_data_entrega_date_e_contratos_valores_num`: datas como `date` e valores de
  contrato numéricos (`valor_*_num`).
- `fase2_emenda_itens_status_id`: `emenda_itens.status_id` (FK para `status_opcoes`).
- `fase1_parlamentar_id_e_unidade_chamados`: normalização de parlamentar e unidade.
- `fase0_mover_backups_para_schema_backup`: backups movidos para schema `backup`.
- `fase8_numero_despesa`, `prod_revisao_cadastros`,
  `prod_hardening_revoke_anon_ciclo_itens` (hardening RLS/anon).
- `prod_fase7_bucket_termos_entrega` (Storage de termos), `prod_fase7_12_atas_execucao_cols`,
  `prod_fase5_6_9_itens_entregas_cols`, `prod_fase9_itens_marca_modelo`,
  `prod_fase6_empenhos_notas_fiscais` (empenhos + notas fiscais).

### 2026-06-25
- `fase3_gera_mais_contratos`: geração de contratos a partir de processos/itens.

### 2026-06-24
- `fase0_itens_e_itens_entregas`: tabelas `itens` e `itens_entregas` (ciclo de vida do item).
- `add_natureza_e_status_processo` + `recreate_vw_processos_resumo_com_natureza`:
  `natureza`/`status` em processos e recriação da view `vw_processos_resumo`.

---

> Mantenha este arquivo atualizado a cada migration ou mudança funcional relevante.
