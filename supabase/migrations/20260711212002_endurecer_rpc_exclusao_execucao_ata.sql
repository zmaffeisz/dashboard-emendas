create or replace function private.limpar_vinculos_execucao_ata_excluida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empenho_ids uuid[];
  v_vinculo_ids uuid[];
begin
  select array_agg(distinct ei.empenho_id), array_agg(ei.id)
    into v_empenho_ids, v_vinculo_ids
    from public.empenho_itens ei
   where ei.exec_id = old.id
      or (old.emenda_item_id is not null and ei.emenda_item_id = old.emenda_item_id);

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

  return old;
end
$$;

revoke all on function private.limpar_vinculos_execucao_ata_excluida() from public;

drop trigger if exists limpar_vinculos_execucao_ata_excluida on public.atas_execucao;
create trigger limpar_vinculos_execucao_ata_excluida
after delete on public.atas_execucao
for each row execute function private.limpar_vinculos_execucao_ata_excluida();

create or replace function public.excluir_execucao_ata_pre_af(p_exec_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_access_tab('atas', 'edit') then
    raise exception using errcode = '42501', message = 'Sem permissao para excluir solicitacoes de ATA.';
  end if;

  delete from public.atas_execucao
   where id = p_exec_id
   returning id into v_id;

  if v_id is null then
    raise exception using errcode = 'P0002', message = 'Solicitacao de ATA nao encontrada ou sem permissao para exclusao.';
  end if;

  return v_id;
end
$$;

revoke all on function public.excluir_execucao_ata_pre_af(uuid) from public, anon;
grant execute on function public.excluir_execucao_ata_pre_af(uuid) to authenticated;
