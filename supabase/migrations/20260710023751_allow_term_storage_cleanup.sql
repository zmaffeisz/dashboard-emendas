-- O frontend precisa excluir termos substituídos, uploads revertidos e arquivos de
-- execuções removidas. Restringe a operação às mesmas áreas que administram os registros.

drop policy if exists dashboard_termos_delete on storage.objects;

create policy dashboard_termos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'termos-entrega'
  and (
    private.is_admin_approved()
    or public.can_access_tab('atas','edit')
    or public.can_access_tab('itens','edit')
  )
);
