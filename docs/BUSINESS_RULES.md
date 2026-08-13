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
- Os dados centrais da emenda são editáveis somente por administradores. Como saldo,
  indicadores e seletores consultam `emendas` pela chave `emenda_id`, a atualização de
  `valor_cedido` passa a valer automaticamente em todas as leituras derivadas; não existe
  cópia separada do teto em cada item.
- Em `emenda_itens` há **dois pares de valores**: planejado
  (`vl_*_cadastrado`) e executado (`vl_*`).
  - Planejado: `vl_unitario_cadastrado` e `vl_total_cadastrado`.
  - Executado: `vl_unitario` e `vl_total`; a aba **Emendas** deve exibir ambos, não só o
    total executado. Quando `vl_total` não estiver preenchido, a exibição pode derivar o
    total executado por `qtde × vl_unitario`.
  - Quando já existe vínculo com `itens`, o estágio real do fluxo prevalece sobre campos
    legados: processo sem contrato aparece em **Vl. licit.**, sem **Total exec.**; após
    contrato ou solicitação de ATA, o contratado passa a alimentar a execução exibida.
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

- O **status detalhado da licitação viaja por item** (`itens.status_lic_id`), não pela
  emenda. `emenda_itens.status_id` permanece como categoria/fallback do cadastro.
  Enquanto o item ainda não possui contrato, a aba **Emendas** exibe o status manual
  definido em **Licitações em andamento**, e alterações feitas ali devem recarregar
  imediatamente o painel.
- A partir do vínculo do item com um contrato, o status manual da licitação deixa de
  prevalecer na aba **Emendas**. O andamento passa a ser derivado automaticamente do
  fluxo real: contrato, empenho, AF, recebimento e confirmação na unidade. O
  `status_lic_id` anterior pode permanecer armazenado como histórico, mas não deve
  substituir o status operacional.
- Quando a soma autorizada em AF for menor que a quantidade contratada, o andamento
  deve indicar **AF parcial — saldo aguardando AF**. Recebimento e confirmação também
  só são considerados totais quando alcançam a quantidade completa do item.
- Ao criar/editar processo, **Objeto é obrigatório** e não pode ser salvo vazio ou apenas
  com espaços.
- Em serviços mensais ou trimestrais de valor fixo, um item pode permanecer cadastrado com
  **quantidade zero**. Ele continua integrando a relação contratual, mas contribui com
  `R$ 0,00` para o cálculo estimado do período e do valor global.
- Novos processos do tipo **SEI** exigem uma URL pública `http/https`. Nas telas de
  Licitações e Emendas, o clique exato no identificador abre o SEI em nova aba sem
  disparar a expansão do card ou os detalhes do item; processos históricos sem URL
  exibem uma indicação de que não há link vinculado.
- Cada item de processo com natureza **Aquisição** ou **ATA de RP** deve possuir prazo de
  entrega em dias, inteiro e maior que zero. O processo não pode ser gravado enquanto
  houver item sem prazo válido, pois esse dado define o limite usado na emissão da AF.
- Itens ainda livres podem ser selecionados diretamente na aba **Emendas** para gerar uma
  licitação. O atalho abre um novo processo com natureza `AQUISIÇÃO`, preserva o vínculo
  de cada item com sua emenda e revalida antes da abertura se algum deles já foi usado em
  outro processo ou solicitação de ATA.
