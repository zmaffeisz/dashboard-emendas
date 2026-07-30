-- Mantém rápidas as consultas e filtros por secretaria na situação de licitação.
create index if not exists idx_itens_status_lic_secretaria_id
  on public.itens(status_lic_secretaria_id)
  where status_lic_secretaria_id is not null;
