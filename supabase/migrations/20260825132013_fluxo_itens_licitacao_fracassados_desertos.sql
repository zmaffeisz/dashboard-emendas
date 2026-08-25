-- Encerramento definitivo de itens de licitacao por fracasso ou desercao.
-- O evento preserva os valores e identificadores da epoca, libera o saldo da
-- Emenda e impede que o mesmo item seja contratado, alterado ou excluido.

create table if not exists public.licitacao_item_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itens(id) on delete restrict,
  processo_id bigint not null references public.processos(id) on delete restrict,
  tipo text not null,
  numero_pregao text not null,
  numero_lote text not null,
  data_ocorrencia date not null default current_date,
  observacao text,
  documento_path text not null,
  documento_nome text not null,
  documento_mime text not null,
  documento_tamanho bigint not null,
  processo_identificador_snapshot text not null,
  item_descricao_snapshot text not null,
  quantidade_snapshot numeric not null,
  valor_unitario_snapshot numeric not null,
  valor_total_snapshot numeric generated always as
    (round(quantidade_snapshot * valor_unitario_snapshot, 2)) stored,
  secao_id bigint not null references public.secoes(id),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint licitacao_item_ocorrencias_item_unico unique (item_id),
  constraint licitacao_item_ocorrencias_tipo_check
    check (tipo in ('FRACASSADO', 'DESERTO')),
  constraint licitacao_item_ocorrencias_pregao_preenchido
    check (char_length(btrim(numero_pregao)) between 1 and 100),
  constraint licitacao_item_ocorrencias_lote_preenchido
    check (char_length(btrim(numero_lote)) between 1 and 100),
  constraint licitacao_item_ocorrencias_documento_path_preenchido
    check (char_length(btrim(documento_path)) between 1 and 1000),
  constraint licitacao_item_ocorrencias_documento_nome_preenchido
    check (char_length(btrim(documento_nome)) between 1 and 255),
  constraint licitacao_item_ocorrencias_documento_mime_check
    check (documento_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  constraint licitacao_item_ocorrencias_documento_tamanho_check
    check (documento_tamanho between 1 and 10485760),
  constraint licitacao_item_ocorrencias_quantidade_check
    check (quantidade_snapshot >= 0),
  constraint licitacao_item_ocorrencias_valor_check
    check (valor_unitario_snapshot >= 0)
);

create table if not exists public.licitacao_item_ocorrencia_emendas (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.licitacao_item_ocorrencias(id) on delete restrict,
  emenda_id uuid not null references public.emendas(id) on delete restrict,
  emenda_item_id uuid not null references public.emenda_itens(id) on delete restrict,
  quantidade_snapshot numeric not null,
  valor_unitario_snapshot numeric not null,
  valor_total_snapshot numeric generated always as
    (round(quantidade_snapshot * valor_unitario_snapshot, 2)) stored,
  secao_id bigint not null references public.secoes(id),
  created_at timestamptz not null default now(),
  constraint licitacao_item_ocorrencia_emendas_unica unique (ocorrencia_id, emenda_item_id),
  constraint licitacao_item_ocorrencia_emendas_quantidade_check check (quantidade_snapshot >= 0),
  constraint licitacao_item_ocorrencia_emendas_valor_check check (valor_unitario_snapshot >= 0)
);

create index if not exists idx_licitacao_item_ocorrencias_processo
  on public.licitacao_item_ocorrencias(processo_id);
create index if not exists idx_licitacao_item_ocorrencias_secao
  on public.licitacao_item_ocorrencias(secao_id);
create index if not exists idx_licitacao_item_ocorrencias_criado_por
  on public.licitacao_item_ocorrencias(criado_por);
create index if not exists idx_licitacao_item_ocorrencia_emendas_emenda_item
  on public.licitacao_item_ocorrencia_emendas(emenda_item_id);
create index if not exists idx_licitacao_item_ocorrencia_emendas_emenda
  on public.licitacao_item_ocorrencia_emendas(emenda_id);
create index if not exists idx_licitacao_item_ocorrencia_emendas_secao
  on public.licitacao_item_ocorrencia_emendas(secao_id);

alter table public.licitacao_item_ocorrencias enable row level security;
alter table public.licitacao_item_ocorrencia_emendas enable row level security;

drop policy if exists licitacao_item_ocorrencias_select_auth on public.licitacao_item_ocorrencias;
create policy licitacao_item_ocorrencias_select_auth
  on public.licitacao_item_ocorrencias for select to authenticated
  using (private.can_access_domain(secao_id, array['licitacoes','contratos','dashboard'], 'view'));

