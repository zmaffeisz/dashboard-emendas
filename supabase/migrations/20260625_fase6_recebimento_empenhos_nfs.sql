-- Fase 6 — recebimento administrativo, empenhos e notas fiscais normalizados
-- Idempotente e não destrutivo. Aplicar apenas no banco local antes de publicar.

create table if not exists public.empenhos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  numero_normalizado text,
  ano int,
  processo_id bigint references public.processos(id),
  contrato_id int references public.contratos(id),
  fornecedor_id bigint references public.fornecedores(id),
  emenda_id uuid references public.emendas(id),
  fonte_tipo text,
  fonte_descricao text,
  valor_empenhado numeric,
  valor_anulado numeric,
  saldo_empenho numeric,
  data_emissao date,
  status text default 'emitido',
  origem_sistema text,
  origem_codigo text,
  ultima_sincronizacao timestamptz,
  raw_data jsonb,
  arquivo_url text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index if not exists idx_empenhos_numero_ano on public.empenhos(numero, ano);
create index if not exists idx_empenhos_numero_norm_ano on public.empenhos(numero_normalizado, ano);
create index if not exists idx_empenhos_contrato on public.empenhos(contrato_id);
create index if not exists idx_empenhos_processo on public.empenhos(processo_id);
create index if not exists idx_empenhos_emenda on public.empenhos(emenda_id);
create index if not exists idx_empenhos_fornecedor on public.empenhos(fornecedor_id);

alter table public.empenhos enable row level security;

drop policy if exists "leitura autenticada empenhos" on public.empenhos;
create policy "leitura autenticada empenhos" on public.empenhos
  for select using (true);

drop policy if exists "escrita empenhos" on public.empenhos;
create policy "escrita empenhos" on public.empenhos
  for all using (
    can_access_tab('itens','edit')
    or can_access_tab('contratos','edit')
    or can_access_tab('dashboard','edit')
  );

create table if not exists public.empenho_itens (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references public.empenhos(id) on delete cascade,
  item_id uuid references public.itens(id),
  emenda_id uuid references public.emendas(id),
  emenda_item_id uuid references public.emenda_itens(id),
  quantidade_vinculada numeric,
  valor_vinculado numeric,
  observacoes text,
  created_at timestamptz default now()
);

create index if not exists idx_empenho_itens_empenho on public.empenho_itens(empenho_id);
create index if not exists idx_empenho_itens_item on public.empenho_itens(item_id);
create index if not exists idx_empenho_itens_emenda_item on public.empenho_itens(emenda_item_id);
create unique index if not exists uq_empenho_itens_empenho_item
  on public.empenho_itens(empenho_id, item_id)
  where item_id is not null;

alter table public.empenho_itens enable row level security;

drop policy if exists "leitura autenticada empenho_itens" on public.empenho_itens;
create policy "leitura autenticada empenho_itens" on public.empenho_itens
  for select using (true);

drop policy if exists "escrita empenho_itens" on public.empenho_itens;
create policy "escrita empenho_itens" on public.empenho_itens
  for all using (
    can_access_tab('itens','edit')
    or can_access_tab('contratos','edit')
    or can_access_tab('dashboard','edit')
  );

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  numero_normalizado text,
  serie text,
  chave_acesso text,
  fornecedor_id bigint references public.fornecedores(id),
  contrato_id int references public.contratos(id),
  processo_id bigint references public.processos(id),
  emenda_id uuid references public.emendas(id),
  data_emissao date,
  data_recebimento date,
  valor_total numeric,
  status text default 'recebida',
  origem_sistema text,
  origem_codigo text,
  raw_data jsonb,
  arquivo_url text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index if not exists idx_notas_fiscais_numero on public.notas_fiscais(numero);
create index if not exists idx_notas_fiscais_numero_norm on public.notas_fiscais(numero_normalizado);
create index if not exists idx_notas_fiscais_fornecedor on public.notas_fiscais(fornecedor_id);
create index if not exists idx_notas_fiscais_contrato on public.notas_fiscais(contrato_id);
create index if not exists idx_notas_fiscais_processo on public.notas_fiscais(processo_id);
create index if not exists idx_notas_fiscais_emenda on public.notas_fiscais(emenda_id);
create index if not exists idx_notas_fiscais_chave on public.notas_fiscais(chave_acesso);

alter table public.notas_fiscais enable row level security;

drop policy if exists "leitura autenticada notas_fiscais" on public.notas_fiscais;
create policy "leitura autenticada notas_fiscais" on public.notas_fiscais
  for select using (true);

drop policy if exists "escrita notas_fiscais" on public.notas_fiscais;
create policy "escrita notas_fiscais" on public.notas_fiscais
  for all using (
    can_access_tab('itens','edit')
    or can_access_tab('contratos','edit')
    or can_access_tab('dashboard','edit')
  );

create table if not exists public.nota_fiscal_itens (
  id uuid primary key default gen_random_uuid(),
  nota_fiscal_id uuid not null references public.notas_fiscais(id) on delete cascade,
  item_id uuid references public.itens(id),
  emenda_id uuid references public.emendas(id),
  emenda_item_id uuid references public.emenda_itens(id),
  empenho_id uuid references public.empenhos(id),
  quantidade numeric,
  valor_unitario numeric,
  valor_total numeric,
  observacoes text,
  created_at timestamptz default now()
);

create index if not exists idx_nf_itens_nf on public.nota_fiscal_itens(nota_fiscal_id);
create index if not exists idx_nf_itens_item on public.nota_fiscal_itens(item_id);
create index if not exists idx_nf_itens_emenda_item on public.nota_fiscal_itens(emenda_item_id);
create index if not exists idx_nf_itens_empenho on public.nota_fiscal_itens(empenho_id);
create unique index if not exists uq_nf_itens_nf_item_empenho
  on public.nota_fiscal_itens(nota_fiscal_id, item_id, coalesce(empenho_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where item_id is not null;

alter table public.nota_fiscal_itens enable row level security;

drop policy if exists "leitura autenticada nota_fiscal_itens" on public.nota_fiscal_itens;
create policy "leitura autenticada nota_fiscal_itens" on public.nota_fiscal_itens
  for select using (true);

drop policy if exists "escrita nota_fiscal_itens" on public.nota_fiscal_itens;
create policy "escrita nota_fiscal_itens" on public.nota_fiscal_itens
  for all using (
    can_access_tab('itens','edit')
    or can_access_tab('contratos','edit')
    or can_access_tab('dashboard','edit')
  );

alter table public.itens_entregas
  add column if not exists empenho_id uuid references public.empenhos(id);

alter table public.itens_entregas
  add column if not exists nota_fiscal_id uuid references public.notas_fiscais(id);

create index if not exists idx_itens_entregas_empenho on public.itens_entregas(empenho_id);
create index if not exists idx_itens_entregas_nota_fiscal on public.itens_entregas(nota_fiscal_id);

grant select on public.empenhos to anon, authenticated;
grant insert, update, delete on public.empenhos to authenticated;

grant select on public.empenho_itens to anon, authenticated;
grant insert, update, delete on public.empenho_itens to authenticated;

grant select on public.notas_fiscais to anon, authenticated;
grant insert, update, delete on public.notas_fiscais to authenticated;

grant select on public.nota_fiscal_itens to anon, authenticated;
grant insert, update, delete on public.nota_fiscal_itens to authenticated;

notify pgrst, 'reload schema';
