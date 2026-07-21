-- Observacoes de prazo, inclusive as trazidas por importacao, nao caracterizam
-- etapa operacional e nao devem impedir a exclusao de uma solicitacao pre-AF.
create or replace function private.bloquear_exclusao_execucao_ata_apos_af()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(old.af_numero), '') is not null
     or nullif(btrim(old.data_af), '') is not null
     or nullif(btrim(old.prev_entrega), '') is not null
     or nullif(btrim(old.nf), '') is not null
     or nullif(btrim(old.dt_entrega), '') is not null
     or old.data_entrega_unidade is not null
     or old.possui_patrimonio is not null
     or nullif(btrim(old.termo_arquivo), '') is not null
     or nullif(btrim(old.termo_responsavel), '') is not null
     or nullif(btrim(old.termo_cargo), '') is not null
     or nullif(btrim(old.confirmacao_obs), '') is not null
     or exists (select 1 from public.atas_execucao_unidades u where u.exec_id = old.id)
     or exists (select 1 from public.sancao_itens s where s.ref_origem = old.id::text)
  then
    raise exception using
      errcode = 'P0001',
      message = 'Exclusao bloqueada: a solicitacao ja possui AF emitida ou etapa posterior registrada.';
  end if;
  return old;
end
$$;

revoke all on function private.bloquear_exclusao_execucao_ata_apos_af() from public;