drop policy if exists licitacao_item_ocorrencias_select_public on public.licitacao_item_ocorrencias;
create policy licitacao_item_ocorrencias_select_public
  on public.licitacao_item_ocorrencias for select to anon
  using (exists (
    select 1 from public.licitacao_item_ocorrencia_emendas oe
    where oe.ocorrencia_id = licitacao_item_ocorrencias.id
  ));

drop policy if exists licitacao_item_ocorrencias_insert_auth on public.licitacao_item_ocorrencias;
create policy licitacao_item_ocorrencias_insert_auth
  on public.licitacao_item_ocorrencias for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and private.can_access_domain(secao_id, array['licitacoes','contratos'], 'edit')
  );

drop policy if exists licitacao_item_ocorrencia_emendas_select_auth on public.licitacao_item_ocorrencia_emendas;
create policy licitacao_item_ocorrencia_emendas_select_auth
  on public.licitacao_item_ocorrencia_emendas for select to authenticated
  using (private.can_access_domain(secao_id, array['licitacoes','contratos','dashboard'], 'view'));

drop policy if exists licitacao_item_ocorrencia_emendas_select_public on public.licitacao_item_ocorrencia_emendas;
create policy licitacao_item_ocorrencia_emendas_select_public
  on public.licitacao_item_ocorrencia_emendas for select to anon
  using (exists (
    select 1 from public.emenda_itens ei where ei.id = emenda_item_id
  ));

grant select on public.licitacao_item_ocorrencias to anon, authenticated, service_role;
grant insert on public.licitacao_item_ocorrencias to authenticated, service_role;
grant select on public.licitacao_item_ocorrencia_emendas to anon, authenticated, service_role;
grant insert on public.licitacao_item_ocorrencia_emendas to service_role;
revoke update, delete on public.licitacao_item_ocorrencias from anon, authenticated;
revoke insert, update, delete on public.licitacao_item_ocorrencia_emendas from anon, authenticated;

create or replace function private.prepare_licitacao_item_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.itens%rowtype;
  v_processo public.processos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para encerrar item de licitacao.' using errcode = '42501';
  end if;

  select * into v_item from public.itens where id = new.item_id for update;
  if not found then
    raise exception 'Item da licitacao nao encontrado.' using errcode = 'P0002';
  end if;

  select * into v_processo from public.processos where id = v_item.processo_id;
  if not found then
    raise exception 'Processo da licitacao nao encontrado.' using errcode = 'P0002';
  end if;

  if not private.can_access_domain(v_item.secao_id, array['licitacoes','contratos'], 'edit') then
    raise exception 'Sem permissao para fracassar ou desertar itens desta licitacao.' using errcode = '42501';
  end if;
  if new.processo_id is distinct from v_item.processo_id then
    raise exception 'O item nao pertence ao processo informado.' using errcode = '23514';
  end if;
  if v_item.contrato_id is not null then
    raise exception 'Item ja vinculado a contrato e nao pode ser encerrado na licitacao.' using errcode = '23514';
  end if;
  if exists (select 1 from public.licitacao_item_ocorrencias o where o.item_id = v_item.id) then
    raise exception 'Item ja foi encerrado definitivamente na licitacao.' using errcode = '23505';
  end if;

  new.tipo := upper(btrim(new.tipo));
  new.numero_pregao := btrim(new.numero_pregao);
  new.numero_lote := btrim(new.numero_lote);
  new.observacao := nullif(btrim(new.observacao), '');
  new.documento_path := btrim(new.documento_path);
  new.documento_nome := btrim(new.documento_nome);
  new.processo_identificador_snapshot := v_processo.identificador;
  new.item_descricao_snapshot := coalesce(nullif(btrim(v_item.descricao), ''), '(sem descricao)');
  new.quantidade_snapshot := coalesce(v_item.qtde, 0);
  new.valor_unitario_snapshot := coalesce(v_item.valor_estimado, 0);
  new.secao_id := v_item.secao_id;
  new.criado_por := auth.uid();

  if new.tipo not in ('FRACASSADO', 'DESERTO') then
    raise exception 'Tipo deve ser FRACASSADO ou DESERTO.' using errcode = '22023';
  end if;
  if new.documento_path not like v_item.processo_id::text || '/%' then
    raise exception 'Caminho do documento nao corresponde ao processo.' using errcode = '23514';
  end if;

  update public.itens
  set status = new.tipo,
      status_lic_id = null,
      status_lic_secretaria_id = null,
      status_lic_texto = null,
      status_lic_desde = new.data_ocorrencia::timestamptz
  where id = v_item.id;

  insert into public.itens_status_historico
    (item_id, status_id, status_nome, mudado_por, origem, secao_id)
  values
    (v_item.id, null, new.tipo, auth.uid(), 'ocorrencia_licitacao', v_item.secao_id);

  return new;
