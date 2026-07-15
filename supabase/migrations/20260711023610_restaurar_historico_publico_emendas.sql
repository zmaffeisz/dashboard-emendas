-- Restaura o historico consolidado da Planilha de Emendas sem reabrir linhas
-- operacionais alheias a Emendas. Cada policy anonima exige um vinculo real com
-- emenda_itens, que permanece a raiz publica do painel.

create policy public_emenda_flow_itens on public.itens for select to anon using (
  emenda_item_id is not null and exists(select 1 from public.emenda_itens ei where ei.id=itens.emenda_item_id)
);

create policy public_emenda_flow_processos on public.processos for select to anon using (
  exists(select 1 from public.itens i where i.processo_id=processos.id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_contratos on public.contratos for select to anon using (
  exists(select 1 from public.itens i where i.contrato_id=contratos.id and i.emenda_item_id is not null)
  or exists(select 1 from public.atas_itens ai join public.atas_execucao ae on ae.ata_item_id=ai.id where ai.contrato_id=contratos.id and ae.emenda_item_id is not null)
);

create policy public_emenda_flow_fornecedores on public.fornecedores for select to anon using (
  exists(select 1 from public.itens i where i.fornecedor_id=fornecedores.id and i.emenda_item_id is not null)
  or exists(select 1 from public.contratos c where c.fornecedor_id=fornecedores.id)
);

create policy public_emenda_flow_entregas on public.itens_entregas for select to anon using (
  exists(select 1 from public.itens i where i.id=itens_entregas.item_id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_entregas_unidades on public.itens_entregas_unidades for select to anon using (
  exists(select 1 from public.itens i where i.id=itens_entregas_unidades.item_id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_empenho_itens on public.empenho_itens for select to anon using (
  emenda_item_id is not null
  or exists(select 1 from public.itens i where i.id=empenho_itens.item_id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_empenhos on public.empenhos for select to anon using (
  exists(select 1 from public.empenho_itens ei where ei.empenho_id=empenhos.id and ei.emenda_item_id is not null)
  or exists(select 1 from public.itens_entregas ie join public.itens i on i.id=ie.item_id where ie.empenho_id=empenhos.id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_nf_itens on public.nota_fiscal_itens for select to anon using (
  emenda_item_id is not null
  or exists(select 1 from public.itens i where i.id=nota_fiscal_itens.item_id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_notas on public.notas_fiscais for select to anon using (
  exists(select 1 from public.nota_fiscal_itens nfi where nfi.nota_fiscal_id=notas_fiscais.id and nfi.emenda_item_id is not null)
  or exists(select 1 from public.itens_entregas ie join public.itens i on i.id=ie.item_id where ie.nota_fiscal_id=notas_fiscais.id and i.emenda_item_id is not null)
  or exists(select 1 from public.itens_entregas_unidades ieu join public.itens i on i.id=ieu.item_id where ieu.nota_fiscal_id=notas_fiscais.id and i.emenda_item_id is not null)
);

create policy public_emenda_flow_atas_execucao on public.atas_execucao for select to anon using (
  emenda_item_id is not null and exists(select 1 from public.emenda_itens ei where ei.id=atas_execucao.emenda_item_id)
);

create policy public_emenda_flow_atas_itens on public.atas_itens for select to anon using (
  exists(select 1 from public.atas_execucao ae where ae.ata_item_id=atas_itens.id and ae.emenda_item_id is not null)
);

create policy public_emenda_flow_atas_unidades on public.atas_execucao_unidades for select to anon using (
  exists(select 1 from public.atas_execucao ae where ae.id=atas_execucao_unidades.exec_id and ae.emenda_item_id is not null)
);

grant select on public.processos,public.contratos,public.fornecedores,public.itens,
  public.itens_entregas,public.itens_entregas_unidades,public.empenhos,public.empenho_itens,
  public.notas_fiscais,public.nota_fiscal_itens,public.atas_itens,public.atas_execucao,
  public.atas_execucao_unidades to anon;
