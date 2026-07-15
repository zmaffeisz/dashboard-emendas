do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='fornecedores' and 'anon'=any(roles) loop
    execute format('drop policy %I on public.fornecedores',p.policyname);
  end loop;
end $$;

create or replace view public.vw_processos_resumo
with (security_invoker=true)
as
select p.id,p.identificador,p.tipo,p.natureza,p.objeto,p.modalidade,p.status,p.secao,
  p.valor_estimado,p.observacao,p.gera_mais_contratos,p.created_at,
  count(i.id)::integer total_itens,
  coalesce(sum(i.qtde),0)::numeric total_qtde,
  coalesce(sum(coalesce(i.valor_contratado,i.valor_estimado,0)*coalesce(i.qtde,1)),0)::numeric total_itens_valor,
  p.tipo_servico,p.servico_mensal_itens,p.servico_mensal_meses,p.servico_mensal_valor_mensal,
  p.servico_mensal_valor_global,
  (select count(*)::integer from public.contratos c where c.processo_id=p.id) n_contratos,
  p.servico_demanda_meses,p.sc,p.secao_id
from public.processos p
left join public.itens i on i.processo_id=p.id
group by p.id;

grant select on public.vw_processos_resumo to authenticated;
revoke select on public.vw_processos_resumo from anon;