end;
$$;

revoke all on function private.prepare_licitacao_item_ocorrencia() from public, anon, authenticated;

drop trigger if exists prepare_licitacao_item_ocorrencia on public.licitacao_item_ocorrencias;
create trigger prepare_licitacao_item_ocorrencia
before insert on public.licitacao_item_ocorrencias
for each row execute function private.prepare_licitacao_item_ocorrencia();

create or replace function private.link_licitacao_item_ocorrencia_emendas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.itens%rowtype;
begin
  select * into v_item from public.itens where id = new.item_id;

  if v_item.emenda_item_id is not null then
    insert into public.licitacao_item_ocorrencia_emendas
      (ocorrencia_id, emenda_id, emenda_item_id, quantidade_snapshot,
       valor_unitario_snapshot, secao_id)
    select new.id, ei.emenda_id, ei.id, new.quantidade_snapshot,
           new.valor_unitario_snapshot, new.secao_id
    from public.emenda_itens ei
    where ei.id = v_item.emenda_item_id
    on conflict (ocorrencia_id, emenda_item_id) do nothing;
  end if;

  insert into public.licitacao_item_ocorrencia_emendas
    (ocorrencia_id, emenda_id, emenda_item_id, quantidade_snapshot,
     valor_unitario_snapshot, secao_id)
  select new.id, ap.emenda_id, ap.emenda_item_id, ap.quantidade_prevista,
         new.valor_unitario_snapshot, new.secao_id
  from public.ata_planejamento_emendas ap
  where ap.processo_item_id = new.item_id
    and ap.status in ('PLANEJAMENTO', 'ATA_VIGENTE_AGUARDANDO_REQUISICAO')
  on conflict (ocorrencia_id, emenda_item_id) do nothing;

  update public.ata_planejamento_emendas
  set status = 'CANCELADO', updated_at = now()
  where processo_item_id = new.item_id
    and status in ('PLANEJAMENTO', 'ATA_VIGENTE_AGUARDANDO_REQUISICAO');

  return new;
end;
$$;

revoke all on function private.link_licitacao_item_ocorrencia_emendas() from public, anon, authenticated;

drop trigger if exists link_licitacao_item_ocorrencia_emendas on public.licitacao_item_ocorrencias;
create trigger link_licitacao_item_ocorrencia_emendas
after insert on public.licitacao_item_ocorrencias
for each row execute function private.link_licitacao_item_ocorrencia_emendas();

create or replace function private.protect_licitacao_item_encerrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.licitacao_item_ocorrencias o
    where o.item_id = old.id
  ) then
    if tg_op = 'UPDATE' and new is not distinct from old then
      return new;
    end if;
    raise exception 'Item encerrado por fracasso/desercao e imutavel.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_licitacao_item_encerrado() from public, anon, authenticated;

drop trigger if exists protect_licitacao_item_encerrado on public.itens;
create trigger protect_licitacao_item_encerrado
before update or delete on public.itens
for each row execute function private.protect_licitacao_item_encerrado();

create or replace function private.reject_licitacao_ocorrencia_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Ocorrencias de licitacao sao historicas e imutaveis.' using errcode = '55000';
end;
$$;

revoke all on function private.reject_licitacao_ocorrencia_mutation() from public, anon, authenticated;

drop trigger if exists reject_licitacao_item_ocorrencia_mutation on public.licitacao_item_ocorrencias;
create trigger reject_licitacao_item_ocorrencia_mutation
before update or delete on public.licitacao_item_ocorrencias
for each row execute function private.reject_licitacao_ocorrencia_mutation();

drop trigger if exists reject_licitacao_item_ocorrencia_emenda_mutation on public.licitacao_item_ocorrencia_emendas;
create trigger reject_licitacao_item_ocorrencia_emenda_mutation
before update or delete on public.licitacao_item_ocorrencia_emendas
for each row execute function private.reject_licitacao_ocorrencia_mutation();

