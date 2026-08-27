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
| Item da emenda | aba **Emendas** (`emenda_itens`) | modal **Nova emenda** (itens inline) / Novo item / status | Licitação, Saldo, Sanções, painel consolidado do ciclo do item |
| Licitação/processo | aba **Licitações** (`processos`) | novo/editar processo | Emenda (status do item), Contrato |
| Status detalhado da licitação | `itens.status_lic_id` (`emenda_itens.status_id` é categoria/fallback) | aba Licitações (por item) | Emenda (somente leitura) |
| Contrato (matriz) | aba **Contratos** (`contratos`) | editar contrato (admin) | Atas, Itens, Empenhos, Chamados, Sanções |
| Ata (itens) | espelhada ao salvar contrato ATA (`atas_itens`) | aba **Atas Rp** | Execução de ata, Itens |
| Execução de ata | aba **Atas Rp** (`atas_execucao`) | AF/entrega/termo | Saldo, Inventário — exceto Carona |
| Planejamento de Emenda para futura Ata | Licitações (`ata_planejamento_emendas`) | vínculo no item/lote de processo `ATA DE RP` | Emendas e conversão opcional ao gerar a Ata; não reserva nem executa |
| AF / entrega | aba **Itens** (`itens_entregas`) | modal AF / recebimento / confirmação na unidade | Emendas, Saldo, NF, Inventário |
| Recebimento por unidade | aba **Itens** (`itens_entregas_unidades`) | modal recebimento | agregado em `itens_entregas` (trigger) |
| Empenho | aba **Itens/Contratos** (`empenhos`,`empenho_itens`) | modal empenho | Saldo, NF, AF de ATA |
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
   - Para ATA RP, o contrato gerado exige número apenas numérico, data de início e seção.
   - A execução/solicitação de ATA originada de Emenda só pode usar `emenda_item_id` ainda
     livre; item já vinculado fica bloqueado na seleção e também é barrado no salvamento.
3. **Trigger de agregação** — `itens_entregas_unidades` → `_sync_entrega_agregado()`
   atualiza `itens_entregas.patrimonio/numero_serie` sem duplicar dado.
4. **Emendas como painel consolidado** — a aba Emendas lê o item cadastrado e agrega o
   fluxo de `itens`, `itens_entregas`, `itens_entregas_unidades`, `empenho_itens` e
   `nota_fiscal_itens`. Por isso AF emitida, aguardando AF, confirmação na unidade,
   empenho, NF, patrimônio e data de entrega precisam aparecer ali sem edição manual.
   Enquanto o item está na licitação, o nome detalhado de `itens.status_lic_id` é exibido e
   o painel é recarregado logo após a alteração na aba Licitações.

5. **Planejamento de futura Ata** — o vínculo percorre
   `Emenda → Licitação → Ata vigente aguardando requisição`. Somente a criação efetiva de
   `atas_execucao`, no momento da formalização ou posteriormente na aba Atas, inicia
   `Requisição → AF → Recebimento` e passa a consumir saldo.
   Para ATA, `atas_execucao` também alimenta esse painel: empenho vinculado, AF, prazo
   calculado e entrega precisam refletir no item da emenda correspondente.
5. **Views derivadas** — `vw_emendas_saldo` recalcula saldo a partir de `emenda_itens`
   sempre que lida (não há valor "congelado" duplicado).

Na aba **Empenhos**, a linha de cada empenho abre uma ficha consolidada somente leitura.
Ela parte de `empenhos` e percorre `empenho_itens` para reunir aquisições em `itens` e
pedidos em `atas_execucao`, preservando os vínculos com contratos, processos, Emendas,
unidades, AFs/recebimentos e o rateio de notas em `nota_fiscal_itens`. A ficha não cria
uma nova fonte de verdade: os valores e estados continuam vindo das tabelas de origem e
respeitam a RLS da sessão autenticada.

## 4. Exemplo de fluxo ponta a ponta

> **Cenário:** emenda parlamentar para aquisição de equipamentos via ATA de RP.

1. **Emenda** — cadastra-se a emenda (`emendas.valor_cedido`) e seus itens em
   `emenda_itens` (com `vl_total_cadastrado` = planejado).
2. **Licitação** — cria-se o `processo`; cada `emenda_itens.processo_id` aponta para ele.
   O status de licitação evolui por item (`status_lic_id`).
3. **Contrato/ATA** — homologado, cria-se o registro em `contratos` com
   `tipo_instrumento = 'ATA'`, vinculado ao `processo_id` e `fornecedor_id`. Os itens são
   **espelhados** para `atas_itens`.
4. **Execução da ata** — em `atas_execucao` registram-se unidade, quantidade, valor,
   empenho, AF, previsão e entrega. A AF só pode ser emitida depois de vínculo de empenho;
   a data limite vem de `data_af + prazo_entrega` herdado da ATA/licitação.
   O vínculo de empenho pode nascer diretamente na subaba **Empenhos** ao selecionar o
   pedido da ATA; nesse caso o Controle de Entregas apenas libera **Emitir AF**, sem criar
   novo vínculo/rateio. A execução fica identificada por `empenho_itens.exec_id`, mesmo
   sem origem em Emenda; no recebimento, `nota_fiscal_itens.exec_id` mantém a NF ligada ao
   mesmo pedido para alimentar a ficha consolidada do empenho.
5. **Recebimento e confirmação** — o recebimento pela Secretaria fica em
   `itens_entregas.data_recebimento` (ou `atas_execucao.dt_entrega`) e a confirmação da
   entrega na unidade fica separadamente em `data_entrega_unidade`. A AF, o recebimento e a
   entrega na unidade são três marcos distintos para bens permanentes. No recebimento, o
   usuário classifica o item: **PERMANENTE** cria uma linha por unidade física em
   `itens_entregas_unidades` ou `atas_execucao_unidades`, inclusive quando patrimônio/série
   estiverem vazios; **CONSUMO** permanece aglutinado no registro pai e encerra o fluxo no
   almoxarifado, sem confirmação na unidade. A **NF** é cadastrada **uma vez** em
   `notas_fiscais` (valor total) e rateada em `nota_fiscal_itens`.
6. **Emendas** — a aba Emendas reflete o estágio atual do item: aguardando AF, AF emitida,
   recebido aguardando confirmação, ou adquirido/entregue na unidade.
7. **Movimentação física** — após o nascimento, `inventario_unidades` guarda localização e
   situação atuais; `inventario_movimentacoes` acrescenta transferência, empréstimo,
   devolução ou baixa com documento. A unidade beneficiada de `emenda_itens` não é alterada:
   Emendas mostra apenas um marcador e a ficha detalhada consulta o histórico. Unidades de
   execuções com origem **Carona** permanecem apenas no fluxo da Ata e não entram nessas
   tabelas de inventário ou movimentação.
8. **Saldo** — `vw_emendas_saldo` reflete `total_executado` (soma de `vl_total`) e
   `saldo_remanescente = valor_cedido − comprometido`.

## 5. Pontos de atenção de integridade

- **Não duplicar valor de NF** ao distribuir por unidade — ver
  [BUSINESS_RULES.md](BUSINESS_RULES.md#notas-fiscais).
- **Comprometido** usa executado *ou* planejado (não soma os dois) na view de saldo.
- **Espelhamento** de atas é idempotente; reexecuções não duplicam `atas_itens`.

Ver regras completas em [BUSINESS_RULES.md](BUSINESS_RULES.md).
