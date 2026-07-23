-- Correção: a mesma função atende duas tabelas com colunas de recebimento diferentes.
-- to_jsonb evita que o PostgreSQL valide uma coluna que não existe na outra tabela.

create or replace function private.limpar_controle_obs_ao_receber()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'itens_entregas'
     and nullif(to_jsonb(new)->>'data_recebimento', '') is not null
     and nullif(to_jsonb(old)->>'data_recebimento', '') is null then
    new.controle_obs := null;
  elsif tg_table_name = 'atas_execucao'
     and nullif(btrim(coalesce(to_jsonb(new)->>'dt_entrega', '')), '') is not null
     and nullif(btrim(coalesce(to_jsonb(old)->>'dt_entrega', '')), '') is null then
    new.controle_obs := null;
  end if;

  return new;
end;
$$;
