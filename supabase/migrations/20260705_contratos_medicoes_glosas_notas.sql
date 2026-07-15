-- Base contratual de medicoes, glosas e notas fiscais.
-- Nao controla pagamento: registra execucao, validacao fiscal e encaminhamento administrativo.

create table if not exists public.contratos_medicoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id integer not null references public.contratos(id) on delete cascade,
  competencia text not null,
  tipo_medicao text not null default 'competencia',
  data_medicao date not null default current_date,
  fiscal_responsavel text,
  status text not null default 'rascunho',
  valor_bruto numeric not null default 0,
  valor_glosa numeric not null default 0,
  valor_liquido numeric not null default 0,
  observacoes text,
  validado_por text,
  validado_em timestamp with time zone,
  encaminhado_em timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone,
  constraint contratos_medicoes_status_check check (
    status = any (array[
      'rascunho',
      'registrada',
      'aprovada_pelo_fiscal',
      'aprovada_com_glosa',
      'recusada',
      'cancelada'
    ])
  ),
  constraint contratos_medicoes_valores_check check (
    valor_bruto >= 0 and valor_glosa >= 0 and valor_liquido >= 0 and valor_liquido <= valor_bruto
  )
);

create table if not exists public.contratos_medicao_itens (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.contratos_medicoes(id) on delete cascade,
  contrato_id integer not null references public.contratos(id) on delete cascade,
  item_id uuid references public.itens(id),
  descricao text,
  unidade text,
  quantidade_executada numeric,
  quantidade_aceita numeric,
  quantidade_recusada numeric,
  valor_unitario numeric,
  valor_total numeric,
  observacoes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.contratos_medicao_glosas (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.contratos_medicoes(id) on delete cascade,
  contrato_id integer not null references public.contratos(id) on delete cascade,
  item_id uuid references public.itens(id),
  motivo text not null,
  periodo_afetado text,
  quantidade_afetada numeric,
  valor_glosa numeric not null default 0,
  justificativa text,
  status text not null default 'registrada',
  documento_url text,
  created_at timestamp with time zone default now(),
  constraint contratos_medicao_glosas_status_check check (
    status = any (array['registrada','validada','cancelada'])
  )
);

alter table public.notas_fiscais
  add column if not exists medicao_id uuid references public.contratos_medicoes(id) on delete set null,
  add column if not exists competencia text,
  add column if not exists valor_glosa numeric default 0,
  add column if not exists valor_aprovado numeric,
  add column if not exists validado_por text,
  add column if not exists validado_em timestamp with time zone,
  add column if not exists encaminhado_em timestamp with time zone;

create index if not exists idx_contratos_medicoes_contrato on public.contratos_medicoes(contrato_id);
create index if not exists idx_contratos_medicoes_status on public.contratos_medicoes(status);
create index if not exists idx_contratos_medicoes_competencia on public.contratos_medicoes(competencia);
create index if not exists idx_contratos_medicao_itens_medicao on public.contratos_medicao_itens(medicao_id);
create index if not exists idx_contratos_medicao_itens_item on public.contratos_medicao_itens(item_id);
create index if not exists idx_contratos_medicao_glosas_medicao on public.contratos_medicao_glosas(medicao_id);
create index if not exists idx_contratos_medicao_glosas_item on public.contratos_medicao_glosas(item_id);
create index if not exists idx_notas_fiscais_medicao on public.notas_fiscais(medicao_id);

create index if not exists idx_nf_contrato_fornecedor_numero_norm
  on public.notas_fiscais (
    contrato_id,
    coalesce(fornecedor_id, 0),
    coalesce(numero_normalizado, regexp_replace(coalesce(numero, ''), '\D', '', 'g'))
  )
  where contrato_id is not null and numero is not null;

alter table public.contratos_medicoes enable row level security;
alter table public.contratos_medicao_itens enable row level security;
alter table public.contratos_medicao_glosas enable row level security;

drop policy if exists "leitura autenticada contratos_medicoes" on public.contratos_medicoes;
create policy "leitura autenticada contratos_medicoes"
  on public.contratos_medicoes for select to authenticated using (true);

drop policy if exists "escrita por aba contratos_medicoes" on public.contratos_medicoes;
create policy "escrita por aba contratos_medicoes"
  on public.contratos_medicoes to authenticated
  using (public.can_access_tab('contratos','edit'))
  with check (public.can_access_tab('contratos','edit'));

drop policy if exists "leitura autenticada contratos_medicao_itens" on public.contratos_medicao_itens;
create policy "leitura autenticada contratos_medicao_itens"
  on public.contratos_medicao_itens for select to authenticated using (true);

drop policy if exists "escrita por aba contratos_medicao_itens" on public.contratos_medicao_itens;
create policy "escrita por aba contratos_medicao_itens"
  on public.contratos_medicao_itens to authenticated
  using (public.can_access_tab('contratos','edit'))
  with check (public.can_access_tab('contratos','edit'));

drop policy if exists "leitura autenticada contratos_medicao_glosas" on public.contratos_medicao_glosas;
create policy "leitura autenticada contratos_medicao_glosas"
  on public.contratos_medicao_glosas for select to authenticated using (true);

drop policy if exists "escrita por aba contratos_medicao_glosas" on public.contratos_medicao_glosas;
create policy "escrita por aba contratos_medicao_glosas"
  on public.contratos_medicao_glosas to authenticated
  using (public.can_access_tab('contratos','edit'))
  with check (public.can_access_tab('contratos','edit'));

grant all on table public.contratos_medicoes to authenticated, service_role;
grant all on table public.contratos_medicao_itens to authenticated, service_role;
grant all on table public.contratos_medicao_glosas to authenticated, service_role;
