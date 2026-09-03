begin;

-- A importação dos destinos por patrimônio não deve substituir a identificação
-- histórica da emenda gravada no cabeçalho da execução. O destino real fica em
-- atas_execucao_unidades.unidade_* e o cabeçalho conserva "EMENDA ... - ...".
create temp table _restaurar_unidade_execucao_monitor (
  item_kind text not null,
  empenho_key text not null,
  unidade_original text not null,
  primary key (item_kind, empenho_key)
) on commit drop;

insert into _restaurar_unidade_execucao_monitor (
  item_kind, empenho_key, unidade_original
) values
  ('MULTI12','08087/2026','EMENDA 190 - APARECIDINHA'),
  ('MULTI12','22148/2025','EMENDA 64 - ULISSES'),
  ('MULTI12','22149/2025','EMENDA 2022.005.38166 - SOROCABA I'),
  ('MULTI12','22176/2025','EMENDA 2022.005.38168 - APARECIDINHA'),
  ('SPO2','22181/2025','EMENDA 2022.005.38161 - CAJURU'),
  ('SPO2','22183,22184/2025','EMENDA 2022.005.38166 - SOROCABA I'),
  ('SPO2','22185/2025','EMENDA 2022.005.38167 - NOVA ESPERANÇA'),
  ('SPO2','22186,22187/2025','EMENDA 2022.005.38168 - APARECIDINHA'),
  ('SPO2','22189/2025','EMENDA 2022.005.38169 - WANEL VILLE'),
  ('SPO2','22190,22191/2025','EMENDA 2022.005.38170 - VITÓRIA RÉGIA'),
  ('SPO2','22192,22193/2025','EMENDA 2022.005.38171 - BARCELONA'),
  ('SPO2','22194/2025','EMENDA 2023.004.46546 - MINEIRÃO'),
  ('SPO2','22195/2025','EMENDA 2023.005.46528 - ANGÉLICA'),
  ('SPO2','24307,24308/2025','EMENDA 2023.005.46530 - BARÃO'),
  ('SPO2','22197/2025','EMENDA 2023.005.46532 - CERRADO'),
  ('SPO2','22198/2025','EMENDA 2023.005.46533 - ESCOLA'),
  ('SPO2','22199/2025','EMENDA 2023.005.46534 - FIORE'),
  ('SPO2','22200/2025','EMENDA 2023.005.46537 - HABITETO'),
  ('SPO2','22201/2025','EMENDA 2023.005.46538 - HORTÊNCIA'),
  ('SPO2','22202/2025','EMENDA 2023.005.46539 - LARANJEIRAS'),
  ('SPO2','22203/2025','EMENDA 2023.005.46540 - LOPES DE OLIVEIRA'),
  ('SPO2','22204/2025','EMENDA 2023.005.46541 - MÁRCIA MENDES'),
  ('SPO2','22205/2025','EMENDA 2023.005.46542 - MARIA DO CARMO'),
  ('SPO2','22206/2025','EMENDA 2023.005.46545 - MARIA EUGÊNIA'),
  ('SPO2','22207/2025','EMENDA 2023.005.46548 - PAINEIRAS'),
  ('SPO2','22208/2025','EMENDA 2023.005.46549 - RODRIGO'),
  ('SPO2','22209/2025','EMENDA 2023.005.46551 - SABIÁ'),
  ('SPO2','22210/2025','EMENDA 2023.005.46553 - SANTANA'),
  ('SPO2','22211/2025','EMENDA 2023.005.46555 - SIMUS'),
  ('SPO2','22212/2025','EMENDA 2023.005.46556 - ULISSES');

create temp table _execucoes_monitor_identificadas on commit drop as
select
  s.item_kind,
  s.empenho_key,
  s.unidade_original,
  ae.id as exec_id
from _restaurar_unidade_execucao_monitor s
join public.atas_execucao ae
  on regexp_replace(
       upper(split_part(coalesce(ae.empenho, ''), '(', 1)),
       '\s+', '', 'g'
     ) = s.empenho_key
join public.atas_itens ai on ai.id = ae.ata_item_id
where regexp_replace(
        upper(coalesce(ae.cpl, ai.cpl, '')),
        '[^A-Z0-9]', '', 'g'
      ) = 'CPL0172024'
  and (ai.item ilike '%SINAIS VITAIS%' or ai.item ilike '%MONITOR MULTIPARAM%')
  and case
        when ai.item ilike '%SINAIS VITAIS%' then 'SPO2'
        else 'MULTI12'
      end = s.item_kind;

do $$
declare
  v_stage integer;
  v_identificadas integer;
  v_distintas integer;
begin
  select count(*) into v_stage
  from _restaurar_unidade_execucao_monitor;

  select count(*), count(distinct exec_id)
    into v_identificadas, v_distintas
  from _execucoes_monitor_identificadas;

  if v_stage <> 30 or v_identificadas <> 30 or v_distintas <> 30 then
    raise exception
      'Correção cancelada: esperado 30 execuções únicas; estágio %, identificadas %, distintas %.',
      v_stage, v_identificadas, v_distintas;
  end if;
end;
$$;

update public.atas_execucao ae
set unidade = m.unidade_original
from _execucoes_monitor_identificadas m
where ae.id = m.exec_id
  and ae.unidade is distinct from m.unidade_original;

do $$
begin
  if exists (
    select 1
    from _execucoes_monitor_identificadas m
    join public.atas_execucao ae on ae.id = m.exec_id
    where ae.unidade is distinct from m.unidade_original
  ) then
    raise exception 'Correção cancelada: nem todos os nomes de emenda foram restaurados.';
  end if;
end;
$$;

commit;
