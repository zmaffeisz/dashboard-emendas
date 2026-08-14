-- Indices de cobertura das FKs das movimentacoes do inventario.

create index if not exists idx_inventario_unidades_unidade_origem
  on public.inventario_unidades(unidade_origem_id);

create index if not exists idx_inventario_movimentacoes_unidade_origem
  on public.inventario_movimentacoes(unidade_origem_id);

create index if not exists idx_inventario_movimentacoes_unidade_destino
  on public.inventario_movimentacoes(unidade_destino_id);
