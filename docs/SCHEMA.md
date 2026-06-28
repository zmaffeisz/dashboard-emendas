# Esquema do Banco de Dados — dashboard-emendas

> Banco: PostgreSQL 17 no Supabase (nuvem, projeto `djtwoesmgeetnrztyvzw`), schema `public`.
> 37 tabelas base + 2 views. Levantado diretamente do banco em produção.
> Detalhes de migrations, funções, RLS e triggers em [DATABASE.md](DATABASE.md).

## 1. Mapa de domínios

| Domínio | Tabelas principais |
|---|---|
| **Emendas** | `emendas`, `emenda_itens`, `parlamentares`, `unidades` |
| **Licitação / Processos** | `processos`, `status_opcoes` |
| **Contratos (matriz)** | `contratos`, `contratos_vigencias`, `contratos_historico`, `contratos_fiscalizadores`, `fornecedores`, `fornecedor_contatos` |
| **Atas de Registro de Preços** | `atas_itens`, `atas_execucao` |
| **Itens (ciclo de vida)** | `itens`, `itens_entregas`, `itens_entregas_unidades`, `itens_status_historico` |
| **Empenhos** | `empenhos`, `empenho_itens` |
| **Notas Fiscais** | `notas_fiscais`, `nota_fiscal_itens` |
| **Sanções** | `sancoes_solicitadas`, `sancao_itens`, `sancoes_administrativas` |
| **Chamados** | `chamados`, `chamados_controle`, `chamados_anexos`, `fiscalizacao_historico`, `termos_ateste`, `termo_chamados`, `termo_contratos` |
| **Inventário** | `inventario_ac` |
| **Pessoas / Acesso** | `profiles`, `user_tab_permissions`, `pessoas`, `secoes` |

## 2. Tabelas centrais do fluxo

### `emendas` (11 colunas)
A emenda parlamentar. Identidade de negócio: **número + ano**.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `emenda` | text | número da emenda |
| `ano` | — | ano |
| `tipo` | text | |
| `parlamentar` | text | nome (texto livre, legado) |
| `parlamentar_id` | FK → `parlamentares.id` | normalizado |
| `sei_emenda` | text | processo SEI da emenda |
| `unidade` | text | |
| `unidade_id` | FK → `unidades.id` | |
| `valor_cedido` | numeric | **valor monetário** — teto da emenda |

### `emenda_itens` (27 colunas)
Os itens de uma emenda. É o **elo N:N** com processos (cada item aponta para o processo
que o licita). Campos monetários "cadastrado" (planejado) vs. corrente (executado).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `emenda_id` | FK → `emendas.id` | |
| `processo_id` | FK → `processos.id` | licitação que atende o item |
| `unidade_beneficiada_id` | FK → `unidades.id` | |
| `unidade_entrega_id` | FK → `unidades.id` | |
| `status_id` | FK → `status_opcoes.id` | status oficial (numérico) |
| `status` | text | status legado (texto) |
| `qtde`, `qtde_cadastrada` | numeric | quantidade executada / planejada |
| `vl_unitario`, `vl_total` | numeric | **valores executados** |
| `vl_unitario_cadastrado`, `vl_total_cadastrado` | numeric | **valores planejados** |

> Na aba **Emendas**, `emenda_itens.status`, `nota_fiscal`, `empenho`, `patrimonio` e
> `data_entrega` podem ser fallback legado. A exibição consolidada deve preferir dados
> derivados do ciclo real em `itens`, `itens_entregas`, `itens_entregas_unidades`,
> `empenho_itens` e `nota_fiscal_itens`.

### `processos` (12 colunas)
A licitação / processo de contratação.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | bigint (PK) | |
| `status` | text | |
| `valor_estimado` | numeric | **valor monetário** |
| `natureza` | — | (ver migration `add_natureza_e_status_processo`) |

### `contratos` (34 colunas) — **MATRIZ PRINCIPAL DOS CONTRATOS**
Tabela-matriz de todo instrumento contratual. `tipo_instrumento` distingue **Contrato**
de **ATA** (a aba "Atas Rp" é uma visão filtrada desta matriz — ver [MODULES.md](MODULES.md)).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | integer (PK) | |
| `processo_id` | FK → `processos.id` | |
| `fornecedor_id` | FK → `fornecedores.id` | |
| `tipo_instrumento` | text | `CONTRATO` ou `ATA` |
| `status` | text | |
| `numero_contrato` | text | |
| `valor_inicial` / `valor_atual` / `valor_mensal` | text | legado (texto) |
| `valor_inicial_num` / `valor_atual_num` / `valor_mensal_num` | numeric | **valores monetários normalizados** |
| `fonte` | text | fonte de recurso |
| `vigencia_atual`, `vencimento`, `total_periodos_vigencia` | — | vigência |
| `prefixo_chamado` | text | liga contrato ↔ chamados |

