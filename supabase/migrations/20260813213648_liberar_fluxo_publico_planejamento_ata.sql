-- A aba pública de Emendas acompanha o planejamento, sem expor auditoria/observações.
grant select (
  id, processo_id, processo_item_id, emenda_id, emenda_item_id, secao_id,
  quantidade_prevista, contrato_id, ata_item_id, ata_execucao_id,
  quantidade_requisitada, status, created_at, updated_at
) on public.ata_planejamento_emendas to anon;

drop policy if exists public_emenda_flow_ata_planejamento on public.ata_planejamento_emendas;
create policy public_emenda_flow_ata_planejamento
  on public.ata_planejamento_emendas
  for select
  to anon
  using (
    status <> 'CANCELADO'
    and exists (select 1 from public.emenda_itens ei where ei.id = emenda_item_id)
  );

drop policy if exists public_emenda_planning_itens on public.itens;
create policy public_emenda_planning_itens
  on public.itens for select to anon
  using (exists (
    select 1 from public.ata_planejamento_emendas ap
     where ap.processo_item_id = itens.id and ap.status <> 'CANCELADO'
  ));

drop policy if exists public_emenda_planning_processos on public.processos;
create policy public_emenda_planning_processos
  on public.processos for select to anon
  using (exists (
    select 1 from public.ata_planejamento_emendas ap
     where ap.processo_id = processos.id and ap.status <> 'CANCELADO'
  ));

drop policy if exists public_emenda_planning_contratos on public.contratos;
create policy public_emenda_planning_contratos
  on public.contratos for select to anon
  using (exists (
    select 1 from public.ata_planejamento_emendas ap
     where ap.contrato_id = contratos.id and ap.status <> 'CANCELADO'
  ));

drop policy if exists public_emenda_planning_atas_itens on public.atas_itens;
create policy public_emenda_planning_atas_itens
  on public.atas_itens for select to anon
  using (exists (
    select 1 from public.ata_planejamento_emendas ap
     where ap.ata_item_id = atas_itens.id and ap.status <> 'CANCELADO'
  ));

drop policy if exists public_emenda_planning_secretarias on public.secretarias;
create policy public_emenda_planning_secretarias
  on public.secretarias for select to anon
  using (exists (
    select 1
      from public.itens i
      join public.ata_planejamento_emendas ap on ap.processo_item_id = i.id
     where i.status_lic_secretaria_id = secretarias.id and ap.status <> 'CANCELADO'
  ));
