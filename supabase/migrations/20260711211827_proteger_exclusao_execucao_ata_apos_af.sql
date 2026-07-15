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
     or nullif(btrim(old.obs_prazo), '') is not null
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

drop trigger if exists bloquear_exclusao_execucao_ata_apos_af on public.atas_execucao;
create trigger bloquear_exclusao_execucao_ata_apos_af
before delete on public.atas_execucao
for each row execute function private.bloquear_exclusao_execucao_ata_apos_af();

create or replace function public.excluir_execucao_ata_pre_af(p_exec_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exec public.atas_execucao%rowtype;
  v_empenho_ids uuid[];
  v_vinculo_ids uuid[];
begin
  if auth.uid() is null or not public.can_access_tab('atas', 'edit') then
    raise exception using errcode = '42501', message = 'Sem permissao para excluir solicitacoes de ATA.';
  end if;

  select * into v_exec
    from public.atas_execucao
   where id = p_exec_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solicitacao de ATA nao encontrada.';
  end if;

  select array_agg(distinct ei.empenho_id), array_agg(ei.id)
    into v_empenho_ids, v_vinculo_ids
    from public.empenho_itens ei
   where ei.exec_id = v_exec.id
      or (v_exec.emenda_item_id is not null and ei.emenda_item_id = v_exec.emenda_item_id);

  -- O trigger acima valida novamente o estado dentro desta mesma transacao.
  delete from public.atas_execucao where id = v_exec.id;

  if coalesce(array_length(v_vinculo_ids, 1), 0) > 0 then
    delete from public.empenho_itens where id = any(v_vinculo_ids);
  end if;

  if coalesce(array_length(v_empenho_ids, 1), 0) > 0 then
    update public.empenhos e
       set saldo_empenho = coalesce(e.valor_empenhado, 0)
                         - coalesce(e.valor_anulado, 0)
                         - coalesce((select sum(ei.valor_vinculado) from public.empenho_itens ei where ei.empenho_id = e.id), 0),
           updated_at = now()
     where e.id = any(v_empenho_ids);
  end if;

  return v_exec.id;
end
$$;

revoke all on function public.excluir_execucao_ata_pre_af(uuid) from public, anon;
grant execute on function public.excluir_execucao_ata_pre_af(uuid) to authenticated;