- `status_opcoes` é o catálogo (com `ordem`, `contexto`, `orgao`, `automatico`).
- **A confirmar:** regra de "auto-trava" de status automáticos (campo `automatico`) e o
  conjunto canônico de status oficiais para "Controle de processos". Ver [DATABASE.md](DATABASE.md#status).

## 4. Contratos (matriz) e Atas

- `contratos` é a **matriz** de todo instrumento; `tipo_instrumento` ∈ {`CONTRATO`, `ATA`}.
- **Valores monetários**: usar sempre os campos numéricos `valor_inicial_num`,
  `valor_atual_num`, `valor_mensal_num` para cálculo. Os campos texto (`valor_inicial`,
  `valor_atual`, `valor_mensal`) são legado de exibição.
- **Serviço mensal de valor fixo**: usar `periodicidade_pagamento = MENSAL` e
  `modelo_execucao = continuo_mensal_fixo`; a classificação exibida no filtro de modelo
  deriva desses campos padronizados.
- **Serviço trimestral de valor fixo**:
  - o contrato permanece vigente e disponível para chamados corretivos durante toda a
    vigência; chamados são ilimitados, não consomem saldo e não geram cobrança individual;
  - os ciclos de pagamento têm três meses e são contados desde a data inicial do contrato,
    independentemente dos trimestres do calendário;
  - o valor global é o valor trimestral multiplicado pela quantidade esperada de ciclos
    da vigência (por exemplo, 24 meses = 8 ciclos);
  - a execução, medição e NF podem ocorrer antes ou depois da data esperada, mas devem
    indicar o ciclo contratual correspondente;
  - a medição trimestral exige a data da preventiva/calibração e a referência do relatório
    de serviço; somente medição aprovada pela fiscalização pode receber NF;
  - reajustes, aditivos e supressões passam a valer, em regra, no próximo ciclo e seus
    impactos usam a quantidade de ciclos trimestrais restantes;
  - uma medição/NF por ciclo é o comportamento esperado, sem bloqueio rígido de exceções
    justificadas.
- **Edição completa de contrato é exclusiva de admin.**
- **Fiscalização de OS por demanda:** a medição e a NF podem incluir OS com situação
  `pendente`, além de `conforme`, `conforme_ressalva` e `parcial`. Gerar a medição não
  encerra nem congela a fiscalização: a situação da OS permanece editável e pode ser
  atualizada posteriormente, preservando os vínculos com medição, NF e termo de ateste.
- A listagem da Fiscalização identifica a empresa vinculada na abertura do chamado e
  mantém visível a descrição original do problema relatado em `chamados.descricao`.
- A aba **Atas Rp** é visão derivada da matriz; recarrega sempre (`loadAtas`) para refletir
  encerrar/prorrogar/editar feitos em Contratos. **Não é subaba de Contratos.**
- Ao salvar contrato `tipo=ATA`, os itens são **espelhados** para `atas_itens`
  (idempotente; `itens.ata_item_id` preenchido). Fonte de verdade da execução = aba Atas.
- Ao cadastrar item diretamente em uma ATA de Registro de Preços, o sistema também cria o
  espelho em `itens`, vinculado por `ata_item_id`, para a licitação reconhecer que ele já
  foi contratado. O espelho replica quantidade, valor unitário e prazo; saldo e execuções
  continuam exclusivamente em `atas_itens` e `atas_execucao`.
- Em toda criação ou edição administrativa de contrato/ATA, o número do instrumento é
  obrigatório. Ao gerar contrato/ATA a partir de **ATA de Registro de Preços**, também são
  obrigatórios a data de início e a seção; o número do contrato/ATA deve conter somente
  dígitos, sem letras, barras, símbolos ou espaços.
- Na solicitação/execução de ATA com origem em **Emenda**, item de emenda já vinculado a
  outro processo/solicitação não pode ser selecionado nem salvo novamente. A lista deve
  mostrar item, quantidade e unidade para evitar vínculo errado.
- `contratos.data_base_reajuste` é uma informação contratual opcional para todos os tipos
  de instrumento. Ela é exibida nos detalhes e, nas ATAs, também na lista de itens, mas
  não cria reajuste automaticamente.
- O reajuste de um item de ATA é versionado em `atas_item_reajustes`. O valor original de
  `atas_itens.valor_unit` é preservado; novas solicitações usam o último valor reajustado
  cuja vigência já tenha começado.
- Ao registrar um reajuste, a consulta de candidatas inclui AF posterior à vigência, NF
  emitida após a vigência e AF anterior ainda não recebida. A decisão de pagar a diferença
  permanece manual e pode ser feita depois, diretamente na execução.
- O pagamento complementar é gravado em `atas_execucao_reajustes`, sem alterar a AF, a NF
  ou o valor original de `atas_execucao`. A diferença é calculada por
  `(valor reajustado − valor unitário original da execução) × quantidade da execução`.
  O botão pertence à linha inteira: não há fracionamento do reajuste dentro da mesma
  execução.
- Empenho e número da NF do reajuste são obrigatórios e nunca são herdados da execução
  original. O número informado cria um novo registro em `empenhos`, pelo valor exato da
  diferença, e um vínculo integral em `empenho_itens`; portanto, esse empenho nasce sem
  saldo livre. O histórico fica vinculado à execução e é exibido no “Ver tudo”.
- Quando a fonte for **Emenda**, uma linha separada é criada em `emenda_itens`, com item,
  ATA/processo, empenho e NF identificados. Quando a fonte for **Recurso próprio**, não é
  criada linha em emenda. A mesma execução não pode receber duas vezes o mesmo reajuste.
- Prorrogar uma ATA não altera mais seu preço; reajuste e prorrogação são fluxos distintos.

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
- A aba **Notas Fiscais** é a central administrativa para cadastro antecipado de NFs de
  serviço e consulta de NFs de qualquer origem. Serviço, aquisição e ATA continuam usando
  a mesma tabela `notas_fiscais`.
- Uma medição de serviço deve selecionar uma NF previamente cadastrada no mesmo contrato
  cujo `medicao_id` ainda esteja vazio. Cada medição aceita no máximo uma NF e, depois do
  vínculo, a NF deixa de aparecer entre as opções disponíveis.
- Nas medições mensais e por demanda, `notas_fiscais.competencia` é a fonte única da
  competência: o valor é apenas exibido para conferência e copiado para a medição, sem
  entrada manual duplicada. A medição trimestral continua usando o ciclo contratual.
- O controle documental mensal considera contratos de manutenção que possuem
  `prefixo_chamado` e ainda não foram encerrados definitivamente. Contratos vencidos que
  permanecem ativos, exibidos como **Aguardando renovação**, continuam no controle.
- Itens do checklist podem valer para todos os contratos da seção ou para um contrato
  específico. As marcações usam o primeiro dia do mês como competência; a virada mensal
  cria um estado visual novo sem excluir o histórico dos meses anteriores.
- No recebimento, uma NF nova só pode ser cadastrada com seu arquivo anexado em PDF ou
  imagem. NF antiga sem anexo deve receber o arquivo antes de ser vinculada.
- No detalhe **Ver tudo** de uma unidade física, os anexos existentes da NF e do termo de
  entrega ficam disponíveis para download por link temporário, inclusive no modo público
  anônimo. Os buckets permanecem privados e a política libera somente arquivos vinculados
  a itens de Emendas expostos no fluxo público.
- No recebimento em lote, a NF e seu anexo são gravados uma única vez. Cada item conserva
  seu vínculo próprio com unidade, AF e empenho em `nota_fiscal_itens`; os itens precisam
  pertencer ao mesmo contrato, fornecedor e processo e representar o mesmo produto
  (descrição, marca e modelo). A gravação relacional do lote é atômica.

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
- No modal de gerar contrato, itens disponíveis cuja descrição seja equivalente
  (ignorando caixa, acentuação e espaços excedentes) são agrupados apenas na interface.
  A quantidade do card é a soma fixa das origens; marca, modelo e valor unitário são
  replicados para cada registro original no salvamento. Uma origem pode ser
  **desvinculada** do card para voltar à edição individual, inclusive para divisão parcial.
- O empenho permanece sempre vinculado ao item original. Em um card agrupado, o mesmo
  empenho pode ser aplicado somente às origens internas selecionadas; a ação coletiva
  cria um vínculo individual em `empenho_itens` para cada seleção e usa apenas a quantidade
  e o valor ainda não vinculados daquele item. Origens não selecionadas preservam seus
  próprios empenhos ou podem receber outro posteriormente.

## 7. Recebimento de itens / AF

- O encerramento de uma ATA pode ser integral, no contrato, ou seletivo, por item. Encerrar um item atualiza somente `atas_itens.status_contrato`; os demais itens do mesmo contrato permanecem vigentes e podem ser renovados/executados. O encerramento do contrato continua prevalecendo sobre todos os itens.

- O encerramento administrativo da ATA ou do item impede **novas solicitações**, mas não
  encerra uma execução já criada. Para acompanhamento operacional, uma linha de
  `atas_execucao` permanece `VIGENTE` enquanto `dt_entrega` estiver vazia, mesmo que a
  ATA/item de origem esteja encerrada. Ela deve continuar visível em Atas Rp nos filtros
  `VIGENTE` e `Todos` e no Controle de Entregas/Prazos. Somente após o recebimento
  (`dt_entrega` preenchida) a execução pode acompanhar a origem no filtro `ENCERRADO`.

- Ao renovar uma ATA com **reiniciar saldo**, nenhuma execução histórica é apagada. A renovação grava `atas_itens.saldo_reiniciado_em` para todos os itens do contrato; o saldo do ciclo renovado considera somente solicitações a partir desse marco.

- Uma solicitação de ATA pode ser excluída antes da AF somente se não houver AF/data/previsão, NF, recebimento, patrimônio, entrega na unidade, termo, unidade física ou sanção. `obs_prazo` isolada, inclusive de importação, é apenas informativa e não bloqueia a exclusão.

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
- O Controle de Entregas permite selecionar pelo menos dois itens de aquisição compatíveis
  e abrir um único modal de recebimento. Quantidade e patrimônios permanecem separados por
  item/unidade; data, responsável e nota fiscal são compartilhados pelo lote.
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
