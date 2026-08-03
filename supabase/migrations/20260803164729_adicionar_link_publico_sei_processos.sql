alter table public.processos
  add column if not exists link_publico_sei text;

comment on column public.processos.link_publico_sei is
  'URL publica do processo no SEI. Obrigatoria no aplicativo para novos processos do tipo SEI; registros historicos podem permanecer sem link.';

alter table public.processos
  drop constraint if exists processos_link_publico_sei_http_check;

alter table public.processos
  add constraint processos_link_publico_sei_http_check
  check (
    link_publico_sei is null
    or btrim(link_publico_sei) ~* '^https?://[^[:space:]]+$'
  );

create or replace view public.vw_processos_resumo
with (security_invoker = true)
as
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
  (select count(*)::integer from public.contratos c where c.processo_id = p.id) as n_contratos,
  p.servico_demanda_meses,
  p.sc,
  p.secao_id,
  p.servico_trimestral_itens,
  p.servico_trimestral_meses,
  p.servico_trimestral_ciclos,
  p.servico_trimestral_valor_trimestral,
  p.servico_trimestral_valor_global,
  p.link_publico_sei
from public.processos p
left join public.itens i on i.processo_id = p.id
group by p.id;

grant select on public.vw_processos_resumo to authenticated;
revoke select on public.vw_processos_resumo from anon;
