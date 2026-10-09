-- Somente contratos-dag (qpvgpfwuurqcqprnpxua).
-- Separa o valor real do item da licitacao das emendas que o financiam.

begin;

create table if not exists public.licitacao_item_recursos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itens(id) on delete cascade,
  emenda_id uuid not null references public.emendas(id) on delete restrict,
  emenda_item_id uuid not null references public.emenda_itens(id) on delete restrict,
  tipo text not null,
  valor_alocado numeric(14,2) not null,
  status text not null default 'ATIVO',
  emenda_item_gerado boolean not null default false,
  justificativa_cancelamento text,
  cancelado_em timestamptz,
  cancelado_por uuid,
  secao_id bigint not null references public.secoes(id) on delete restrict,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint licitacao_item_recursos_tipo_check
    check (tipo in ('PRINCIPAL','COMPLEMENTO')),
  constraint licitacao_item_recursos_valor_check
    check (valor_alocado > 0),
  constraint licitacao_item_recursos_status_check
    check (status in ('ATIVO','CANCELADO')),
  constraint licitacao_item_recursos_cancelamento_check
    check (
      (status = 'ATIVO' and justificativa_cancelamento is null and cancelado_em is null)
      or
      (status = 'CANCELADO' and nullif(btrim(justificativa_cancelamento),'') is not null and cancelado_em is not null)
    )
);

create index if not exists licitacao_item_recursos_item_idx
  on public.licitacao_item_recursos(item_id);
create index if not exists licitacao_item_recursos_emenda_idx
  on public.licitacao_item_recursos(emenda_id);
create index if not exists licitacao_item_recursos_emenda_item_idx
  on public.licitacao_item_recursos(emenda_item_id);
create index if not exists licitacao_item_recursos_secao_idx
  on public.licitacao_item_recursos(secao_id);
create unique index if not exists licitacao_item_recursos_emenda_ativa_unica
  on public.licitacao_item_recursos(item_id,emenda_id)
  where status='ATIVO';
create unique index if not exists licitacao_item_recursos_principal_ativo_unico
  on public.licitacao_item_recursos(item_id)
  where tipo='PRINCIPAL' and status='ATIVO';

comment on table public.licitacao_item_recursos is
  'Rateio financeiro de um item de licitacao entre uma emenda principal e zero ou mais emendas complementares.';
comment on column public.licitacao_item_recursos.valor_alocado is
  'Parcela monetaria da compra atribuida a esta emenda; nao representa quantidade nem valor unitario do bem.';
comment on column public.licitacao_item_recursos.emenda_item_gerado is
  'True quando o emenda_item foi criado automaticamente para representar um complemento.';

alter table public.licitacao_item_recursos enable row level security;

drop policy if exists licitacao_item_recursos_select_public on public.licitacao_item_recursos;
create policy licitacao_item_recursos_select_public
on public.licitacao_item_recursos for select to anon
using (
  exists (
    select 1 from public.emenda_itens ei
    where ei.id=licitacao_item_recursos.emenda_item_id
  )
);

drop policy if exists licitacao_item_recursos_select_auth on public.licitacao_item_recursos;
create policy licitacao_item_recursos_select_auth
on public.licitacao_item_recursos for select to authenticated
using (
  private.can_access_domain(secao_id,array['licitacoes','dashboard'],'view')
);

revoke all on table public.licitacao_item_recursos from public,anon,authenticated;
grant select on table public.licitacao_item_recursos to anon,authenticated;
grant all on table public.licitacao_item_recursos to service_role;

-- Fotografa os vinculos simples existentes como fonte principal, sem converter
-- descricoes antigas de "complemento financeiro" e sem alterar valores atuais.
insert into public.licitacao_item_recursos (
  item_id,emenda_id,emenda_item_id,tipo,valor_alocado,status,
  emenda_item_gerado,secao_id,created_at,updated_at
)
select
  i.id,i.emenda_id,i.emenda_item_id,'PRINCIPAL',
  round(coalesce(
    case when i.valor_contratado is not null
      then coalesce(i.qtde,0)*coalesce(i.valor_contratado,0)
      else coalesce(i.qtde,0)*coalesce(i.valor_estimado,0)
    end,
    ei.vl_total_cadastrado,
    ei.vl_total,
    0
  ),2),
  'ATIVO',false,coalesce(i.secao_id,ei.secao_id),coalesce(i.created_at,now()),now()
