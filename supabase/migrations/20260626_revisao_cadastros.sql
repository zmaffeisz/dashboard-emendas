-- Revisão de cadastros — fila de moderação de dados-mestre criados inline.
-- Adiciona "revisado" às 5 tabelas de cadastro e marca os registros existentes
-- como já validados (grandfather). Idempotente: o backfill só roda quando a
-- coluna é criada pela primeira vez, para não re-validar pendências reais.

do $$
declare t text;
begin
  foreach t in array array['parlamentares','pessoas','fornecedores','secoes','unidades'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='revisado'
    ) then
      execute format('alter table public.%I add column revisado boolean not null default false', t);
      execute format('update public.%I set revisado = true', t);  -- grandfather: existentes = já validados
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
