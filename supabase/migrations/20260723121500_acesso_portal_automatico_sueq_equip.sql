-- No Portal Unidades, a seção SUEQ - EQUIP é gestora por regra de negócio.
-- O papel e o escopo usados pelo dashboard principal não são alterados.
create or replace function private.portal_pode_administrar()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.secoes s on s.id = p.secao_id
    where p.id = (select auth.uid())
      and p.aprovado is true
      and (
        p.papel = 'admin'
        or p.escopo_organizacional = 'divisao'
        or upper(btrim(coalesce(s.sigla,''))) = 'SUEQ - EQUIP'
      )
  );
$$;