create or replace function public.registrar_licitacao_itens_ocorrencias(
  p_processo_id bigint,
  p_numero_pregao text,
  p_data_ocorrencia date,
  p_observacao text,
  p_documento_path text,
  p_documento_nome text,
  p_documento_mime text,
  p_documento_tamanho bigint,
  p_itens jsonb
)
returns setof public.licitacao_item_ocorrencias
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para encerrar itens de licitacao.' using errcode = '42501';
  end if;
  if p_processo_id is null or nullif(btrim(p_numero_pregao), '') is null then
    raise exception 'Processo e numero do pregao sao obrigatorios.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione ao menos um item.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    return query
    insert into public.licitacao_item_ocorrencias (
      item_id, processo_id, tipo, numero_pregao, numero_lote,
      data_ocorrencia, observacao, documento_path, documento_nome,
      documento_mime, documento_tamanho, processo_identificador_snapshot,
      item_descricao_snapshot, quantidade_snapshot, valor_unitario_snapshot,
      secao_id, criado_por
    ) values (
      (v_item->>'item_id')::uuid,
      p_processo_id,
      v_item->>'tipo',
      p_numero_pregao,
      v_item->>'numero_lote',
      coalesce(p_data_ocorrencia, current_date),
      p_observacao,
      p_documento_path,
      p_documento_nome,
      p_documento_mime,
      p_documento_tamanho,
      '', '', 0, 0, 0, auth.uid()
    )
    returning *;
  end loop;
end;
$$;

revoke all on function public.registrar_licitacao_itens_ocorrencias(
  bigint, text, date, text, text, text, text, bigint, jsonb
) from public, anon;
grant execute on function public.registrar_licitacao_itens_ocorrencias(
  bigint, text, date, text, text, text, text, bigint, jsonb
) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'licitacao-ocorrencias',
  'licitacao-ocorrencias',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists licitacao_ocorrencias_storage_insert on storage.objects;
create policy licitacao_ocorrencias_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'licitacao-ocorrencias'
    and (public.can_access_tab('licitacoes', 'edit') or public.can_access_tab('contratos', 'edit'))
  );

drop policy if exists licitacao_ocorrencias_storage_select_auth on storage.objects;
create policy licitacao_ocorrencias_storage_select_auth
  on storage.objects for select to authenticated
  using (
    bucket_id = 'licitacao-ocorrencias'
    and (
      public.can_access_tab('licitacoes', 'view')
      or public.can_access_tab('contratos', 'view')
      or public.can_access_tab('dashboard', 'view')
    )
  );

drop policy if exists licitacao_ocorrencias_storage_select_public on storage.objects;
create policy licitacao_ocorrencias_storage_select_public
  on storage.objects for select to anon
  using (
    bucket_id = 'licitacao-ocorrencias'
    and exists (
      select 1
      from public.licitacao_item_ocorrencias o
      join public.licitacao_item_ocorrencia_emendas oe on oe.ocorrencia_id = o.id
      where o.documento_path = storage.objects.name
    )
  );

drop policy if exists licitacao_ocorrencias_storage_delete_orphan on storage.objects;
create policy licitacao_ocorrencias_storage_delete_orphan
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'licitacao-ocorrencias'
    and owner_id = (select auth.uid()::text)
    and not exists (
      select 1 from public.licitacao_item_ocorrencias o
      where o.documento_path = storage.objects.name
    )
  );

