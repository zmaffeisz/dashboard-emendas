alter table public.termos_ateste
  add column if not exists cpl_contrato text,
  add column if not exists competencia text,
  add column if not exists nf_referencia text,
  add column if not exists fiscalizado_por text,
  add column if not exists gerado_em date;

create index if not exists idx_termos_ateste_contrato on public.termos_ateste(contrato_id);
create index if not exists idx_termos_ateste_competencia on public.termos_ateste(competencia);
