create index if not exists atas_item_reajustes_secao_idx
  on public.atas_item_reajustes (secao_id);

create index if not exists atas_execucao_reajustes_secao_idx
  on public.atas_execucao_reajustes (secao_id);

create index if not exists atas_execucao_reajustes_emenda_idx
  on public.atas_execucao_reajustes (emenda_id)
  where emenda_id is not null;
