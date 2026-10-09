# Banco de Dados — migrations, views, funções e RLS

> Complementa [SCHEMA.md](SCHEMA.md). Foca em objetos não-tabela: migrations, views,
> funções, triggers, regras de integridade e RLS.
> Banco: PostgreSQL 17, Supabase de produção `qpvgpfwuurqcqprnpxua` (`contratos-dag`), schema `public`.

## 1. Ambientes

### Importação de NFs legadas — processo 014/2024, 29/09/2026

Lote `legado-014-2024-20260929`, em produção `qpvgpfwuurqcqprnpxua`:
22 NFs e 22 medições de competência no contrato 703/2024 (`id=274`, processo 29),
de 2024-09 a 2026-06. Total R$ 267.302,93: NF 2042 de setembro/2024 por
R$ 5.810,93 e as demais por R$ 12.452,00 cada. Números, por competência:
2042, 2060, 2078, 2093, 2106, 2117, 2148, 2162, 2180, 2193, 2209,
2227, 2242, 2257, 2275, 4, 22, 45, 64, 78, 94 e 108.

Fonte: quatro imagens de planilha fornecidas pelo usuário. O usuário confirmou
que todas já estavam atestadas/aprovadas; NFs em `aprovada`, medições em
`aprovada_pelo_fiscal`. Não foram inventados fiscal, data de ateste, retenções,
pagamento, PDFs ou ordens de serviço. Como `data_medicao` é obrigatória, foi usada
a data da importação, com ressalva explícita em cada medição. As seis datas de
emissão de janeiro a junho/2026 não estavam visíveis e permanecem nulas.
Valores transcritos sem aplicar os reajustes atuais ao legado; sem glosa informada.

Execução transacional com trava do contrato e checagem prévia de número/competência.
Verificação: 22 vínculos válidos, zero divergências com a transcrição e soma
R$ 267.302,93. NF 128 (julho/2026, aprovada), NF 153 (agosto/2026, recebida)
e medição preexistente preservadas. Identificação do lote em `origem_codigo`,
`raw_data` e observações; não houve alteração de schema.

| Artefato | Onde |
|---|---|
| **Produção (usada pelo app)** | Supabase nuvem `qpvgpfwuurqcqprnpxua` (`contratos-dag`) |
| `supabase/config.toml` | Configuração do stack **local** (porta DB 54322, API 54321, Studio 54323) — **não** usado pelo app |
| `schema_prod.sql` | Dump do schema de produção |
| `schema_local.sql` | Dump do schema local |
| `schema.sql` | Dump/baseline |
| `supabase/migrations/*.sql` | Migrations versionadas (algumas locais, algumas espelhadas em prod) |
| `migracao_emenda_itens.sql`, `supabase-unificar-atas-contratos.sql` | Scripts pontuais de migração |

> A análise/migração deve mirar a **nuvem**. O stack local existe na config mas não é o alvo de runtime.

## 2. Migrations aplicadas em produção

### Regularização pontual de dados — 29/09/2026

No projeto `qpvgpfwuurqcqprnpxua`, os 47 registros de
`processos.servico_mensal_itens` do processo 038/2021 (`id=36`) foram
materializados em `itens`, com origem `servico_mensal`, status `contratado` e
vínculo ao contrato 374/2021 (`id=273`). A operação foi transacional, com bloqueio
dos registros de origem e destino e exigência de ausência de itens anteriores.
Não houve alteração de schema nem criação de outro contrato.

Verificação após a gravação: 47 itens vinculados, nenhuma divergência de descrição,
quantidade ou preço em relação à origem, nenhum item pendente de contratação e
12 linhas com quantidade zero preservadas. A soma mensal é R$ 8.468,87
(R$ 203.252,88 em 24 meses); os valores históricos do contrato permanecem
R$ 178.237,92 inicial/atual e R$ 7.789,52 mensal, pendentes de conciliação.
O JSON de origem e o status do contrato foram preservados. O filtro existente de
Licitações oculta processos cujos itens estão todos contratados; não foi usado
encerramento por fracasso/deserção.

