-- Central de notas fiscais: checklist mensal de documentos e vinculo 1:1 com medicao.
-- O mes nao e apagado/resetado: cada competencia possui suas proprias marcacoes.

create table if not exists public.nf_checklist_documentos (
  id uuid primary key default gen_random_uuid(),
  secao_id bigint not null references public.secoes(id),
  contrato_id integer references public.contratos(id) on delete cascade,
  nome text not null,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint nf_checklist_documentos_nome_check check (length(btrim(nome)) > 0)
);

create unique index if not exists uq_nf_checklist_documentos_ativos
  on public.nf_checklist_documentos (
    secao_id,
    coalesce(contrato_id, 0),
    lower(btrim(nome))
  )
  where ativo is true;

create index if not exists idx_nf_checklist_documentos_secao_ordem
  on public.nf_checklist_documentos(secao_id, ativo, ordem, nome);
create index if not exists idx_nf_checklist_documentos_contrato
  on public.nf_checklist_documentos(contrato_id) where contrato_id is not null;

create table if not exists public.nf_checklist_marcacoes (
  id uuid primary key default gen_random_uuid(),
  secao_id bigint not null references public.secoes(id),
  contrato_id integer not null references public.contratos(id) on delete cascade,
  documento_id uuid not null references public.nf_checklist_documentos(id) on delete cascade,
  competencia date not null,
  concluido boolean not null default true,
  observacoes text,
  marcado_por uuid references auth.users(id) on delete set null,
  marcado_em timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint nf_checklist_marcacoes_competencia_check
    check (competencia = date_trunc('month', competencia)::date),
  constraint uq_nf_checklist_marcacao unique (contrato_id, documento_id, competencia)
);

create index if not exists idx_nf_checklist_marcacoes_mes
  on public.nf_checklist_marcacoes(secao_id, competencia, contrato_id);

create or replace function private.prepare_nf_checklist_documento()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_secao_id bigint;
begin
  if new.contrato_id is not null then
    select c.secao_id into v_secao_id
    from public.contratos c
    where c.id = new.contrato_id;
    if v_secao_id is null then
      raise exception 'Contrato do checklist nao encontrado ou sem secao.' using errcode = '23503';
    end if;
  else
    v_secao_id := coalesce(
      new.secao_id,
      private.current_context_secao_id(),
      private.current_profile_secao_id()
    );
  end if;

  if v_secao_id is null then
    raise exception 'Nao foi possivel definir a secao do checklist.' using errcode = '23502';
  end if;

  new.secao_id := v_secao_id;
  new.nome := btrim(new.nome);
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_at := now();
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
  v_documento_contrato integer;
begin
  select c.secao_id into v_contrato_secao
  from public.contratos c
  where c.id = new.contrato_id;

  select d.secao_id, d.contrato_id
    into v_documento_secao, v_documento_contrato
  from public.nf_checklist_documentos d
  where d.id = new.documento_id;

  if v_contrato_secao is null or v_documento_secao is null then
    raise exception 'Contrato ou documento do checklist nao encontrado.' using errcode = '23503';
  end if;
  if v_contrato_secao <> v_documento_secao then
    raise exception 'Contrato e documento pertencem a secoes diferentes.' using errcode = '23514';
  end if;
  if v_documento_contrato is not null and v_documento_contrato <> new.contrato_id then
    raise exception 'Este documento pertence a outro contrato.' using errcode = '23514';
  end if;

  new.secao_id := v_contrato_secao;
  new.competencia := date_trunc('month', new.competencia)::date;
  new.marcado_por := auth.uid();
  new.marcado_em := case when new.concluido then now() else null end;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_nf_checklist_documento() from public;
revoke all on function private.prepare_nf_checklist_marcacao() from public;

drop trigger if exists prepare_nf_checklist_documento on public.nf_checklist_documentos;
create trigger prepare_nf_checklist_documento
  before insert or update on public.nf_checklist_documentos
  for each row execute function private.prepare_nf_checklist_documento();

drop trigger if exists prepare_nf_checklist_marcacao on public.nf_checklist_marcacoes;
create trigger prepare_nf_checklist_marcacao
  before insert or update on public.nf_checklist_marcacoes
  for each row execute function private.prepare_nf_checklist_marcacao();

alter table public.nf_checklist_documentos enable row level security;
alter table public.nf_checklist_marcacoes enable row level security;

drop policy if exists scoped_select on public.nf_checklist_documentos;
drop policy if exists scoped_insert on public.nf_checklist_documentos;
drop policy if exists scoped_update on public.nf_checklist_documentos;
drop policy if exists scoped_delete on public.nf_checklist_documentos;
create policy scoped_select on public.nf_checklist_documentos for select to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'view'));
create policy scoped_insert on public.nf_checklist_documentos for insert to authenticated
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_update on public.nf_checklist_documentos for update to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'))
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_delete on public.nf_checklist_documentos for delete to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));

