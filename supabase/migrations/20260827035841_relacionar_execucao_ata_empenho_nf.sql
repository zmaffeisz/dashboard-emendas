-- Execucoes de ATA precisam de uma chave relacional para empenho e NF mesmo
-- quando nao vieram de Emenda e quando materiais de consumo nao geram unidades.

alter table public.nota_fiscal_itens
  add column if not exists exec_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.empenho_itens'::regclass
      and conname = 'empenho_itens_exec_id_fkey'
  ) then
    alter table public.empenho_itens
      add constraint empenho_itens_exec_id_fkey
      foreign key (exec_id) references public.atas_execucao(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nota_fiscal_itens'::regclass
      and conname = 'nota_fiscal_itens_exec_id_fkey'
  ) then
    alter table public.nota_fiscal_itens
      add constraint nota_fiscal_itens_exec_id_fkey
      foreign key (exec_id) references public.atas_execucao(id) on delete cascade;
  end if;
end
$$;

create unique index if not exists empenho_itens_exec_id_uq
  on public.empenho_itens(exec_id)
  where exec_id is not null;

create index if not exists nota_fiscal_itens_exec_id_idx
  on public.nota_fiscal_itens(exec_id)
  where exec_id is not null;

create unique index if not exists nota_fiscal_itens_nf_exec_emp_uq
  on public.nota_fiscal_itens(nota_fiscal_id, exec_id, empenho_id)
  where exec_id is not null and empenho_id is not null;

-- Recupera vinculos de empenho que ficaram apenas no texto da execucao.
with candidatos as (
  select
    ae.id as exec_id,
    ae.emenda_id,
    ae.emenda_item_id,
    ae.qtde,
    ae.valor,
    ae.secao_id,
    e.id as empenho_id,
    count(*) over (partition by ae.id) as quantidade_candidatos
  from public.atas_execucao ae
  join public.atas_itens ai on ai.id = ae.ata_item_id
  join public.empenhos e
    on e.secao_id = ae.secao_id
   and (e.contrato_id is null or e.contrato_id = ai.contrato_id)
   and coalesce(nullif(ltrim(regexp_replace(coalesce(e.numero, ''), '[^0-9]', '', 'g'), '0'), ''), '0')
       = coalesce(nullif(ltrim(regexp_replace(split_part(coalesce(ae.empenho, ''), '/', 1), '[^0-9]', '', 'g'), '0'), ''), '0')
   and (
     nullif(regexp_replace(split_part(coalesce(ae.empenho, ''), '/', 2), '[^0-9]', '', 'g'), '') is null
     or e.ano = regexp_replace(split_part(ae.empenho, '/', 2), '[^0-9]', '', 'g')::integer
   )
  where nullif(btrim(ae.empenho), '') is not null
    and not exists (
      select 1 from public.empenho_itens ei where ei.exec_id = ae.id
    )
)
insert into public.empenho_itens (
  empenho_id, item_id, emenda_id, emenda_item_id, exec_id,
  quantidade_vinculada, valor_vinculado, observacoes, secao_id
)
select
  empenho_id, null, emenda_id, emenda_item_id, exec_id,
  qtde, valor, 'Vinculo recuperado do numero registrado na execucao da ATA.', secao_id
from candidatos
where quantidade_candidatos = 1
on conflict do nothing;

-- Localiza a NF pelo numero normalizado, contrato e secao. Casos ambiguos sao
-- deliberadamente ignorados para nunca associar uma nota errada.
with correspondencias as (
  select
    ae.id as exec_id,
    ei.empenho_id,
    nf.id as nota_fiscal_id,
    count(*) over (partition by ae.id) as quantidade_candidatos
  from public.atas_execucao ae
  join public.atas_itens ai on ai.id = ae.ata_item_id
  join public.empenho_itens ei on ei.exec_id = ae.id
  join public.notas_fiscais nf
    on nf.secao_id = ae.secao_id
   and nf.contrato_id = ai.contrato_id
   and regexp_replace(coalesce(nf.numero_normalizado, ''), '[^0-9]', '', 'g')
       = regexp_replace(coalesce(ae.nf, ''), '[^0-9]', '', 'g')
  where nullif(btrim(ae.nf), '') is not null
), unicas as (
  select exec_id, empenho_id, nota_fiscal_id
  from correspondencias
  where quantidade_candidatos = 1
), pares_unicos as (
  select nota_fiscal_id, empenho_id, min(exec_id::text)::uuid as exec_id
  from unicas
  group by nota_fiscal_id, empenho_id
  having count(distinct exec_id) = 1
)
update public.nota_fiscal_itens nfi
set exec_id = p.exec_id
from pares_unicos p
where nfi.exec_id is null
  and nfi.nota_fiscal_id = p.nota_fiscal_id
  and nfi.empenho_id = p.empenho_id;

