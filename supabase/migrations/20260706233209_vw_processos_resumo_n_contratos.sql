create or replace view public.vw_processos_resumo
with (security_invoker = true) as
select
  p.id,
  p.identificador,
  p.tipo,
  p.natureza,
  p.objeto,
  p.modalidade,
  p.status,
  p.secao,
  p.valor_estimado,
  p.observacao,
  p.gera_mais_contratos,
  p.created_at,
  count(i.id)::integer as total_itens,
  coalesce(sum(i.qtde), 0::numeric) as total_qtde,
  coalesce(sum(coalesce(i.valor_contratado, i.valor_estimado, 0::numeric) * coalesce(i.qtde, 1::numeric)), 0::numeric) as total_itens_valor,
  p.tipo_servico,
  p.servico_mensal_itens,
  p.servico_mensal_meses,
  p.servico_mensal_valor_mensal,
  p.servico_mensal_valor_global,
  (
    select count(*)::integer
    from public.contratos c
    where c.processo_id = p.id
  ) as n_contratos
from public.processos p
left join public.itens i on i.processo_id = p.id
group by p.id;