Na mesma data, o processo 014/2024 (`id=29`) recebeu a mesma regularização:
10 itens de `servico_mensal_itens` materializados e vinculados ao contrato
703/2024 (`id=274`), com origem `servico_mensal` e status `contratado`.
A transação também exigiu ausência de itens anteriores e bloqueou processo e
contrato. A conferência confirmou 10 vínculos, nenhuma divergência de descrição,
quantidade ou preço e nenhum item pendente de contratação. Soma mensal dos itens:
R$ 13.502,10 (R$ 324.050,40 em 24 meses). Valores históricos preservados:
R$ 298.848,00 inicial/atual e R$ 12.452,00 mensal; conciliação pendente.
O JSON de origem e o status do contrato foram mantidos, sem alteração de schema.

**Reversão do 014/2024 na mesma data, a pedido do usuário:** os 10 itens criados
na operação foram excluídos após conferir que não tinham registros dependentes.
A lista `servico_mensal_itens` foi esvaziada e os campos `valor_estimado`,
`servico_mensal_valor_mensal` e `servico_mensal_valor_global` foram limpos para
recadastro dos preços unitários iniciais. Prazo de 24 meses e demais dados do
processo mantidos. Contrato 703/2024, seus valores históricos e a regularização
do 038/2021 preservados. Conferência: zero itens no processo/contrato 014/2024,
lista mensal vazia e os 47 vínculos do 038/2021 mantidos.

**Reaplicação do 014/2024 após correção pelo usuário:** os 10 itens corrigidos
foram novamente materializados e vinculados ao contrato 703/2024 em transação,
exigindo ausência de itens anteriores e conferência dos totais contra o contrato.
Verificação posterior: nenhuma divergência de descrição, quantidade ou preço,
10 itens contratados, nenhum pendente, R$ 12.452,00 mensais e R$ 298.848,00
em 24 meses. A divergência anterior foi resolvida pelo recadastro dos preços.
Os dados e valores históricos do contrato foram preservados.

Listadas via `list_migrations` (ordem cronológica):

Regularização complementar em 29/09/2026: após os reajustes lançados pelo usuário
no contrato 703/2024 (`id=274`), seus 10 itens somavam R$ 13.502,10 mensais, mas
`valor_mensal_num` permanecia em R$ 12.452,00. Foram sincronizados
`valor_mensal_num`, `valor_mensal` e `valor_periodico_num` para R$ 13.502,10.
Operação transacional com bloqueio e conferência da soma, sem alterar itens,
histórico, valor inicial (R$ 298.848,00) ou global persistido (R$ 313.919,12).