create or replace view public.vw_emendas_saldo
with (security_invoker = true) as
with planejado as (
  select
    ei.id as emenda_item_id,
    ei.emenda_id,
    coalesce(
      ei.vl_total_cadastrado,
      coalesce(ei.qtde_cadastrada, ei.qtde, 0) *
      coalesce(ei.vl_unitario_cadastrado, ei.vl_unitario, 0),
      0
    )::numeric as valor_planejado
  from public.emenda_itens ei
),
licitacao as (
  select
    i.emenda_item_id,
    sum(case when i.valor_contratado is null
      then coalesce(i.valor_estimado, 0) * coalesce(i.qtde, 0) else 0 end)::numeric
      as valor_estimado_licitacao,
    sum(case when i.valor_contratado is null and o.item_id is null
      then coalesce(i.valor_estimado, 0) * coalesce(i.qtde, 0) else 0 end)::numeric
      as valor_estimado_ativo,
    sum(case when i.valor_contratado is not null
      then coalesce(i.valor_contratado, 0) * coalesce(i.qtde, 0) else 0 end)::numeric
      as valor_contratado,
    count(*)::bigint as qtd_vinculos
  from public.itens i
  left join public.licitacao_item_ocorrencias o on o.item_id = i.id
  where i.emenda_item_id is not null
  group by i.emenda_item_id
),
ocorrencias as (
  select
    oe.emenda_item_id,
    sum(coalesce(oe.valor_total_snapshot, 0))::numeric as valor_ocorrencia,
    count(*)::bigint as qtd_ocorrencias
  from public.licitacao_item_ocorrencia_emendas oe
  group by oe.emenda_item_id
),
ata as (
  select
    ae.emenda_item_id,
    sum(coalesce(ae.valor, 0))::numeric as valor_contratado,
    count(*)::bigint as qtd_vinculos
  from public.atas_execucao ae
  where ae.emenda_item_id is not null
  group by ae.emenda_item_id
),
por_item as (
  select
    p.emenda_id,
    p.emenda_item_id,
    p.valor_planejado,
    case
      when l.emenda_item_id is not null then coalesce(l.valor_estimado_licitacao, 0)
      else coalesce(o.valor_ocorrencia, 0)
    end::numeric as valor_estimado_licitacao,
    coalesce(l.valor_contratado, a.valor_contratado, 0)::numeric as valor_contratado,
    coalesce(o.valor_ocorrencia, 0)::numeric as valor_ocorrencia,
    case
      when l.emenda_item_id is not null then
        coalesce(l.valor_estimado_ativo, 0) + coalesce(l.valor_contratado, 0)
      when a.emenda_item_id is not null then coalesce(a.valor_contratado, 0)
      when o.emenda_item_id is not null then 0
      else p.valor_planejado
    end::numeric as valor_consumido,
    coalesce(l.qtd_vinculos, a.qtd_vinculos, o.qtd_ocorrencias, 0)::bigint as qtd_vinculos,
    coalesce(o.qtd_ocorrencias, 0)::bigint as qtd_ocorrencias
  from planejado p
  left join licitacao l on l.emenda_item_id = p.emenda_item_id
  left join ata a on a.emenda_item_id = p.emenda_item_id
  left join ocorrencias o on o.emenda_item_id = p.emenda_item_id
),
agregado as (
  select
    e.id,
    e.emenda as numero_emenda,
    e.ano,
    e.tipo,
    e.parlamentar,
    e.sei_emenda,
    e.unidade,
    e.objeto,
    e.valor_cedido,
    coalesce(sum(pi.valor_planejado), 0)::numeric as total_planejado,
    coalesce(sum(pi.valor_estimado_licitacao), 0)::numeric as total_estimado_licitacao,
    coalesce(sum(pi.valor_contratado), 0)::numeric as total_contratado,
    coalesce(sum(pi.valor_ocorrencia), 0)::numeric as total_ocorrencia,
    coalesce(sum(pi.valor_consumido), 0)::numeric as total_consumido,
    count(pi.emenda_item_id)::bigint as qtd_itens,
    coalesce(sum(pi.qtd_vinculos), 0)::bigint as qtd_vinculos,
    coalesce(sum(pi.qtd_ocorrencias), 0)::bigint as qtd_ocorrencias
  from public.emendas e
  left join por_item pi on pi.emenda_id = e.id
  group by e.id
)
select
  a.id,
  a.numero_emenda,
  a.ano,
  a.tipo,
  a.parlamentar,
  a.sei_emenda,
  a.unidade,
  a.objeto,
  a.valor_cedido,
  a.total_planejado,
  (a.total_contratado - a.total_ocorrencia)::numeric as total_executado,
  a.total_consumido as total_comprometido,
  (a.valor_cedido - a.total_consumido)::numeric as saldo_remanescente,
  case
    when a.valor_cedido is null then null::text
    when a.total_consumido >= a.valor_cedido * 0.99 then 'Executada'::text
    when a.total_consumido > 0 and a.total_ocorrencia > 0 then 'Em andamento com ocorrências'::text
    when a.total_consumido > 0 then 'Em andamento'::text
    when a.total_ocorrencia > 0 then 'Com itens fracassados/desertos'::text
    else 'Não iniciada'::text
  end as status_execucao,
  a.qtd_itens,
  a.total_estimado_licitacao,
  a.total_contratado,
  (-a.total_ocorrencia)::numeric as total_ocorrencias_negativas,
  a.qtd_ocorrencias as qtd_itens_ocorrencia
from agregado a;

grant select on public.vw_emendas_saldo to anon, authenticated, service_role;

notify pgrst, 'reload schema';
