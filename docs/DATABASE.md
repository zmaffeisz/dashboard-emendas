# Banco de Dados — migrations, views, funções e RLS

> Complementa [SCHEMA.md](SCHEMA.md). Foca em objetos não-tabela: migrations, views,
> funções, triggers, regras de integridade e RLS.
> Banco: PostgreSQL 17, Supabase nuvem `djtwoesmgeetnrztyvzw`, schema `public`.

## 1. Ambientes

| Artefato | Onde |
|---|---|
| **Produção (usada pelo app)** | Supabase nuvem `djtwoesmgeetnrztyvzw` (hardcoded no HTML) |
| `supabase/config.toml` | Configuração do stack **local** (porta DB 54322, API 54321, Studio 54323) — **não** usado pelo app |
| `schema_prod.sql` | Dump do schema de produção |
| `schema_local.sql` | Dump do schema local |
| `schema.sql` | Dump/baseline |
| `supabase/migrations/*.sql` | Migrations versionadas (algumas locais, algumas espelhadas em prod) |
| `migracao_emenda_itens.sql`, `supabase-unificar-atas-contratos.sql` | Scripts pontuais de migração |

> A análise/migração deve mirar a **nuvem**. O stack local existe na config mas não é o alvo de runtime.

## 2. Migrations aplicadas em produção

Listadas via `list_migrations` (ordem cronológica):

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

> Os arquivos em `supabase/migrations/` nem sempre têm o mesmo *naming* das versões
> aplicadas em prod (há arquivos `20260624_*`, `20260625_*`, `20260626_*` com nomes de
> "fases"). **A confirmar:** sincronização exata entre arquivos locais e o histórico
> aplicado na nuvem (alguns nomes diferem).

## 3. Views {#views}

### `vw_emendas_saldo`
Consolida o saldo de cada emenda a partir de `emenda_itens`:

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
| `is_approved_profile()` | `() → boolean` | Indica se o perfil atual está aprovado. |
| `abrir_chamado_publico(...)` | 20 args text | RPC pública usada por `chamado.html` para abrir chamado sem login. |
| `admin_delete_user(p_user_id uuid)` | | Exclusão de usuário (admin). |
| `fill_chamado_id_by_protocolo()` | | Preenche `chamado_id` a partir do `protocolo`. |
| `rls_auto_enable()` | | Habilita RLS automaticamente (hardening). |
| `_sync_entrega_agregado()` | trigger | Mantém `itens_entregas.patrimonio/numero_serie` agregados a partir de `itens_entregas_unidades`. |
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

- **`trg_ieu_sync`** em `itens_entregas_unidades` (AFTER INSERT/UPDATE/DELETE) → executa
  `_sync_entrega_agregado()`, reescrevendo `itens_entregas.patrimonio` e `numero_serie`
  como agregação (`string_agg`) das unidades. Mantém a UI antiga funcionando sem duplicar dado.
- **ON DELETE CASCADE** de `itens_entregas_unidades.entrega_id` → ao apagar a entrega,
  apagam-se as unidades.
- Demais relações usam FK padrão (ver lista completa §7).

## 6. RLS (Row Level Security) {#rls}

- RLS habilitada nas tabelas (hardening em `prod_hardening_revoke_anon_ciclo_itens` e
  `rls_auto_enable()`).
- Padrão de policy (exemplo de `itens_entregas_unidades`):
  - **SELECT** para `authenticated` usando `is_approved_profile()`.
  - **ALL (escrita)** condicionada a `can_access_tab('itens'|'contratos'|'dashboard'|'atas','edit')`.
- O `anon` foi **revogado** das tabelas do ciclo de itens (acesso público só pela RPC
  `abrir_chamado_publico`).

> Recomenda-se rodar `get_advisors` (security/performance) periodicamente — ver [SECURITY.md](SECURITY.md).

## 7. Chaves estrangeiras (completo) {#chaves-estrangeiras}

| Tabela | Coluna | → Tabela.coluna |
|---|---|---|
| atas_execucao | ata_item_id | atas_itens.id |
| atas_execucao | emenda_id | emendas.id |
| atas_execucao | emenda_item_id | emenda_itens.id |
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