| Versão | Nome |
|---|---|
| 20260624015111 | `add_natureza_e_status_processo` |
| 20260624015131 | `recreate_vw_processos_resumo_com_natureza` |
| 20260624030952 | `fase0_itens_e_itens_entregas` |
| 20260625005604 | `fase3_gera_mais_contratos` |
| 20260626003351 | `prod_fase6_empenhos_notas_fiscais` |
| 20260626003409 | `prod_fase9_itens_marca_modelo` |
| 20260626003419 | `prod_fase5_6_9_itens_entregas_cols` |
| 20260626003429 | `prod_fase7_12_atas_execucao_cols` |
| 20260626003500 | `prod_fase7_bucket_termos_entrega` |
| 20260626005152 | `prod_hardening_revoke_anon_ciclo_itens` |
| 20260626010320 | `prod_revisao_cadastros` |
| 20260626030755 | `fase8_numero_despesa` |
| 20260626173643 | `fase0_mover_backups_para_schema_backup` |
| 20260626174300 | `fase1_parlamentar_id_e_unidade_chamados` |
| 20260626180652 | `fase2_emenda_itens_status_id` |
| 20260626183854 | `fase4_data_entrega_date_e_contratos_valores_num` |
| 20260626191113 | `fase5_drop_inventario_ac_contrato_morto` |
| 20260626224200 | `recebimento_por_unidade` |
| 20260626224428 | `recebimento_por_unidade_search_path` |
| 20260628141120 | `atas_execucao_af_numero` — coluna `af_numero` em `atas_execucao` (Emitir AF de ATA) |
| 20260723192606 | `servico_trimestral_fixo` — periodicidade trimestral em processos, contratos, vigências, histórico e medições |
| 20260730211951 | `ata_reajustes_e_data_base` — data-base dos contratos, histórico de preço e pagamento complementar por execução de ATA |
| 20260730212030 | `indexar_fks_ata_reajustes` — índices das relações organizacionais e de emenda dos reajustes |
| 20260730220523 | `criar_empenho_obrigatorio_reajuste_ata` — exige novo empenho e NF, cria o empenho e vincula integralmente a diferença |
| 20260813213015 | `planejamento_emendas_ata_em_licitacao` — vínculo não orçamentário de Emenda com futura Ata, RLS e sincronização com requisição |
| 20260813213102 | `indexar_planejamento_emendas_ata` — índices das relações do planejamento |
| 20260813213230 | `corrigir_validacao_planejamento_ata` — validação da correspondência entre item licitado e item formalizado da Ata |
| 20260813213648 | `liberar_fluxo_publico_planejamento_ata` — leitura limitada do planejamento pela aba pública de Emendas |
| 20260813213831 | `corrigir_reabertura_planejamento_ata` — reabre o planejamento ao excluir uma requisição ainda removível |
| 20260814193014 | `individualizar_inventario_unidades_fisicas` — materializa uma linha por unidade recebida, inclusive sem patrimônio/série, e protege quantidade física igual a 1 |
| 20260818202216 | `excluir_caronas_do_inventario` — preserva o recebimento operacional de Caronas, mas impede sua incorporação e movimentação no Inventário da Saúde |
| 20260825133433 | `fluxo_itens_licitacao_fracassados_desertos` — eventos imutáveis de fracasso/deserção, documentos privados, bloqueio definitivo do item e reflexo no saldo da Emenda |
| 20260825134011 | `indexar_criador_ocorrencias_licitacao` — índice da relação entre ocorrência e usuário autor |
| 20260827152129 | `adicionar_codigo_siam_itens` — código opcional do catálogo SIAM em itens licitados e itens de ATA, com validação e índices de consulta |
| 20260828204740 | `adicionar_unidade_medida_itens_licitacao` — unidade de medida pesquisável e personalizável nos itens licitados |
| 20260828213724 | `adicionar_unidade_medida_atas_itens` — unidade de medida nos itens de ATA, com recuperação a partir dos itens espelhados |
| 20260830220942 | `marcar_itens_ata_em_tramite_renovacao` — estado e data do acompanhamento de renovação por item da Ata |
| 20260830223355 | `planejar_encerramento_itens_ata` — decisão exclusiva de encerrar o item ao fim da vigência, com data de marcação |
| 20260830230436 | `restringir_edicao_operacional_contratos` — protege dados cadastrais e seção para admin e cria RPCs auditadas para os campos operacionais permitidos |
| 20260901003150 | `categorias_licitacao_e_propagacao` — cadastro mestre, 25 opções iniciais, RLS, vínculos e propagação para processo/item/contrato/ATA |
| 20260901003312 | `corrigir_trigger_categoria_licitacao` — restringe a leitura dos campos de origem ao tipo correto de cada gatilho compartilhado |
| 20260901004527 | `classificar_contratacoes_existentes` — classifica por inferência os 99 processos históricos e propaga a categoria para itens, contratos e itens de ATA |
| 20260901005743 | `ampliar_categorias_e_reclassificar_dmmhf` — adiciona 11 categorias específicas da DMMHF, reclassifica vínculos inequívocos e remove inferências conflitantes |
| 20261008234849 | `rateio_financeiro_itens_licitacao` — separa o item comprado das parcelas principal/complementares de emendas, preserva cancelamentos justificados e recalcula o saldo |
| 20261009000444 | `bloquear_rateio_apos_formalizacao` — torna as parcelas imutáveis depois de contrato/Ata, ocorrência ou início da entrega |
| 20261009002734 | `migrar_complementos_legados` — converte oito itens artificiais de complemento em parcelas financeiras dos respectivos itens reais, preservando valores e históricos |
| 20261009005009 | `permitir_complementos_outras_fontes` — amplia o rateio para Fonte 01 e outras fontes sem criar espelho em `emenda_itens` |

> Os arquivos em `supabase/migrations/` nem sempre têm o mesmo *naming* das versões
> aplicadas em prod (há arquivos `20260624_*`, `20260625_*`, `20260626_*` com nomes de
> "fases"). **A confirmar:** sincronização exata entre arquivos locais e o histórico
> aplicado na nuvem (alguns nomes diferem).

## 3. Views {#views}

### `vw_emendas_saldo`
Consolida o saldo de cada emenda a partir de `emenda_itens`:

Desde a migration `fluxo_itens_licitacao_fracassados_desertos`, a view também desconta
do comprometimento os itens encerrados, preserva seus valores históricos de licitação e
expõe `total_ocorrencias_negativas` e `qtd_itens_ocorrencia`. O `total_executado` exibido
é o contratado menos o valor encerrado, permitindo representar a liberação como negativo.

