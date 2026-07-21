-- Anexos obrigatórios de notas fiscais cadastradas no recebimento.
-- O arquivo permanece privado e só pode ser manipulado por quem tem acesso ao fluxo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notas-fiscais',
  'notas-fiscais',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leitura notas-fiscais autorizada" on storage.objects;
create policy "leitura notas-fiscais autorizada"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'notas-fiscais'
  and (
    public.can_access_tab('itens', 'view')
    or public.can_access_tab('atas', 'view')
    or public.can_access_tab('dashboard', 'view')
    or public.can_access_tab('contratos', 'view')
  )
);

drop policy if exists "upload notas-fiscais autorizado" on storage.objects;
create policy "upload notas-fiscais autorizado"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'notas-fiscais'
  and (
    public.can_access_tab('itens', 'edit')
    or public.can_access_tab('atas', 'edit')
    or public.can_access_tab('dashboard', 'edit')
  )
);

drop policy if exists "remove notas-fiscais autorizado" on storage.objects;
create policy "remove notas-fiscais autorizado"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'notas-fiscais'
  and (
    public.can_access_tab('itens', 'edit')
    or public.can_access_tab('atas', 'edit')
    or public.can_access_tab('dashboard', 'edit')
  )
);