drop policy if exists scoped_select on public.nf_checklist_marcacoes;
drop policy if exists scoped_insert on public.nf_checklist_marcacoes;
drop policy if exists scoped_update on public.nf_checklist_marcacoes;
drop policy if exists scoped_delete on public.nf_checklist_marcacoes;
create policy scoped_select on public.nf_checklist_marcacoes for select to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'view'));
create policy scoped_insert on public.nf_checklist_marcacoes for insert to authenticated
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_update on public.nf_checklist_marcacoes for update to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'))
  with check (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));
create policy scoped_delete on public.nf_checklist_marcacoes for delete to authenticated
  using (private.can_access_domain(secao_id, array['notas-fiscais'], 'edit'));

grant select, insert, update, delete on public.nf_checklist_documentos to authenticated;
grant select, insert, update, delete on public.nf_checklist_marcacoes to authenticated;

-- Uma medicao possui no maximo uma NF; uma NF ja possui apenas um medicao_id.
create unique index if not exists uq_notas_fiscais_medicao
  on public.notas_fiscais(medicao_id)
  where medicao_id is not null;

-- A nova aba precisa ler o contexto, mas nao ganha permissao de alterar contratos,
-- processos ou medicoes. Em notas_fiscais ela possui o CRUD proprio.
drop policy if exists scoped_select on public.contratos;
create policy scoped_select on public.contratos for select to authenticated
  using (private.can_access_domain(secao_id, array['contratos','notas-fiscais'], 'view'));

drop policy if exists scoped_select on public.processos;
create policy scoped_select on public.processos for select to authenticated
  using (private.can_access_domain(secao_id, array['licitacoes','contratos','dashboard','notas-fiscais'], 'view'));

drop policy if exists scoped_select on public.contratos_medicoes;
create policy scoped_select on public.contratos_medicoes for select to authenticated
  using (private.can_access_domain(secao_id, array['contratos','fiscalizacao','notas-fiscais'], 'view'));

drop policy if exists scoped_select on public.notas_fiscais;
drop policy if exists scoped_insert on public.notas_fiscais;
drop policy if exists scoped_update on public.notas_fiscais;
drop policy if exists scoped_delete on public.notas_fiscais;
create policy scoped_select on public.notas_fiscais for select to authenticated
  using (private.can_access_domain(secao_id, array['contratos','itens','fiscalizacao','notas-fiscais'], 'view'));
create policy scoped_insert on public.notas_fiscais for insert to authenticated
  with check (private.can_access_domain(secao_id, array['contratos','itens','fiscalizacao','notas-fiscais'], 'edit'));
create policy scoped_update on public.notas_fiscais for update to authenticated
  using (private.can_access_domain(secao_id, array['contratos','itens','fiscalizacao','notas-fiscais'], 'edit'))
  with check (private.can_access_domain(secao_id, array['contratos','itens','fiscalizacao','notas-fiscais'], 'edit'));
create policy scoped_delete on public.notas_fiscais for delete to authenticated
  using (private.can_access_domain(secao_id, array['contratos','itens','fiscalizacao','notas-fiscais'], 'edit'));

-- O anexo da NF segue a mesma permissao da central e continua acessivel pelos
-- fluxos existentes de aquisicoes, atas, emendas, contratos e fiscalizacao.
drop policy if exists "leitura notas-fiscais autorizada" on storage.objects;
create policy "leitura notas-fiscais autorizada" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (
      public.can_access_tab('itens','view')
      or public.can_access_tab('atas','view')
      or public.can_access_tab('dashboard','view')
      or public.can_access_tab('contratos','view')
      or public.can_access_tab('fiscalizacao','view')
      or public.can_access_tab('notas-fiscais','view')
    )
  );

drop policy if exists "upload notas-fiscais autorizado" on storage.objects;
create policy "upload notas-fiscais autorizado" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notas-fiscais'
    and (
      public.can_access_tab('itens','edit')
      or public.can_access_tab('atas','edit')
      or public.can_access_tab('dashboard','edit')
      or public.can_access_tab('contratos','edit')
      or public.can_access_tab('fiscalizacao','edit')
      or public.can_access_tab('notas-fiscais','edit')
    )
  );

drop policy if exists "remove notas-fiscais autorizado" on storage.objects;
create policy "remove notas-fiscais autorizado" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (
      public.can_access_tab('itens','edit')
      or public.can_access_tab('atas','edit')
      or public.can_access_tab('dashboard','edit')
      or public.can_access_tab('contratos','edit')
      or public.can_access_tab('fiscalizacao','edit')
      or public.can_access_tab('notas-fiscais','edit')
    )
  );

comment on table public.nf_checklist_documentos is
  'Itens configuraveis do checklist mensal de documentos de NF, globais ou por contrato.';
comment on table public.nf_checklist_marcacoes is
  'Estado mensal de cada documento por contrato; a competencia preserva o historico sem reset destrutivo.';
