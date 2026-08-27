-- Vincula o caminho de um arquivo ja enviado a uma nota fiscal por RPC.
-- O cliente chama esta funcao por POST, evitando depender de PATCH para a etapa
-- final do upload. SECURITY INVOKER preserva integralmente a RLS da tabela.
create or replace function public.anexar_arquivo_nota_fiscal(
  p_nota_fiscal_id uuid,
  p_arquivo_url text
)
returns public.notas_fiscais
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nota public.notas_fiscais;
  v_arquivo_url text := btrim(coalesce(p_arquivo_url, ''));
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  if p_nota_fiscal_id is null then
    raise exception 'Nota fiscal obrigatoria.' using errcode = '22023';
  end if;

  if v_arquivo_url = ''
     or v_arquivo_url not like p_nota_fiscal_id::text || '/%' then
    raise exception 'Caminho de arquivo invalido para a nota fiscal.' using errcode = '22023';
  end if;

  update public.notas_fiscais
     set arquivo_url = v_arquivo_url,
         updated_at = now()
   where id = p_nota_fiscal_id
   returning * into v_nota;

  if not found then
    raise exception 'Nota fiscal nao encontrada ou sem permissao de edicao.' using errcode = 'P0002';
  end if;

  return v_nota;
end;
$$;

revoke all on function public.anexar_arquivo_nota_fiscal(uuid, text) from public;
revoke all on function public.anexar_arquivo_nota_fiscal(uuid, text) from anon;
grant execute on function public.anexar_arquivo_nota_fiscal(uuid, text) to authenticated;
