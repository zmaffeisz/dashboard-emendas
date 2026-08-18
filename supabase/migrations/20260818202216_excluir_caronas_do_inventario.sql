begin;

-- Caronas pertencem ao órgão solicitante. O recebimento continua individualizado em
-- atas_execucao_unidades, mas essas unidades não compõem o inventário da Saúde.
create or replace function public._sincronizar_inventario_unidade_ata()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade_id bigint;
  v_unidade_nome text;
  v_origem_recurso text;
begin
  select
    u.id,
    nullif(btrim(ae.unidade), ''),
    lower(coalesce(nullif(btrim(ae.origem_recurso), ''), ''))
  into v_unidade_id, v_unidade_nome, v_origem_recurso
  from public.atas_execucao ae
  left join lateral (
    select ux.id
    from public.unidades ux
    where lower(btrim(ux.nome)) = lower(btrim(ae.unidade))
    order by (ux.ativo is true) desc, ux.id
    limit 1
  ) u on true
  where ae.id = new.exec_id;

  if v_origem_recurso = 'carona' then
    delete from public.inventario_unidades
    where origem_tipo = 'ATA'
      and unidade_fisica_id = new.id;
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
    unidade_origem_id = coalesce(inventario_unidades.unidade_origem_id, excluded.unidade_origem_id),
    unidade_origem_nome = coalesce(inventario_unidades.unidade_origem_nome, excluded.unidade_origem_nome),
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

-- Se a origem for corrigida depois do recebimento, alinha imediatamente o estado do
-- inventário sem apagar as unidades físicas e os documentos da execução.
create or replace function public._sincronizar_inventario_origem_execucao_ata()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(nullif(btrim(new.origem_recurso), ''), '')) = 'carona' then
    delete from public.inventario_unidades iu
    using public.atas_execucao_unidades aeu
    where iu.origem_tipo = 'ATA'
      and iu.unidade_fisica_id = aeu.id
      and aeu.exec_id = new.id;
  elsif lower(coalesce(nullif(btrim(old.origem_recurso), ''), '')) = 'carona' then
    update public.atas_execucao_unidades
    set secao_id = secao_id
    where exec_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sincronizar_inventario_origem_execucao_ata
  on public.atas_execucao;
create trigger trg_sincronizar_inventario_origem_execucao_ata
after update of origem_recurso
on public.atas_execucao
for each row execute function public._sincronizar_inventario_origem_execucao_ata();

-- Limpeza idempotente para eventual dado anterior à regra. Os registros operacionais
-- em atas_execucao e atas_execucao_unidades permanecem preservados.
select set_config('app.inventario_movimentacao_autorizada', '1', true);

delete from public.inventario_unidades iu
using public.atas_execucao_unidades aeu, public.atas_execucao ae
where iu.origem_tipo = 'ATA'
  and iu.unidade_fisica_id = aeu.id
  and aeu.exec_id = ae.id
  and lower(coalesce(nullif(btrim(ae.origem_recurso), ''), '')) = 'carona';

comment on function public._sincronizar_inventario_unidade_ata() is
  'Espelha unidades recebidas de ATA no inventário, exceto execuções com origem Carona.';
comment on function public._sincronizar_inventario_origem_execucao_ata() is
  'Remove ou recompõe o estado de inventário quando a origem de uma execução de ATA muda.';

notify pgrst, 'reload schema';

commit;
