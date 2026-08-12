-- Indices de cobertura das chaves estrangeiras do checklist mensal de NFs.

create index if not exists idx_nf_checklist_documentos_created_by
  on public.nf_checklist_documentos(created_by)
  where created_by is not null;

create index if not exists idx_nf_checklist_marcacoes_documento
  on public.nf_checklist_marcacoes(documento_id);

create index if not exists idx_nf_checklist_marcacoes_marcado_por
  on public.nf_checklist_marcacoes(marcado_por)
  where marcado_por is not null;