> **Atenção:** existem campos monetários duplicados em texto (`valor_*`) e numéricos
> (`valor_*_num`). Os numéricos são a referência para cálculos. Ver [BUSINESS_RULES.md](BUSINESS_RULES.md).

### `atas_itens` (13 colunas)
Itens de uma ATA de registro de preços (fonte de verdade da execução das atas).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `contrato_id` | FK → `contratos.id` | ATA pai (na matriz de contratos) |
| `qtde_contratada` | numeric | |
| `valor_unit` | numeric | **valor monetário** |
| `status_contrato` | text | |

### `atas_execucao` (24 colunas)
Execução/entrega por item de ata, por unidade (AF, NF, datas, termo).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `ata_item_id` | FK → `atas_itens.id` | |
| `emenda_id` | FK → `emendas.id` | |
| `emenda_item_id` | FK → `emenda_itens.id` | |
| `qtde`, `valor` | numeric | **valores monetários** |
| `af_numero` | text | nº da Autorização de Fornecimento da ATA (migration `atas_execucao_af_numero`) |
| `data_af`, `prev_entrega`, `dt_entrega` | text | datas da AF/entrega |
| `empenho`, `nf` | text | nº de empenho / nota fiscal |
| `origem_recurso` | text | |
| `termo_arquivo` | text | arquivo de termo (Storage) |

### `itens` (25 colunas) — ciclo de vida do item
Item materializado que "viaja" pelo fluxo (origem emenda/ata → contrato → entrega).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `emenda_id`, `emenda_item_id` | FK | origem na emenda |
| `ata_item_id` | FK → `atas_itens.id` | origem na ata (espelhamento) |
| `contrato_id` | FK → `contratos.id` | |
| `processo_id` | FK → `processos.id` | |
| `fornecedor_id` | FK → `fornecedores.id` | |
| `item_origem_id` | FK → `itens.id` (auto) | divisão/troca marca-modelo |
| `status_lic_id` | FK → `status_opcoes.id` | status de licitação por item |
| `status_lic_desde` | timestamptz | |
| `qtde` | numeric | |
| `valor_estimado`, `valor_contratado` | numeric | **valores monetários** |

### `itens_entregas` (25 colunas)
Autorização de Fornecimento (AF) / recebimento agregado por item.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `item_id` | FK → `itens.id` | |
| `empenho_id` | FK → `empenhos.id` | |
| `nota_fiscal_id` | FK → `notas_fiscais.id` | |
| `af_numero`, `af_data`, `data_limite_entrega` | — | AF |
| `qtde_autorizada`, `qtde_recebida` | numeric | |
| `patrimonio`, `numero_serie` | text | **agregado/legado** (preenchido por trigger a partir de `itens_entregas_unidades`) |
| `status` | text | |

`data_entrega_unidade`, `termo_arquivo`, `termo_responsavel` e `termo_cargo` registram a
confirmação de entrega na unidade. Linhas com `af_numero` alimentam a subaba
**Confirmação de Entrega na Unidade** e o painel consolidado de **Emendas**.

### `itens_entregas_unidades` (11 colunas)
**Uma linha por unidade física recebida** (patrimônio/série individuais). Introduzida
para recebimento por unidade. Referencia a NF **sem armazenar valor** (evita duplicidade).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `entrega_id` | FK → `itens_entregas.id` (ON DELETE CASCADE) | |
| `item_id` | FK → `itens.id` | |
| `nota_fiscal_id` | FK → `notas_fiscais.id` | **mesma NF pode repetir entre unidades — sem somar valor** |
| `unidade_seq` | integer | 1..N |
| `patrimonio`, `numero_serie` | text | individuais |
| `recebido_em` | date | |

## 3. Modelo de Notas Fiscais (anti-duplicidade)

Três tabelas separam claramente os níveis de valor:

| Tabela | Granularidade | Campo de valor |
|---|---|---|
| `notas_fiscais` (20 col.) | **uma linha por NF** | `valor_total` (valor total da NF, **uma única vez**) |
| `nota_fiscal_itens` (11 col.) | **rateio por item** | `valor_unitario`, `valor_total`, `quantidade` |
| `itens_entregas_unidades` | por unidade física | **sem campo de valor** — só referencia `nota_fiscal_id` |

