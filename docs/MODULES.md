# Módulos do Sistema — dashboard-emendas

> Cada módulo corresponde a uma aba do `index.html`. Mapeamento de abas em [ROUTES.md](ROUTES.md);
> tabelas em [SCHEMA.md](SCHEMA.md); fluxo em [DATA_FLOW.md](DATA_FLOW.md).

## Visão geral dos módulos

| Módulo (aba) | Tabelas/Views consumidas | Onde o dado nasce | Onde é editado |
|---|---|---|---|
| Emendas (dashboard) | `emendas`, `emenda_itens`, `itens`, `itens_entregas`, `empenhos`, `notas_fiscais`, `vw_emendas_saldo` | Cadastro de emenda/itens | Modais nova emenda / novo item / status |
| Saldo das Emendas | `vw_emendas_saldo` | derivado | leitura |
| Consulta rápida | múltiplas | — | leitura |
| Chamados Antigos | (Google Sheets — consulta) | externo | **somente leitura** |
| Chamados novos | `chamados`, `chamados_controle`, `chamados_anexos` | `chamado.html` (público) + sistema | controle interno |
| Fiscalização | `chamados`, `fiscalizacao_historico`, `termos_ateste` | chamados | fiscalização/ateste |
| Inventário | `inventario_ac` | importação/cadastro | edição inventário |
| Controle de Entregas (Itens) | `itens`, `itens_entregas`, `itens_entregas_unidades`, `empenhos`, `notas_fiscais` | espelhamento do contrato/ata | AF, recebimento, NF, termo |
| Atas Rp Vigentes | `contratos` (tipo ATA), `atas_itens`, `atas_execucao` | matriz de contratos | execução de ata |
| Contratos em execução | `contratos` (**matriz**), `contratos_vigencias`, `contratos_historico`, `fornecedores` | cadastro de contrato | edição (admin) |
| Licitações em andamento | `processos`, `vw_processos_resumo`, `itens` | processos | status por item |
| Sanções | `sancoes_solicitadas`, `sancao_itens`, `sancoes_administrativas` | a partir de execução/contrato | solicitação/aplicação |
| Cadastros | `parlamentares`, `unidades`, `fornecedores`, `status_opcoes`, `secoes`, `pessoas` | cadastros-mestre | **admin** |
| Usuários | `profiles`, `user_tab_permissions` | Auth/cadastro | **admin** |
| Planilhas | importações/exports | — | export/import |

---

## 1. Emendas (dashboard)
Aba inicial e única visível sem permissões adicionais. Lista emendas e seus itens
(`emenda_itens`), com filtros, exportação Excel (`exportarExcel`) e modais de cadastro
(nova emenda, novo item, atualizar status). É a porta de entrada do fluxo: a emenda e
seus itens nascem aqui. O modal **Nova emenda** cadastra a emenda (valor cedido global) e
seus **itens inline** (item + valor unitário + status + unidades/qtde), calculando o valor
por unidade = unitário × qtde. Ver [BUSINESS_RULES.md](BUSINESS_RULES.md). Reflete o fluxo completo (status do item ao longo da licitação,
contratação, AF, recebimento e confirmação na unidade). Quando Controle de Entregas muda
AF, empenho, NF, patrimônio, unidade/data de entrega ou termo, a aba Emendas deve exibir
esse avanço como painel consolidado, sem depender de edição manual no cadastro do item.
Na planilha da aba, os valores planejados (`vl_unitario_cadastrado`, `vl_total_cadastrado`)
e executados (`vl_unitario`, `vl_total`) devem aparecer separados.

## 2. Saldo das Emendas
Leitura da view `vw_emendas_saldo`: planejado, executado, comprometido, saldo
remanescente e status de execução por emenda. Visível apenas para quem pode **editar**
o dashboard (regra de `aplicarVisibilidadeAbas`).

## 3. Consulta rápida
Pesquisa transversal de dados (busca global). Somente leitura.

## 4. Chamados Antigos
Consulta de chamados históricos vindos do **Google Sheets**. Conforme regra do projeto,
é **somente consulta** — não é fonte de escrita do sistema.

## 5. Chamados novos
Chamados no Supabase. Abertos pelo formulário público `chamado.html`
(RPC `abrir_chamado_publico`) ou internamente. O **controle** vive em `chamados_controle`
(chave `protocolo`). Regra: chamado "órfão" sem controle é tratado como "não aberto"
(não criar automaticamente). Anexos em `chamados_anexos` (Storage).

## 6. Fiscalização
Acompanhamento/fiscalização de chamados e contratos: histórico
(`fiscalizacao_historico`), termos de ateste (`termos_ateste`, `termo_chamados`,
`termo_contratos`), glosas.

## 7. Inventário
`inventario_ac`: equipamentos por unidade, vinculados a `emenda_item_id`. Em evolução
(não totalmente normalizado — ver [TODO.md](TODO.md)).

