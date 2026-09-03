-- Enriquece as unidades físicas dos monitores do CPL 017/2024 com os dados da
-- planilha "execucao ata monitor.xlsx". A carga é idempotente e rejeita qualquer
-- divergência patrimonial preexistente.

begin;

alter table public.atas_execucao_unidades
  add column if not exists unidade_id bigint,
  add column if not exists unidade_nome text,
  add column if not exists data_entrega_unidade date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atas_execucao_unidades_unidade_id_fkey'
      and conrelid = 'public.atas_execucao_unidades'::regclass
  ) then
    alter table public.atas_execucao_unidades
      add constraint atas_execucao_unidades_unidade_id_fkey
      foreign key (unidade_id) references public.unidades(id);
  end if;
end;
$$;

create index if not exists idx_atas_execucao_unidades_unidade_id
  on public.atas_execucao_unidades(unidade_id);

comment on column public.atas_execucao_unidades.unidade_id is
  'Unidade de destino desta unidade física; permite destinos distintos dentro da mesma execução.';
comment on column public.atas_execucao_unidades.unidade_nome is
  'Fotografia do nome da unidade de destino no recebimento/entrega.';
comment on column public.atas_execucao_unidades.data_entrega_unidade is
  'Data em que esta unidade física foi entregue na unidade de destino.';

-- Mantém o Inventário sincronizado com a destinação individual, preservando
-- localização e origem quando já houver movimentação posterior.
create or replace function public._sincronizar_inventario_unidade_ata()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade_id bigint := new.unidade_id;
  v_unidade_nome text := nullif(btrim(new.unidade_nome), '');
  v_origem_recurso text;
begin
  select lower(coalesce(nullif(btrim(ae.origem_recurso), ''), ''))
    into v_origem_recurso
  from public.atas_execucao ae
  where ae.id = new.exec_id;

  if v_unidade_id is not null and v_unidade_nome is null then
    select u.nome into v_unidade_nome
    from public.unidades u where u.id = v_unidade_id;
  elsif v_unidade_id is null and v_unidade_nome is not null then
    select u.id, u.nome into v_unidade_id, v_unidade_nome
    from public.unidades u
    where lower(btrim(u.nome)) = lower(v_unidade_nome)
    order by (u.ativo is true) desc, u.id
    limit 1;
  end if;

  if v_unidade_id is null and v_unidade_nome is null then
    select u.id, nullif(btrim(ae.unidade), '')
      into v_unidade_id, v_unidade_nome
    from public.atas_execucao ae
    left join lateral (
      select ux.id
      from public.unidades ux
      where lower(btrim(ux.nome)) = lower(btrim(ae.unidade))
      order by (ux.ativo is true) desc, ux.id
      limit 1
    ) u on true
    where ae.id = new.exec_id;
  end if;

  if v_origem_recurso = 'carona' then
    delete from public.inventario_unidades
    where origem_tipo = 'ATA' and unidade_fisica_id = new.id;
    return null;
  end if;

  insert into public.inventario_unidades (
    origem_tipo, unidade_fisica_id, secao_id,
    unidade_origem_id, unidade_origem_nome, unidade_atual_id, unidade_atual_nome
  ) values (
    'ATA', new.id, new.secao_id,
    v_unidade_id, v_unidade_nome, v_unidade_id, v_unidade_nome
  )
  on conflict (origem_tipo, unidade_fisica_id) do update set
    secao_id = excluded.secao_id,
    unidade_origem_id = case
      when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_origem_id
      else coalesce(inventario_unidades.unidade_origem_id, excluded.unidade_origem_id)
    end,
    unidade_origem_nome = case
      when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_origem_nome
      else coalesce(inventario_unidades.unidade_origem_nome, excluded.unidade_origem_nome)
    end,
    unidade_atual_id = case
      when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_id
      else inventario_unidades.unidade_atual_id
    end,
    unidade_atual_nome = case
      when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_nome
      else inventario_unidades.unidade_atual_nome
    end,
    atualizado_em = now();
  return null;
