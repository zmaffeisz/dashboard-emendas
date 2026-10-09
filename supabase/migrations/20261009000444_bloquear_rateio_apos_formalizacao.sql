-- Somente contratos-dag (qpvgpfwuurqcqprnpxua).
-- Depois da formalizacao/execucao, o vinculo financeiro vira historico imutavel.

begin;

create or replace function private.bloquear_rateio_apos_formalizacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.itens i
    where i.id=new.item_id
      and (
        i.contrato_id is not null
        or i.ata_item_id is not null
        or exists (
          select 1 from public.licitacao_item_ocorrencias o
          where o.item_id=i.id
        )
        or exists (
          select 1 from public.itens_entregas ie
          where ie.item_id=i.id
        )
      )
  ) then
    raise exception 'O rateio e historico e nao pode ser alterado depois da formalizacao ou do encerramento do item.'
      using errcode='55000';
  end if;
  return new;
end;
$$;

revoke all on function private.bloquear_rateio_apos_formalizacao() from public,anon,authenticated;
grant execute on function private.bloquear_rateio_apos_formalizacao() to service_role;

drop trigger if exists trg_bloquear_rateio_apos_formalizacao
  on public.licitacao_item_recursos;
create trigger trg_bloquear_rateio_apos_formalizacao
before insert or update on public.licitacao_item_recursos
for each row execute function private.bloquear_rateio_apos_formalizacao();

comment on function private.bloquear_rateio_apos_formalizacao() is
  'Impede criar, editar ou cancelar parcelas depois que a compra foi formalizada, encerrada ou entrou em entrega.';

commit;
