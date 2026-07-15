-- Saldo da Emenda por estágio do fluxo:
-- sem licitação = planejado; licitação = valor estimado; contrato = valor contratado.
-- Nesta aplicação, o valor contratado passa a compor o executado/consumido da Emenda.
create or replace view public.vw_emendas_saldo
with (security_invoker = true) as
with planejado as (
  select
    ei.id as emenda_item_id,
    ei.emenda_id,
    coalesce(ei.vl_total_cadastrado, coalesce(ei.qtde_cadastrada, ei.qtde, 0) * coalesce(ei.vl_unitario_cadastrado, ei.vl_unitario, 0), 0)::numeric as valor_planejado
  from public.emenda_itens ei
),
licitacao as (
  select
    i.emenda_item_id,
    sum(case when i.valor_contratado is null then coalesce(i.valor_estimado, 0) * coalesce(i.qtde, 0) else 0 end)::numeric as valor_estimado_licitacao,
    sum(case when i.valor_contratado is not null then coalesce(i.valor_contratado, 0) * coalesce(i.qtde, 0) else 0 end)::numeric as valor_contratado,
    count(*)::bigint as qtd_vinculos
  from public.itens i
  where i.emenda_item_id is not null
  group by i.emenda_item_id
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
    coalesce(l.valor_estimado_licitacao, 0)::numeric as valor_estimado_licitacao,
    coalesce(l.valor_contratado, a.valor_contratado, 0)::numeric as valor_contratado,
    case
      when l.emenda_item_id is not null then coalesce(l.valor_estimado_licitacao, 0) + coalesce(l.valor_contratado, 0)
      when a.emenda_item_id is not null then coalesce(a.valor_contratado, 0)
      else p.valor_planejado
    end::numeric as valor_consumido,
    coalesce(l.qtd_vinculos, a.qtd_vinculos, 0)::bigint as qtd_vinculos
  from planejado p
  left join licitacao l on l.emenda_item_id = p.emenda_item_id
  left join ata a on a.emenda_item_id = p.emenda_item_id
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
    coalesce(sum(pi.valor_consumido), 0)::numeric as total_consumido,
    count(pi.emenda_item_id)::bigint as qtd_itens,
    coalesce(sum(pi.qtd_vinculos), 0)::bigint as qtd_vinculos
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
  a.total_contratado as total_executado,
  a.total_consumido as total_comprometido,
  (a.valor_cedido - a.total_consumido)::numeric as saldo_remanescente,
  case
    when a.valor_cedido is null then null::text
    when a.total_consumido >= a.valor_cedido * 0.99 then 'Executada'::text
    when a.total_consumido > 0 then 'Em andamento'::text
    else 'Não iniciada'::text
  end as status_execucao,
  a.qtd_itens,
  a.total_estimado_licitacao,
  a.total_contratado
from agregado a;
