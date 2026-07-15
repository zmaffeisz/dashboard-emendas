alter table public.termos_ateste
  add column if not exists medicao_id uuid references public.contratos_medicoes(id) on delete set null,
  add column if not exists nota_fiscal_id uuid references public.notas_fiscais(id) on delete set null,
  add column if not exists protocolos jsonb default '[]'::jsonb,
  add column if not exists valor_atestado numeric default 0;

alter table public.chamados_controle
  add column if not exists medicao_id uuid references public.contratos_medicoes(id) on delete set null,
  add column if not exists nota_fiscal_id uuid references public.notas_fiscais(id) on delete set null,
  add column if not exists termo_ateste_id uuid references public.termos_ateste(id) on delete set null;

create index if not exists idx_termos_ateste_medicao on public.termos_ateste(medicao_id);
create index if not exists idx_termos_ateste_nota_fiscal on public.termos_ateste(nota_fiscal_id);
create index if not exists idx_chamados_controle_medicao on public.chamados_controle(medicao_id);
create index if not exists idx_chamados_controle_nota_fiscal on public.chamados_controle(nota_fiscal_id);
create index if not exists idx_chamados_controle_termo_ateste on public.chamados_controle(termo_ateste_id);
