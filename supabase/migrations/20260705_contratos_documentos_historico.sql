-- Documentos/referencias e historico enriquecido do modulo de contratos.
-- O site estatico registra referencias; upload real deve usar Storage/fluxo proprio quando existir.

create table if not exists public.contratos_documentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id integer not null references public.contratos(id) on delete cascade,
  related_entity_type text not null default 'contract',
  related_entity_id text,
  tipo_documento text not null default 'outro',
  titulo text not null,
  numero_documento text,
  data_documento date,
  nome_arquivo text,
  url_arquivo text,
  referencia text,
  observacoes text,
  criado_por text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone,
  constraint contratos_documentos_related_type_check check (
    related_entity_type = any (array[
      'contract',
      'contractEvent',
      'measurement',
      'invoice',
      'history',
      'other'
    ])
  )
);

alter table public.contratos_historico
  add column if not exists action_type text,
  add column if not exists titulo text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id text,
  add column if not exists status_evento text default 'formalizado',
  add column if not exists valor_impacto numeric,
  add column if not exists valor_reajustado numeric,
  add column if not exists documento_id uuid references public.contratos_documentos(id) on delete set null;

create index if not exists idx_contratos_documentos_contrato on public.contratos_documentos(contrato_id);
create index if not exists idx_contratos_documentos_tipo on public.contratos_documentos(tipo_documento);
create index if not exists idx_contratos_documentos_related on public.contratos_documentos(related_entity_type, related_entity_id);
create index if not exists idx_contratos_historico_action_type on public.contratos_historico(action_type);
create index if not exists idx_contratos_historico_related on public.contratos_historico(related_entity_type, related_entity_id);
create index if not exists idx_contratos_historico_documento on public.contratos_historico(documento_id);
create index if not exists idx_contratos_historico_status_evento on public.contratos_historico(status_evento);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contratos_historico_status_evento_check'
  ) then
    alter table public.contratos_historico
      add constraint contratos_historico_status_evento_check
      check (status_evento is null or status_evento = any (array['rascunho','formalizado','cancelado']));
  end if;
end $$;

alter table public.contratos_documentos enable row level security;

drop policy if exists "leitura autenticada contratos_documentos" on public.contratos_documentos;
create policy "leitura autenticada contratos_documentos"
  on public.contratos_documentos for select to authenticated using (true);

drop policy if exists "escrita por aba contratos_documentos" on public.contratos_documentos;
create policy "escrita por aba contratos_documentos"
  on public.contratos_documentos to authenticated
  using (public.can_access_tab('contratos','edit'))
  with check (public.can_access_tab('contratos','edit'));

grant all on table public.contratos_documentos to authenticated, service_role;
