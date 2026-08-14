-- Checklist mensal: cadastra a documentacao uma vez e vincula N contratos.
-- Preserva documentos, marcacoes mensais e a aplicacao global existentes.

alter table public.nf_checklist_documentos
  add column if not exists aplica_todos boolean not null default false;

create table if not exists public.nf_checklist_documento_contratos (
  documento_id uuid not null references public.nf_checklist_documentos(id) on delete cascade,
  contrato_id integer not null references public.contratos(id) on delete cascade,
  secao_id bigint not null references public.secoes(id),
  created_at timestamp with time zone not null default now(),
  primary key (documento_id, contrato_id)
);

create index if not exists idx_nf_checklist_documento_contratos_contrato
  on public.nf_checklist_documento_contratos(contrato_id, documento_id);
create index if not exists idx_nf_checklist_documento_contratos_secao
  on public.nf_checklist_documento_contratos(secao_id, documento_id);

create or replace function private.prepare_nf_checklist_documento_contrato()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_documento_secao bigint;
  v_contrato_secao bigint;
begin
  select d.secao_id into v_documento_secao
  from public.nf_checklist_documentos d
  where d.id = new.documento_id;

  select c.secao_id into v_contrato_secao
  from public.contratos c
  where c.id = new.contrato_id;

  if v_documento_secao is null or v_contrato_secao is null then
    raise exception 'Documento ou contrato do checklist nao encontrado.' using errcode = '23503';
  end if;
  if v_documento_secao <> v_contrato_secao then
    raise exception 'Documento e contrato pertencem a secoes diferentes.' using errcode = '23514';
  end if;

  new.secao_id := v_documento_secao;
  return new;
end;
$$;

revoke all on function private.prepare_nf_checklist_documento_contrato() from public;

drop trigger if exists prepare_nf_checklist_documento_contrato on public.nf_checklist_documento_contratos;
create trigger prepare_nf_checklist_documento_contrato
  before insert or update on public.nf_checklist_documento_contratos
  for each row execute function private.prepare_nf_checklist_documento_contrato();

-- Converte o escopo antigo sem alterar os IDs referenciados pelas marcacoes.
-- O bloco condicional tambem permite reaplicar o arquivo com seguranca.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nf_checklist_documentos'
      and column_name = 'contrato_id'
  ) then
    execute $sql$
      insert into public.nf_checklist_documento_contratos (documento_id, contrato_id, secao_id)
      select d.id, d.contrato_id, d.secao_id
      from public.nf_checklist_documentos d
      where d.contrato_id is not null
      on conflict (documento_id, contrato_id) do nothing
    $sql$;
    execute $sql$
      update public.nf_checklist_documentos
      set aplica_todos = true
      where contrato_id is null
    $sql$;
    execute $sql$
      update public.nf_checklist_documentos
      set contrato_id = null
      where contrato_id is not null
    $sql$;
  end if;
end;
$$;

create or replace function private.prepare_nf_checklist_documento()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_secao_id bigint;
begin
  v_secao_id := coalesce(
    new.secao_id,
    private.current_context_secao_id(),
    private.current_profile_secao_id()
  );

  if v_secao_id is null then
    raise exception 'Nao foi possivel definir a secao do checklist.' using errcode = '23502';
  end if;

  new.secao_id := v_secao_id;
  new.nome := btrim(new.nome);
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_at := now();

  if tg_op = 'INSERT' and coalesce(new.ordem, 0) <= 0 then
    select coalesce(max(d.ordem), 0) + 10 into new.ordem
    from public.nf_checklist_documentos d
    where d.secao_id = v_secao_id
      and d.ativo is true;
  end if;

  return new;
end;
$$;

create or replace function private.prepare_nf_checklist_marcacao()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_contrato_secao bigint;
  v_documento_secao bigint;
  v_aplica_todos boolean;
begin
  select c.secao_id into v_contrato_secao
  from public.contratos c
  where c.id = new.contrato_id;

  select d.secao_id, d.aplica_todos
    into v_documento_secao, v_aplica_todos
  from public.nf_checklist_documentos d
  where d.id = new.documento_id;

  if v_contrato_secao is null or v_documento_secao is null then
    raise exception 'Contrato ou documento do checklist nao encontrado.' using errcode = '23503';
  end if;
  if v_contrato_secao <> v_documento_secao then
    raise exception 'Contrato e documento pertencem a secoes diferentes.' using errcode = '23514';
  end if;
  if not v_aplica_todos and not exists (
    select 1
    from public.nf_checklist_documento_contratos dc
    where dc.documento_id = new.documento_id
      and dc.contrato_id = new.contrato_id
  ) then
    raise exception 'Este documento nao esta vinculado ao contrato.' using errcode = '23514';
  end if;

  new.secao_id := v_contrato_secao;
  new.competencia := date_trunc('month', new.competencia)::date;
  new.marcado_por := auth.uid();
  new.marcado_em := case when new.concluido then now() else null end;
  new.updated_at := now();
  return new;
end;
$$;

drop index if exists public.uq_nf_checklist_documentos_ativos;
drop index if exists public.idx_nf_checklist_documentos_contrato;

alter table public.nf_checklist_documentos
  drop column if exists contrato_id;

create unique index if not exists uq_nf_checklist_documentos_ativos
  on public.nf_checklist_documentos (secao_id, lower(btrim(nome)))
  where ativo is true;

alter table public.nf_checklist_documento_contratos enable row level security;

drop policy if exists scoped_select on public.nf_checklist_documento_contratos;
drop policy if exists scoped_insert on public.nf_checklist_documento_contratos;
drop policy if exists scoped_update on public.nf_checklist_documento_contratos;
drop policy if exists scoped_delete on public.nf_checklist_documento_contratos;
create policy scoped_select on public.nf_checklist_documento_contratos for select to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'view'));
create policy scoped_insert on public.nf_checklist_documento_contratos for insert to authenticated
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_update on public.nf_checklist_documento_contratos for update to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'))
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_delete on public.nf_checklist_documento_contratos for delete to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));

grant select, insert, update, delete on public.nf_checklist_documento_contratos to authenticated;

comment on table public.nf_checklist_documentos is
  'Catalogo de documentacoes do checklist mensal, com ordem automatica e escopo global ou por vinculos.';
comment on column public.nf_checklist_documentos.aplica_todos is
  'Quando verdadeiro, a documentacao aparece em todos os contratos de manutencao da secao.';
comment on table public.nf_checklist_documento_contratos is
  'Vinculos N:N entre uma documentacao do checklist e os contratos em que deve aparecer.';
