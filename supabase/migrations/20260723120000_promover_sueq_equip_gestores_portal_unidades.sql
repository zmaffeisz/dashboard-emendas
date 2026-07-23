-- Usuários vinculados à SUEQ - EQUIP administram o Portal Unidades.
-- Isso não altera o papel global do dashboard: só define a abrangência
-- organizacional que a função private.portal_pode_administrar já reconhece.
do $$
begin
  alter table public.profiles disable trigger guard_profile_organizacional;

  update public.profiles p
  set aprovado = true,
      escopo_organizacional = 'divisao',
      contexto_modo = 'divisao',
      contexto_secao_id = null
  from public.secoes s
  where s.id = p.secao_id
    and upper(btrim(s.sigla)) = 'SUEQ - EQUIP'
    and (
      p.aprovado is distinct from true
      or p.escopo_organizacional is distinct from 'divisao'
      or p.contexto_modo is distinct from 'divisao'
      or p.contexto_secao_id is not null
    );

  alter table public.profiles enable trigger guard_profile_organizacional;
end
$$;