## 8. Controle de Entregas (Itens)
Ciclo de vida do item após a contratação:
- **Controle de Entregas / Prazos**: lista aquisições que ainda possuem saldo aguardando
  AF e execuções de ATA pendentes/prazos. Ao emitir AF de aquisição que cubra a quantidade,
  o item deixa esta subaba.
- **Confirmação de Entrega na Unidade**: lista aquisições com `af_numero` e execuções de
  ATA para confirmar a entrega real na unidade, termo e responsável. A confirmação alimenta
  a aba Emendas.
- **Empenhos**: cadastro e vínculo de empenhos; a confirmação/Emendas pode herdar o empenho
  de `empenho_itens` ou do contrato.
- **AF (Autorização de Fornecimento)** — aquisição: `abrirModalAF`, `abrirAFLote` →
  `itens_entregas`. ATA: `abrirModalAtaAF`/`salvarAtaAF` → grava `af_numero`/`data_af`/
  `prev_entrega` em `atas_execucao` (modal dedicado `#modal-ata-af`).
- **Empenho**: vínculo via `empenhos`/`empenho_itens` (`abrirVincularEmpenho`).
- **Recebimento**: `abrirRecebimento` → quantidade recebida, NF, patrimônio/série.
  Recebimento **por unidade física** em `itens_entregas_unidades` (cada unidade com
  patrimônio/série próprios; NF referenciada sem valor).
- **Termo de entrega**: `abrirTermoEntrega` (arquivo no Storage).
- **Notas Fiscais**: `notas_fiscais` + `nota_fiscal_itens` (rateio).

## 9. Atas Rp Vigentes  ⚠️ aba própria
Gestão **específica das Atas de Registro de Preços**. Tecnicamente, uma ATA é um registro
da matriz `contratos` com `tipo_instrumento = 'ATA'`; os itens vivem em `atas_itens` e a
execução em `atas_execucao`.

> **Importante (decisão de modelagem):**
> - A aba **Atas / Contratos ("Atas Rp Vigentes")** é um **item próprio do menu lateral**,
>   na seção "Contratos".
> - **NÃO** é subaba de "Contratos".
> - É uma **visualização/gestão específica das atas, sincronizada com a matriz de contratos**.
> - Por isso `showTab('atas')` chama `loadAtas()` **a cada visita**, refletindo
>   automaticamente alterações feitas na aba Contratos (encerrar/prorrogar/editar).
> - Ao cadastrar um contrato do tipo ATA, os itens selecionados são **espelhados** para
>   `atas_itens` (`abrirModalNovoContrato` → espelhamento; a fonte de verdade da execução
>   permanece na aba Atas).

## 10. Contratos em execução  ⭐ MATRIZ
Aba-**matriz** de todos os instrumentos contratuais (`contratos`). Inclui vigências
(`contratos_vigencias`), histórico (`contratos_historico`), fiscalizadores
(`contratos_fiscalizadores`) e fornecedores. Edição completa de contrato é **exclusiva de
admin** (`abrirEditarContrato`/`abrirDetalheContrato`). É a fonte de verdade de onde a aba
Atas Rp deriva sua visão.

## 11. Licitações em andamento
Processos (`processos`, `vw_processos_resumo`) e status de licitação por **item**
(`itens.status_lic_id`). Tela "Controle de processos". O status viaja por item; a emenda
apenas lê o status.

## 12. Sanções
Solicitação (`sancoes_solicitadas` + `sancao_itens`) e aplicação
(`sancoes_administrativas`) de sanções administrativas, ligadas a `contratos` e a itens
de emenda. Geração de documento (`abrirModalSolicitacaoSancao`,
`abrirModalSolicitacaoSancaoAta`).

## 13. Cadastros (admin)
Cadastros-mestre: `parlamentares`, `unidades`, `fornecedores`, `status_opcoes`, `secoes`,
`pessoas`. Inclui fila de **revisão/moderação/dedup** de cadastros criados inline
(`carregarRevisao`). Apenas admin.

## 14. Usuários (admin)
Gestão de `profiles` e `user_tab_permissions` (caixinhas ver/editar por aba), aprovação de
contas e exclusão (`admin_delete_user`). Apenas admin. Ver [SECURITY.md](SECURITY.md).

## 15. Planilhas
Importação/exportação de planilhas (Excel/CSV via `xlsx`/`papaparse`). Oculta por padrão
(`DEFAULT_HIDDEN_TABS`), liberada por admin.

---

## Interdependências entre módulos

```
Emendas ──(emenda_itens.processo_id)──▶ Licitações
Licitações ──(contratos.processo_id)──▶ Contratos (matriz)
Contratos ──(tipo_instrumento=ATA → atas_itens)──▶ Atas Rp
Contratos/Atas ──(itens, espelhamento)──▶ Controle de Entregas
Controle de Entregas ──(notas_fiscais, empenhos)──▶ Saldo das Emendas
Contratos ──▶ Chamados / Fiscalização / Sanções
```

Alterar um contrato reflete em Atas Rp (recarregada sempre), em Itens (espelhados) e nos
saldos. Ver regras em [BUSINESS_RULES.md](BUSINESS_RULES.md).
