alter table public.itens_entregas add column if not exists controle_obs text;
alter table public.atas_execucao add column if not exists controle_obs text;
alter table public.itens add column if not exists controle_obs text;
