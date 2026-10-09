-- Somente contratos-dag (qpvgpfwuurqcqprnpxua).
-- Converte os oito itens que foram cadastrados manualmente como se fossem compras
-- independentes em parcelas financeiras do item real da mesma licitacao.

begin;

create temporary table tmp_complementos_legados (
  fake_emenda_item_id uuid primary key,
  fake_item_id uuid unique not null,
  target_item_id uuid not null,
  valor_esperado numeric(14,2) not null
) on commit drop;

insert into tmp_complementos_legados (
  fake_emenda_item_id,fake_item_id,target_item_id,valor_esperado
) values
  ('6ce1b870-699b-467f-a77f-8e4065411957','cd0a850c-e08b-4634-8eb1-a474e38db713','78a9d317-595c-409c-a902-0b508d7a5727',2124.52),
  ('d5db5851-58e7-4a7e-a8e7-00ef51fc1ede','98f01192-69cb-4574-bb22-3037f79bf543','8918e5ce-5deb-4a45-9b6c-2ac1128b69ef',2124.52),
  ('ac4ad2b8-fae0-465d-895b-03b5558ae2bf','9ee02a10-db95-4532-bfca-98bdec95987e','9057f34c-f493-488c-bedc-49523095ba16',778.28),
  ('ee8c8d88-0c1c-4bcf-8d6a-433859dd4658','86aadb6a-8cb6-4c87-ae30-6245d4417cfc','18dfac3e-ae16-4b7f-aa26-6653fba8e59b',995.00),
  ('b9e2da77-f733-494a-b7d6-e61592200653','8e77463b-200f-464b-9cdb-d5707ac8a88b','0c5250b8-e8f0-4344-8a87-7bfa3ec8e773',5010.24),
  ('eceff83c-ef95-46f4-9dad-465cfcb59725','ec9f66b8-86fd-41d7-9c56-e5e220ced889','5f117d14-cee0-4727-94b9-78f3c93a73b0',647.76),
  ('3dad14a0-ac39-4881-89f8-40c84dd9be12','2bccd125-dad3-46b2-8100-ffc6e52a43d0','e4c76a42-886a-4e78-930d-7acee93e7fa5',311.31),
  ('0c843c64-eff2-439e-accf-451546aba398','cc0d92c5-413e-41a6-8e5f-088159aa069c','ca4d0d15-7c8b-4cc1-b336-d62c62faff0c',7452.38);

do $$
begin
  if (select count(*) from tmp_complementos_legados) <> 8 then
    raise exception 'Mapa de complementos legados incompleto.';
  end if;

  if exists (
    select 1
    from tmp_complementos_legados m
    left join public.emenda_itens ei on ei.id=m.fake_emenda_item_id
    left join public.itens fi on fi.id=m.fake_item_id and fi.emenda_item_id=ei.id
    left join public.itens ti on ti.id=m.target_item_id
    where ei.id is null or fi.id is null or ti.id is null
      or fi.processo_id is distinct from ti.processo_id
      or fi.secao_id is distinct from ti.secao_id
  ) then
    raise exception 'Um complemento legado nao corresponde mais ao item alvo inventariado.';
  end if;

  if exists (
    select 1
    from tmp_complementos_legados m
    where 1 <> (
      select count(*)
      from public.licitacao_item_recursos r
      join public.emenda_itens ei on ei.id=m.fake_emenda_item_id
      where r.item_id=m.fake_item_id
        and r.emenda_item_id=m.fake_emenda_item_id
        and r.emenda_id=ei.emenda_id
        and r.tipo='PRINCIPAL'
        and r.status='ATIVO'
        and r.valor_alocado=m.valor_esperado
    )
  ) then
    raise exception 'A parcela financeira de um complemento legado mudou desde o inventario.';
  end if;

  if exists (
    select 1
    from tmp_complementos_legados m
    where 1 <> (
      select count(*) from public.licitacao_item_recursos r
      where r.item_id=m.target_item_id and r.tipo='PRINCIPAL' and r.status='ATIVO'
    )
  ) then
    raise exception 'Um item alvo nao possui exatamente uma fonte principal ativa.';
  end if;

  if exists (
    select 1
    from tmp_complementos_legados m
    join public.emenda_itens ei on ei.id=m.fake_emenda_item_id
    join public.licitacao_item_recursos r
      on r.item_id=m.target_item_id and r.emenda_id=ei.emenda_id and r.status='ATIVO'
  ) then
    raise exception 'Um item alvo ja usa a emenda que seria convertida em complemento.';
  end if;

  if exists (
    select 1 from tmp_complementos_legados m
    join public.itens i on i.id=m.fake_item_id
    where i.contrato_id is not null or i.ata_item_id is not null
      or exists(select 1 from public.ata_planejamento_emendas x where x.processo_item_id=i.id)
      or exists(select 1 from public.contratos_medicao_glosas x where x.item_id=i.id)
      or exists(select 1 from public.contratos_medicao_itens x where x.item_id=i.id)
      or exists(select 1 from public.empenho_itens x where x.item_id=i.id)
      or exists(select 1 from public.entregas_observacoes x where x.item_id=i.id)
      or exists(select 1 from public.itens_entregas x where x.item_id=i.id)
      or exists(select 1 from public.itens_entregas_unidades x where x.item_id=i.id)
      or exists(select 1 from public.licitacao_item_ocorrencias x where x.item_id=i.id)
      or exists(select 1 from public.nota_fiscal_itens x where x.item_id=i.id)
  ) then
    raise exception 'Um item complemento legado recebeu execucao e nao pode ser mesclado automaticamente.';
  end if;
