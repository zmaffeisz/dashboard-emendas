-- =====================================================================
-- MIGRAÇÃO: emenda_itens  ->  itens (+ notas_fiscais / empenhos / entregas)
-- Projeto Supabase nuvem deste clone de teste: qpvgpfwuurqcqprnpxua (contratos-dag)
-- Gerado em 2026-06-26
--
-- SEGURANÇA:
--   * Roda TUDO dentro de UMA transação que termina em ROLLBACK.
--   * Rodando o arquivo como está => NADA é gravado; só mostra as contagens.
--   * Para efetivar: troque o "ROLLBACK;" final por "COMMIT;".
--   * Idempotente: usa NOT EXISTS em itens.emenda_item_id, então rodar 2x
--     não duplica.
--
-- ESCOPO desta migração:
--   - Migra APENAS o balde automático (limpo + parser) ~1.238 linhas.
--   - As ~201 linhas "precisa humano" são DELIBERADAMENTE puladas (mesmo
--     predicado de classificação no WHERE). Elas saem na consulta final
--     para você revisar à mão.
--   - NÃO tenta vincular contrato_id (CPL é texto fuzzy) — fica p/ 2ª passada.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Classificação: marca cada emenda_item como humano (pular) ou auto.
--    Mesmo critério usado na análise. Materializa parsing de NF/empenho.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _mig AS
SELECT
  ei.*,
  -- bandeira: precisa de humano? (então NÃO migra aqui)
  (
       coalesce(trim(ei.item),'') = ''
    OR length(coalesce(ei.status,'')) > 60
    OR (coalesce(trim(ei.empenho),'') <> '' AND ei.empenho ~* '[;,]| A |REEMPENHO|/26\)|\(0')
    OR (coalesce(trim(ei.nota_fiscal),'') <> '' AND ei.nota_fiscal !~ '[0-9]')
  ) AS precisa_humano,
  -- NF normalizada: remove prefixo "NF", pega o 1º grupo de dígitos
  NULLIF(substring(regexp_replace(coalesce(ei.nota_fiscal,''), '(?i)^\s*nf[ºo°.:\- ]*', '') from '[0-9]+'), '') AS nf_num,
  -- Empenho normalizado (apenas valores simples; múltiplos já caíram p/ humano)
  NULLIF(substring(coalesce(ei.empenho,'') from '[0-9]{3,}'), '') AS emp_num,
  -- status do item (texto) derivado da categoria status_id
  CASE ei.status_id
    WHEN 55 THEN 'entregue'        -- ENTREGUE
    WHEN 53 THEN 'contratado'      -- AF EMITIDA
    WHEN 54 THEN 'contratado'      -- EM CARONA
    WHEN 50 THEN 'em licitação'    -- EM LICITAÇÃO
    WHEN 49 THEN 'em licitação'    -- EM ANDAMENTO
    WHEN 60 THEN 'em licitação'    -- SEGOV
    WHEN 61 THEN 'em licitação'    -- CONTROLE INTERNO
    WHEN 51 THEN 'aguardando'      -- AGUARDANDO RESERVA
    WHEN 48 THEN 'aguardando'      -- SEM STATUS
    WHEN 56 THEN 'fracassado'      -- FRACASSADO
    WHEN 57 THEN 'cancelado'       -- CANCELADO
    WHEN 58 THEN 'suspenso'        -- SUSPENSO
    WHEN 59 THEN 'transferido'     -- TRANSFERIDO TI
    ELSE 'em licitação'
  END AS item_status
FROM emenda_itens ei;

-- ---------------------------------------------------------------------
-- 1) itens  (1 linha de item por emenda_item automático)
-- ---------------------------------------------------------------------
INSERT INTO itens (
  origem, fonte_tipo, fonte_descricao, emenda_id, emenda_item_id,
  descricao, qtde, valor_estimado, valor_contratado,
  unidade_destino_id, processo_id, status, observacoes, created_at
)
SELECT
  'aquisicao',
  'emenda',
  m.emenda,
  m.emenda_id,
  m.id,
  m.item,
  coalesce(m.qtde, m.qtde_cadastrada, 0),
  m.vl_unitario,
  CASE WHEN m.item_status IN ('contratado','entregue')
       THEN coalesce(m.vl_unitario_cadastrado, m.vl_unitario) END,
  m.unidade_beneficiada_id,
  m.processo_id,
  m.item_status,
  -- preserva a rastreabilidade do legado dentro do item
  concat_ws(' | ',
    'migrado de emenda_itens ' || m.id::text,
    NULLIF('CPL: ' || coalesce(m.cpl,''), 'CPL: '),
    NULLIF('status_legado: ' || coalesce(m.status,''), 'status_legado: ')
  ),
  coalesce(m.created_at, now())
FROM _mig m
WHERE m.precisa_humano = false
  AND NOT EXISTS (SELECT 1 FROM itens i WHERE i.emenda_item_id = m.id);