end;
$$;

drop trigger if exists trg_sincronizar_inventario_unidade_ata
  on public.atas_execucao_unidades;
create trigger trg_sincronizar_inventario_unidade_ata
after insert or update of exec_id, secao_id, unidade_id, unidade_nome
on public.atas_execucao_unidades
for each row execute function public._sincronizar_inventario_unidade_ata();

create temp table _stg_monitor_ata (
  source_order integer primary key,
  item_kind text not null,
  empenho_key text not null,
  patrimonio text not null,
  unidade_nome text,
  data_entrega_unidade date,
  confianca text not null,
  exec_id uuid
) on commit drop;

insert into _stg_monitor_ata (
  source_order, item_kind, empenho_key, patrimonio,
  unidade_nome, data_entrega_unidade, confianca
) values
  (2,'MULTI12','08087/2026','399012','UBS Aparecidinha',null,'PLANILHA'),
  (3,'SPO2','22181/2025','395806','UBS Cajuru do Sul','2026-05-19','PLANILHA'),
  (4,'SPO2','22181/2025','395807','UBS Cajuru do Sul','2026-05-19','PLANILHA'),
  (5,'MULTI12','22149/2025','395782','UBS Sorocaba I','2026-05-20','PLANILHA'),
  (6,'MULTI12','22149/2025','395783','UBS Sorocaba I','2026-05-20','PLANILHA'),
  (7,'SPO2','22183,22184/2025','395808','UBS Sorocaba I','2026-05-20','PLANILHA'),
  (8,'SPO2','22183,22184/2025','395809','UBS Sorocaba I','2026-05-20','PLANILHA'),
  (9,'SPO2','22185/2025','395810','UBS Nova Esperança','2026-05-20','PLANILHA'),
  (10,'SPO2','22185/2025','395811','UBS Nova Esperança','2026-05-20','PLANILHA'),
  (11,'MULTI12','22176/2025','395784','UBS Aparecidinha','2026-05-19','PLANILHA'),
  (12,'SPO2','22186,22187/2025','395812','UBS Aparecidinha','2026-05-19','PLANILHA'),
  (13,'SPO2','22189/2025','395813','UBS Wanel Ville','2026-05-20','PLANILHA'),
  (14,'SPO2','22189/2025','395814','UBS Wanel Ville','2026-05-20','PLANILHA'),
  (15,'SPO2','22190,22191/2025','395815','UBS Vitória Régia','2026-05-19','PLANILHA'),
  (16,'SPO2','22190,22191/2025','395816','UBS Vitória Régia','2026-05-19','PLANILHA'),
  (17,'SPO2','22192,22193/2025','395817','UBS Barcelona','2026-05-19','PLANILHA'),
  (18,'SPO2','22194/2025','395818','UBS Mineirão','2026-05-21','PLANILHA'),
  (19,'SPO2','22195/2025','395819','UBS Angélica','2026-05-18','PLANILHA'),
  (20,'SPO2','24307,24308/2025','395821','UBS Barão','2026-05-20','PLANILHA'),
  (21,'SPO2','24307,24308/2025','395822','UBS Barão','2026-05-20','PLANILHA'),
  (22,'SPO2','22197/2025','395820','UBS Cerrado','2026-05-20','PLANILHA'),
  (23,'SPO2','22198/2025','394231','UBS Escola','2026-05-20','PLANILHA'),
  (24,'SPO2','22199/2025','395791','UBS Fiori','2026-05-21','PLANILHA'),
  (25,'SPO2','22200/2025','394233','UBS Habiteto','2026-05-19','PLANILHA'),
  (26,'SPO2','22201/2025','394234','UBS Hortência','2026-05-18','PLANILHA'),
  (27,'SPO2','22202/2025','394236','PA Laranjeiras','2026-05-21','PLANILHA'),
  (28,'SPO2','22202/2025','394235','UBS Laranjeiras','2026-05-21','PLANILHA'),
  (29,'SPO2','22203/2025','394237','UBS Lopes Oliveira','2026-05-21','PLANILHA'),
  (30,'SPO2','22203/2025','394238','UBS Lopes Oliveira','2026-05-21','PLANILHA'),
  (31,'SPO2','22204/2025','394239','UBS Márcia Mendes','2026-05-20','PLANILHA'),
  (32,'SPO2','22205/2025','394240','UBS Maria do Carmo','2026-05-18','PLANILHA'),
  (33,'SPO2','22207/2025','394243','UBS Paineiras',null,'QUASE_CERTEZA'),
  (34,'SPO2','22208/2025','394244','UBS Rodrigo','2026-05-21','PLANILHA'),
  (35,'SPO2','22209/2025','394245','UBS Sabiá','2026-05-19','PLANILHA'),
  (36,'SPO2','22209/2025','394246','UBS Sabiá','2026-05-19','PLANILHA'),
  (37,'SPO2','22210/2025','394247','UBS Santana','2026-05-20','PLANILHA'),
  (38,'SPO2','22211/2025','394248','UBS Simus','2026-05-20','PLANILHA'),
  (39,'SPO2','22211/2025','394249','UBS Simus','2026-05-20','PLANILHA'),
  (40,'SPO2','22212/2025','394250','UBS Ulisses','2026-05-19','PLANILHA'),
  (41,'SPO2','22212/2025','394251','UBS Ulisses','2026-05-19','PLANILHA'),
  (42,'SPO2','22180/2025','395793','UBS Haro','2026-05-20','PLANILHA'),
  (43,'SPO2','22180/2025','395794','UBS Haro','2026-05-20','PLANILHA'),
  (44,'SPO2','22180/2025','395796','UBS Márcia Mendes','2026-05-20','PLANILHA'),
  (45,'SPO2','22180/2025','395797','UBS Nova Sorocaba','2026-05-19','PLANILHA'),
  (46,'SPO2','22180/2025','395798','UBS Nova Sorocaba','2026-05-19','PLANILHA'),
  (47,'SPO2','22180/2025','395803','[LEGADO] PA SÃO GUILHERME','2026-05-19','PLANILHA'),
  (48,'SPO2','22180/2025','395802','UBS São Guilherme','2026-05-19','PLANILHA'),
  (49,'SPO2','22180/2025','395792','UBS Habiteto','2026-05-19','PLANILHA'),
  (50,'SPO2','22180/2025','395790','UBS Éden','2026-05-19','PLANILHA'),
  (51,'SPO2','22180/2025','395789','UBS Éden','2026-05-19','PLANILHA'),
  (52,'SPO2','22180/2025','395786','UBS Brigadeiro Tobias','2026-05-19','PLANILHA'),
  (53,'SPO2','22180/2025','395805','UBS Hortência','2026-05-18','PLANILHA'),
  (54,'SPO2','22180/2025','395795','PA Laranjeiras','2026-05-21','PLANILHA'),
  (55,'SPO2','22180/2025','394232','UBS Fiori','2026-05-21','PLANILHA'),
  (56,'SPO2','22180/2025','395785','UBS Angélica','2026-05-18','PLANILHA'),
  (57,'SPO2','22180/2025','395804','UBS Mineirão','2026-05-21','PLANILHA'),
  (58,'SPO2','22180/2025','395800','UBS São Bento','2026-05-21','PLANILHA'),
  (59,'SPO2','22180/2025','395801','[LEGADO] PA SÃO BENTO','2026-05-21','PLANILHA'),
  (60,'SPO2','22180/2025','395787','UBS Carandá','2026-05-21','PLANILHA'),
  (61,'SPO2','22180/2025','395788','[LEGADO] PA CARANDÁ','2026-05-21','PLANILHA'),
  -- Deduções por lacunas completas nas sequências patrimoniais e quantidades das execuções.
  (1001,'MULTI12','22148/2025','395781','UBS Ulisses',null,'QUASE_CERTEZA'),
  (1002,'SPO2','22206/2025','394241','UBS Maria Eugênia',null,'QUASE_CERTEZA'),
  (1003,'SPO2','22206/2025','394242','UBS Maria Eugênia',null,'QUASE_CERTEZA'),
  (1004,'SPO2','22180/2025','395799',null,null,'QUASE_CERTEZA');

