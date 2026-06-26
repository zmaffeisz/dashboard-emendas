-- Fase 8 — Cadastro/controle de empenhos com saldo
-- Idempotente e não destrutivo. Aplicar apenas no banco local antes de publicar.
-- As tabelas empenhos e empenho_itens já existem (Fase 6). Aqui só acrescentamos
-- o campo "Número da despesa" pedido no relatório "Normalizar empenhos".

alter table public.empenhos
  add column if not exists numero_despesa text;

-- saldo_empenho passa a ser controlado pela aplicação:
--   saldo_empenho = coalesce(valor_empenhado,0) - coalesce(valor_anulado,0) - Σ empenho_itens.valor_vinculado
-- (recalculado a cada vínculo/desvínculo no salvarEmpenho()).
