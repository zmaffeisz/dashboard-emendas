-- Indexa a FK de autoria adicionada no fluxo de ocorrencias da licitacao.
create index if not exists idx_licitacao_item_ocorrencias_criado_por
  on public.licitacao_item_ocorrencias(criado_por);
