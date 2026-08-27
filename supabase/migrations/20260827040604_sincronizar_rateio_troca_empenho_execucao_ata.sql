-- Se o empenho de uma execucao ja recebida for trocado, o rateio da NF deve
-- acompanhar a mesma execucao para a ficha nao se dividir entre dois empenhos.
create or replace function private.sincronizar_rateio_empenho_execucao_ata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.exec_id is not null and old.empenho_id is distinct from new.empenho_id then
    update public.nota_fiscal_itens
    set empenho_id = new.empenho_id
    where exec_id = new.exec_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_rateio_empenho_execucao_ata
  on public.empenho_itens;
create trigger trg_sincronizar_rateio_empenho_execucao_ata
after update of empenho_id on public.empenho_itens
for each row
execute function private.sincronizar_rateio_empenho_execucao_ata();