end;
$$;

-- O emenda_itens manual passa a ter a mesma forma do registro que o sistema cria
-- atualmente para um complemento. O valor preservado e o da parcela da licitacao.
update public.emenda_itens ei
set item=ti.descricao,
    item_cadastrado=ti.descricao,
    qtde=null,
    qtde_cadastrada=null,
    vl_unitario=null,
    vl_total=null,
    vl_unitario_cadastrado=null,
    vl_total_cadastrado=r.valor_alocado,
    processo_id=ti.processo_id,
    cpl=coalesce(p.identificador,ei.cpl),
    status='COMPLEMENTO FINANCEIRO - EM LICITACAO',
    unidade_beneficiada=u.nome,
    unidade_beneficiada_id=ti.unidade_destino_id,
    unidade_entrega=u.nome,
    unidade_entrega_id=ti.unidade_destino_id,
    data_atualizacao=to_char(current_date,'DD/MM/YYYY'),
    secao_id=ti.secao_id
from tmp_complementos_legados m
join public.itens ti on ti.id=m.target_item_id
join public.licitacao_item_recursos r
  on r.item_id=m.fake_item_id and r.emenda_item_id=m.fake_emenda_item_id
left join public.processos p on p.id=ti.processo_id
left join public.unidades u on u.id=ti.unidade_destino_id
where ei.id=m.fake_emenda_item_id;

-- Reaproveita a parcela ja existente, mantendo id, valor, autor e data originais.
update public.licitacao_item_recursos r
set item_id=m.target_item_id,
    tipo='COMPLEMENTO',
    emenda_item_gerado=true,
    secao_id=ti.secao_id,
    updated_at=now()
from tmp_complementos_legados m
join public.itens ti on ti.id=m.target_item_id
where r.item_id=m.fake_item_id
  and r.emenda_item_id=m.fake_emenda_item_id
  and r.status='ATIVO';

-- O historico de andamento pertencia ao mesmo objeto e permanece associado ao item real.
update public.itens_status_historico h
set item_id=m.target_item_id
from tmp_complementos_legados m
where h.item_id=m.fake_item_id;

-- Remove somente as oito linhas artificiais da licitacao; nenhum registro de execucao
-- apontava para elas e a parcela financeira ja foi transferida para o item real.
delete from public.itens i
using tmp_complementos_legados m
where i.id=m.fake_item_id;

do $$
begin
  if exists (
    select 1 from tmp_complementos_legados m
    join public.itens i on i.id=m.fake_item_id
  ) then
    raise exception 'Ainda existem itens artificiais depois da conversao.';
  end if;

  if exists (
    select 1
    from tmp_complementos_legados m
    left join public.licitacao_item_recursos r
      on r.item_id=m.target_item_id
     and r.emenda_item_id=m.fake_emenda_item_id
     and r.tipo='COMPLEMENTO'
     and r.status='ATIVO'
     and r.emenda_item_gerado
    where r.id is null
  ) then
    raise exception 'A conversao de um complemento legado nao foi concluida.';
  end if;
end;
$$;

commit;