Desde `rateio_financeiro_itens_licitacao`, itens vinculados usam
`licitacao_item_recursos.valor_alocado`: parcelas ativas compõem o comprometimento e
parcelas canceladas aparecem no histórico negativo sem consumir saldo. O caminho legado
continua valendo apenas para itens ainda sem rateio.

```sql
SELECT e.id, e.emenda AS numero_emenda, e.ano, e.tipo, e.parlamentar,
       e.sei_emenda, e.unidade, e.valor_cedido,
       COALESCE(sum(i.vl_total_cadastrado),0)  AS total_planejado,
       COALESCE(sum(i.vl_total),0)             AS total_executado,
       COALESCE(sum(CASE WHEN i.vl_total > 0 THEN i.vl_total
                         ELSE COALESCE(i.vl_total_cadastrado,0) END),0) AS total_comprometido,
       e.valor_cedido - (total_comprometido)   AS saldo_remanescente,
       CASE WHEN e.valor_cedido IS NULL THEN NULL
            WHEN sum(i.vl_total) >= e.valor_cedido*0.99 THEN 'Executada'
            WHEN sum(i.vl_total) > 0 THEN 'Em andamento'
            ELSE 'Não iniciada' END            AS status_execucao,
       count(i.id) AS qtd_itens
FROM emendas e LEFT JOIN emenda_itens i ON i.emenda_id = e.id
GROUP BY e.id;
```

- **Planejado** = soma de `vl_total_cadastrado`.
- **Executado** = soma de `vl_total`.
- **Comprometido** = executado quando há valor executado, senão planejado (não soma os dois → evita duplicidade).
- **Status** "Executada" com tolerância de 1% (`>= valor_cedido * 0.99`).

### `vw_processos_resumo`
Resumo de processos (inclui `status`, `valor_estimado`, e `natureza` — recriada na migration `recreate_vw_processos_resumo_com_natureza`).

## 4. Funções (RPC e internas)

| Função | Assinatura | Papel |
|---|---|---|
| `can_access_tab(p_tab, p_action)` | `(text, text) → boolean` | **Autorização central** usada nas policies RLS. Ver §6. |
| `private.can_access_secao(p_secao_id)` | `(bigint) → boolean` | Limita a linha ao contexto global/divisão/seção permitido ao perfil atual. |
| `is_approved_profile()` | `() → boolean` | Indica se o perfil atual está aprovado. |
| `abrir_chamado_publico(...)` | 20 args text | RPC pública usada por `chamado.html` para abrir chamado sem login. |
| `admin_delete_user(p_user_id uuid)` | | Exclusão de usuário (admin). |
| `fill_chamado_id_by_protocolo()` | | Preenche `chamado_id` a partir do `protocolo`. |
| `rls_auto_enable()` | | Habilita RLS automaticamente (hardening). |
| `registrar_reajuste_item_ata(...)` | item, vigência, percentual, novo valor e observação | Registra uma versão de preço do item sem sobrescrever o valor original. |
| `registrar_reajuste_execucao_ata(...)` | reajuste, execução, fonte, emenda, quantidade, empenho e NF | Grava atomicamente o complemento e, quando aplicável, a linha executada na emenda. |
| `salvar_licitacao_item_recursos(...)` | item e array JSONB de parcelas | Cria/atualiza o rateio; gera `emenda_itens` apenas quando o complemento é outra emenda. |
| `cancelar_licitacao_item_recurso(...)` | parcela e justificativa | Cancela complemento sem apagar o histórico e libera o saldo. |
| `registrar_movimentacao_inventario(...)` | unidade física, tipo, data, destino/responsáveis e documento | Acrescenta o evento e atualiza atomicamente o estado corrente do item. |
| `registrar_recebimento_aquisicao_lote(...)` | nota e itens em JSONB | Valida/classifica o tipo de material e grava atomicamente NF, rateios e recebimentos; bens permanentes preenchem por `upsert` as sequências físicas materializadas pelo trigger, sem duplicá-las. |
| `obter_dados_operacionais_contrato(...)` | contrato | Retorna somente os campos do editor operacional e informa se a data-base já foi bloqueada por reajuste. |
| `atualizar_dados_operacionais_contrato(...)` | contrato e JSONB | Atualiza apenas e-mails, prefixo, contato e data-base permitida; acrescenta mudanças e observações ao histórico. |
| `_sync_entrega_agregado()` | trigger | Mantém `itens_entregas.patrimonio/numero_serie` agregados a partir de `itens_entregas_unidades`. |
| `_validar_classificacao_recebimento()` | trigger | Exige `PERMANENTE`/`CONSUMO`, restringe patrimônio a permanentes e impede fluxo de unidade para consumo. |
| `_unidade_key(p text)` | | Normalização de chave de unidade. |