-- Cada chave direta deve apontar para exatamente uma execução.
do $$
declare
  v_invalid integer;
begin
  select count(*) into v_invalid
  from _stg_monitor_ata s
  cross join lateral (
    select count(distinct ae.id) as n
    from public.atas_execucao ae
    join public.atas_itens ai on ai.id = ae.ata_item_id
    where regexp_replace(upper(coalesce(ae.cpl, ai.cpl, '')), '[^A-Z0-9]', '', 'g') = 'CPL0172024'
      and (ai.item ilike '%SINAIS VITAIS%' or ai.item ilike '%MONITOR MULTIPARAM%')
      and case when ai.item ilike '%SINAIS VITAIS%' then 'SPO2' else 'MULTI12' end = s.item_kind
      and regexp_replace(upper(split_part(coalesce(ae.empenho, ''), '(', 1)), '\s+', '', 'g') = s.empenho_key
  ) q
  where s.empenho_key <> '22180/2025' and q.n <> 1;

  if v_invalid <> 0 then
    raise exception 'Importação cancelada: % chave(s) direta(s) não identificaram uma única execução.', v_invalid;
  end if;
end;
$$;

update _stg_monitor_ata s
set exec_id = ae.id
from public.atas_execucao ae
join public.atas_itens ai on ai.id = ae.ata_item_id
where s.empenho_key <> '22180/2025'
  and regexp_replace(upper(coalesce(ae.cpl, ai.cpl, '')), '[^A-Z0-9]', '', 'g') = 'CPL0172024'
  and (ai.item ilike '%SINAIS VITAIS%' or ai.item ilike '%MONITOR MULTIPARAM%')
  and case when ai.item ilike '%SINAIS VITAIS%' then 'SPO2' else 'MULTI12' end = s.item_kind
  and regexp_replace(upper(split_part(coalesce(ae.empenho, ''), '(', 1)), '\s+', '', 'g') = s.empenho_key;

