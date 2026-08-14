-- Compatibilidade durante a transicao do frontend antigo para os vinculos N:N.
-- O frontend novo sempre envia contrato_id nulo e usa a tabela de vinculos.

alter table public.nf_checklist_documentos
  add column if not exists contrato_id integer references public.contratos(id) on delete cascade;

alter table public.nf_checklist_documentos
  alter column aplica_todos set default true;

update public.nf_checklist_documentos d
set contrato_id = (
  select dc.contrato_id
  from public.nf_checklist_documento_contratos dc
  where dc.documento_id = d.id
  order by dc.created_at, dc.contrato_id
  limit 1
)
where d.aplica_todos is false
  and d.contrato_id is null
  and exists (
    select 1
    from public.nf_checklist_documento_contratos dc
    where dc.documento_id = d.id
  );

create index if not exists idx_nf_checklist_documentos_contrato
  on public.nf_checklist_documentos(contrato_id)
  where contrato_id is not null;

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
    new.aplica_todos := false;
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

  if tg_op = 'INSERT' and coalesce(new.ordem, 0) <= 0 then
    select coalesce(max(d.ordem), 0) + 10 into new.ordem
    from public.nf_checklist_documentos d
    where d.secao_id = v_secao_id
      and d.ativo is true;
  end if;

  return new;
end;
$$;

create or replace function private.sync_nf_checklist_documento_legado()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.contrato_id is not null then
    insert into public.nf_checklist_documento_contratos (documento_id, contrato_id, secao_id)
    values (new.id, new.contrato_id, new.secao_id)
    on conflict (documento_id, contrato_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_nf_checklist_documento_legado() from public;

drop trigger if exists sync_nf_checklist_documento_legado on public.nf_checklist_documentos;
create trigger sync_nf_checklist_documento_legado
  after insert or update of contrato_id on public.nf_checklist_documentos
  for each row execute function private.sync_nf_checklist_documento_legado();

comment on column public.nf_checklist_documentos.contrato_id is
  'Compatibilidade temporaria com o frontend anterior; o modelo atual usa nf_checklist_documento_contratos.';
