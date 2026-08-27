-- Impede que o recebimento em lote acrescente unidades identificadas depois das
-- linhas vazias já materializadas pelo trigger e saneia o incidente de 27/08/2026.

begin;

do $migration$
declare
  v_funcao regprocedure;
  v_definicao text;
  v_bloco_sequencia text := $old_seq$    select coalesce(max(unidade_seq), 0)
    into v_seq
    from public.itens_entregas_unidades
    where entrega_id = v_entrega_id;$old_seq$;
  v_bloco_sequencia_novo text := $new_seq$    -- O trigger já materializou as sequências até v_total_recebido.
    -- Preenche exatamente as posições deste lote, em vez de acrescentar novas linhas.
    v_seq := greatest(0, trunc(v_total_recebido - v_quantidade)::integer);$new_seq$;
  v_bloco_insert text := $old_insert$        insert into public.itens_entregas_unidades (
          entrega_id, item_id, unidade_id, unidade_nome, quantidade,
          patrimonio, numero_serie, nota_fiscal_id, unidade_seq,
          recebido_em, recebido_por, secao_id
        ) values (
          v_entrega_id, v_entrega.item_id, v_entrega.unidade_destino_id, v_entrega.unidade_nome, 1,
          v_patrimonio, v_numero_serie, v_nf_id, v_seq,
          v_data_recebimento, v_recebido_por, v_entrega.secao_id
        );$old_insert$;
  v_bloco_insert_novo text := $new_insert$        insert into public.itens_entregas_unidades (
          entrega_id, item_id, unidade_id, unidade_nome, quantidade,
          patrimonio, numero_serie, nota_fiscal_id, unidade_seq,
          recebido_em, recebido_por, secao_id
        ) values (
          v_entrega_id, v_entrega.item_id, v_entrega.unidade_destino_id, v_entrega.unidade_nome, 1,
          v_patrimonio, v_numero_serie, v_nf_id, v_seq,
          v_data_recebimento, v_recebido_por, v_entrega.secao_id
        )
        on conflict (entrega_id, unidade_seq) do update set
          item_id = excluded.item_id,
          unidade_id = excluded.unidade_id,
          unidade_nome = excluded.unidade_nome,
          quantidade = 1,
          patrimonio = excluded.patrimonio,
          numero_serie = excluded.numero_serie,
          nota_fiscal_id = excluded.nota_fiscal_id,
          recebido_em = excluded.recebido_em,
          recebido_por = excluded.recebido_por,
          secao_id = excluded.secao_id;$new_insert$;
begin
  v_funcao := to_regprocedure(
    'public._registrar_recebimento_aquisicao_lote_core(jsonb,jsonb)'
  );
  if v_funcao is null then
    raise exception 'Função central do recebimento em lote não encontrada.';
  end if;

  select pg_get_functiondef(v_funcao::oid) into v_definicao;

  if strpos(v_definicao, v_bloco_sequencia_novo) = 0 then
    if strpos(v_definicao, v_bloco_sequencia) = 0 then
      raise exception 'Trecho de sequência da função diverge do esperado.';
    end if;
    v_definicao := replace(v_definicao, v_bloco_sequencia, v_bloco_sequencia_novo);
  end if;

  if strpos(v_definicao, v_bloco_insert_novo) = 0 then
    if strpos(v_definicao, v_bloco_insert) = 0 then
      raise exception 'Trecho de gravação das unidades diverge do esperado.';
    end if;
    v_definicao := replace(v_definicao, v_bloco_insert, v_bloco_insert_novo);
  end if;

  execute v_definicao;
end;
$migration$;

comment on function public._registrar_recebimento_aquisicao_lote_core(jsonb, jsonb) is
  'Registra NF e recebimentos em lote, preenchendo as unidades físicas materializadas nas sequências do próprio lote.';

create temporary table unidades_vazias_duplicadas on commit drop as
select
  e.id as entrega_id,
  (array_agg(u.id order by u.unidade_seq) filter (
    where u.unidade_seq = 1
      and nullif(btrim(coalesce(u.patrimonio, '')), '') is null
      and nullif(btrim(coalesce(u.numero_serie, '')), '') is null
  ))[1] as unidade_vazia_id,
  (array_agg(u.id order by u.unidade_seq) filter (
    where u.unidade_seq = 2
      and (
        nullif(btrim(coalesce(u.patrimonio, '')), '') is not null
        or nullif(btrim(coalesce(u.numero_serie, '')), '') is not null
      )
  ))[1] as unidade_identificada_id
