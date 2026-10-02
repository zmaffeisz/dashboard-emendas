-- Produção oficial: qpvgpfwuurqcqprnpxua (contratos-dag).
alter table public.processos add column if not exists locacao_meses integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.processos'::regclass and conname='processos_locacao_meses_positivo') then
    alter table public.processos add constraint processos_locacao_meses_positivo check (locacao_meses is null or locacao_meses > 0);
  end if;
end;
$$;
comment on column public.processos.locacao_meses is 'Prazo estimado da locação em meses. Valor estimado do processo é global; preços dos itens são mensais.';

create or replace view public.vw_processos_resumo with (security_invoker=true) as
select p.id,p.identificador,p.tipo,p.natureza,p.objeto,p.modalidade,p.status,p.secao,
       p.valor_estimado,p.observacao,p.gera_mais_contratos,p.created_at,
       count(i.id)::integer as total_itens,
       coalesce(sum(i.qtde),0::numeric) as total_qtde,
       coalesce(sum(coalesce(i.valor_contratado,i.valor_estimado,0::numeric)*coalesce(i.qtde,1::numeric)),0::numeric) as total_itens_valor,
       p.tipo_servico,p.servico_mensal_itens,p.servico_mensal_meses,
       p.servico_mensal_valor_mensal,p.servico_mensal_valor_global,
       (select count(*)::integer from public.contratos c where c.processo_id=p.id) as n_contratos,
       p.servico_demanda_meses,p.sc,p.secao_id,
       p.servico_trimestral_itens,p.servico_trimestral_meses,p.servico_trimestral_ciclos,
       p.servico_trimestral_valor_trimestral,p.servico_trimestral_valor_global,
       p.link_publico_sei,p.categoria_id,
       (select cl.nome from public.categorias_licitacao cl where cl.id=p.categoria_id) as categoria_licitacao,
       p.locacao_meses
from public.processos p left join public.itens i on i.processo_id=p.id
group by p.id;