### `can_access_tab` (autorização)

```sql
-- Resumo do comportamento:
-- 1. auth.uid() nulo → false
-- 2. perfil não aprovado → false
-- 3. papel = 'admin' → true
-- 4. senão, consulta user_tab_permissions (user_id, tab_key):
--    action 'view' → can_view = true
--    action 'edit' → can_view AND can_edit
--    sem registro → false
```

## 5. Triggers e integridade

- **`proteger_identidade_contrato`** em `contratos` (BEFORE UPDATE) bloqueia para
  não administradores alterações diretas nos dados cadastrais, na seção, no modelo e
  nos valores iniciais; também impede corrigir a data-base depois do primeiro reajuste.
- **`trg_ieu_sync`** em `itens_entregas_unidades` (AFTER INSERT/UPDATE/DELETE) → executa
  `_sync_entrega_agregado()`, reescrevendo `itens_entregas.patrimonio` e `numero_serie`
  como agregação (`string_agg`) das unidades. Mantém a UI antiga funcionando sem duplicar dado.
- **ON DELETE CASCADE** de `itens_entregas_unidades.entrega_id` → ao apagar a entrega,
  apagam-se as unidades.
- **`trg_sincronizar_inventario_unidade_*`** cria/atualiza o estado inicial quando uma
  unidade física nasce em aquisição ou ATA. **`trg_proteger_inventario_*`** bloqueia
  alteração direta do estado e do histórico fora do RPC transacional; a existência do
  documento é validada somente no `INSERT` de `inventario_movimentacoes`, pois
  `inventario_unidades` não possui `documento_path`.
- **`trg_materializar_unidades_*`** cria linhas físicas somente quando `tipo_material =
  'PERMANENTE'`; **`trg_bloquear_unidade_fisica_consumo`** rejeita inserção direta de
  unidades para materiais de consumo.
- Demais relações usam FK padrão (ver lista completa §7).

## 6. RLS (Row Level Security) {#rls}

- RLS habilitada nas tabelas (hardening em `prod_hardening_revoke_anon_ciclo_itens` e
  `rls_auto_enable()`).
- Padrão de policy (exemplo de `itens_entregas_unidades`):
  - **SELECT** para `authenticated` combina permissão de aba e seção visível.
  - **Escrita** combina `can_access_tab(..., 'edit')` com
    `private.can_access_secao(secao_id)` por meio de `private.can_access_domain(...)`.
- `divisoes` agrupa `secoes`; registros operacionais continuam armazenando somente
  `secao_id`. Assim, uma nova divisão não exige regravar contratos ou históricos.
- Chefias respeitam `profiles.divisao_id` e podem alternar o contexto entre a divisão e
  suas seções. Administradores podem usar `global`, uma divisão ou uma seção.
- O `anon` permanece revogado do ciclo operacional em geral, mas possui policies
  `SELECT` estritas para as linhas comprovadamente vinculadas a `emenda_itens`, pois a
  aba Emendas é pública. Isso inclui o fluxo derivado de licitação, contratos, empenhos,
  notas fiscais, entregas, patrimônios/séries e ATAs. Nos catálogos auxiliares,
  `secretarias` e `status_opcoes` expõem somente os registros referenciados por esse
  fluxo público. Escritas e a navegação das demais abas continuam restritas.
- `inventario_unidades`, `inventario_movimentacoes` e o bucket privado
  `inventario-movimentacoes` exigem usuário autenticado e permissões das abas Inventário ou
  Emendas para leitura; somente quem edita Inventário registra operações.

> Recomenda-se rodar `get_advisors` (security/performance) periodicamente — ver [SECURITY.md](SECURITY.md).

## 7. Chaves estrangeiras (completo) {#chaves-estrangeiras}

