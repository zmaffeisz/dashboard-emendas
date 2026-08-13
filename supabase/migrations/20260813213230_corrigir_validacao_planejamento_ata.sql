-- Corrige a validação para o schema real de itens, que não possui item_origem_id.
create or replace function private.validar_planejamento_emenda_ata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.processo_id,new.processo_item_id,new.emenda_id,new.emenda_item_id)
       is distinct from (old.processo_id,old.processo_item_id,old.emenda_id,old.emenda_item_id) then
      raise exception 'Os vínculos de origem do planejamento não podem ser alterados.';
    end if;
    if old.status = 'CANCELADO' then
      raise exception 'Um planejamento cancelado não pode ser reativado.';
    end if;
    if new.status = 'CANCELADO' and old.status <> 'PLANEJAMENTO' then
      raise exception 'Somente um planejamento ainda não formalizado pode ser cancelado.';
    end if;
  end if;

  if not exists (
    select 1 from public.emenda_itens ei
     where ei.id = new.emenda_item_id and ei.emenda_id = new.emenda_id
  ) then raise exception 'O item informado não pertence à Emenda.'; end if;

  if not exists (
    select 1 from public.itens i
     where i.id = new.processo_item_id and i.processo_id = new.processo_id and i.origem = 'ata'
  ) then raise exception 'O item informado não pertence ao processo de Ata.'; end if;

  if new.status in ('ATA_VIGENTE_AGUARDANDO_REQUISICAO','REQUISITADO') and not exists (
    select 1
      from public.atas_itens ai
      join public.itens i on i.ata_item_id = ai.id
     where ai.id = new.ata_item_id
       and ai.contrato_id = new.contrato_id
       and i.processo_id = new.processo_id
       and i.contrato_id = new.contrato_id
       and (i.id = new.processo_item_id or i.descricao = (
         select origem.descricao from public.itens origem where origem.id = new.processo_item_id
       ))
  ) then raise exception 'O item da Ata não corresponde ao item planejado da licitação.'; end if;

  if new.status = 'ATA_VIGENTE_AGUARDANDO_REQUISICAO'
     and not (tg_op = 'UPDATE' and old.status = 'REQUISITADO' and pg_trigger_depth() > 1)
     and exists (
    select 1 from public.atas_execucao ae
     where ae.ata_item_id = new.ata_item_id and ae.emenda_item_id = new.emenda_item_id
  ) then raise exception 'Já existe uma requisição para este planejamento.'; end if;

  if new.status = 'REQUISITADO' and not exists (
    select 1 from public.atas_execucao ae
     where ae.id = new.ata_execucao_id
       and ae.ata_item_id = new.ata_item_id
       and ae.emenda_item_id = new.emenda_item_id
       and ae.emenda_id = new.emenda_id
       and ae.qtde = new.quantidade_requisitada
  ) then raise exception 'A requisição não corresponde ao planejamento.'; end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.validar_planejamento_emenda_ata() from public, anon, authenticated;