-- ---------------------------------------------------------------------
-- 2) notas_fiscais (deduplicadas por número normalizado) + vínculo
-- ---------------------------------------------------------------------
INSERT INTO notas_fiscais (numero, numero_normalizado, emenda_id, status, observacoes)
SELECT DISTINCT ON (m.nf_num)
  m.nf_num, m.nf_num, m.emenda_id, 'recebida', 'migrado de emenda_itens.nota_fiscal'
FROM _mig m
WHERE m.precisa_humano = false
  AND m.nf_num IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM notas_fiscais nf WHERE nf.numero_normalizado = m.nf_num)
ORDER BY m.nf_num, m.created_at;

INSERT INTO nota_fiscal_itens (nota_fiscal_id, item_id, emenda_id, emenda_item_id, quantidade)
SELECT nf.id, i.id, m.emenda_id, m.id, coalesce(m.qtde, m.qtde_cadastrada)
FROM _mig m
JOIN itens i           ON i.emenda_item_id = m.id
JOIN notas_fiscais nf  ON nf.numero_normalizado = m.nf_num
WHERE m.precisa_humano = false
  AND m.nf_num IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM nota_fiscal_itens x WHERE x.emenda_item_id = m.id AND x.nota_fiscal_id = nf.id);

-- ---------------------------------------------------------------------
-- 3) empenhos (dedup por número) + vínculo  (só valores simples)
-- ---------------------------------------------------------------------
INSERT INTO empenhos (numero, numero_normalizado, emenda_id, status, observacoes)
SELECT DISTINCT ON (m.emp_num)
  m.emp_num, m.emp_num, m.emenda_id, 'emitido', 'migrado de emenda_itens.empenho'
FROM _mig m
WHERE m.precisa_humano = false
  AND m.emp_num IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM empenhos e WHERE e.numero_normalizado = m.emp_num)
ORDER BY m.emp_num, m.created_at;

INSERT INTO empenho_itens (empenho_id, item_id, emenda_id, emenda_item_id, quantidade_vinculada)
SELECT e.id, i.id, m.emenda_id, m.id, coalesce(m.qtde, m.qtde_cadastrada)
FROM _mig m
JOIN itens i      ON i.emenda_item_id = m.id
JOIN empenhos e   ON e.numero_normalizado = m.emp_num
WHERE m.precisa_humano = false
  AND m.emp_num IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM empenho_itens x WHERE x.emenda_item_id = m.id AND x.empenho_id = e.id);

-- ---------------------------------------------------------------------
-- 4) itens_entregas  (só para itens ENTREGUE com evidência de recebimento)
-- ---------------------------------------------------------------------
INSERT INTO itens_entregas (
  item_id, nota_fiscal, patrimonio, qtde_recebida, qtde_autorizada,
  data_recebimento, data_entrega_unidade, status,
  empenho_id, nota_fiscal_id, af_obs
)
SELECT
  i.id,
  m.nota_fiscal,
  m.patrimonio,
  coalesce(m.qtde, m.qtde_cadastrada),
  coalesce(m.qtde, m.qtde_cadastrada),
  m.data_entrega,
  m.data_entrega,
  'recebido',
  e.id,
  nf.id,
  'migrado de emenda_itens'
FROM _mig m
JOIN itens i          ON i.emenda_item_id = m.id
LEFT JOIN notas_fiscais nf ON nf.numero_normalizado = m.nf_num
LEFT JOIN empenhos e       ON e.numero_normalizado  = m.emp_num
WHERE m.precisa_humano = false
  AND m.item_status = 'entregue'
  AND (m.nf_num IS NOT NULL OR m.patrimonio IS NOT NULL OR m.data_entrega IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM itens_entregas x WHERE x.item_id = i.id);

-- ---------------------------------------------------------------------
-- 5) DRY-RUN: contagens do que SERIA gravado
-- ---------------------------------------------------------------------
SELECT 'itens'             AS tabela, count(*) AS inseridos FROM itens
UNION ALL SELECT 'notas_fiscais',     count(*) FROM notas_fiscais
UNION ALL SELECT 'nota_fiscal_itens', count(*) FROM nota_fiscal_itens
UNION ALL SELECT 'empenhos',          count(*) FROM empenhos
UNION ALL SELECT 'empenho_itens',     count(*) FROM empenho_itens
UNION ALL SELECT 'itens_entregas',    count(*) FROM itens_entregas
UNION ALL SELECT 'PULADAS (humano)',  count(*) FROM _mig WHERE precisa_humano
ORDER BY 1;

-- =====================================================================
-- >>> Rodando assim, NADA é salvo (ROLLBACK).
-- >>> Conferiu as contagens? Troque a linha abaixo por  COMMIT;
-- =====================================================================
ROLLBACK;
