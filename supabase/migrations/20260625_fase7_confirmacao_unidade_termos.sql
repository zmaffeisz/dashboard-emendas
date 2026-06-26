-- Fase 7 — confirmação de entrega na unidade e termos anexados
-- Idempotente e não destrutivo. Aplicar apenas no banco local antes de publicar.

alter table public.atas_execucao
  add column if not exists data_entrega_unidade date,
  add column if not exists termo_arquivo text,
  add column if not exists termo_responsavel text,
  add column if not exists termo_cargo text,
  add column if not exists confirmacao_obs text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'termos-entrega',
  'termos-entrega',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leitura termos-entrega autenticada" on storage.objects;
create policy "leitura termos-entrega autenticada" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'termos-entrega'
    and (
      can_access_tab('itens','view')
      or can_access_tab('atas','view')
      or can_access_tab('dashboard','view')
      or can_access_tab('itens','edit')
      or can_access_tab('atas','edit')
      or can_access_tab('dashboard','edit')
    )
  );

drop policy if exists "upload termos-entrega autorizado" on storage.objects;
create policy "upload termos-entrega autorizado" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'termos-entrega'
    and (
      can_access_tab('itens','edit')
      or can_access_tab('atas','edit')
      or can_access_tab('dashboard','edit')
    )
  );

drop policy if exists "atualiza termos-entrega autorizado" on storage.objects;
create policy "atualiza termos-entrega autorizado" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'termos-entrega'
    and (
      can_access_tab('itens','edit')
      or can_access_tab('atas','edit')
      or can_access_tab('dashboard','edit')
    )
  )
  with check (
    bucket_id = 'termos-entrega'
    and (
      can_access_tab('itens','edit')
      or can_access_tab('atas','edit')
      or can_access_tab('dashboard','edit')
    )
  );

drop policy if exists "remove termos-entrega autorizado" on storage.objects;
create policy "remove termos-entrega autorizado" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'termos-entrega'
    and (
      can_access_tab('itens','edit')
      or can_access_tab('atas','edit')
      or can_access_tab('dashboard','edit')
    )
  );

notify pgrst, 'reload schema';