from public.itens i
join public.emenda_itens ei on ei.id=i.emenda_item_id
where i.emenda_id is not null
  and coalesce(i.secao_id,ei.secao_id) is not null
  and coalesce(
    case when i.valor_contratado is not null
      then coalesce(i.qtde,0)*coalesce(i.valor_contratado,0)
      else coalesce(i.qtde,0)*coalesce(i.valor_estimado,0)
    end,
    ei.vl_total_cadastrado,
    ei.vl_total,
    0
  ) > 0
  and not exists (
    select 1 from public.licitacao_item_recursos r where r.item_id=i.id
  );

create or replace function private.salvar_licitacao_item_recursos_impl(
  p_item_id uuid,
  p_recursos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.itens%rowtype;
  v_processo public.processos%rowtype;
  v_recurso public.licitacao_item_recursos%rowtype;
  v_emenda public.emendas%rowtype;
  v_emenda_item public.emenda_itens%rowtype;
  v_dado jsonb;
  v_id uuid;
  v_emenda_id uuid;
  v_emenda_item_id uuid;
  v_tipo text;
  v_valor numeric(14,2);
  v_unidade text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para alterar fontes de recurso.' using errcode='42501';
  end if;
  if not public.can_access_tab('licitacoes','edit') then
    raise exception 'E necessario ter permissao de edicao em Licitacoes.' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_recursos,'[]'::jsonb)) <> 'array' then
    raise exception 'A lista de fontes de recurso e invalida.' using errcode='22023';
  end if;

  select * into v_item from public.itens where id=p_item_id for update;
  if not found then
    raise exception 'Item da licitacao nao encontrado.' using errcode='P0002';
  end if;
  if not private.can_access_secao(v_item.secao_id) then
    raise exception 'Sem permissao para a secao deste item.' using errcode='42501';
  end if;
  if exists(select 1 from public.licitacao_item_ocorrencias o where o.item_id=v_item.id) then
    raise exception 'O rateio nao pode ser alterado porque o item foi encerrado na licitacao.' using errcode='55000';
  end if;

  select * into v_processo from public.processos where id=v_item.processo_id;

  for v_dado in select value from jsonb_array_elements(coalesce(p_recursos,'[]'::jsonb))
  loop
    v_id:=nullif(v_dado->>'id','')::uuid;
    v_emenda_id:=nullif(v_dado->>'emenda_id','')::uuid;
    v_emenda_item_id:=nullif(v_dado->>'emenda_item_id','')::uuid;
    v_tipo:=upper(btrim(coalesce(v_dado->>'tipo','')));
    v_valor:=round(nullif(v_dado->>'valor_alocado','')::numeric,2);

    if v_tipo not in ('PRINCIPAL','COMPLEMENTO') or v_valor is null or v_valor<=0 then
      raise exception 'Cada fonte precisa de tipo e valor positivo.' using errcode='22023';
    end if;

    if v_id is not null then
      select * into v_recurso
      from public.licitacao_item_recursos
      where id=v_id and item_id=v_item.id
      for update;
      if not found then
        raise exception 'Fonte de recurso nao encontrada para este item.' using errcode='P0002';
      end if;
      if v_recurso.status<>'ATIVO' then
        raise exception 'Fonte cancelada e historica; crie um novo complemento.' using errcode='55000';
      end if;
      if v_tipo<>v_recurso.tipo
         or (v_emenda_id is not null and v_emenda_id<>v_recurso.emenda_id)
         or (v_emenda_item_id is not null and v_emenda_item_id<>v_recurso.emenda_item_id) then
        raise exception 'A identidade de uma fonte existente nao pode ser trocada.' using errcode='23514';
      end if;

      update public.licitacao_item_recursos
      set valor_alocado=v_valor,updated_at=now()
      where id=v_recurso.id;

      if v_recurso.emenda_item_gerado then
        update public.emenda_itens
        set item=coalesce(nullif(btrim(v_item.descricao),''),'Item da licitacao'),
            item_cadastrado=coalesce(nullif(btrim(v_item.descricao),''),'Item da licitacao'),
            vl_total_cadastrado=v_valor,
            processo_id=v_item.processo_id,
            cpl=coalesce(v_processo.identificador,cpl),
            unidade_beneficiada_id=coalesce(v_item.unidade_destino_id,unidade_beneficiada_id),
            status='COMPLEMENTO FINANCEIRO - EM LICITACAO',
            data_atualizacao=to_char(current_date,'DD/MM/YYYY')
        where id=v_recurso.emenda_item_id;
      end if;
      continue;
    end if;

    if v_tipo='PRINCIPAL' then
      if v_item.emenda_id is null or v_item.emenda_item_id is null
         or v_emenda_id is distinct from v_item.emenda_id
         or v_emenda_item_id is distinct from v_item.emenda_item_id then
        raise exception 'A fonte principal deve ser o item puxado da emenda.' using errcode='23514';
      end if;
      if exists(
        select 1 from public.licitacao_item_recursos r
        where r.item_id=v_item.id and r.tipo='PRINCIPAL' and r.status='ATIVO'
      ) then
        raise exception 'Este item ja possui fonte principal.' using errcode='23505';
      end if;
      select * into v_emenda_item from public.emenda_itens
      where id=v_emenda_item_id and emenda_id=v_emenda_id;
      if not found then
        raise exception 'Item principal da emenda nao encontrado.' using errcode='P0002';
      end if;

      insert into public.licitacao_item_recursos(
        item_id,emenda_id,emenda_item_id,tipo,valor_alocado,status,
        emenda_item_gerado,secao_id,criado_por
      ) values (
        v_item.id,v_emenda_id,v_emenda_item_id,'PRINCIPAL',v_valor,'ATIVO',
        false,v_item.secao_id,auth.uid()
      );
      update public.emenda_itens
      set processo_id=coalesce(processo_id,v_item.processo_id),
          cpl=coalesce(nullif(cpl,''),v_processo.identificador)
      where id=v_emenda_item_id;
      continue;
    end if;

    if v_emenda_id is null then
      raise exception 'Selecione a emenda que fara o complemento.' using errcode='22023';
    end if;
    if v_emenda_id=v_item.emenda_id then
      raise exception 'A emenda principal nao pode ser repetida como complemento.' using errcode='23514';
    end if;
    if exists(
      select 1 from public.licitacao_item_recursos r
      where r.item_id=v_item.id and r.emenda_id=v_emenda_id and r.status='ATIVO'
    ) then
      raise exception 'Esta emenda ja participa do rateio deste item.' using errcode='23505';
    end if;

    select * into v_emenda from public.emendas where id=v_emenda_id;
    if not found or v_emenda.secao_id is distinct from v_item.secao_id then
      raise exception 'Emenda complementar nao encontrada na mesma secao do processo.' using errcode='23514';
    end if;
    select nome into v_unidade from public.unidades where id=v_item.unidade_destino_id;

    insert into public.emenda_itens(
      emenda_id,emenda,item,qtde,vl_unitario,vl_total,cpl,processo_id,status,
      unidade_beneficiada,unidade_beneficiada_id,unidade_entrega,unidade_entrega_id,
      item_cadastrado,qtde_cadastrada,vl_unitario_cadastrado,vl_total_cadastrado,
      data_atualizacao,secao_id
    ) values (
      v_emenda.id,v_emenda.emenda,
      coalesce(nullif(btrim(v_item.descricao),''),'Item da licitacao'),
      null,null,null,v_processo.identificador,v_item.processo_id,
      'COMPLEMENTO FINANCEIRO - EM LICITACAO',
      v_unidade,v_item.unidade_destino_id,v_unidade,v_item.unidade_destino_id,
      coalesce(nullif(btrim(v_item.descricao),''),'Item da licitacao'),
      null,null,v_valor,to_char(current_date,'DD/MM/YYYY'),v_item.secao_id
    ) returning id into v_emenda_item_id;

    insert into public.licitacao_item_recursos(
      item_id,emenda_id,emenda_item_id,tipo,valor_alocado,status,
      emenda_item_gerado,secao_id,criado_por
    ) values (
      v_item.id,v_emenda.id,v_emenda_item_id,'COMPLEMENTO',v_valor,'ATIVO',
      true,v_item.secao_id,auth.uid()
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.tipo desc,r.created_at,r.id),'[]'::jsonb)
  into v_result
  from public.licitacao_item_recursos r
  where r.item_id=v_item.id;
  return v_result;
