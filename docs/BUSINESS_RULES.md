# Regras de Negócio — dashboard-emendas

> Regras encontradas no código/banco **e** regras obrigatórias do domínio. Itens não
> confirmados no código estão marcados como **A confirmar**. Relacionado:
> [DATA_FLOW.md](DATA_FLOW.md), [SCHEMA.md](SCHEMA.md), [SECURITY.md](SECURITY.md).

## 1. Princípios gerais (obrigatórios)

| # | Regra | Status no código |
|---|---|---|
| G1 | **Fonte única da verdade** no banco; abas são views da mesma base. | Implementado (recarregamento + views) |
| G2 | Alteração em uma aba **reflete automaticamente** nas abas relacionadas. | Implementado para Contratos→Atas, Controle de Entregas→Emendas e espelhamentos |
| G3 | **Integridade referencial** entre Emenda, Licitação, Contrato, Ata e Execução. | Implementado via FKs (ver [DATABASE.md](DATABASE.md#chaves-estrangeiras)) |
| G4 | **Evitar duplicidade de valores** (especialmente NF e saldo). | Implementado (modelo NF + view de saldo) |

## 2. Emendas e saldo

- Identidade da emenda = **número + ano** (`emendas.emenda` + `emendas.ano`).
- `valor_cedido` é o teto da emenda.
- Em `emenda_itens` há **dois pares de valores**: planejado
  (`vl_*_cadastrado`) e executado (`vl_*`).
  - Planejado: `vl_unitario_cadastrado` e `vl_total_cadastrado`.
  - Executado: `vl_unitario` e `vl_total`; a aba **Emendas** deve exibir ambos, não só o
    total executado. Quando `vl_total` não estiver preenchido, a exibição pode derivar o
    total executado por `qtde × vl_unitario`.
- `vw_emendas_saldo`:
  - `total_planejado` = Σ `vl_total_cadastrado`.
  - `total_executado` = Σ `vl_total`.
  - `total_comprometido` = por item, usa **executado quando > 0, senão planejado**
    (nunca soma os dois → evita duplicidade).
  - `saldo_remanescente` = `valor_cedido − total_comprometido`.
  - `status_execucao`: `Executada` se executado ≥ 99% do cedido; `Em andamento` se > 0;
    senão `Não iniciada`.
- **Cadastro de nova emenda (modal "Nova emenda" com itens inline)**: cria **1 linha em
  `emendas`** com `valor_cedido` = **valor global** informado, e os itens são cadastrados
  no mesmo modal. Cada item tem valor unitário e uma ou mais unidades com quantidade; o
  **valor por unidade = valor unitário × qtde** (não há divisão igual do valor global).
  O modal mostra o resumo por unidade, o total comprometido e o saldo (global −
  comprometido), avisando se o comprometido exceder o global.
  - O status inicial do item vem da **mesma fonte da aba Licitações** (`status_opcoes`
    `contexto='licitacao'`, opções manuais).
  - A aba **Emendas** não fica presa ao cadastro inicial: ela consolida o ciclo real do
    item a partir de `itens`, `itens_entregas`, `itens_entregas_unidades`,
    `empenhos`/`empenho_itens` e `notas_fiscais`/`nota_fiscal_itens`. AF emitida,
    aguardando AF, recebimento, confirmação na unidade, NF, empenho, patrimônio e data de
    entrega devem aparecer ali como reflexo do fluxo.
  - Modelo anterior (1 linha de `emendas` por unidade, com o valor dividido igualmente)
    foi **substituído**; emendas antigas multi-linha permanecem válidas.

## 3. Licitação / status por item

- O **status de licitação viaja por item** (`itens.status_lic_id`,
  `emenda_itens.status_id`), não pela emenda. A emenda apenas **lê** o status.
- Ao criar/editar processo, **Objeto é obrigatório** e não pode ser salvo vazio ou apenas
  com espaços.
- `status_opcoes` é o catálogo (com `ordem`, `contexto`, `orgao`, `automatico`).
- **A confirmar:** regra de "auto-trava" de status automáticos (campo `automatico`) e o
  conjunto canônico de status oficiais para "Controle de processos". Ver [DATABASE.md](DATABASE.md#status).

## 4. Contratos (matriz) e Atas

- `contratos` é a **matriz** de todo instrumento; `tipo_instrumento` ∈ {`CONTRATO`, `ATA`}.
- **Valores monetários**: usar sempre os campos numéricos `valor_inicial_num`,
  `valor_atual_num`, `valor_mensal_num` para cálculo. Os campos texto (`valor_inicial`,
  `valor_atual`, `valor_mensal`) são legado de exibição.
- **Edição completa de contrato é exclusiva de admin.**
- A aba **Atas Rp** é visão derivada da matriz; recarrega sempre (`loadAtas`) para refletir
  encerrar/prorrogar/editar feitos em Contratos. **Não é subaba de Contratos.**
- Ao salvar contrato `tipo=ATA`, os itens são **espelhados** para `atas_itens`
  (idempotente; `itens.ata_item_id` preenchido). Fonte de verdade da execução = aba Atas.
- Ao gerar contrato/ATA a partir de **ATA de Registro de Preços**, número do instrumento,
  data de início e seção são obrigatórios. O número do contrato/ATA deve conter somente
  dígitos, sem letras, barras, símbolos ou espaços.
- Na solicitação/execução de ATA com origem em **Emenda**, item de emenda já vinculado a
  outro processo/solicitação não pode ser selecionado nem salvo novamente. A lista deve
  mostrar item, quantidade e unidade para evitar vínculo errado.

## 5. Notas Fiscais (anti-duplicidade) {#notas-fiscais}

> Regra central de modelagem para **não somar o mesmo valor várias vezes**.

- Uma mesma NF **pode cobrir várias unidades/itens**.
- **`notas_fiscais.valor_total`** guarda o valor total da NF **uma única vez**.
- **`nota_fiscal_itens`** guarda o **rateio por item** (`valor_unitario`, `valor_total`,
  `quantidade`).
- **`itens_entregas_unidades`** (recebimento por unidade física) **referencia a NF
  (`nota_fiscal_id`) mas NÃO armazena valor** — a mesma NF pode repetir entre unidades sem
  que o sistema some o valor novamente. (Confirmado na migration `recebimento_por_unidade`.)
- Distinção de valores:
  | Nível | Onde |
  |---|---|
  | Valor total da NF | `notas_fiscais.valor_total` |
  | Valor por item (rateio) | `nota_fiscal_itens.valor_total` / `valor_unitario` |
  | Valor por unidade | **não existe** (proposital — evita soma indevida) |
- **Preferência:** NF cadastrada **uma única vez** e vinculada a itens/unidades.

## 6. Empenhos

- `empenhos` com `valor_empenhado`, `valor_anulado`, `saldo_empenho`.
- `empenho_itens` faz o vínculo/rateio (`valor_vinculado`, `quantidade_vinculada`) a
  emenda/item/item-físico.
- Para **ATA de Registro de Preços**, o empenho deve poder ser vinculado diretamente ao
  pedido/execução da ATA na subaba **Empenhos**. Esse vínculo já libera a emissão de AF no
  Controle de Entregas; não deve ser necessário vincular de novo nem digitar novamente
  quantidade/valor.
- O mesmo pedido de ATA não pode gerar dois vínculos financeiros simultâneos em
  `empenho_itens`. Ao trocar o empenho do pedido, o vínculo anterior deve ser substituído e
  o saldo dos empenhos afetados recalculado.
- No "gerar contrato" o empenho considera **fonte + emenda** (memória do projeto, lote
  27/06). **A confirmar** comportamento exato.

## 7. Recebimento de itens / AF

- AF de **aquisição** gera `itens_entregas` (autorizada vs. recebida).
- Na subaba **Controle de Entregas / Prazos**, aquisições com saldo de AF pendente ficam
  como "aguardando AF". Após emitir AF, o item **permanece** nesta subaba com os botões
  **Receber** e **Prazo**. O item só sai da subaba e entra em **Confirmação de Entrega na
  Unidade** após o recebimento interno ser confirmado (saldo da AF <= 0).
- A subaba **Confirmação de Entrega na Unidade** lista apenas aquisições que já passaram
  pelo recebimento interno (`qtde_recebida > 0` ou `data_recebimento` preenchida). O
  empenho exibido pode vir da entrega ou ser herdado de `empenho_itens`/`empenhos` pelo
  item/contrato.
- Confirmar a entrega na unidade grava `data_entrega_unidade`, responsável/cargo e termo em
  `itens_entregas`; a aba **Emendas** deve refletir esse item como entregue/confirmado na
  unidade e preencher a data de entrega derivada.
- AF de **ATA**: o botão "Emitir AF" no Controle de Entregas grava `af_numero`, `data_af`
  e `prev_entrega` em `atas_execucao`. O prazo de entrega não é digitado livremente na AF:
  ele é herdado de `atas_itens.prazo_entrega` (ou do item de origem vinculado) e a data
  limite é calculada por `data_af + prazo`. Após emitir, o item sai de "aguardando AF",
  libera o "Receber" e a aba **Emendas** reflete o estágio "AF emitida".
- AF de **ATA** e de **aquisição** exige empenho vinculado antes da emissão. Sem empenho, o
  sistema deve bloquear o botão/salvamento e orientar o usuário a usar **Vincular empenho**.
- Após emitir AF, o Controle de Entregas deve disponibilizar **Baixar AF em PDF** com os
  dados oficiais da autorização: número/data da AF, processo, contrato/ATA, fornecedor,
  CNPJ, empenho, item, quantidade, valores, unidade/local de entrega, prazo e responsável.
- Recebimento por unidade física: `itens_entregas_unidades` (patrimônio/série individuais
  por unidade; `unidade_seq` 1..N).
- Trigger `_sync_entrega_agregado` mantém `itens_entregas.patrimonio/numero_serie` como
  **agregado legado** (concatenação) — UI antiga continua lendo, sem duplicar a verdade.
- Gerar AF em lote e PDF: `abrirAFLote` (memória: implementado, aguardando validação).

## 8. Chamados

- Chamado **órfão sem controle** = tratado como **"não aberto"** — o sistema **não cria
  controle automaticamente**.
- **Chamados Antigos** = consulta do Google Sheets, **somente leitura** (não escrever).
- Controle interno em `chamados_controle`, chave de negócio `protocolo`
  (upsert `onConflict: protocolo`).
- Abertura pública via RPC `abrir_chamado_publico` (sem login).

## 9. Permissões (resumo)

- Dois papéis: **admin** (acesso total) e **usuário comum** (acesso 100% definido por
  caixinhas por aba em `user_tab_permissions`).
- Conta nova nasce só com **ver Emendas**; sem login vê apenas Emendas.
- `usuarios` e `cadastros` são **admin-only**; `planilhas` oculta por padrão.
- Detalhes em [SECURITY.md](SECURITY.md).

## 10. Sanções

- Solicitação (`sancoes_solicitadas` + snapshot dos itens em `sancao_itens`) e aplicação
  (`sancoes_administrativas`, `valor_multa`). Ligadas a `contratos` e itens de emenda.
- Geração de documento a partir do snapshot dos itens.

---

## Regras marcadas como "A confirmar"

| Tema | Pendência |
|---|---|
| ~~Rateio multi-unidade~~ | **Resolvido**: sem divisão igual. Emenda única com valor global; valor por unidade = unitário × qtde (definido nos itens). |
| Status auto-trava | Confirmar quais status são `automatico` e a regra de bloqueio. |
| Empenho no gerar-contrato | Confirmar uso exato de fonte + emenda. |
| Catálogo de status | Confirmar conjunto canônico ("26 status oficiais"). |

Ver acompanhamento em [TODO.md](TODO.md).
