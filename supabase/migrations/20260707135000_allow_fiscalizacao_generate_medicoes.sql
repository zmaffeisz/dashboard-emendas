drop policy if exists "escrita por aba contratos_medicoes" on public.contratos_medicoes;
create policy "escrita por aba contratos_medicoes"
  on public.contratos_medicoes to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );

drop policy if exists "escrita por aba contratos_medicao_itens" on public.contratos_medicao_itens;
create policy "escrita por aba contratos_medicao_itens"
  on public.contratos_medicao_itens to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );

drop policy if exists "escrita por aba contratos_medicao_glosas" on public.contratos_medicao_glosas;
create policy "escrita por aba contratos_medicao_glosas"
  on public.contratos_medicao_glosas to authenticated
  using (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  )
  with check (
    public.can_access_tab('contratos','edit')
    or public.can_access_tab('fiscalizacao','edit')
  );