do $$
declare
  v_exec_id uuid;
  v_count integer;
begin
  select (array_agg(distinct ae.id))[1], count(distinct ae.id)
    into v_exec_id, v_count
  from public.atas_execucao ae
  join public.atas_itens ai on ai.id = ae.ata_item_id
  where regexp_replace(upper(coalesce(ae.cpl, ai.cpl, '')), '[^A-Z0-9]', '', 'g') = 'CPL0172024'
    and ai.item ilike '%SINAIS VITAIS%'
    and ae.qtde = 21
    and regexp_replace(coalesce(ae.nf, ''), '\D', '', 'g') = '51579'
    and ae.unidade = 'EMENDA 12493.507000/1190-01 - UBS';

  if v_count <> 1 then
    raise exception 'Importação cancelada: o lote agregado de 21 monitores teve % correspondências.', v_count;
  end if;

  update _stg_monitor_ata set exec_id = v_exec_id
  where empenho_key = '22180/2025';
end;
$$;

do $$
begin
  if (select count(*) from _stg_monitor_ata) <> 64
     or exists(select 1 from _stg_monitor_ata where exec_id is null) then
    raise exception 'Importação cancelada: o conjunto reconciliado não contém 64 linhas identificadas.';
  end if;
end;
$$;

create temp table _map_monitor_ata on commit drop as
with ordenado as (
  select s.*,
    row_number() over(partition by s.exec_id order by s.source_order) as unidade_seq
  from _stg_monitor_ata s
)
select
  o.*,
  aeu.id as unidade_fisica_id,
  un.id as unidade_id
from ordenado o
left join public.atas_execucao_unidades aeu
  on aeu.exec_id = o.exec_id and aeu.unidade_seq = o.unidade_seq
left join public.unidades un on un.nome = o.unidade_nome;