from public.itens_entregas e
join public.itens_entregas_unidades u on u.entrega_id = e.id
where e.qtde_recebida = 1
group by e.id
having count(*) = 2
   and count(*) filter (
     where u.unidade_seq = 1
       and nullif(btrim(coalesce(u.patrimonio, '')), '') is null
       and nullif(btrim(coalesce(u.numero_serie, '')), '') is null
   ) = 1
   and count(*) filter (
     where u.unidade_seq = 2
       and (
         nullif(btrim(coalesce(u.patrimonio, '')), '') is not null
         or nullif(btrim(coalesce(u.numero_serie, '')), '') is not null
       )
   ) = 1;

do $cleanup$
declare
  v_candidatos integer;
  v_count integer;
begin
  select count(*) into v_candidatos from unidades_vazias_duplicadas;
  if v_candidatos not in (0, 24) then
    raise exception 'Limpeza interrompida: esperadas 24 duplicatas ou nenhuma; encontradas %.', v_candidatos;
  end if;
  if v_candidatos = 0 then
    return;
  end if;

  select count(*) into v_count
  from public.inventario_movimentacoes m
  join public.inventario_unidades i on i.id = m.inventario_unidade_id
  join unidades_vazias_duplicadas d
    on i.origem_tipo = 'AQUISICAO'
   and i.unidade_fisica_id in (d.unidade_vazia_id, d.unidade_identificada_id);
  if v_count <> 0 then
    raise exception 'Limpeza interrompida: existem % movimentações ligadas às unidades afetadas.', v_count;
  end if;

  select count(*) into v_count
  from public.inventario_unidades i
  join unidades_vazias_duplicadas d
    on i.origem_tipo = 'AQUISICAO'
   and i.unidade_fisica_id = d.unidade_vazia_id;
  if v_count <> v_candidatos then
    raise exception 'Limpeza interrompida: esperadas % linhas vazias no inventário; encontradas %.', v_candidatos, v_count;
  end if;

  alter table public.inventario_unidades
    disable trigger trg_proteger_inventario_unidades;

  delete from public.inventario_unidades i
  using unidades_vazias_duplicadas d
  where i.origem_tipo = 'AQUISICAO'
    and i.unidade_fisica_id = d.unidade_vazia_id;
  get diagnostics v_count = row_count;
  if v_count <> v_candidatos then
    raise exception 'Limpeza interrompida: esperadas % linhas removidas do inventário; removidas %.', v_candidatos, v_count;
  end if;

  alter table public.inventario_unidades
    enable trigger trg_proteger_inventario_unidades;

  delete from public.itens_entregas_unidades u
  using unidades_vazias_duplicadas d
  where u.id = d.unidade_vazia_id;
  get diagnostics v_count = row_count;
  if v_count <> v_candidatos then
    raise exception 'Limpeza interrompida: esperadas % unidades físicas vazias removidas; removidas %.', v_candidatos, v_count;
  end if;

  update public.itens_entregas_unidades u
  set unidade_seq = 1
  from unidades_vazias_duplicadas d
  where u.id = d.unidade_identificada_id;
  get diagnostics v_count = row_count;
  if v_count <> v_candidatos then
    raise exception 'Limpeza interrompida: esperadas % unidades renumeradas; renumeradas %.', v_candidatos, v_count;
  end if;

  select count(*) into v_count
  from (
    select d.entrega_id
    from unidades_vazias_duplicadas d
    join public.itens_entregas e on e.id = d.entrega_id
    join public.itens_entregas_unidades u on u.entrega_id = e.id
    group by d.entrega_id, e.qtde_recebida
    having count(*) <> e.qtde_recebida
       or min(u.unidade_seq) <> 1
       or max(u.unidade_seq) <> e.qtde_recebida
  ) inconsistentes;
  if v_count <> 0 then
    raise exception 'Limpeza interrompida: % recebimentos permaneceram inconsistentes.', v_count;
  end if;
end;
$cleanup$;

notify pgrst, 'reload schema';

commit;
