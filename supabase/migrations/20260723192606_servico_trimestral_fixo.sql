-- Serviço contínuo com pagamento trimestral fixo.
-- Mantém integralmente os campos mensais legados e acrescenta periodicidade explícita.

alter table public.processos
  add column if not exists servico_trimestral_itens jsonb,
  add column if not exists servico_trimestral_meses integer,
  add column if not exists servico_trimestral_ciclos integer,
  add column if not exists servico_trimestral_valor_trimestral numeric,
  add column if not exists servico_trimestral_valor_global numeric;

alter table public.contratos
  add column if not exists periodicidade_pagamento text,
  add column if not exists valor_periodico_num numeric,
  add column if not exists modelo_execucao text;

alter table public.contratos_vigencias
  add column if not exists periodicidade_pagamento text,
  add column if not exists valor_periodico numeric;

alter table public.contratos_historico
  add column if not exists periodicidade_calculo text,
  add column if not exists periodos_considerados integer,
  add column if not exists quantidade_alterada numeric,
  add column if not exists valor_unitario_periodo numeric;

alter table public.contratos_medicoes
  add column if not exists ciclo_numero integer,
  add column if not exists ciclo_inicio date,
  add column if not exists ciclo_fim date,
  add column if not exists data_execucao_preventiva date,
  add column if not exists relatorio_servico_referencia text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contratos_periodicidade_pagamento_check'
      and conrelid = 'public.contratos'::regclass
  ) then
    alter table public.contratos
      add constraint contratos_periodicidade_pagamento_check
      check (periodicidade_pagamento is null or periodicidade_pagamento = any (array['MENSAL','TRIMESTRAL']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contratos_vigencias_periodicidade_pagamento_check'
      and conrelid = 'public.contratos_vigencias'::regclass
  ) then
    alter table public.contratos_vigencias
      add constraint contratos_vigencias_periodicidade_pagamento_check
      check (periodicidade_pagamento is null or periodicidade_pagamento = any (array['MENSAL','TRIMESTRAL']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contratos_historico_periodicidade_calculo_check'
      and conrelid = 'public.contratos_historico'::regclass
  ) then
    alter table public.contratos_historico
      add constraint contratos_historico_periodicidade_calculo_check
      check (periodicidade_calculo is null or periodicidade_calculo = any (array['MENSAL','TRIMESTRAL']));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contratos_medicoes_ciclo_check'
      and conrelid = 'public.contratos_medicoes'::regclass
  ) then
    alter table public.contratos_medicoes
      add constraint contratos_medicoes_ciclo_check
      check (
        (ciclo_numero is null or ciclo_numero > 0)
        and (ciclo_inicio is null or ciclo_fim is null or ciclo_fim >= ciclo_inicio)
      );
  end if;
end $$;

create index if not exists idx_contratos_periodicidade_pagamento
  on public.contratos(periodicidade_pagamento);

create index if not exists idx_contratos_medicoes_ciclo
  on public.contratos_medicoes(contrato_id, ciclo_numero);

create or replace view public.vw_processos_resumo
with (security_invoker=true)
as
select
  p.id,p.identificador,p.tipo,p.natureza,p.objeto,p.modalidade,p.status,p.secao,
  p.valor_estimado,p.observacao,p.gera_mais_contratos,p.created_at,
  count(i.id)::integer total_itens,
  coalesce(sum(i.qtde),0)::numeric total_qtde,
  coalesce(sum(coalesce(i.valor_contratado,i.valor_estimado,0)*coalesce(i.qtde,1)),0)::numeric total_itens_valor,
  p.tipo_servico,
  p.servico_mensal_itens,p.servico_mensal_meses,p.servico_mensal_valor_mensal,p.servico_mensal_valor_global,
  (select count(*)::integer from public.contratos c where c.processo_id=p.id) n_contratos,
  p.servico_demanda_meses,p.sc,p.secao_id,
  p.servico_trimestral_itens,p.servico_trimestral_meses,p.servico_trimestral_ciclos,
  p.servico_trimestral_valor_trimestral,p.servico_trimestral_valor_global
from public.processos p
left join public.itens i on i.processo_id=p.id
group by p.id;

grant select on public.vw_processos_resumo to authenticated;
revoke select on public.vw_processos_resumo from anon;