`notas_fiscais` referencia: `fornecedor_id`, `contrato_id`, `processo_id`, `emenda_id`.
`nota_fiscal_itens` referencia: `nota_fiscal_id`, `item_id`, `emenda_id`, `emenda_item_id`, `empenho_id`.

> Regra: **o valor total da NF mora em `notas_fiscais.valor_total`; o rateio mora em
> `nota_fiscal_itens`; o recebimento físico por unidade NÃO carrega valor.** Isso impede
> que o mesmo valor seja somado várias vezes ao distribuir por unidade. Ver
> [BUSINESS_RULES.md](BUSINESS_RULES.md#notas-fiscais).

## 4. Empenhos

| Tabela | Observação |
|---|---|
| `empenhos` (24 col.) | FK: `contrato_id`, `emenda_id`, `fornecedor_id`, `processo_id`. Valores: `valor_empenhado`, `valor_anulado`, `saldo_empenho`; `status`. |
| `empenho_itens` (9 col.) | rateio: `empenho_id`, `emenda_id`, `emenda_item_id`, `item_id`; `quantidade_vinculada`, `valor_vinculado`. |

## 5. Sanções

| Tabela | Observação |
|---|---|
| `sancoes_solicitadas` (15) | FK `contrato_id`; `percentual_multa`. |
| `sancao_itens` (16) | FK `sancao_id`, `emenda_item_id`; `qtde`, `vl_unitario`, `vl_total`. |
| `sancoes_administrativas` (12) | FK `contrato_id`; `valor_multa`, `status`. |

## 6. Chamados

| Tabela | Observação |
|---|---|
| `chamados` (35) | FK `contrato_id`, `unidade_id`; `status`, `glosa`. |
| `chamados_controle` (23) | controle interno; FK `chamado_id`, `contrato_id`; chave de negócio `protocolo`. |
| `chamados_anexos` (8) | FK `chamado_id`. |
| `fiscalizacao_historico` (9) | FK `chamado_id`. |
| `termos_ateste` (10), `termo_chamados` (3), `termo_contratos` (3) | termos de ateste e vínculos. |

## 7. Cadastros de apoio e acesso

| Tabela | Observação |
|---|---|
| `parlamentares` (5) | mestre de parlamentares. |
| `unidades` (8) | unidades (beneficiada/entrega). |
| `fornecedores` (6) / `fornecedor_contatos` (7) | mestre de fornecedores. |
| `status_opcoes` (8) | catálogo de status (`contexto`, `nome`, `ordem`, `ativo`, `orgao`, `automatico`). Ver [DATABASE.md](DATABASE.md#status). |
| `profiles` (6) | perfil do usuário: `papel`, `aprovado`. |
| `user_tab_permissions` (6) | permissões por aba (`tab_key`, `can_view`, `can_edit`). |
| `pessoas` (10), `secoes` (6) | cadastros auxiliares. |
| `inventario_ac` (17) | inventário; FK `emenda_item_id`, `unidade_id`. |

## 8. Views

| View | Função |
|---|---|
| `vw_emendas_saldo` | Saldo consolidado por emenda: `total_planejado`, `total_executado`, `total_comprometido`, `saldo_remanescente`, `status_execucao`. Base da aba **Saldo das Emendas**. Definição em [DATABASE.md](DATABASE.md#views). |
| `vw_processos_resumo` | Resumo de processos com `status` e `valor_estimado`. |

## 9. Diagrama de relacionamentos (resumido)

```
parlamentares ─┐
unidades ──────┼─< emendas ─< emenda_itens >─ processos
               │                   │   │
               │                   │   └─< (status_opcoes)
               │                   │
               │      contratos (MATRIZ) ─< atas_itens ─< atas_execucao
               │        │  │  │                   ▲              │
fornecedores ──┘        │  │  └─< empenhos ─< empenho_itens     │
                        │  └─< contratos_vigencias / _historico │
                        │                                       │
                        └─< itens ─< itens_entregas ─< itens_entregas_unidades
                                          │                     │
                                          └─ notas_fiscais ─< nota_fiscal_itens
                                          └─ empenhos

contratos ─< sancoes_solicitadas ─< sancao_itens
contratos ─< sancoes_administrativas
contratos ─< chamados ─< chamados_controle / chamados_anexos / fiscalizacao_historico

profiles ─< user_tab_permissions ;  profiles ─< pessoas
```

> A lista completa de chaves estrangeiras está consolidada em [DATABASE.md](DATABASE.md#chaves-estrangeiras).
