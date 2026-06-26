-- Fase 5 — AF, quantidade autorizada, data limite e controle de prazos
-- Adiciona campos da AF em itens_entregas. Não destrutivo (if not exists).

alter table public.itens_entregas
  add column if not exists qtde_autorizada numeric;

-- Observação livre da AF (campo "Observação" do formulário de emissão de AF)
alter table public.itens_entregas
  add column if not exists af_obs text;

-- Recarrega o cache de schema do PostgREST
notify pgrst, 'reload schema';
