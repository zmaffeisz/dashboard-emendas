create index if not exists idx_contratos_medicao_itens_contrato on public.contratos_medicao_itens(contrato_id);
create index if not exists idx_contratos_medicao_glosas_contrato on public.contratos_medicao_glosas(contrato_id);

drop index if exists public.idx_termos_ateste_contrato;

drop policy if exists "escrita por aba contratos_medicoes" on public.contratos_medicoes;
create policy "inserir contratos_medicoes por aba"
  on public.contratos_medicoes for insert to authenticated
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "atualizar contratos_medicoes por aba"
  on public.contratos_medicoes for update to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "excluir contratos_medicoes por aba"
  on public.contratos_medicoes for delete to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );

drop policy if exists "escrita por aba contratos_medicao_itens" on public.contratos_medicao_itens;
create policy "inserir contratos_medicao_itens por aba"
  on public.contratos_medicao_itens for insert to authenticated
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "atualizar contratos_medicao_itens por aba"
  on public.contratos_medicao_itens for update to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "excluir contratos_medicao_itens por aba"
  on public.contratos_medicao_itens for delete to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );

drop policy if exists "escrita por aba contratos_medicao_glosas" on public.contratos_medicao_glosas;
create policy "inserir contratos_medicao_glosas por aba"
  on public.contratos_medicao_glosas for insert to authenticated
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "atualizar contratos_medicao_glosas por aba"
  on public.contratos_medicao_glosas for update to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
create policy "excluir contratos_medicao_glosas por aba"
  on public.contratos_medicao_glosas for delete to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
