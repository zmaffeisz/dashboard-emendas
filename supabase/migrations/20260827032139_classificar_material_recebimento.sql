-- Separa bens permanentes de materiais de consumo no recebimento administrativo.
-- Compatibilidade: registros históricos permanecem sem classificação até uma nova
-- operação de recebimento, evitando qualquer reclassificação automática indevida.

begin;

alter table public.itens_entregas
  add column if not exists tipo_material text;
alter table public.atas_execucao
  add column if not exists tipo_material text;

alter table public.itens_entregas
  drop constraint if exists itens_entregas_tipo_material_check;
alter table public.itens_entregas
  add constraint itens_entregas_tipo_material_check
  check (tipo_material is null or tipo_material in ('PERMANENTE', 'CONSUMO'));

alter table public.atas_execucao
  drop constraint if exists atas_execucao_tipo_material_check;
alter table public.atas_execucao
  add constraint atas_execucao_tipo_material_check
  check (tipo_material is null or tipo_material in ('PERMANENTE', 'CONSUMO'));

comment on column public.itens_entregas.tipo_material is
  'Classificação informada no recebimento: PERMANENTE gera unidades físicas; CONSUMO encerra no recebimento administrativo.';
comment on column public.atas_execucao.tipo_material is
  'Classificação informada no recebimento: PERMANENTE gera unidades físicas; CONSUMO encerra no recebimento administrativo.';

create or replace function public._validar_classificacao_recebimento()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recebido boolean;
  v_alterou_recebimento boolean;
  v_tem_unidades boolean;
begin
  new.tipo_material := nullif(upper(btrim(coalesce(new.tipo_material, ''))), '');

  if tg_table_name = 'itens_entregas' then
    v_recebido := coalesce(new.qtde_recebida, 0) > 0 or new.data_recebimento is not null;
    v_alterou_recebimento := tg_op = 'INSERT'
      or new.qtde_recebida is distinct from old.qtde_recebida
      or new.data_recebimento is distinct from old.data_recebimento
      or new.nota_fiscal_id is distinct from old.nota_fiscal_id;
    if new.tipo_material = 'CONSUMO' then
      select exists (
        select 1 from public.itens_entregas_unidades u where u.entrega_id = new.id
      ) into v_tem_unidades;
    end if;
  else
    v_recebido := nullif(btrim(coalesce(new.dt_entrega, '')), '') is not null
      or nullif(btrim(coalesce(new.nf, '')), '') is not null;
    v_alterou_recebimento := tg_op = 'INSERT'
      or new.dt_entrega is distinct from old.dt_entrega
      or new.nf is distinct from old.nf;
    if new.tipo_material = 'CONSUMO' then
      select exists (
        select 1 from public.atas_execucao_unidades u where u.exec_id = new.id
      ) into v_tem_unidades;
    end if;
  end if;

  if v_alterou_recebimento and v_recebido and new.tipo_material is null then
    raise exception 'Informe se o item é bem permanente ou material de consumo.';
  end if;

  if new.tipo_material = 'PERMANENTE' and v_recebido and new.possui_patrimonio is null then
    raise exception 'Informe se o bem permanente possui patrimônio.';
  end if;

  if new.tipo_material = 'CONSUMO' then
    if v_tem_unidades then
      raise exception 'O item já possui unidades físicas e não pode ser classificado como material de consumo.';
    end if;
    new.possui_patrimonio := null;
    new.data_entrega_unidade := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_classificacao_recebimento on public.itens_entregas;
create trigger trg_validar_classificacao_recebimento
before insert or update on public.itens_entregas
for each row execute function public._validar_classificacao_recebimento();

drop trigger if exists trg_validar_classificacao_recebimento on public.atas_execucao;
create trigger trg_validar_classificacao_recebimento
before insert or update on public.atas_execucao
for each row execute function public._validar_classificacao_recebimento();

-- Somente permanentes nascem como unidades físicas. A opção de patrimônio define
-- apenas se cada unidade já recebe número patrimonial, não se ela existe fisicamente.
create or replace function public._materializar_unidades_aquisicao_sem_patrimonio()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.tipo_material = 'PERMANENTE'
     and coalesce(new.qtde_recebida, 0) > 0
     and (new.data_recebimento is not null or new.nota_fiscal_id is not null) then
    if new.qtde_recebida <> trunc(new.qtde_recebida) then
      raise exception 'Bem permanente exige quantidade inteira.';
    end if;

    insert into public.itens_entregas_unidades (
      entrega_id, item_id, unidade_id, unidade_nome, quantidade, unidade_seq,
      nota_fiscal_id, recebido_em, recebido_por, secao_id
    )
    select
      new.id, new.item_id, i.unidade_destino_id, u.nome, 1, g.seq,
      new.nota_fiscal_id, new.data_recebimento, new.recebido_por, new.secao_id
    from public.itens i
    left join public.unidades u on u.id = i.unidade_destino_id
    cross join lateral generate_series(1, trunc(new.qtde_recebida)::integer) as g(seq)
    where i.id = new.item_id
    on conflict (entrega_id, unidade_seq) do update set
      item_id = excluded.item_id,
      unidade_id = excluded.unidade_id,
      unidade_nome = excluded.unidade_nome,
      quantidade = 1,
      nota_fiscal_id = excluded.nota_fiscal_id,
      recebido_em = excluded.recebido_em,
      recebido_por = excluded.recebido_por,
      secao_id = excluded.secao_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_materializar_unidades_aquisicao_sem_patrimonio
  on public.itens_entregas;
