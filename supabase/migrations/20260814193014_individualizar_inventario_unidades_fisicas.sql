-- Inventário: toda unidade recebida passa a existir como uma linha física própria,
-- mesmo quando patrimônio e número de série não estiverem disponíveis.

begin;

-- A quantidade pertence ao lote/recebimento pai. Na tabela física ela é sempre 1.
update public.itens_entregas_unidades
set quantidade = 1
where quantidade is distinct from 1;

alter table public.itens_entregas_unidades
  alter column quantidade set default 1,
  alter column quantidade set not null;

alter table public.itens_entregas_unidades
  drop constraint if exists itens_entregas_unidades_quantidade_unitaria;
alter table public.itens_entregas_unidades
  add constraint itens_entregas_unidades_quantidade_unitaria
  check (quantidade = 1);

create unique index if not exists uq_itens_entregas_unidades_entrega_seq
  on public.itens_entregas_unidades(entrega_id, unidade_seq);

create unique index if not exists uq_atas_execucao_unidades_exec_seq
  on public.atas_execucao_unidades(exec_id, unidade_seq);

-- Materializa qualquer unidade de aquisição já recebida que ainda não possua linha
-- física. Patrimônio/série podem permanecer nulos no legado.
insert into public.itens_entregas_unidades (
  entrega_id, item_id, unidade_id, unidade_nome, quantidade, unidade_seq,
  nota_fiscal_id, recebido_em, recebido_por, secao_id
)
select
  e.id, e.item_id, i.unidade_destino_id, u.nome, 1, g.seq,
  e.nota_fiscal_id, e.data_recebimento, e.recebido_por, e.secao_id
from public.itens_entregas e
join public.itens i on i.id = e.item_id
left join public.unidades u on u.id = i.unidade_destino_id
cross join lateral generate_series(1, trunc(coalesce(e.qtde_recebida, 0))::integer) as g(seq)
where coalesce(e.qtde_recebida, 0) > 0
  and e.qtde_recebida = trunc(e.qtde_recebida)
  and not exists (
    select 1
    from public.itens_entregas_unidades eu
    where eu.entrega_id = e.id and eu.unidade_seq = g.seq
  );

-- Materializa as execuções históricas de ATA. O registro agregado continua sendo a
-- execução/pedido; estas linhas representam o nascimento das unidades no inventário.
insert into public.atas_execucao_unidades (
  exec_id, ata_item_id, emenda_item_id, unidade_seq,
  recebido_em, secao_id
)
select
  e.id, e.ata_item_id, e.emenda_item_id, g.seq,
  case
    when nullif(btrim(coalesce(e.dt_entrega, '')), '') ~ '^\d{4}-\d{2}-\d{2}$'
      then e.dt_entrega::date
    else e.data_entrega_unidade
  end,
  e.secao_id
from public.atas_execucao e
cross join lateral generate_series(1, trunc(coalesce(e.qtde, 0))::integer) as g(seq)
where coalesce(e.qtde, 0) > 0
  and e.qtde = trunc(e.qtde)
  and (
    nullif(btrim(coalesce(e.dt_entrega, '')), '') is not null
    or nullif(btrim(coalesce(e.nf, '')), '') is not null
    or e.data_entrega_unidade is not null
  )
  and not exists (
    select 1
    from public.atas_execucao_unidades eu
    where eu.exec_id = e.id and eu.unidade_seq = g.seq
  );

-- Defesa para recebimentos sem patrimônio feitos por integrações/RPCs: ao nascer o
-- recebimento, cria automaticamente as linhas físicas ausentes. Recebimentos com
-- patrimônio continuam preenchendo essas mesmas sequências pela aplicação.
create or replace function public._materializar_unidades_aquisicao_sem_patrimonio()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.possui_patrimonio is not true
     and coalesce(new.qtde_recebida, 0) > 0
     and (new.data_recebimento is not null or new.nota_fiscal_id is not null) then
    if new.qtde_recebida <> trunc(new.qtde_recebida) then
      raise exception 'Recebimento físico exige quantidade inteira.';
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
  recebido_por, possui_patrimonio
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
  if new.possui_patrimonio is not true
     and coalesce(new.qtde, 0) > 0
     and (
       nullif(btrim(coalesce(new.dt_entrega, '')), '') is not null
       or nullif(btrim(coalesce(new.nf, '')), '') is not null
       or new.data_entrega_unidade is not null
     ) then
    if new.qtde <> trunc(new.qtde) then
      raise exception 'Recebimento físico de ATA exige quantidade inteira.';
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
after insert or update of qtde, dt_entrega, nf, data_entrega_unidade, possui_patrimonio
on public.atas_execucao
for each row execute function public._materializar_unidades_ata_sem_patrimonio();

comment on table public.itens_entregas_unidades is
  'Uma linha por unidade física recebida. Patrimônio e série são opcionais; quantidade é sempre 1.';
comment on table public.atas_execucao_unidades is
  'Uma linha por unidade física recebida de ATA. Patrimônio e série são opcionais.';

notify pgrst, 'reload schema';

commit;