end;
$$;

create or replace function private.cancelar_licitacao_item_recurso_impl(
  p_recurso_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurso public.licitacao_item_recursos%rowtype;
  v_item public.itens%rowtype;
  v_justificativa text:=nullif(btrim(p_justificativa),'');
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para cancelar complementos.' using errcode='42501';
  end if;
  if not public.can_access_tab('licitacoes','edit') then
    raise exception 'E necessario ter permissao de edicao em Licitacoes.' using errcode='42501';
  end if;
  if v_justificativa is null or char_length(v_justificativa)<5 then
    raise exception 'Informe uma justificativa com pelo menos 5 caracteres.' using errcode='22023';
  end if;

  select * into v_recurso from public.licitacao_item_recursos
  where id=p_recurso_id for update;
  if not found then
    raise exception 'Complemento nao encontrado.' using errcode='P0002';
  end if;
  select * into v_item from public.itens where id=v_recurso.item_id;
  if not found or not private.can_access_secao(v_item.secao_id) then
    raise exception 'Item nao encontrado ou sem permissao.' using errcode='42501';
  end if;
  if v_recurso.tipo<>'COMPLEMENTO' then
    raise exception 'A fonte principal nao pode ser cancelada por esta acao.' using errcode='23514';
  end if;
  if v_recurso.status<>'ATIVO' then
    raise exception 'Este complemento ja esta cancelado.' using errcode='55000';
  end if;

  update public.licitacao_item_recursos
  set status='CANCELADO',justificativa_cancelamento=v_justificativa,
      cancelado_em=now(),cancelado_por=auth.uid(),updated_at=now()
  where id=v_recurso.id;

  if v_recurso.emenda_item_gerado then
    update public.emenda_itens
    set status='COMPLEMENTO CANCELADO - '||v_justificativa,
        data_atualizacao=to_char(current_date,'DD/MM/YYYY')
    where id=v_recurso.emenda_item_id;
  end if;

  return jsonb_build_object(
    'id',v_recurso.id,'status','CANCELADO','valor_alocado',v_recurso.valor_alocado,
    'justificativa_cancelamento',v_justificativa
  );
end;
$$;

revoke all on function private.salvar_licitacao_item_recursos_impl(uuid,jsonb) from public,anon;
revoke all on function private.cancelar_licitacao_item_recurso_impl(uuid,text) from public,anon;
grant execute on function private.salvar_licitacao_item_recursos_impl(uuid,jsonb) to authenticated,service_role;
grant execute on function private.cancelar_licitacao_item_recurso_impl(uuid,text) to authenticated,service_role;

create or replace function public.salvar_licitacao_item_recursos(
  p_item_id uuid,
  p_recursos jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.salvar_licitacao_item_recursos_impl(p_item_id,p_recursos)
$$;

create or replace function public.cancelar_licitacao_item_recurso(
  p_recurso_id uuid,
  p_justificativa text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.cancelar_licitacao_item_recurso_impl(p_recurso_id,p_justificativa)
$$;

revoke all on function public.salvar_licitacao_item_recursos(uuid,jsonb) from public,anon;
revoke all on function public.cancelar_licitacao_item_recurso(uuid,text) from public,anon;
grant execute on function public.salvar_licitacao_item_recursos(uuid,jsonb) to authenticated,service_role;
grant execute on function public.cancelar_licitacao_item_recurso(uuid,text) to authenticated,service_role;

comment on function public.salvar_licitacao_item_recursos(uuid,jsonb) is
  'Cria e atualiza o rateio financeiro de um item de licitacao. Complementos criam emenda_itens automaticamente.';
comment on function public.cancelar_licitacao_item_recurso(uuid,text) is
  'Cancela um complemento com justificativa, preservando o historico e liberando o saldo.';

-- Fracasso/desercao fotografa cada parcela ativa. Usa quantidade 1 porque o
-- valor do vinculo e financeiro, nao uma quantidade fisica do bem.
create or replace function private.link_licitacao_item_ocorrencia_emendas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.itens%rowtype;
begin
  select * into v_item from public.itens where id=new.item_id;

  if exists(
    select 1 from public.licitacao_item_recursos r
    where r.item_id=new.item_id and r.status='ATIVO'
  ) then
    insert into public.licitacao_item_ocorrencia_emendas(
      ocorrencia_id,emenda_id,emenda_item_id,quantidade_snapshot,
      valor_unitario_snapshot,secao_id
    )
    select new.id,r.emenda_id,r.emenda_item_id,1,r.valor_alocado,new.secao_id
    from public.licitacao_item_recursos r
    where r.item_id=new.item_id and r.status='ATIVO'
    on conflict (ocorrencia_id,emenda_item_id) do nothing;
  elsif v_item.emenda_item_id is not null then
    insert into public.licitacao_item_ocorrencia_emendas(
      ocorrencia_id,emenda_id,emenda_item_id,quantidade_snapshot,
      valor_unitario_snapshot,secao_id
    )
    select new.id,ei.emenda_id,ei.id,new.quantidade_snapshot,
           new.valor_unitario_snapshot,new.secao_id
    from public.emenda_itens ei
    where ei.id=v_item.emenda_item_id
    on conflict (ocorrencia_id,emenda_item_id) do nothing;
  end if;

  insert into public.licitacao_item_ocorrencia_emendas(
    ocorrencia_id,emenda_id,emenda_item_id,quantidade_snapshot,
    valor_unitario_snapshot,secao_id
  )
  select new.id,ap.emenda_id,ap.emenda_item_id,ap.quantidade_prevista,
         new.valor_unitario_snapshot,new.secao_id
  from public.ata_planejamento_emendas ap
  where ap.processo_item_id=new.item_id
    and ap.status in ('PLANEJAMENTO','ATA_VIGENTE_AGUARDANDO_REQUISICAO')
  on conflict (ocorrencia_id,emenda_item_id) do nothing;

  update public.ata_planejamento_emendas
  set status='CANCELADO',updated_at=now()
  where processo_item_id=new.item_id
    and status in ('PLANEJAMENTO','ATA_VIGENTE_AGUARDANDO_REQUISICAO');
  return new;
end;
$$;

-- Um emenda_item usado no rateio deixa de ser editavel/excluivel como item livre.
create or replace function private.emenda_item_bloqueio_edicao(p_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.emenda_itens%rowtype;
begin
  if auth.uid() is null or not private.is_admin_approved() then
    raise exception 'Somente administradores aprovados podem editar os itens.' using errcode='42501';
  end if;
  select * into v from public.emenda_itens where id=p_id;
  if not found then raise exception 'Item nao encontrado.' using errcode='P0002'; end if;
  if not private.can_access_domain(v.secao_id,array['dashboard'],'edit') then
    raise exception 'Sem permissao para esta secao.' using errcode='42501';
  end if;
  if exists(select 1 from public.licitacao_item_recursos where emenda_item_id=p_id) then return 'Fonte financeira vinculada a licitacao'; end if;
  if v.processo_id is not null or nullif(btrim(v.cpl),'') is not null then return 'Processo vinculado'; end if;
  if exists(select 1 from public.itens where emenda_item_id=p_id) then return 'Item de processo/contrato vinculado'; end if;
  if exists(select 1 from public.ata_planejamento_emendas where emenda_item_id=p_id) then return 'Planejamento de ata vinculado'; end if;
  if exists(select 1 from public.atas_execucao where emenda_item_id=p_id) then return 'Execucao de ata vinculada'; end if;
  if exists(select 1 from public.atas_execucao_unidades where emenda_item_id=p_id) then return 'Unidade fisica de ata vinculada'; end if;
  if exists(select 1 from public.atas_execucao_reajustes where emenda_item_id=p_id) then return 'Reajuste de ata vinculado'; end if;
  if exists(select 1 from public.empenho_itens where emenda_item_id=p_id) then return 'Empenho vinculado'; end if;
  if exists(select 1 from public.nota_fiscal_itens where emenda_item_id=p_id) then return 'Nota fiscal vinculada'; end if;
  if exists(select 1 from public.licitacao_item_ocorrencia_emendas where emenda_item_id=p_id) then return 'Historico de ocorrencia em licitacao'; end if;
  if coalesce(nullif(btrim(v.nota_fiscal),''),nullif(btrim(v.empenho),''),
    nullif(btrim(v.patrimonio),''),nullif(btrim(v.data_entrega),''),
    nullif(btrim(v.ordem_pagamento),''),nullif(btrim(v.comprovante_pagamento),'')) is not null
    or coalesce(v.vl_unitario,0)<>0 or coalesce(v.vl_total,0)<>0 then
    return 'Registro legado de execucao, documento ou entrega';
  end if;
  return null;
end;
$$;

create or replace view public.vw_emendas_saldo
with (security_invoker=true)
as
with planejado as (
  select ei.id emenda_item_id,ei.emenda_id,
    coalesce(ei.vl_total_cadastrado,
      coalesce(ei.qtde_cadastrada,ei.qtde,0)*coalesce(ei.vl_unitario_cadastrado,ei.vl_unitario,0),0) valor_planejado
  from public.emenda_itens ei
),
licitacao_rateio as (
  select r.emenda_item_id,
    sum(r.valor_alocado) valor_estimado_licitacao,
    sum(case when r.status='ATIVO' and i.valor_contratado is null and o.item_id is null then r.valor_alocado else 0 end) valor_estimado_ativo,
    sum(case when r.status='ATIVO' and i.valor_contratado is not null and o.item_id is null then r.valor_alocado else 0 end) valor_contratado,
    sum(case when r.status='CANCELADO' or o.item_id is not null then r.valor_alocado else 0 end) valor_ocorrencia,
    count(*)::bigint qtd_vinculos
  from public.licitacao_item_recursos r
  join public.itens i on i.id=r.item_id
  left join public.licitacao_item_ocorrencias o on o.item_id=i.id
  group by r.emenda_item_id
),
licitacao_legado as (
  select i.emenda_item_id,
    sum(case when i.valor_contratado is null then coalesce(i.valor_estimado,0)*coalesce(i.qtde,0) else 0 end) valor_estimado_licitacao,
    sum(case when i.valor_contratado is null and o.item_id is null then coalesce(i.valor_estimado,0)*coalesce(i.qtde,0) else 0 end) valor_estimado_ativo,
    sum(case when i.valor_contratado is not null then coalesce(i.valor_contratado,0)*coalesce(i.qtde,0) else 0 end) valor_contratado,
    0::numeric valor_ocorrencia,
    count(*)::bigint qtd_vinculos
  from public.itens i
  left join public.licitacao_item_ocorrencias o on o.item_id=i.id
  where i.emenda_item_id is not null
    and not exists(select 1 from public.licitacao_item_recursos r where r.item_id=i.id)
  group by i.emenda_item_id
),
licitacao as (
  select * from licitacao_rateio
  union all
  select * from licitacao_legado
),
ocorrencias as (
  select oe.emenda_item_id,sum(coalesce(oe.valor_total_snapshot,0)) valor_ocorrencia,count(*)::bigint qtd_ocorrencias
  from public.licitacao_item_ocorrencia_emendas oe
  where not exists(select 1 from public.licitacao_item_recursos r where r.emenda_item_id=oe.emenda_item_id)
  group by oe.emenda_item_id
),
ata as (
  select ae.emenda_item_id,sum(coalesce(ae.valor,0)) valor_contratado,count(*)::bigint qtd_vinculos
  from public.atas_execucao ae where ae.emenda_item_id is not null group by ae.emenda_item_id
),
por_item as (
  select p.emenda_id,p.emenda_item_id,p.valor_planejado,
    case when l.emenda_item_id is not null then coalesce(l.valor_estimado_licitacao,0) else coalesce(o.valor_ocorrencia,0) end valor_estimado_licitacao,
    coalesce(l.valor_contratado,a.valor_contratado,0) valor_contratado,
    coalesce(l.valor_ocorrencia,o.valor_ocorrencia,0) valor_ocorrencia,
    case
      when l.emenda_item_id is not null then coalesce(l.valor_estimado_ativo,0)+coalesce(l.valor_contratado,0)
      when a.emenda_item_id is not null then coalesce(a.valor_contratado,0)
      when o.emenda_item_id is not null then 0
      else p.valor_planejado
    end valor_consumido,
    coalesce(l.qtd_vinculos,a.qtd_vinculos,o.qtd_ocorrencias,0)::bigint qtd_vinculos,
    (coalesce(o.qtd_ocorrencias,0)+case when coalesce(l.valor_ocorrencia,0)>0 then 1 else 0 end)::bigint qtd_ocorrencias
  from planejado p
  left join licitacao l on l.emenda_item_id=p.emenda_item_id
  left join ata a on a.emenda_item_id=p.emenda_item_id
  left join ocorrencias o on o.emenda_item_id=p.emenda_item_id
),
agregado as (
  select e.id,e.emenda numero_emenda,e.ano,e.tipo,e.parlamentar,e.sei_emenda,e.unidade,e.objeto,e.valor_cedido,
    coalesce(sum(pi.valor_planejado),0) total_planejado,
    coalesce(sum(pi.valor_estimado_licitacao),0) total_estimado_licitacao,
    coalesce(sum(pi.valor_contratado),0) total_contratado,
    coalesce(sum(pi.valor_ocorrencia),0) total_ocorrencia,
    coalesce(sum(pi.valor_consumido),0) total_consumido,
    count(pi.emenda_item_id) qtd_itens,
    coalesce(sum(pi.qtd_vinculos),0)::bigint qtd_vinculos,
    coalesce(sum(pi.qtd_ocorrencias),0)::bigint qtd_ocorrencias
  from public.emendas e left join por_item pi on pi.emenda_id=e.id group by e.id
)
select id,numero_emenda,ano,tipo,parlamentar,sei_emenda,unidade,objeto,valor_cedido,total_planejado,
  total_contratado-total_ocorrencia total_executado,
  total_consumido total_comprometido,
  valor_cedido-total_consumido saldo_remanescente,
  case
    when valor_cedido is null then null
    when total_consumido>=valor_cedido*0.99 then 'Executada'
    when total_consumido>0 and total_ocorrencia>0 then 'Em andamento com ocorrências'
    when total_consumido>0 then 'Em andamento'
    when total_ocorrencia>0 then 'Com itens fracassados/desertos ou complementos cancelados'
    else 'Não iniciada'
  end status_execucao,
  qtd_itens,total_estimado_licitacao,total_contratado,-total_ocorrencia total_ocorrencias_negativas,
  qtd_ocorrencias qtd_itens_ocorrencia
from agregado;

grant select on public.vw_emendas_saldo to anon,authenticated,service_role;

notify pgrst,'reload schema';

commit;
