-- Adiciona colunas em contratos_historico que o JS de aditivo/reajuste/supressão/prorrogação
-- já usava (status_evento, valor_impacto, valor_reajustado, related_entity_type/id,
-- documento_id, action_type, titulo), mas que não existiam na tabela real. Sem essas colunas,
-- o PostgREST rejeitava o insert com "column ... does not exist", e um fallback silencioso no
-- app reenviava sem esses campos — o evento era gravado, mas sem valor de impacto nem status,
-- por isso "Valor atual" e "% aditivo" nunca refletiam os ajustes salvos.
alter table public.contratos_historico
  add column if not exists titulo text,
  add column if not exists action_type text,
  add column if not exists status_evento text,
  add column if not exists valor_impacto numeric,
  add column if not exists valor_reajustado numeric,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id text,
  add column if not exists documento_id text;