| Tabela | Coluna | → Tabela.coluna |
|---|---|---|
| atas_execucao | ata_item_id | atas_itens.id |
| atas_execucao | emenda_id | emendas.id |
| atas_execucao | emenda_item_id | emenda_itens.id |
| ata_planejamento_emendas | processo_id | processos.id |
| ata_planejamento_emendas | processo_item_id | itens.id |
| ata_planejamento_emendas | emenda_id | emendas.id |
| ata_planejamento_emendas | emenda_item_id | emenda_itens.id |
| ata_planejamento_emendas | contrato_id | contratos.id |
| ata_planejamento_emendas | ata_item_id | atas_itens.id |
| ata_planejamento_emendas | ata_execucao_id | atas_execucao.id |
| atas_itens | contrato_id | contratos.id |
| chamados | contrato_id | contratos.id |
| chamados | unidade_id | unidades.id |
| chamados_anexos | chamado_id | chamados.id |
| chamados_controle | chamado_id | chamados.id |
| chamados_controle | contrato_id | contratos.id |
| contratos | fornecedor_id | fornecedores.id |
| contratos | processo_id | processos.id |
| contratos_fiscalizadores | contrato_id | contratos.id |
| contratos_historico | contrato_id | contratos.id |
| contratos_vigencias | contrato_id | contratos.id |
| emenda_itens | emenda_id | emendas.id |
| emenda_itens | processo_id | processos.id |
| emenda_itens | status_id | status_opcoes.id |
| emenda_itens | unidade_beneficiada_id | unidades.id |
| emenda_itens | unidade_entrega_id | unidades.id |
| emendas | parlamentar_id | parlamentares.id |
| emendas | unidade_id | unidades.id |
| empenho_itens | emenda_id / emenda_item_id / empenho_id / item_id | emendas / emenda_itens / empenhos / itens |
| empenhos | contrato_id / emenda_id / fornecedor_id / processo_id | respectivas |
| fiscalizacao_historico | chamado_id | chamados.id |
| fornecedor_contatos | fornecedor_id | fornecedores.id |
| inventario_ac | emenda_item_id / unidade_id | emenda_itens / unidades |
| itens | ata_item_id / contrato_id / emenda_id / emenda_item_id / fornecedor_id / item_origem_id / processo_id / status_lic_id / unidade_destino_id | respectivas (item_origem_id → itens.id) |
| itens_entregas | empenho_id / item_id / nota_fiscal_id | empenhos / itens / notas_fiscais |
| itens_entregas_unidades | entrega_id / item_id / nota_fiscal_id | itens_entregas / itens / notas_fiscais |
| itens_status_historico | item_id / status_id | itens / status_opcoes |
| nota_fiscal_itens | nota_fiscal_id / item_id / emenda_id / emenda_item_id / empenho_id | respectivas |
| notas_fiscais | contrato_id / emenda_id / fornecedor_id / processo_id | respectivas |
| nf_checklist_documento_contratos | documento_id / contrato_id | nf_checklist_documentos / contratos |
| nf_checklist_marcacoes | contrato_id / documento_id | contratos / nf_checklist_documentos |
| pessoas | usuario_id | profiles.id |
| sancao_itens | emenda_item_id / sancao_id | emenda_itens / sancoes_solicitadas |
| sancoes_administrativas | contrato_id | contratos.id |
| sancoes_solicitadas | contrato_id | contratos.id |
| termo_chamados | chamado_id / termo_id | chamados / termos_ateste |
| termo_contratos | contrato_id / termo_id | contratos / termos_ateste |
| termos_ateste | contrato_id | contratos.id |
| user_tab_permissions | user_id | profiles.id |

## 8. Catálogo de status {#status}

`status_opcoes` (colunas: `id, contexto, nome, ordem, ativo, created_at, orgao, automatico`)
guarda os status usados por emendas/itens/processos/contratos. Há **dezenas** de status
(numéricos por `ordem`), incluindo grupos por órgão (ex.: `SES – ...`, `SEAD – ...`,
`CONTROLADORIA – ...`) e os status de ciclo de licitação (1=Em planejamento … 20=Aguardando
entrega/VIGENTE … 25=Cancelado).

> **A confirmar:** a memória do projeto cita "26 status oficiais" e regra de auto-trava
> (status 21–26 automáticos via `automatico`). O catálogo real em prod tem mais linhas
> (com `contexto`/`orgao` variados). Validar quais status são canônicos para "Controle de
> processos". Ver [TODO.md](TODO.md).
