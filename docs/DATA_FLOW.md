# Fluxo de Dados — dashboard-emendas

> O sistema é um **ecossistema integrado**. Fluxo principal:
>
> **Emenda → Licitação → Contrato → Ata → Execução/Entrega**
>
> Este documento mostra onde cada dado nasce, é editado e consumido, e as dependências
> entre módulos. Ver tabelas em [SCHEMA.md](SCHEMA.md) e módulos em [MODULES.md](MODULES.md).

## 1. Visão macro

```
 ┌─────────┐   processo_id   ┌───────────┐  processo_id  ┌────────────┐
 │ EMENDA  │────────────────▶│ LICITAÇÃO │──────────────▶│  CONTRATO  │
 │ emendas │                 │ processos │               │ (MATRIZ)   │
 │ +itens  │◀── status ──────│           │               │ contratos  │
 └────┬────┘                 └───────────┘               └─────┬──────┘
      │ valor_cedido / planejado / executado                   │ tipo_instrumento
      │                                                          ├── = CONTRATO
      ▼                                                          └── = ATA
 ┌───────────────┐                                          ┌──────────────┐
 │ SALDO EMENDAS │◀──────────────── valores ────────────── │   ATA (RP)   │
 │ vw_emendas_   │                                          │ atas_itens   │
 │ saldo         │                                          │ atas_execucao│
 └───────────────┘                                          └──────┬───────┘
      ▲                                                            │ espelhamento (itens.ata_item_id)
      │  notas/empenhos                                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ EXECUÇÃO / ENTREGA                                                     │
 │ itens → itens_entregas → itens_entregas_unidades                       │
 │ empenhos/empenho_itens · notas_fiscais/nota_fiscal_itens · termos      │
 └──────────────────────────────────────────────────────────────────────┘
```

## 2. Onde cada dado nasce / é editado / é consumido

| Etapa | Nasce em | Editado em | Consumido por |
|---|---|---|---|
| Emenda | aba **Emendas** (`emendas`) | modal nova emenda | Saldo, Itens, relatórios |
| Item da emenda | aba **Emendas** (`emenda_itens`) | modal **Nova emenda** (itens inline) / Novo item / status | Licitação, Saldo, Sanções |
| Licitação/processo | aba **Licitações** (`processos`) | novo/editar processo | Emenda (status do item), Contrato |
| Status de licitação | `itens.status_lic_id` / `emenda_itens.status_id` | aba Licitações (por item) | Emenda (somente leitura) |
| Contrato (matriz) | aba **Contratos** (`contratos`) | editar contrato (admin) | Atas, Itens, Empenhos, Chamados, Sanções |
| Ata (itens) | espelhada ao salvar contrato ATA (`atas_itens`) | aba **Atas Rp** | Execução de ata, Itens |
| Execução de ata | aba **Atas Rp** (`atas_execucao`) | AF/entrega/termo | Saldo, Inventário |
| AF / entrega | aba **Itens** (`itens_entregas`) | modal AF / recebimento | Saldo, NF, Inventário |
| Recebimento por unidade | aba **Itens** (`itens_entregas_unidades`) | modal recebimento | agregado em `itens_entregas` (trigger) |
| Empenho | aba **Itens/Contratos** (`empenhos`,`empenho_itens`) | modal empenho | Saldo, NF |
| Nota Fiscal | aba **Itens** (`notas_fiscais`,`nota_fiscal_itens`) | modal NF/recebimento | Saldo, conferência |
| Sanção | aba **Sanções** | solicitação/aplicação | Contrato |
| Chamado | `chamado.html` (público) / aba Chamados | controle interno | Fiscalização, Contrato |

## 3. Reflexo automático entre abas (fonte única da verdade)

O sistema mantém **uma fonte única** no banco; as abas são *views*. Mecanismos de reflexo:

1. **Recarregamento por aba** — `showTab` dispara `loadXxx`. A aba **Atas Rp** chama
   `loadAtas()` **toda vez**, garantindo que alterações em **Contratos** (encerrar,
   prorrogar, editar) apareçam imediatamente. ([index.html:2820](../index.html))
2. **Espelhamento Contrato ATA → `atas_itens`** — ao salvar um contrato `tipo=ATA`, os
   itens selecionados são copiados para `atas_itens` e `itens.ata_item_id` é preenchido
   (idempotente; não duplica). A **fonte de verdade da execução** permanece na aba Atas.
   ([index.html:7118+](../index.html), `abrirModalNovoContrato`)
3. **Trigger de agregação** — `itens_entregas_unidades` → `_sync_entrega_agregado()`
   atualiza `itens_entregas.patrimonio/numero_serie` sem duplicar dado.
4. **Views derivadas** — `vw_emendas_saldo` recalcula saldo a partir de `emenda_itens`
   sempre que lida (não há valor "congelado" duplicado).

## 4. Exemplo de fluxo ponta a ponta

> **Cenário:** emenda parlamentar para aquisição de equipamentos via ATA de RP.

1. **Emenda** — cadastra-se a emenda (`emendas.valor_cedido`) e seus itens em
   `emenda_itens` (com `vl_total_cadastrado` = planejado).
2. **Licitação** — cria-se o `processo`; cada `emenda_itens.processo_id` aponta para ele.
   O status de licitação evolui por item (`status_lic_id`).
3. **Contrato/ATA** — homologado, cria-se o registro em `contratos` com
   `tipo_instrumento = 'ATA'`, vinculado ao `processo_id` e `fornecedor_id`. Os itens são
   **espelhados** para `atas_itens`.
4. **Execução da ata** — em `atas_execucao` registram-se AF, unidade, quantidade, valor,
   previsão e entrega; e/ou em `itens_entregas` (AF), com empenho vinculado.
5. **Recebimento** — `itens_entregas.qtde_recebida` e, por unidade física, linhas em
   `itens_entregas_unidades` (patrimônio/série). A **NF** é cadastrada **uma vez** em
   `notas_fiscais` (valor total) e rateada em `nota_fiscal_itens`.
6. **Saldo** — `vw_emendas_saldo` reflete `total_executado` (soma de `vl_total`) e
   `saldo_remanescente = valor_cedido − comprometido`.

## 5. Pontos de atenção de integridade

- **Não duplicar valor de NF** ao distribuir por unidade — ver
  [BUSINESS_RULES.md](BUSINESS_RULES.md#notas-fiscais).
- **Comprometido** usa executado *ou* planejado (não soma os dois) na view de saldo.
- **Espelhamento** de atas é idempotente; reexecuções não duplicam `atas_itens`.

Ver regras completas em [BUSINESS_RULES.md](BUSINESS_RULES.md).
