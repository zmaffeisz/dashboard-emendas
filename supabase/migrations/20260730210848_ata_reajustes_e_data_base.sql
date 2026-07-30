begin;

alter table public.contratos
  add column if not exists data_base_reajuste date;

comment on column public.contratos.data_base_reajuste is
  'Data-base contratual usada apenas como referência para reajustes. Não aplica reajuste automaticamente.';

create table if not exists public.atas_item_reajustes (
  id uuid primary key default gen_random_uuid(),
  ata_item_id uuid not null references public.atas_itens(id) on delete restrict,
  contrato_id integer not null references public.contratos(id) on delete restrict,
  data_vigencia date not null,
  percentual numeric(12,6) not null,
  valor_unitario_anterior numeric(18,4) not null,
  valor_unitario_novo numeric(18,4) not null,
  observacoes text,
  status text not null default 'ATIVO'
    check (status in ('ATIVO','CANCELADO')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  cancelado_por uuid,
  cancelado_em timestamptz,
  secao_id bigint references public.secoes(id),
  constraint atas_item_reajustes_valores_validos check (
    valor_unitario_anterior >= 0
    and valor_unitario_novo > 0
  )
);

create unique index if not exists atas_item_reajustes_item_vigencia_ativo_uidx
  on public.atas_item_reajustes (ata_item_id, data_vigencia)
  where status = 'ATIVO';

create index if not exists atas_item_reajustes_contrato_idx
  on public.atas_item_reajustes (contrato_id, data_vigencia desc);

create index if not exists atas_item_reajustes_item_idx
  on public.atas_item_reajustes (ata_item_id, data_vigencia desc);

create table if not exists public.atas_execucao_reajustes (
  id uuid primary key default gen_random_uuid(),
  ata_reajuste_id uuid not null references public.atas_item_reajustes(id) on delete restrict,
  ata_execucao_id uuid not null references public.atas_execucao(id) on delete restrict,
  origem_recurso text not null
    check (origem_recurso in ('emenda','recurso_proprio')),
  emenda_id uuid references public.emendas(id) on delete restrict,
  emenda_item_id uuid references public.emenda_itens(id) on delete restrict,
  quantidade_reajustada numeric(18,4) not null,
  valor_unitario_anterior numeric(18,4) not null,
  valor_unitario_reajustado numeric(18,4) not null,
  valor_reajuste_unitario numeric(18,4) not null,
  valor_reajuste_total numeric(18,2) not null,
  empenho text,
  nota_fiscal text,
  status text not null default 'ATIVO'
    check (status in ('ATIVO','CANCELADO')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  cancelado_por uuid,
  cancelado_em timestamptz,
  secao_id bigint references public.secoes(id),
  constraint atas_execucao_reajustes_valores_validos check (
    quantidade_reajustada > 0
    and valor_unitario_anterior >= 0
    and valor_unitario_reajustado > valor_unitario_anterior
    and valor_reajuste_unitario > 0
    and valor_reajuste_total > 0
  ),
  constraint atas_execucao_reajustes_emenda_coerente check (
    (origem_recurso = 'emenda' and emenda_id is not null and emenda_item_id is not null)
    or
    (origem_recurso = 'recurso_proprio' and emenda_id is null and emenda_item_id is null)
  )
);

create unique index if not exists atas_execucao_reajustes_unico_ativo_uidx
  on public.atas_execucao_reajustes (ata_reajuste_id, ata_execucao_id)
  where status = 'ATIVO';

create index if not exists atas_execucao_reajustes_execucao_idx
  on public.atas_execucao_reajustes (ata_execucao_id, criado_em desc);

create index if not exists atas_execucao_reajustes_emenda_item_idx
  on public.atas_execucao_reajustes (emenda_item_id)
  where emenda_item_id is not null;

comment on table public.atas_item_reajustes is
  'Histórico de versões de preço dos itens de ATA. O valor original de atas_itens não é sobrescrito.';

comment on table public.atas_execucao_reajustes is
  'Pagamentos complementares de reajuste por execução, sem alterar AF, NF ou valor original da execução.';

alter table public.atas_item_reajustes enable row level security;
alter table public.atas_execucao_reajustes enable row level security;

drop policy if exists scoped_select on public.atas_item_reajustes;
create policy scoped_select on public.atas_item_reajustes
  for select to authenticated
  using (private.can_access_domain(secao_id, array['atas']::text[], 'view'));

drop policy if exists scoped_insert on public.atas_item_reajustes;
create policy scoped_insert on public.atas_item_reajustes
  for insert to authenticated
  with check (private.can_access_domain(secao_id, array['atas']::text[], 'edit'));

drop policy if exists scoped_update on public.atas_item_reajustes;
create policy scoped_update on public.atas_item_reajustes
  for update to authenticated
  using (private.can_access_domain(secao_id, array['atas']::text[], 'edit'))
  with check (private.can_access_domain(secao_id, array['atas']::text[], 'edit'));

drop policy if exists scoped_select on public.atas_execucao_reajustes;
create policy scoped_select on public.atas_execucao_reajustes
  for select to authenticated
  using (private.can_access_domain(secao_id, array['atas']::text[], 'view'));

drop policy if exists scoped_insert on public.atas_execucao_reajustes;
create policy scoped_insert on public.atas_execucao_reajustes
  for insert to authenticated
  with check (private.can_access_domain(secao_id, array['atas']::text[], 'edit'));

drop policy if exists scoped_update on public.atas_execucao_reajustes;
create policy scoped_update on public.atas_execucao_reajustes
  for update to authenticated
  using (private.can_access_domain(secao_id, array['atas']::text[], 'edit'))
  with check (private.can_access_domain(secao_id, array['atas']::text[], 'edit'));

grant select, insert, update on public.atas_item_reajustes to authenticated;
grant select, insert, update on public.atas_execucao_reajustes to authenticated;

create or replace function public.registrar_reajuste_item_ata(
  p_ata_item_id uuid,
  p_data_vigencia date,
  p_percentual numeric,
  p_valor_unitario_novo numeric,
  p_observacoes text default null
)
returns public.atas_item_reajustes
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item public.atas_itens%rowtype;
  v_valor_anterior numeric;
  v_registro public.atas_item_reajustes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_data_vigencia is null then
    raise exception 'Informe a data de vigência do reajuste.';
  end if;
  if p_percentual is null then
    raise exception 'Informe a porcentagem do reajuste.';
  end if;
  if p_valor_unitario_novo is null or p_valor_unitario_novo <= 0 then
    raise exception 'Informe um novo valor unitário válido.';
  end if;

  select *
    into v_item
    from public.atas_itens
   where id = p_ata_item_id;
  if not found then
    raise exception 'Item da ATA não encontrado.';
  end if;

  if exists (
    select 1
      from public.atas_item_reajustes r
     where r.ata_item_id = p_ata_item_id
       and r.status = 'ATIVO'
       and r.data_vigencia >= p_data_vigencia
  ) then
    raise exception 'Já existe um reajuste nesta data ou em data posterior. Cadastre os reajustes em ordem cronológica.';
  end if;

  select r.valor_unitario_novo
    into v_valor_anterior
    from public.atas_item_reajustes r
   where r.ata_item_id = p_ata_item_id
     and r.status = 'ATIVO'
     and r.data_vigencia < p_data_vigencia
   order by r.data_vigencia desc, r.criado_em desc
   limit 1;

  v_valor_anterior := coalesce(v_valor_anterior, v_item.valor_unit, 0);
  if p_valor_unitario_novo <= v_valor_anterior then
    raise exception 'O novo valor deve ser maior que o valor vigente (%).', v_valor_anterior;
  end if;

  insert into public.atas_item_reajustes (
    ata_item_id, contrato_id, data_vigencia, percentual,
    valor_unitario_anterior, valor_unitario_novo, observacoes,
    criado_por, secao_id
  ) values (
    v_item.id, v_item.contrato_id, p_data_vigencia, p_percentual,
    v_valor_anterior, p_valor_unitario_novo, nullif(trim(p_observacoes), ''),
    auth.uid(), coalesce(v_item.secao_id, (
      select c.secao_id from public.contratos c where c.id = v_item.contrato_id
    ))
  )
  returning * into v_registro;

  return v_registro;
end;
$function$;

revoke all on function public.registrar_reajuste_item_ata(uuid,date,numeric,numeric,text) from public;
grant execute on function public.registrar_reajuste_item_ata(uuid,date,numeric,numeric,text) to authenticated;

create or replace function public.registrar_reajuste_execucao_ata(
  p_ata_reajuste_id uuid,
  p_ata_execucao_id uuid,
  p_origem_recurso text,
  p_emenda_id uuid default null,
  p_quantidade numeric default null,
  p_empenho text default null,
  p_nota_fiscal text default null
)
returns public.atas_execucao_reajustes
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reajuste public.atas_item_reajustes%rowtype;
  v_execucao public.atas_execucao%rowtype;
  v_item public.atas_itens%rowtype;
  v_contrato public.contratos%rowtype;
  v_emenda public.emendas%rowtype;
  v_emenda_item_id uuid;
  v_quantidade numeric;
  v_valor_anterior numeric;
  v_diferenca numeric;
  v_total numeric;
  v_descricao text;
  v_status_entregue_id bigint;
  v_registro public.atas_execucao_reajustes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_origem_recurso not in ('emenda','recurso_proprio') then
    raise exception 'Informe uma origem de recurso válida.';
  end if;

  select * into v_reajuste
    from public.atas_item_reajustes
   where id = p_ata_reajuste_id and status = 'ATIVO';
  if not found then
    raise exception 'Reajuste do item não encontrado ou cancelado.';
  end if;

  select * into v_execucao
    from public.atas_execucao
   where id = p_ata_execucao_id;
  if not found then
    raise exception 'Execução da ATA não encontrada.';
  end if;
  if v_execucao.ata_item_id is distinct from v_reajuste.ata_item_id then
    raise exception 'A execução não pertence ao item reajustado.';
  end if;

  if exists (
    select 1
      from public.atas_execucao_reajustes er
     where er.ata_reajuste_id = p_ata_reajuste_id
       and er.ata_execucao_id = p_ata_execucao_id
       and er.status = 'ATIVO'
  ) then
    raise exception 'Esta execução já recebeu o reajuste selecionado.';
  end if;

  select * into v_item from public.atas_itens where id = v_reajuste.ata_item_id;
  select * into v_contrato from public.contratos where id = v_reajuste.contrato_id;

  v_quantidade := coalesce(p_quantidade, v_execucao.qtde, 0);
  if v_quantidade <= 0 or v_quantidade > coalesce(v_execucao.qtde, 0) then
    raise exception 'A quantidade reajustada deve ser maior que zero e não pode ultrapassar a execução.';
  end if;

  v_valor_anterior := case
    when coalesce(v_execucao.qtde, 0) > 0
      then coalesce(v_execucao.valor, 0) / v_execucao.qtde
    else v_reajuste.valor_unitario_anterior
  end;
  v_diferenca := v_reajuste.valor_unitario_novo - v_valor_anterior;
  if v_diferenca <= 0 then
    raise exception 'Esta execução já possui valor igual ou superior ao valor reajustado.';
  end if;
  v_total := round(v_diferenca * v_quantidade, 2);

  if p_origem_recurso = 'emenda' then
    if p_emenda_id is null then
      raise exception 'Selecione a emenda que pagará o reajuste.';
    end if;
    select * into v_emenda from public.emendas where id = p_emenda_id;
    if not found then
      raise exception 'Emenda selecionada não encontrada.';
    end if;

    v_descricao := concat(
      'REAJUSTE DO ITEM ', coalesce(v_item.item, v_execucao.item, 'SEM DESCRIÇÃO'),
      case when nullif(trim(coalesce(p_empenho, v_execucao.empenho, '')), '') is not null
        then concat(' - EMPENHO ', coalesce(nullif(trim(p_empenho), ''), v_execucao.empenho)) else '' end,
      case when nullif(trim(coalesce(p_nota_fiscal, v_execucao.nf, '')), '') is not null
        then concat(' - NOTA FISCAL ', coalesce(nullif(trim(p_nota_fiscal), ''), v_execucao.nf)) else '' end
    );

    select id into v_status_entregue_id
      from public.status_opcoes
     where contexto = 'emenda_item' and upper(nome) = 'ENTREGUE'
     order by ordem
     limit 1;

    insert into public.emenda_itens (
      emenda_id, emenda, item, qtde, vl_unitario, vl_total,
      cpl, processo_id, status, status_id, nota_fiscal, empenho,
      unidade_beneficiada, unidade_entrega,
      item_cadastrado, qtde_cadastrada,
      vl_unitario_cadastrado, vl_total_cadastrado,
      data_atualizacao, secao_id
    ) values (
      v_emenda.id, v_emenda.emenda, v_descricao, v_quantidade, v_diferenca, v_total,
      coalesce(v_contrato.cpl, v_execucao.cpl), v_contrato.processo_id,
      'ENTREGUE', v_status_entregue_id,
      coalesce(nullif(trim(p_nota_fiscal), ''), nullif(trim(v_execucao.nf), '')),
      coalesce(nullif(trim(p_empenho), ''), nullif(trim(v_execucao.empenho), '')),
      nullif(trim(v_execucao.unidade), ''), nullif(trim(v_execucao.unidade), ''),
      v_descricao, v_quantidade, v_diferenca, v_total,
      to_char(current_date, 'DD/MM/YYYY'), coalesce(v_execucao.secao_id, v_item.secao_id)
    )
    returning id into v_emenda_item_id;
  end if;

  insert into public.atas_execucao_reajustes (
    ata_reajuste_id, ata_execucao_id, origem_recurso,
    emenda_id, emenda_item_id, quantidade_reajustada,
    valor_unitario_anterior, valor_unitario_reajustado,
    valor_reajuste_unitario, valor_reajuste_total,
    empenho, nota_fiscal, criado_por, secao_id
  ) values (
    v_reajuste.id, v_execucao.id, p_origem_recurso,
    case when p_origem_recurso = 'emenda' then p_emenda_id else null end,
    v_emenda_item_id, v_quantidade,
    v_valor_anterior, v_reajuste.valor_unitario_novo,
    v_diferenca, v_total,
    coalesce(nullif(trim(p_empenho), ''), nullif(trim(v_execucao.empenho), '')),
    coalesce(nullif(trim(p_nota_fiscal), ''), nullif(trim(v_execucao.nf), '')),
    auth.uid(), coalesce(v_execucao.secao_id, v_item.secao_id)
  )
  returning * into v_registro;

  return v_registro;
end;
$function$;

revoke all on function public.registrar_reajuste_execucao_ata(uuid,uuid,text,uuid,numeric,text,text) from public;
grant execute on function public.registrar_reajuste_execucao_ata(uuid,uuid,text,uuid,numeric,text,text) to authenticated;

commit;
