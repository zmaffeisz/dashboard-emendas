begin;

alter table public.atas_itens
  add column if not exists unidade_medida text;

alter table public.atas_itens
  drop constraint if exists atas_itens_unidade_medida_formato_check;
alter table public.atas_itens
  add constraint atas_itens_unidade_medida_formato_check
  check (
    unidade_medida is null
    or (
      unidade_medida = btrim(unidade_medida)
      and char_length(unidade_medida) between 1 and 80
    )
  );

-- Recupera a unidade dos itens de licitação já espelhados para as Atas.
update public.atas_itens ai
set unidade_medida = i.unidade_medida
from public.itens i
where i.ata_item_id = ai.id
  and ai.unidade_medida is null
  and i.unidade_medida is not null;

comment on column public.atas_itens.unidade_medida is
  'Unidade de medida do item da Ata de Registro de Preços.';

-- Mantém a unidade ao criar o espelho navegável do item da Ata na licitação.
create or replace function public.espelhar_item_ata_na_licitacao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_processo_id bigint;
  v_fornecedor_id bigint;
  v_secao_id bigint;
  v_natureza text;
begin
  select c.processo_id, c.fornecedor_id, c.secao_id, p.natureza
    into v_processo_id, v_fornecedor_id, v_secao_id, v_natureza
  from public.contratos c
  join public.processos p on p.id = c.processo_id
  where c.id = new.contrato_id;

  if v_natureza is distinct from 'ATA DE RP' then
    return new;
  end if;

  insert into public.itens (
    processo_id, origem, fonte_tipo, descricao, unidade_medida, qtde,
    valor_estimado, prazo_entrega_dias, contrato_id, fornecedor_id,
    valor_contratado, ata_item_id, status, secao_id, observacoes
  )
  select
    v_processo_id, 'ata', 'sem_emenda', new.item, new.unidade_medida,
    new.qtde_contratada, new.valor_unit, new.prazo_entrega, new.contrato_id,
    v_fornecedor_id, new.valor_unit, new.id, 'contratado',
    coalesce(new.secao_id, v_secao_id),
    'Item espelhado automaticamente da ATA para controle da licitação.'
  where not exists (
    select 1 from public.itens i where i.ata_item_id = new.id
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
