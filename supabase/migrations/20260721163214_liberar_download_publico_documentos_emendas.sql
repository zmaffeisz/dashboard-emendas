-- Permite que visitantes anônimos baixem somente documentos efetivamente vinculados
-- ao fluxo público de Emendas. Os buckets continuam privados e os arquivos são servidos
-- por URLs assinadas de curta duração.

drop policy if exists "public_emenda_nf_attachments_select" on storage.objects;
create policy "public_emenda_nf_attachments_select"
on storage.objects
for select
to anon
using (
  bucket_id = 'notas-fiscais'
  and exists (
    select 1
    from public.notas_fiscais nf
    where nf.arquivo_url = storage.objects.name
  )
);

drop policy if exists "public_emenda_termos_attachments_select" on storage.objects;
create policy "public_emenda_termos_attachments_select"
on storage.objects
for select
to anon
using (
  bucket_id = 'termos-entrega'
  and (
    exists (
      select 1
      from public.itens_entregas ie
      join public.itens i on i.id = ie.item_id
      where ie.termo_arquivo = storage.objects.name
        and i.emenda_item_id is not null
    )
    or exists (
      select 1
      from public.atas_execucao ae
      where ae.termo_arquivo = storage.objects.name
        and ae.emenda_item_id is not null
    )
  )
);
