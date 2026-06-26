-- Regressão/permissões — restringe leitura anônima do ciclo novo de itens.
-- Mantém Emendas e Chamados públicos fora do escopo.

revoke all on public.itens from anon;
revoke all on public.itens_entregas from anon;
revoke all on public.empenhos from anon;
revoke all on public.empenho_itens from anon;
revoke all on public.notas_fiscais from anon;
revoke all on public.nota_fiscal_itens from anon;
revoke all on public.atas_execucao from anon;

grant select, insert, update, delete on public.itens to authenticated;
grant select, insert, update, delete on public.itens_entregas to authenticated;
grant select, insert, update, delete on public.empenhos to authenticated;
grant select, insert, update, delete on public.empenho_itens to authenticated;
grant select, insert, update, delete on public.notas_fiscais to authenticated;
grant select, insert, update, delete on public.nota_fiscal_itens to authenticated;
grant select, insert, update, delete on public.atas_execucao to authenticated;

drop policy if exists "leitura autenticada itens" on public.itens;
create policy "leitura autenticada itens" on public.itens
  for select
  to authenticated
  using (true);

drop policy if exists "leitura autenticada itens_entregas" on public.itens_entregas;
create policy "leitura autenticada itens_entregas" on public.itens_entregas
  for select
  to authenticated
  using (true);

drop policy if exists "leitura autenticada empenhos" on public.empenhos;
create policy "leitura autenticada empenhos" on public.empenhos
  for select
  to authenticated
  using (true);

drop policy if exists "leitura autenticada empenho_itens" on public.empenho_itens;
create policy "leitura autenticada empenho_itens" on public.empenho_itens
  for select
  to authenticated
  using (true);

drop policy if exists "leitura autenticada notas_fiscais" on public.notas_fiscais;
create policy "leitura autenticada notas_fiscais" on public.notas_fiscais
  for select
  to authenticated
  using (true);

drop policy if exists "leitura autenticada nota_fiscal_itens" on public.nota_fiscal_itens;
create policy "leitura autenticada nota_fiscal_itens" on public.nota_fiscal_itens
  for select
  to authenticated
  using (true);

notify pgrst, 'reload schema';
