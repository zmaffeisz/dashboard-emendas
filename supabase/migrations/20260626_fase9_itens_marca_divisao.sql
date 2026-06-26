-- Fase 9 — itens: marca/modelo + linhagem da divisão de quantidade + número de série no recebimento
-- Idempotente e não destrutivo. Aplicar apenas no banco local antes de publicar.

alter table public.itens
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists item_origem_id uuid references public.itens(id);

create index if not exists idx_itens_origem on public.itens(item_origem_id) where item_origem_id is not null;

-- "Número de Série" pedido nos relatórios (hoje o recebimento só tem patrimônio)
alter table public.itens_entregas
  add column if not exists numero_serie text;
