-- Impede que cliques duplos, duas abas ou requisicoes concorrentes criem
-- autorizacoes duplicadas ou acima da quantidade contratada do item.

create or replace function public.validar_saldo_item_entrega()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_qtde_item numeric;
  v_qtde_ja_autorizada numeric;
begin
  if new.item_id is null then
    raise exception using
      errcode = '23502',
      message = 'Item da entrega nao informado.';
  end if;

  if coalesce(new.status, '') = 'cancelada' then
    return new;
  end if;

  if new.qtde_autorizada is null or new.qtde_autorizada <= 0 then
    raise exception using
      errcode = '23514',
      message = 'A quantidade autorizada deve ser maior que zero.';
  end if;

  -- O bloqueio da linha do item serializa emissoes concorrentes para o mesmo item.
  select i.qtde
    into v_qtde_item
    from public.itens i
   where i.id = new.item_id
   for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Item da entrega nao encontrado.';
  end if;

  select coalesce(sum(ie.qtde_autorizada), 0)
    into v_qtde_ja_autorizada
    from public.itens_entregas ie
   where ie.item_id = new.item_id
     and coalesce(ie.status, '') <> 'cancelada'
     and ie.id is distinct from new.id;

  if v_qtde_ja_autorizada + new.qtde_autorizada > coalesce(v_qtde_item, 0) then
    raise exception using
      errcode = '23514',
      message = format(
        'Quantidade autorizada excede o saldo do item. Contratada: %s; ja autorizada: %s; solicitada: %s.',
        coalesce(v_qtde_item, 0),
        v_qtde_ja_autorizada,
        new.qtde_autorizada
      );
  end if;

  return new;
end;
$function$;

revoke all on function public.validar_saldo_item_entrega() from public;
revoke all on function public.validar_saldo_item_entrega() from anon;
revoke all on function public.validar_saldo_item_entrega() from authenticated;

drop trigger if exists trg_itens_entregas_validar_saldo on public.itens_entregas;
create trigger trg_itens_entregas_validar_saldo
before insert or update of item_id, qtde_autorizada, status
on public.itens_entregas
for each row
execute function public.validar_saldo_item_entrega();

create unique index if not exists uq_itens_entregas_item_af_ativa
  on public.itens_entregas (item_id, lower(btrim(af_numero)))
  where nullif(btrim(af_numero), '') is not null
    and coalesce(status, '') <> 'cancelada';

comment on function public.validar_saldo_item_entrega() is
  'Serializa emissoes de AF por item e impede autorizacao acima da quantidade contratada.';

comment on index public.uq_itens_entregas_item_af_ativa is
  'Impede AF ativa duplicada para o mesmo item; AF cancelada pode ser reemitida.';
