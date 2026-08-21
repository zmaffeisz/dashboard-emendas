begin;

alter table public.atas_item_marca_apostilamentos
  add column if not exists execucao_ids uuid[] not null default '{}'::uuid[];

comment on column public.atas_item_marca_apostilamentos.execucao_ids is
  'Execuções pendentes escolhidas pelo usuário para receber a nova marca/modelo.';

create or replace function public.registrar_troca_marca_item_ata_seletiva(
  p_ata_item_id uuid,
  p_marca_modelo_nova text,
  p_apostilamento text,
  p_data_apostilamento date,
  p_execucao_ids uuid[],
  p_observacoes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item public.atas_itens%rowtype;
  v_nova text;
  v_apostilamento text;
  v_execucao_ids uuid[];
  v_atualizadas integer := 0;
  v_secao_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_nova := nullif(btrim(p_marca_modelo_nova), '');
  v_apostilamento := nullif(btrim(p_apostilamento), '');
  v_execucao_ids := array(
    select distinct x
      from unnest(coalesce(p_execucao_ids, '{}'::uuid[])) as x
     where x is not null
  );

  if v_nova is null then
    raise exception 'Informe a nova marca/modelo.';
  end if;
  if v_apostilamento is null then
    raise exception 'Informe a referência do apostilamento.';
  end if;
  if p_data_apostilamento is null then
    raise exception 'Informe a data do apostilamento.';
  end if;

  select *
    into v_item
    from public.atas_itens
   where id = p_ata_item_id
   for update;
  if not found then
    raise exception 'Item da ATA não encontrado ou sem permissão de acesso.';
  end if;

  v_secao_id := coalesce(v_item.secao_id, (
    select c.secao_id from public.contratos c where c.id = v_item.contrato_id
  ));
  if not private.can_access_domain(v_secao_id, array['atas']::text[], 'edit') then
    raise exception 'Você não tem permissão para trocar a marca deste item.';
  end if;
  if upper(coalesce(btrim(v_item.marca_modelo), '')) = upper(v_nova) then
    raise exception 'A nova marca/modelo é igual à marca/modelo vigente.';
  end if;

  if exists (
    select 1
      from unnest(v_execucao_ids) as escolhido(id)
     where not exists (
       select 1
         from public.atas_execucao ae
        where ae.id = escolhido.id
          and ae.ata_item_id = v_item.id
          and nullif(btrim(ae.dt_entrega), '') is null
          and not exists (
            select 1
              from public.atas_execucao_unidades u
             where u.exec_id = ae.id
               and u.recebido_em is not null
          )
     )
  ) then
    raise exception 'Um dos pedidos selecionados não pertence ao item ou já foi recebido. Atualize a lista e tente novamente.';
  end if;

  -- Completa fotografias legadas antes de alterar a marca vigente do item.
  update public.atas_execucao ae
     set marca_modelo = v_item.marca_modelo
   where ae.ata_item_id = v_item.id
     and nullif(btrim(ae.marca_modelo), '') is null;

  -- O item é atualizado mesmo sem pedidos marcados para que a nova marca seja usada
  -- em todas as solicitações futuras.
  update public.atas_itens
     set marca_modelo = v_nova
   where id = v_item.id;

  update public.atas_execucao ae
     set marca_modelo = v_nova
   where ae.id = any(v_execucao_ids)
     and ae.ata_item_id = v_item.id
     and nullif(btrim(ae.dt_entrega), '') is null
     and not exists (
       select 1
         from public.atas_execucao_unidades u
        where u.exec_id = ae.id
          and u.recebido_em is not null
     );
  get diagnostics v_atualizadas = row_count;

  insert into public.atas_item_marca_apostilamentos (
    ata_item_id, contrato_id, marca_modelo_anterior, marca_modelo_nova,
    apostilamento, data_apostilamento, observacoes,
    execucoes_atualizadas, execucao_ids, criado_por, secao_id
  ) values (
    v_item.id, v_item.contrato_id, nullif(btrim(v_item.marca_modelo), ''), v_nova,
    v_apostilamento, p_data_apostilamento, nullif(btrim(p_observacoes), ''),
    v_atualizadas, v_execucao_ids, auth.uid(), v_secao_id
  );

  return jsonb_build_object(
    'ata_item_id', v_item.id,
    'marca_modelo_anterior', v_item.marca_modelo,
    'marca_modelo_nova', v_nova,
    'execucoes_atualizadas', v_atualizadas,
    'execucao_ids', v_execucao_ids
  );
end;
$function$;

revoke all on function public.registrar_troca_marca_item_ata_seletiva(uuid,text,text,date,uuid[],text) from public;
revoke all on function public.registrar_troca_marca_item_ata_seletiva(uuid,text,text,date,uuid[],text) from anon;
grant execute on function public.registrar_troca_marca_item_ata_seletiva(uuid,text,text,date,uuid[],text) to authenticated;

commit;
