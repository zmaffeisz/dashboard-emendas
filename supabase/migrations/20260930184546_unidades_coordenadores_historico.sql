-- Produção exclusiva: qpvgpfwuurqcqprnpxua (contratos-dag).
alter table public.unidades add column if not exists email text;
alter table public.unidades add column if not exists coordenador_id bigint references public.pessoas(id);
create index if not exists unidades_coordenador_idx on public.unidades(coordenador_id);

create table if not exists public.unidades_historico (
  id bigint generated always as identity primary key,
  unidade_id bigint not null,
  registrado_em timestamptz not null default clock_timestamp(),
  registrado_por uuid,
  dados jsonb not null
);
create index if not exists unidades_historico_unidade_idx on public.unidades_historico(unidade_id,registrado_em desc);
alter table public.unidades_historico enable row level security;
revoke all on public.unidades_historico from anon,authenticated;
grant select on public.unidades_historico to authenticated;
drop policy if exists unidades_historico_admin on public.unidades_historico;
create policy unidades_historico_admin on public.unidades_historico for select to authenticated
  using ((select private.is_admin_approved()));

create or replace function private.ficha_unidade(p_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',u.id,'nome',u.nome,'endereco',u.endereco,
    'telefone',u.telefone,'email',u.email,'ativo',u.ativo,'coordenador_id',u.coordenador_id,
    'coordenador',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'nome',p.nome,'email',p.email,'telefone',p.telefone,'cargo',p.cargo) end)
  from public.unidades u left join public.pessoas p on p.id=u.coordenador_id where u.id=p_id;
$$;
revoke all on function private.ficha_unidade(bigint) from public,anon;
grant execute on function private.ficha_unidade(bigint) to authenticated;

-- Um retrato anterior à importação; sem inventar coordenadores/dados passados.
insert into public.unidades_historico(unidade_id,dados)
select u.id,private.ficha_unidade(u.id) from public.unidades u
where not exists (select 1 from public.unidades_historico h where h.unidade_id=u.id);

create or replace function private.registrar_ficha_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='pessoas' then
    if row(new.nome,new.email,new.telefone,new.cargo) is not distinct from row(old.nome,old.email,old.telefone,old.cargo) then return new; end if;
    insert into public.unidades_historico(unidade_id,registrado_por,dados)
      select u.id,auth.uid(),private.ficha_unidade(u.id) from public.unidades u where u.coordenador_id=new.id;
  else
    if tg_op='UPDATE' and row(new.nome,new.endereco,new.telefone,new.email,new.coordenador_id,new.ativo)
      is not distinct from row(old.nome,old.endereco,old.telefone,old.email,old.coordenador_id,old.ativo) then return new; end if;
    insert into public.unidades_historico(unidade_id,registrado_por,dados)
      values(new.id,auth.uid(),private.ficha_unidade(new.id));
  end if;
  return new;
end;
$$;
revoke all on function private.registrar_ficha_unidade() from public,anon,authenticated;
drop trigger if exists registrar_ficha_unidade on public.unidades;
create trigger registrar_ficha_unidade after insert or update on public.unidades
for each row execute function private.registrar_ficha_unidade();
drop trigger if exists registrar_coordenador_unidade on public.pessoas;
create trigger registrar_coordenador_unidade after update on public.pessoas
for each row execute function private.registrar_ficha_unidade();

-- Contatos e coordenação só podem ser alterados por administradores aprovados.
-- Outros fluxos mantêm a possibilidade de criar uma unidade apenas com nome.
create or replace function private.validar_contatos_unidade()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.endereco,new.telefone,new.email) is null and new.coordenador_id is null then return new; end if;
  elsif row(new.endereco,new.telefone,new.email,new.coordenador_id) is not distinct from row(old.endereco,old.telefone,old.email,old.coordenador_id) then
    return new;
  end if;
  if not private.is_admin_approved() then raise exception 'Apenas administradores podem alterar contatos e coordenação da unidade.'; end if;
  return new;
end;
$$;
revoke all on function private.validar_contatos_unidade() from public,anon;
grant execute on function private.validar_contatos_unidade() to authenticated;
drop trigger if exists validar_contatos_unidade on public.unidades;
create trigger validar_contatos_unidade before insert or update on public.unidades
for each row execute function private.validar_contatos_unidade();

alter table public.itens_entregas add column if not exists unidade_snapshot jsonb;
alter table public.atas_execucao add column if not exists unidade_snapshot jsonb;
create or replace function private.congelar_unidade_entrega()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_id bigint; v_nome text; v_emitido boolean; v_ficha jsonb;
begin
  if tg_op='UPDATE' and old.unidade_snapshot is not null then
    new.unidade_snapshot:=old.unidade_snapshot;
    return new;
  end if;
  -- Ignora snapshots enviados pelo cliente: a fotografia nasce no banco.
  new.unidade_snapshot:=null;
  if tg_table_name='itens_entregas' then
    v_emitido:=new.af_numero is not null or new.af_data is not null or new.termo_arquivo is not null or new.data_entrega_unidade is not null;
    select unidade_destino_id into v_id from public.itens where id=new.item_id;
  else
    v_emitido:=new.af_numero is not null or nullif(new.data_af,'') is not null or new.termo_arquivo is not null or new.data_entrega_unidade is not null;
    v_nome:=new.unidade;
    if new.origem_recurso='carona' then
      v_ficha:=jsonb_build_object('nome',v_nome);
    else
      select coalesce(unidade_entrega_id,unidade_beneficiada_id) into v_id from public.emenda_itens where id=new.emenda_item_id;
      if v_id is null then
        select id into v_id from public.unidades where lower(btrim(nome))=lower(btrim(v_nome)) and ativo is true order by id limit 1;
      end if;
    end if;
  end if;
  if not v_emitido then return new; end if;
  v_ficha:=coalesce(v_ficha,private.ficha_unidade(v_id),jsonb_build_object('nome',v_nome));
  new.unidade_snapshot:=v_ficha||jsonb_build_object('capturado_em',clock_timestamp());
  return new;
end;
$$;
revoke all on function private.congelar_unidade_entrega() from public,anon;
grant execute on function private.congelar_unidade_entrega() to authenticated;
drop trigger if exists congelar_unidade_entrega on public.itens_entregas;
create trigger congelar_unidade_entrega before insert or update on public.itens_entregas
for each row execute function private.congelar_unidade_entrega();
drop trigger if exists congelar_unidade_entrega on public.atas_execucao;
create trigger congelar_unidade_entrega before insert or update on public.atas_execucao
for each row execute function private.congelar_unidade_entrega();
-- Guarda somente o que se conhece na implantação, antes dos novos contatos.
update public.itens_entregas set unidade_snapshot=null where unidade_snapshot is null
  and (af_numero is not null or af_data is not null or termo_arquivo is not null or data_entrega_unidade is not null);
update public.atas_execucao set unidade_snapshot=null where unidade_snapshot is null
  and (af_numero is not null or nullif(data_af,'') is not null or termo_arquivo is not null or data_entrega_unidade is not null);
notify pgrst,'reload schema';
