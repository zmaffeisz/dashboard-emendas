-- Observações do Controle de Entregas são temporárias: desaparecem ao registrar o recebimento.
-- Cobre recebimentos feitos pela tela, em lote e por qualquer outro fluxo autorizado.

create or replace function private.limpar_controle_obs_ao_receber()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'itens_entregas'
     and new.data_recebimento is not null
     and old.data_recebimento is null then
    new.controle_obs := null;
  elsif tg_table_name = 'atas_execucao'
     and nullif(btrim(coalesce(new.dt_entrega, '')), '') is not null
     and nullif(btrim(coalesce(old.dt_entrega, '')), '') is null then
    new.controle_obs := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limpar_controle_obs_ao_receber on public.itens_entregas;
create trigger trg_limpar_controle_obs_ao_receber
before update of data_recebimento on public.itens_entregas
for each row
execute function private.limpar_controle_obs_ao_receber();

drop trigger if exists trg_limpar_controle_obs_ao_receber on public.atas_execucao;
create trigger trg_limpar_controle_obs_ao_receber
before update of dt_entrega on public.atas_execucao
for each row
execute function private.limpar_controle_obs_ao_receber();
