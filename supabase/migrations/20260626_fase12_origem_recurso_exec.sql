-- Fase 12 — Origem do recurso na solicitação/execução de ATA (emenda × recurso próprio)
-- Idempotente e não destrutivo. Aplicar apenas no banco local antes de publicar.

alter table public.atas_execucao
  add column if not exists origem_recurso text,
  add column if not exists emenda_id uuid references public.emendas(id),
  add column if not exists emenda_item_id uuid references public.emenda_itens(id);

create index if not exists idx_atas_execucao_emenda on public.atas_execucao(emenda_id) where emenda_id is not null;