with correspondencias as (
  select
    ae.id as exec_id,
    ae.emenda_id,
    ae.emenda_item_id,
    ae.qtde,
    ae.valor,
    ae.secao_id,
    ei.empenho_id,
    nf.id as nota_fiscal_id,
    count(*) over (partition by ae.id) as quantidade_candidatos
  from public.atas_execucao ae
  join public.atas_itens ai on ai.id = ae.ata_item_id
  join public.empenho_itens ei on ei.exec_id = ae.id
  join public.notas_fiscais nf
    on nf.secao_id = ae.secao_id
   and nf.contrato_id = ai.contrato_id
   and regexp_replace(coalesce(nf.numero_normalizado, ''), '[^0-9]', '', 'g')
       = regexp_replace(coalesce(ae.nf, ''), '[^0-9]', '', 'g')
  where nullif(btrim(ae.nf), '') is not null
)
insert into public.nota_fiscal_itens (
  nota_fiscal_id, item_id, emenda_id, emenda_item_id, empenho_id, exec_id,
  quantidade, valor_unitario, valor_total, observacoes, secao_id
)
select
  c.nota_fiscal_id, null, c.emenda_id, c.emenda_item_id, c.empenho_id, c.exec_id,
  c.qtde, c.valor / nullif(c.qtde, 0), c.valor,
  'Rateio recuperado da execucao da ATA.', c.secao_id
from correspondencias c
where c.quantidade_candidatos = 1
  and not exists (
    select 1
    from public.nota_fiscal_itens nfi
    where nfi.nota_fiscal_id = c.nota_fiscal_id
      and nfi.empenho_id = c.empenho_id
  )
on conflict do nothing;

-- Mantem saldo derivado coerente depois da recuperacao.
update public.empenhos e
set saldo_empenho = (coalesce(e.valor_empenhado, 0) - coalesce(e.valor_anulado, 0))
  - coalesce((
      select sum(coalesce(ei.valor_vinculado, 0))
      from public.empenho_itens ei
      where ei.empenho_id = e.id
    ), 0),
    updated_at = now()
where exists (
  select 1 from public.empenho_itens ei where ei.empenho_id = e.id
);

