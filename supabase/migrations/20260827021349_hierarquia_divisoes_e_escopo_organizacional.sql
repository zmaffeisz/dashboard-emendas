-- Hierarquia organizacional: divisao -> secoes.
-- Mantem os ids de secao e todos os vinculos operacionais existentes.

begin;

create table if not exists public.divisoes (
  id bigint generated always as identity primary key,
  sigla text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.divisoes (sigla, ativo)
values ('DAG', true), ('DMMHF', true)
on conflict (sigla) do update set ativo = excluded.ativo;

alter table public.secoes
  add column if not exists divisao_id bigint references public.divisoes(id);

update public.secoes s
set divisao_id = d.id
from public.divisoes d
where d.sigla = 'DAG'
  and s.sigla in ('SAC','SACON','SECOMP','SMCP','SUEQ - EQUIP')
  and s.divisao_id is null;

update public.secoes s
set divisao_id = d.id
from public.divisoes d
where d.sigla = 'DMMHF'
  and s.sigla in ('DMMHF - MJ','DMMHF - SAMA','DMMHF - SEAP','DMMHF - SEMED')
  and s.divisao_id is null;

do $$
begin
  if exists (select 1 from public.secoes where divisao_id is null) then
    raise exception 'Existem secoes sem divisao; a migracao foi interrompida sem alterar os vinculos operacionais.';
  end if;
end
$$;

alter table public.secoes alter column divisao_id set not null;
create index if not exists idx_secoes_divisao_id on public.secoes(divisao_id);

drop trigger if exists guard_profile_organizacional on public.profiles;

alter table public.profiles
  add column if not exists divisao_id bigint references public.divisoes(id),
  add column if not exists contexto_divisao_id bigint references public.divisoes(id);

alter table public.profiles drop constraint if exists profiles_contexto_modo_check;
alter table public.profiles add constraint profiles_contexto_modo_check
  check (contexto_modo in ('secao','divisao','global'));

-- Usuarios de secao conservam exatamente a secao atual e passam a carregar
-- tambem a divisao pai. Chefias preexistentes pertencem a DAG por decisao
-- administrativa tomada antes desta migracao.
update public.profiles p
set divisao_id = s.divisao_id
from public.secoes s
where p.secao_id = s.id
  and p.divisao_id is distinct from s.divisao_id;

update public.profiles p
set divisao_id = d.id
from public.divisoes d
where d.sigla = 'DAG'
  and p.papel <> 'admin'
  and p.escopo_organizacional = 'divisao'
  and p.divisao_id is null;

-- Preserva a secao atualmente selecionada pelos administradores. Isso mantem a
-- migracao compativel com o frontend publicado durante a janela de atualizacao;
-- a nova interface oferece a visao global sem forcar uma troca imediata.
update public.profiles p
set contexto_divisao_id = s.divisao_id
from public.secoes s
where p.contexto_modo = 'secao'
  and p.contexto_secao_id = s.id;

update public.profiles
set contexto_modo = 'secao',
    contexto_divisao_id = divisao_id,
    contexto_secao_id = secao_id
where papel <> 'admin' and escopo_organizacional = 'secao';

update public.profiles
set contexto_modo = 'divisao',
    contexto_divisao_id = divisao_id,
    contexto_secao_id = null,
    secao_id = null
where papel <> 'admin' and escopo_organizacional = 'divisao';

create index if not exists idx_profiles_divisao_id on public.profiles(divisao_id);
create index if not exists idx_profiles_contexto_divisao_id on public.profiles(contexto_divisao_id);

create or replace function private.current_context_secao_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.papel = 'admin' and p.contexto_modo = 'secao' then p.contexto_secao_id
    when p.papel <> 'admin' and p.escopo_organizacional = 'divisao' and p.contexto_modo = 'secao' then p.contexto_secao_id
    when p.papel <> 'admin' and p.escopo_organizacional = 'secao' then p.secao_id
    else null
  end
  from public.profiles p
  where p.id = (select auth.uid()) and p.aprovado is true
$$;

create or replace function private.can_access_secao(p_secao_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.secoes s on s.id = p_secao_id
    where p.id = (select auth.uid())
      and p.aprovado is true
      and p_secao_id is not null
      and (
        (p.papel = 'admin' and p.contexto_modo = 'global')
        or (p.papel = 'admin' and p.contexto_modo = 'divisao'
            and (p.contexto_divisao_id is null or s.divisao_id = p.contexto_divisao_id))
        or (p.papel = 'admin' and p.contexto_modo = 'secao'
            and p_secao_id = p.contexto_secao_id)
        or (p.papel <> 'admin' and p.escopo_organizacional = 'divisao'
            and s.divisao_id = p.divisao_id
            and (
              (p.contexto_modo = 'divisao' and p.contexto_divisao_id = p.divisao_id)
              or (p.contexto_modo = 'secao' and p_secao_id = p.contexto_secao_id)
            ))
        or (p.papel <> 'admin' and p.escopo_organizacional = 'secao'
            and p_secao_id = p.secao_id)
      )
  )
$$;

create or replace function private.guard_profile_organizacional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secao_divisao bigint;
  v_contexto_secao_divisao bigint;
begin
  if new.secao_id is not null then
    select s.divisao_id into v_secao_divisao from public.secoes s where s.id = new.secao_id;
  end if;
  if new.contexto_secao_id is not null then
    select s.divisao_id into v_contexto_secao_divisao from public.secoes s where s.id = new.contexto_secao_id;
  end if;

  if new.aprovado is true and new.papel <> 'admin' then
    if new.escopo_organizacional = 'secao' then
      if new.secao_id is null or new.divisao_id is null or v_secao_divisao is distinct from new.divisao_id then
        raise exception 'Usuario de secao deve possuir secao e divisao correspondentes.' using errcode = '23514';
      end if;
      if new.contexto_modo <> 'secao'
         or new.contexto_secao_id is distinct from new.secao_id
         or new.contexto_divisao_id is distinct from new.divisao_id then
        raise exception 'O contexto do usuario de secao deve permanecer em sua secao.' using errcode = '23514';
      end if;
    elsif new.escopo_organizacional = 'divisao' then
      if new.divisao_id is null or new.secao_id is not null then
        raise exception 'Chefia de divisao deve possuir uma divisao e nao uma secao fixa.' using errcode = '23514';
      end if;
      if new.contexto_modo = 'divisao' then
        if new.contexto_divisao_id is distinct from new.divisao_id or new.contexto_secao_id is not null then
          raise exception 'Contexto de divisao invalido para a chefia.' using errcode = '23514';
        end if;
      elsif new.contexto_modo = 'secao' then
        if new.contexto_secao_id is null
           or v_contexto_secao_divisao is distinct from new.divisao_id
           or new.contexto_divisao_id is distinct from new.divisao_id then
          raise exception 'A secao selecionada nao pertence a divisao da chefia.' using errcode = '23514';
        end if;
      else
        raise exception 'Chefia de divisao nao pode usar contexto global.' using errcode = '23514';
      end if;
    end if;
  elsif new.papel = 'admin' then
    -- O frontend anterior nao enviava contexto_divisao_id ao trocar a secao.
    -- Completar o pai aqui torna a transicao segura e mantem a validacao forte.
    if new.contexto_modo = 'secao' and new.contexto_secao_id is not null then
      new.contexto_divisao_id := v_contexto_secao_divisao;
    end if;
    if new.contexto_modo = 'global' then
      if new.contexto_divisao_id is not null or new.contexto_secao_id is not null then
        raise exception 'Contexto global do administrador nao deve fixar divisao ou secao.' using errcode = '23514';
      end if;
    elsif new.contexto_modo = 'divisao' then
      if new.contexto_secao_id is not null then
        raise exception 'Selecione uma divisao valida para o contexto do administrador.' using errcode = '23514';
      end if;
    elsif new.contexto_modo = 'secao' then
      if new.contexto_secao_id is null
         or new.contexto_divisao_id is distinct from v_contexto_secao_divisao then
        raise exception 'Selecione uma secao valida para o contexto do administrador.' using errcode = '23514';
      end if;
    end if;
  end if;

  if private.is_admin_approved() then
    return new;
  end if;

  if new.papel is distinct from old.papel
    or new.aprovado is distinct from old.aprovado
    or new.escopo_organizacional is distinct from old.escopo_organizacional
    or new.secao_id is distinct from old.secao_id
    or new.divisao_id is distinct from old.divisao_id then
    raise exception 'Somente administradores podem alterar papel, aprovacao ou vinculo organizacional.' using errcode = '42501';
  end if;

  return new;
end
$$;

create trigger guard_profile_organizacional
before update on public.profiles
for each row execute function private.guard_profile_organizacional();

revoke all on function private.current_context_secao_id() from public;
revoke all on function private.can_access_secao(bigint) from public;
revoke all on function private.guard_profile_organizacional() from public;
grant execute on function private.current_context_secao_id() to authenticated;
grant execute on function private.can_access_secao(bigint) to authenticated;

alter table public.divisoes enable row level security;

drop policy if exists read_divisoes on public.divisoes;
drop policy if exists insert_divisoes on public.divisoes;
drop policy if exists update_divisoes on public.divisoes;
drop policy if exists delete_divisoes on public.divisoes;

create policy read_divisoes on public.divisoes
for select to authenticated using (true);
create policy insert_divisoes on public.divisoes
for insert to authenticated with check ((select private.is_admin_approved()));
create policy update_divisoes on public.divisoes
for update to authenticated
using ((select private.is_admin_approved()))
with check ((select private.is_admin_approved()));
create policy delete_divisoes on public.divisoes
for delete to authenticated using ((select private.is_admin_approved()));

grant select, insert, update, delete on public.divisoes to authenticated, service_role;
grant usage, select on sequence public.divisoes_id_seq to authenticated, service_role;

comment on table public.divisoes is 'Divisoes organizacionais que agrupam as secoes do sistema.';
comment on column public.secoes.divisao_id is 'Divisao organizacional proprietaria da secao.';
comment on column public.profiles.divisao_id is 'Divisao de lotacao ou alcance da chefia; administradores globais podem manter nulo.';
comment on column public.profiles.contexto_divisao_id is 'Divisao selecionada no contexto operacional atual.';
comment on column public.profiles.contexto_modo is 'Contexto operacional: global (somente admin), divisao ou secao.';

-- Os buckets sao privados. A leitura e a exclusao passam a exigir que o
-- arquivo esteja ligado a um registro visivel/editavel no contexto atual.
create or replace function private.storage_object_is_linked(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  case p_bucket
    when 'notas-fiscais' then
      return exists (select 1 from public.notas_fiscais n where n.arquivo_url = p_name);
    when 'termos-entrega' then
      return exists (select 1 from public.itens_entregas e where e.termo_arquivo = p_name)
          or exists (select 1 from public.atas_execucao a where a.termo_arquivo = p_name);
    when 'inventario-movimentacoes' then
      return exists (select 1 from public.inventario_movimentacoes m where m.documento_path = p_name);
    when 'licitacao-ocorrencias' then
      return exists (select 1 from public.licitacao_item_ocorrencias o where o.documento_path = p_name);
    when 'chamados-fotos' then
      return exists (select 1 from public.chamados_anexos a where a.storage_path = p_name);
    else
      return false;
  end case;
end
$$;

create or replace function private.can_access_storage_object(p_bucket text, p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_tabs text[];
begin
  case p_bucket
    when 'notas-fiscais' then
      v_tabs := array['contratos','itens','fiscalizacao','notas-fiscais'];
      select exists (
        select 1 from public.notas_fiscais n
        where n.arquivo_url = p_name
          and private.can_access_domain(n.secao_id, v_tabs, p_action)
      ) into v_allowed;
    when 'termos-entrega' then
      v_tabs := array['atas','itens'];
      select exists (
        select 1 from public.itens_entregas e
        where e.termo_arquivo = p_name and private.can_access_domain(e.secao_id, v_tabs, p_action)
      ) or exists (
        select 1 from public.atas_execucao a
        where a.termo_arquivo = p_name and private.can_access_domain(a.secao_id, v_tabs, p_action)
      ) into v_allowed;
    when 'inventario-movimentacoes' then
      v_tabs := case when p_action = 'edit' then array['inventario-ac'] else array['inventario-ac','dashboard'] end;
      select exists (
        select 1 from public.inventario_movimentacoes m
        where m.documento_path = p_name and private.can_access_domain(m.secao_id, v_tabs, p_action)
      ) into v_allowed;
    when 'licitacao-ocorrencias' then
      v_tabs := case when p_action = 'edit' then array['licitacoes','contratos'] else array['licitacoes','contratos','dashboard'] end;
      select exists (
        select 1 from public.licitacao_item_ocorrencias o
        where o.documento_path = p_name and private.can_access_domain(o.secao_id, v_tabs, p_action)
      ) into v_allowed;
    when 'chamados-fotos' then
      v_tabs := array['chamados-novos','fiscalizacao'];
      select exists (
        select 1 from public.chamados_anexos a
        where a.storage_path = p_name and private.can_access_domain(a.secao_id, v_tabs, p_action)
      ) into v_allowed;
    else
      v_allowed := false;
  end case;
  return coalesce(v_allowed, false);
end
$$;

revoke all on function private.storage_object_is_linked(text,text) from public;
revoke all on function private.can_access_storage_object(text,text,text) from public;
grant execute on function private.storage_object_is_linked(text,text) to authenticated;
grant execute on function private.can_access_storage_object(text,text,text) to authenticated;

drop policy if exists dashboard_chamados_fotos_select on storage.objects;
create policy dashboard_chamados_fotos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'chamados-fotos'
  and private.can_access_storage_object(bucket_id, name, 'view')
);

drop policy if exists dashboard_termos_select on storage.objects;
create policy dashboard_termos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'termos-entrega'
  and (
    private.can_access_storage_object(bucket_id, name, 'view')
    or (owner_id = (select auth.uid())::text and created_at > now() - interval '1 hour'
        and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists dashboard_termos_insert on storage.objects;
create policy dashboard_termos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'termos-entrega'
  and (public.can_access_tab('atas','edit') or public.can_access_tab('itens','edit'))
);

drop policy if exists dashboard_termos_delete on storage.objects;
create policy dashboard_termos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'termos-entrega'
  and (
    private.can_access_storage_object(bucket_id, name, 'edit')
    or (owner_id = (select auth.uid())::text and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists "leitura notas-fiscais autorizada" on storage.objects;
create policy "leitura notas-fiscais autorizada" on storage.objects
for select to authenticated
using (
  bucket_id = 'notas-fiscais'
  and (
    private.can_access_storage_object(bucket_id, name, 'view')
    or (owner_id = (select auth.uid())::text and created_at > now() - interval '1 hour'
        and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists "remove notas-fiscais autorizado" on storage.objects;
create policy "remove notas-fiscais autorizado" on storage.objects
for delete to authenticated
using (
  bucket_id = 'notas-fiscais'
  and (
    private.can_access_storage_object(bucket_id, name, 'edit')
    or (owner_id = (select auth.uid())::text and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists "leitura inventario-movimentacoes autorizada" on storage.objects;
create policy "leitura inventario-movimentacoes autorizada" on storage.objects
for select to authenticated
using (
  bucket_id = 'inventario-movimentacoes'
  and (
    private.can_access_storage_object(bucket_id, name, 'view')
    or (owner_id = (select auth.uid())::text and created_at > now() - interval '1 hour'
        and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists "remove inventario-movimentacoes autorizado" on storage.objects;
create policy "remove inventario-movimentacoes autorizado" on storage.objects
for delete to authenticated
using (
  bucket_id = 'inventario-movimentacoes'
  and (
    private.can_access_storage_object(bucket_id, name, 'edit')
    or (owner_id = (select auth.uid())::text and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists licitacao_ocorrencias_storage_select_auth on storage.objects;
create policy licitacao_ocorrencias_storage_select_auth on storage.objects
for select to authenticated
using (
  bucket_id = 'licitacao-ocorrencias'
  and (
    private.can_access_storage_object(bucket_id, name, 'view')
    or (owner_id = (select auth.uid())::text and created_at > now() - interval '1 hour'
        and not private.storage_object_is_linked(bucket_id, name))
  )
);

drop policy if exists licitacao_ocorrencias_storage_delete_orphan on storage.objects;
create policy licitacao_ocorrencias_storage_delete_orphan on storage.objects
for delete to authenticated
using (
  bucket_id = 'licitacao-ocorrencias'
  and (
    private.can_access_storage_object(bucket_id, name, 'edit')
    or (owner_id = (select auth.uid())::text and not private.storage_object_is_linked(bucket_id, name))
  )
);

-- A RPC privilegiada precisa repetir a verificacao organizacional, pois
-- SECURITY DEFINER nao herda a RLS do chamador.
create or replace function public.excluir_processo_licitacao(
  p_processo_id bigint,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_ids uuid[] := '{}';
  v_secao_id bigint;
  v_bloqueios jsonb := '{}'::jsonb;
  v_bloqueado boolean := false;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para excluir processo.' using errcode = '42501';
  end if;

  if p_processo_id is null then
    raise exception 'Processo invalido.' using errcode = '22023';
  end if;

  select p.secao_id into v_secao_id
  from public.processos p where p.id = p_processo_id;
  if not found then
    raise exception 'Processo nao encontrado.' using errcode = 'P0002';
  end if;

  if not private.can_access_domain(v_secao_id, array['contratos'], 'edit') then
    raise exception 'Sem permissao para excluir processos desta secao.' using errcode = '42501';
  end if;

  select coalesce(array_agg(i.id), '{}') into v_item_ids
  from public.itens i where i.processo_id = p_processo_id;

  v_bloqueios := jsonb_build_object(
    'contratos', (select count(*) from public.contratos c where c.processo_id = p_processo_id),
    'empenhos', (select count(*) from public.empenhos e where e.processo_id = p_processo_id),
    'notas_fiscais', (select count(*) from public.notas_fiscais n where n.processo_id = p_processo_id),
    'itens_contratados', (select count(*) from public.itens i where i.processo_id = p_processo_id and i.contrato_id is not null),
    'entregas', (select count(*) from public.itens_entregas e where e.item_id = any(v_item_ids)),
    'unidades_recebidas', (select count(*) from public.itens_entregas_unidades u where u.item_id = any(v_item_ids)),
    'execucoes_ata', (
      select count(*) from public.atas_execucao ae
      join public.atas_itens ai on ai.id = ae.ata_item_id
      join public.contratos c on c.id = ai.contrato_id
      where c.processo_id = p_processo_id
    ),
    'sancoes', 0,
    'inventario', 0
  );

  v_bloqueado := exists(select 1 from jsonb_each_text(v_bloqueios) x where x.value::integer > 0);

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'blocked', v_bloqueado,
      'reason', case when v_bloqueado then 'O processo possui registros operacionais e nao pode ser excluido.' else null end,
      'counts', v_bloqueios, 'itens', coalesce(array_length(v_item_ids, 1), 0));
  end if;

  if v_bloqueado then
    raise exception 'Processo possui registros operacionais e nao pode ser excluido.' using errcode = '23514';
  end if;

  update public.emenda_itens set processo_id = null where processo_id = p_processo_id;

  if to_regclass('public.itens_status_historico') is not null then
    execute 'delete from public.itens_status_historico where item_id = any($1)' using v_item_ids;
  end if;

  delete from public.itens where id = any(v_item_ids);
  get diagnostics v_count = row_count;

  delete from public.processos where id = p_processo_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('dry_run', false, 'blocked', false,
    'deleted', jsonb_build_object('itens', coalesce(array_length(v_item_ids, 1), 0), 'processos', v_count));
end
$$;

revoke all on function public.excluir_processo_licitacao(bigint, boolean) from public, anon;
grant execute on function public.excluir_processo_licitacao(bigint, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