create trigger trg_materializar_unidades_aquisicao_sem_patrimonio
after insert or update of qtde_recebida, data_recebimento, nota_fiscal_id,
  recebido_por, possui_patrimonio, tipo_material
on public.itens_entregas
for each row execute function public._materializar_unidades_aquisicao_sem_patrimonio();

create or replace function public._materializar_unidades_ata_sem_patrimonio()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recebido_em date;
begin
  if new.tipo_material = 'PERMANENTE'
     and coalesce(new.qtde, 0) > 0
     and (
       nullif(btrim(coalesce(new.dt_entrega, '')), '') is not null
       or nullif(btrim(coalesce(new.nf, '')), '') is not null
       or new.data_entrega_unidade is not null
     ) then
    if new.qtde <> trunc(new.qtde) then
      raise exception 'Bem permanente de ATA exige quantidade inteira.';
    end if;

    if nullif(btrim(coalesce(new.dt_entrega, '')), '') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_recebido_em := new.dt_entrega::date;
    else
      v_recebido_em := new.data_entrega_unidade;
    end if;

    insert into public.atas_execucao_unidades (
      exec_id, ata_item_id, emenda_item_id, unidade_seq, recebido_em, secao_id
    )
    select new.id, new.ata_item_id, new.emenda_item_id, g.seq, v_recebido_em, new.secao_id
    from generate_series(1, trunc(new.qtde)::integer) as g(seq)
    on conflict (exec_id, unidade_seq) do update set
      ata_item_id = excluded.ata_item_id,
      emenda_item_id = excluded.emenda_item_id,
      recebido_em = excluded.recebido_em,
      secao_id = excluded.secao_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_materializar_unidades_ata_sem_patrimonio
  on public.atas_execucao;
create trigger trg_materializar_unidades_ata_sem_patrimonio
after insert or update of qtde, dt_entrega, nf, data_entrega_unidade,
  possui_patrimonio, tipo_material
on public.atas_execucao
for each row execute function public._materializar_unidades_ata_sem_patrimonio();

create or replace function public._bloquear_unidade_fisica_consumo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tipo text;
begin
  if tg_table_name = 'itens_entregas_unidades' then
    select e.tipo_material into v_tipo
    from public.itens_entregas e where e.id = new.entrega_id;
  else
    select e.tipo_material into v_tipo
    from public.atas_execucao e where e.id = new.exec_id;
  end if;
  if v_tipo = 'CONSUMO' then
    raise exception 'Material de consumo não gera unidades físicas individuais.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_unidade_fisica_consumo on public.itens_entregas_unidades;
create trigger trg_bloquear_unidade_fisica_consumo
before insert or update on public.itens_entregas_unidades
for each row execute function public._bloquear_unidade_fisica_consumo();

drop trigger if exists trg_bloquear_unidade_fisica_consumo on public.atas_execucao_unidades;
create trigger trg_bloquear_unidade_fisica_consumo
before insert or update on public.atas_execucao_unidades
for each row execute function public._bloquear_unidade_fisica_consumo();

-- Mantém o recebimento em lote atômico: classifica todas as entregas antes de
-- delegar para a função já consolidada de NF/rateio/recebimento.
do $$
begin
  if to_regprocedure('public._registrar_recebimento_aquisicao_lote_core(jsonb,jsonb)') is null then
    alter function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb)
      rename to _registrar_recebimento_aquisicao_lote_core;
  end if;
end;
$$;

create or replace function public.registrar_recebimento_aquisicao_lote(
  p_nota jsonb,
  p_itens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_entrega_id uuid;
  v_tipo_material text;
  v_possui_patrimonio boolean;
  v_quantidade numeric;
  v_afetadas integer;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'A lista de itens do recebimento é inválida.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    begin
      v_entrega_id := nullif(v_item->>'entrega_id', '')::uuid;
      v_quantidade := nullif(v_item->>'quantidade', '')::numeric;
      v_tipo_material := upper(btrim(coalesce(v_item->>'tipo_material', '')));
      v_possui_patrimonio := (v_item->>'possui_patrimonio')::boolean;
    exception when invalid_text_representation then
      raise exception 'Classificação ou quantidade inválida no recebimento em lote.';
    end;

    if v_tipo_material not in ('PERMANENTE', 'CONSUMO') then
      raise exception 'Informe se os itens são bens permanentes ou materiais de consumo.';
    end if;
    if v_tipo_material = 'PERMANENTE' and v_possui_patrimonio is null then
      raise exception 'Informe se os bens permanentes possuem patrimônio.';
    end if;
    if v_tipo_material = 'PERMANENTE'
       and (v_quantidade is null or v_quantidade <> trunc(v_quantidade)) then
      raise exception 'Bens permanentes exigem quantidade inteira.';
    end if;
    if v_tipo_material = 'CONSUMO' and v_possui_patrimonio then
      raise exception 'Material de consumo não possui controle patrimonial neste fluxo.';
    end if;

    update public.itens_entregas
    set tipo_material = v_tipo_material
    where id = v_entrega_id
      and (tipo_material is null or tipo_material = v_tipo_material);
    get diagnostics v_afetadas = row_count;
    if v_afetadas <> 1 then
      raise exception 'A classificação do material conflita com um recebimento anterior.';
    end if;
  end loop;

  return public._registrar_recebimento_aquisicao_lote_core(p_nota, p_itens);
end;
$$;

revoke all on function public._registrar_recebimento_aquisicao_lote_core(jsonb, jsonb)
  from public, anon;
grant execute on function public._registrar_recebimento_aquisicao_lote_core(jsonb, jsonb)
  to authenticated;
revoke all on function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb)
  from public, anon;
grant execute on function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