do $$
begin
  if (select count(*) from _map_monitor_ata) <> 64
     or exists(select 1 from _map_monitor_ata where unidade_fisica_id is null) then
    raise exception 'Importação cancelada: nem todas as 64 unidades físicas foram localizadas.';
  end if;

  if exists (
    select 1 from _map_monitor_ata
    where unidade_nome is not null and unidade_id is null
  ) then
    raise exception 'Importação cancelada: existe unidade de destino sem correspondência no cadastro.';
  end if;

  if exists (
    select 1
    from _map_monitor_ata m
    join public.atas_execucao_unidades u on u.id = m.unidade_fisica_id
    where nullif(btrim(u.patrimonio), '') is not null
      and btrim(u.patrimonio) <> m.patrimonio
  ) then
    raise exception 'Importação cancelada: uma unidade física já possui patrimônio diferente.';
  end if;

  if exists (
    select 1
    from _map_monitor_ata m
    join public.atas_execucao_unidades u on btrim(u.patrimonio) = m.patrimonio
    where u.id <> m.unidade_fisica_id
  ) or exists (
    select 1
    from _map_monitor_ata m
    join public.itens_entregas_unidades u on btrim(u.patrimonio) = m.patrimonio
  ) then
    raise exception 'Importação cancelada: existe patrimônio atribuído a outro bem.';
  end if;

  if exists (
    select 1
    from _map_monitor_ata m
    join public.inventario_unidades iu
      on iu.origem_tipo = 'ATA' and iu.unidade_fisica_id = m.unidade_fisica_id
    where iu.ultima_movimentacao_em is not null
  ) then
    raise exception 'Importação cancelada: uma das unidades já possui movimentação no inventário.';
  end if;
end;
$$;

update public.atas_execucao_unidades u
set
  patrimonio = m.patrimonio,
  unidade_id = coalesce(m.unidade_id, u.unidade_id),
  unidade_nome = coalesce(m.unidade_nome, u.unidade_nome),
  data_entrega_unidade = coalesce(m.data_entrega_unidade, u.data_entrega_unidade),
  obs = case
    when coalesce(u.obs, '') like '%execucao ata monitor.xlsx%' then u.obs
    else concat_ws(E'\n', nullif(u.obs, ''),
      case when m.confianca = 'PLANILHA'
        then format('Importado de execucao ata monitor.xlsx, linha %s.', m.source_order)
        else format('Importado por reconciliação de alta confiança (%s). Fonte: execucao ata monitor.xlsx.', m.patrimonio)
      end)
  end
from _map_monitor_ata m
where u.id = m.unidade_fisica_id;

-- No cabeçalho da execução, mantém unidade/data apenas quando o lote inteiro possui
-- um único valor. Lotes com vários destinos permanecem detalhados por unidade física.
with resumo as (
  select
    m.exec_id,
    count(*) as mapeadas,
    count(m.unidade_nome) as com_unidade,
    count(distinct m.unidade_nome) as unidades_distintas,
    min(m.unidade_nome) as unidade_nome,
    count(m.data_entrega_unidade) as com_data,
    count(distinct m.data_entrega_unidade) as datas_distintas,
    min(m.data_entrega_unidade) as data_entrega_unidade
  from _map_monitor_ata m
  group by m.exec_id
)
update public.atas_execucao ae
set
  possui_patrimonio = true,
  unidade = case
    when r.com_unidade = r.mapeadas and r.unidades_distintas = 1 then r.unidade_nome
    else ae.unidade
  end,
  data_entrega_unidade = case
    when r.com_data = r.mapeadas and r.datas_distintas = 1 then r.data_entrega_unidade
    else ae.data_entrega_unidade
  end
from resumo r
where ae.id = r.exec_id;

comment on function public._sincronizar_inventario_unidade_ata() is
  'Espelha no inventário o destino individual da unidade física de ATA, exceto Carona, sem reescrever movimentações posteriores.';

notify pgrst, 'reload schema';

commit;
