-- Somente contratos-dag (qpvgpfwuurqcqprnpxua).
-- Permite que um item puxado de emenda seja complementado por Fonte 01 ou outra
-- fonte financeira, sem criar um emenda_itens ficticio para recursos nao parlamentares.

begin;

alter table public.licitacao_item_recursos
  add column if not exists fonte_tipo text not null default 'emenda',
  add column if not exists fonte_descricao text;

alter table public.licitacao_item_recursos
  alter column fonte_tipo set default 'emenda',
  alter column fonte_tipo set not null,
  alter column emenda_id drop not null,
  alter column emenda_item_id drop not null;

alter table public.licitacao_item_recursos
  drop constraint if exists licitacao_item_recursos_fonte_check;
alter table public.licitacao_item_recursos
  add constraint licitacao_item_recursos_fonte_check check (
    (
      fonte_tipo='emenda'
      and emenda_id is not null
      and emenda_item_id is not null
    )
    or
    (
      fonte_tipo in ('recurso_proprio','outra')
      and emenda_id is null
      and emenda_item_id is null
      and not emenda_item_gerado
      and nullif(btrim(fonte_descricao),'') is not null
    )
  );

drop index if exists public.licitacao_item_recursos_emenda_ativa_unica;
create unique index licitacao_item_recursos_emenda_ativa_unica
  on public.licitacao_item_recursos(item_id,emenda_id)
  where status='ATIVO' and fonte_tipo='emenda';

create unique index if not exists licitacao_item_recursos_fonte_ativa_unica
  on public.licitacao_item_recursos(
    item_id,fonte_tipo,lower(coalesce(fonte_descricao,''))
  )
  where status='ATIVO' and fonte_tipo<>'emenda';

comment on table public.licitacao_item_recursos is
  'Rateio financeiro de um item de licitacao entre a emenda principal e complementos vindos de emendas, Fonte 01 ou outras fontes.';
comment on column public.licitacao_item_recursos.fonte_tipo is
  'Origem da parcela: emenda, recurso_proprio (Fonte 01) ou outra.';
comment on column public.licitacao_item_recursos.fonte_descricao is
  'Identificacao da fonte nao parlamentar; fica nula quando a origem e uma emenda.';
comment on column public.licitacao_item_recursos.valor_alocado is
  'Parcela monetaria da compra atribuida a esta fonte; nao representa quantidade nem valor unitario do bem.';

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
  v_fonte_tipo text;
  v_fonte_descricao text;
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
    v_fonte_tipo:=lower(btrim(coalesce(nullif(v_dado->>'fonte_tipo',''),'emenda')));
    v_fonte_descricao:=nullif(btrim(v_dado->>'fonte_descricao'),'');
    v_valor:=round(nullif(v_dado->>'valor_alocado','')::numeric,2);

    if v_tipo not in ('PRINCIPAL','COMPLEMENTO') or v_valor is null or v_valor<=0 then
      raise exception 'Cada fonte precisa de tipo e valor positivo.' using errcode='22023';
    end if;
    if v_fonte_tipo not in ('emenda','recurso_proprio','outra') then
      raise exception 'O tipo da fonte de recurso e invalido.' using errcode='22023';
    end if;
    if v_fonte_tipo='recurso_proprio' then
      v_fonte_descricao:='FONTE 01';
      v_emenda_id:=null;
      v_emenda_item_id:=null;
    elsif v_fonte_tipo='outra' then
      if v_fonte_descricao is null then
        raise exception 'Descreva a outra fonte usada no complemento.' using errcode='22023';
      end if;
      v_emenda_id:=null;
      v_emenda_item_id:=null;
    else
      v_fonte_descricao:=null;
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
         or v_fonte_tipo<>v_recurso.fonte_tipo
         or v_emenda_id is distinct from v_recurso.emenda_id
         or v_emenda_item_id is distinct from v_recurso.emenda_item_id
         or v_fonte_descricao is distinct from v_recurso.fonte_descricao then
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
      if v_fonte_tipo<>'emenda'
         or v_item.emenda_id is null or v_item.emenda_item_id is null
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
        item_id,fonte_tipo,fonte_descricao,emenda_id,emenda_item_id,tipo,
        valor_alocado,status,emenda_item_gerado,secao_id,criado_por
      ) values (
        v_item.id,'emenda',null,v_emenda_id,v_emenda_item_id,'PRINCIPAL',
        v_valor,'ATIVO',false,v_item.secao_id,auth.uid()
      );
      update public.emenda_itens
      set processo_id=coalesce(processo_id,v_item.processo_id),
          cpl=coalesce(nullif(cpl,''),v_processo.identificador)
      where id=v_emenda_item_id;
      continue;
    end if;

    if v_fonte_tipo<>'emenda' then
      if exists(
        select 1 from public.licitacao_item_recursos r
        where r.item_id=v_item.id and r.fonte_tipo=v_fonte_tipo
          and lower(coalesce(r.fonte_descricao,''))=lower(v_fonte_descricao)
          and r.status='ATIVO'
      ) then
        raise exception 'Esta fonte ja participa do rateio deste item.' using errcode='23505';
      end if;
      insert into public.licitacao_item_recursos(
        item_id,fonte_tipo,fonte_descricao,emenda_id,emenda_item_id,tipo,
        valor_alocado,status,emenda_item_gerado,secao_id,criado_por
      ) values (
        v_item.id,v_fonte_tipo,v_fonte_descricao,null,null,'COMPLEMENTO',
        v_valor,'ATIVO',false,v_item.secao_id,auth.uid()
      );
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
      item_id,fonte_tipo,fonte_descricao,emenda_id,emenda_item_id,tipo,
      valor_alocado,status,emenda_item_gerado,secao_id,criado_por
    ) values (
      v_item.id,'emenda',null,v_emenda.id,v_emenda_item_id,'COMPLEMENTO',
      v_valor,'ATIVO',true,v_item.secao_id,auth.uid()
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.tipo desc,r.created_at,r.id),'[]'::jsonb)
  into v_result
  from public.licitacao_item_recursos r
  where r.item_id=v_item.id;
  return v_result;
end;
$$;

revoke all on function private.salvar_licitacao_item_recursos_impl(uuid,jsonb) from public,anon;
grant execute on function private.salvar_licitacao_item_recursos_impl(uuid,jsonb) to authenticated,service_role;

comment on function public.salvar_licitacao_item_recursos(uuid,jsonb) is
  'Cria e atualiza o rateio financeiro. Complementos de emenda criam emenda_itens; Fonte 01 e outras fontes ficam vinculadas somente ao item.';

-- O historico de fracasso/desercao por emenda recebe apenas as parcelas que
-- efetivamente pertencem a emendas. As demais permanecem no rateio imutavel do item.
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
      and r.fonte_tipo='emenda'
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

revoke all on function private.link_licitacao_item_ocorrencia_emendas() from public,anon,authenticated;
grant execute on function private.link_licitacao_item_ocorrencia_emendas() to service_role;

commit;