create or replace function public.vincular_documentos_execucao_ata(
  p_exec_id uuid,
  p_empenho_id uuid,
  p_nota_fiscal_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exec public.atas_execucao;
  v_empenho public.empenhos;
  v_nota public.notas_fiscais;
  v_contrato_id integer;
  v_vinculo_id uuid;
  v_rateio_id uuid;
  v_empenho_anterior uuid;
  v_empenho_texto text;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  select * into v_exec
  from public.atas_execucao
  where id = p_exec_id;
  if not found then
    raise exception 'Execucao de ATA nao encontrada ou sem permissao.' using errcode = 'P0002';
  end if;

  select * into v_empenho
  from public.empenhos
  where id = p_empenho_id;
  if not found then
    raise exception 'Empenho nao encontrado ou sem permissao.' using errcode = 'P0002';
  end if;

  select contrato_id into v_contrato_id
  from public.atas_itens
  where id = v_exec.ata_item_id;

  if v_exec.secao_id is distinct from v_empenho.secao_id
     or (v_empenho.contrato_id is not null and v_empenho.contrato_id is distinct from v_contrato_id) then
    raise exception 'O empenho nao pertence ao contrato e a secao desta execucao.' using errcode = '22023';
  end if;

  select empenho_id into v_empenho_anterior
  from public.empenho_itens
  where exec_id = p_exec_id;

  update public.empenho_itens
  set empenho_id = p_empenho_id,
      item_id = null,
      emenda_id = v_exec.emenda_id,
      emenda_item_id = v_exec.emenda_item_id,
      quantidade_vinculada = v_exec.qtde,
      valor_vinculado = v_exec.valor,
      secao_id = v_exec.secao_id
  where exec_id = p_exec_id
  returning id into v_vinculo_id;

  if v_vinculo_id is null then
    insert into public.empenho_itens (
      empenho_id, item_id, emenda_id, emenda_item_id, exec_id,
      quantidade_vinculada, valor_vinculado, observacoes, secao_id
    ) values (
      p_empenho_id, null, v_exec.emenda_id, v_exec.emenda_item_id, p_exec_id,
      v_exec.qtde, v_exec.valor, 'Vinculo da execucao da ATA.', v_exec.secao_id
    ) returning id into v_vinculo_id;
  end if;

  v_empenho_texto := v_empenho.numero || case when v_empenho.ano is not null then '/' || v_empenho.ano else '' end;
  update public.atas_execucao
  set empenho = v_empenho_texto
  where id = p_exec_id;

  if p_nota_fiscal_id is not null then
    select * into v_nota
    from public.notas_fiscais
    where id = p_nota_fiscal_id;
    if not found then
      raise exception 'Nota fiscal nao encontrada ou sem permissao.' using errcode = 'P0002';
    end if;
    if v_nota.secao_id is distinct from v_exec.secao_id
       or (v_nota.contrato_id is not null and v_nota.contrato_id is distinct from v_contrato_id) then
      raise exception 'A nota fiscal nao pertence ao contrato e a secao desta execucao.' using errcode = '22023';
    end if;

    update public.nota_fiscal_itens
    set item_id = null,
        emenda_id = v_exec.emenda_id,
        emenda_item_id = v_exec.emenda_item_id,
        quantidade = v_exec.qtde,
        valor_unitario = v_exec.valor / nullif(v_exec.qtde, 0),
        valor_total = v_exec.valor,
        secao_id = v_exec.secao_id
    where nota_fiscal_id = p_nota_fiscal_id
      and empenho_id = p_empenho_id
      and exec_id = p_exec_id
    returning id into v_rateio_id;

    if v_rateio_id is null then
      insert into public.nota_fiscal_itens (
        nota_fiscal_id, item_id, emenda_id, emenda_item_id, empenho_id, exec_id,
        quantidade, valor_unitario, valor_total, observacoes, secao_id
      ) values (
        p_nota_fiscal_id, null, v_exec.emenda_id, v_exec.emenda_item_id, p_empenho_id, p_exec_id,
        v_exec.qtde, v_exec.valor / nullif(v_exec.qtde, 0), v_exec.valor,
        'Rateio da execucao da ATA.', v_exec.secao_id
      ) returning id into v_rateio_id;
    end if;

    update public.atas_execucao
    set nf = v_nota.numero
    where id = p_exec_id;
  end if;

  update public.empenhos e
  set saldo_empenho = (coalesce(e.valor_empenhado, 0) - coalesce(e.valor_anulado, 0))
    - coalesce((
        select sum(coalesce(ei.valor_vinculado, 0))
        from public.empenho_itens ei
        where ei.empenho_id = e.id
      ), 0),
      updated_at = now()
  where e.id = p_empenho_id
     or e.id = v_empenho_anterior;

  return jsonb_build_object(
    'empenho_item_id', v_vinculo_id,
    'nota_fiscal_item_id', v_rateio_id
  );
end;
$$;

revoke all on function public.vincular_documentos_execucao_ata(uuid, uuid, uuid) from public;
revoke all on function public.vincular_documentos_execucao_ata(uuid, uuid, uuid) from anon;
grant execute on function public.vincular_documentos_execucao_ata(uuid, uuid, uuid) to authenticated;
