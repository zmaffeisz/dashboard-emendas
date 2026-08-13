-- Índices das FKs que não são cobertas pelos índices de consulta/uniqueness da tabela.
create index if not exists ata_planejamento_emendas_processo_item_fk_idx
  on public.ata_planejamento_emendas (processo_item_id);

create index if not exists ata_planejamento_emendas_emenda_fk_idx
  on public.ata_planejamento_emendas (emenda_id);

create index if not exists ata_planejamento_emendas_secao_fk_idx
  on public.ata_planejamento_emendas (secao_id);

create index if not exists ata_planejamento_emendas_contrato_fk_idx
  on public.ata_planejamento_emendas (contrato_id)
  where contrato_id is not null;

create index if not exists ata_planejamento_emendas_execucao_fk_idx
  on public.ata_planejamento_emendas (ata_execucao_id)
  where ata_execucao_id is not null;
