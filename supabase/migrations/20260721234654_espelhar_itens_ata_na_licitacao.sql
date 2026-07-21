-- Mantém a linha da licitação sincronizada com cada item cadastrado em uma
-- ATA de Registro de Preços. A linha em `itens` é o espelho de navegação e
-- vínculo; o saldo e as execuções continuam sendo controlados em `atas_itens`
-- e `atas_execucao`.
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
    processo_id, origem, fonte_tipo, descricao, qtde,
    valor_estimado, prazo_entrega_dias, contrato_id, fornecedor_id,
    valor_contratado, ata_item_id, status, secao_id, observacoes
  )
  select
    v_processo_id, 'ata', 'sem_emenda', new.item, new.qtde_contratada,
    new.valor_unit, new.prazo_entrega, new.contrato_id, v_fornecedor_id,
    new.valor_unit, new.id, 'contratado', coalesce(new.secao_id, v_secao_id),
    'Item espelhado automaticamente da ATA para controle da licitação.'
  where not exists (
    select 1 from public.itens i where i.ata_item_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_espelhar_item_ata_na_licitacao on public.atas_itens;
create trigger trg_espelhar_item_ata_na_licitacao
after insert on public.atas_itens
for each row
execute function public.espelhar_item_ata_na_licitacao();
