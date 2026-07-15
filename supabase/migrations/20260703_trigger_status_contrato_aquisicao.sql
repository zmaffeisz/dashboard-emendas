-- Move para o banco (fonte única da verdade) a transição automática de status dos
-- contratos de aquisição, que antes dependia só de chamadas client-side ao final de
-- salvarAF()/salvarRecebimento(). Se qualquer chamada anterior nessas funções lançasse
-- erro, a transição nunca rodava e o contrato ficava com status desatualizado mesmo com
-- os itens já 100% recebidos.
--
-- Regras (mesmas do JS que este trigger substitui):
--   "Aguardando emissão da AF" -> VIGENTE assim que a 1ª AF é emitida (af_numero preenchido);
--   VIGENTE -> CONCLUIDO quando todos os itens de aquisição do contrato estiverem 100%
--   recebidos (soma de itens_entregas.qtde_recebida, ignorando linhas canceladas).

create or replace function public.sync_contrato_status_aquisicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrato_id integer;
  v_origem text;
  v_status text;
  v_all_received boolean;
begin
  select contrato_id, origem into v_contrato_id, v_origem
  from itens where id = coalesce(new.item_id, old.item_id);

  if v_contrato_id is null or v_origem <> 'aquisicao' then
    return coalesce(new, old);
  end if;

  select status into v_status from contratos where id = v_contrato_id;

  if v_status = 'Aguardando emissão da AF' and new.af_numero is not null then
    update contratos set status = 'VIGENTE' where id = v_contrato_id;
    v_status := 'VIGENTE';
  end if;

  if v_status = 'VIGENTE' then
    select bool_and(coalesce(e.recebido, 0) >= coalesce(it.qtde, 0) or coalesce(it.qtde, 0) <= 0)
      into v_all_received
    from itens it
    left join (
      select item_id, sum(qtde_recebida) as recebido
      from itens_entregas
      where coalesce(status, '') <> 'cancelada'
      group by item_id
    ) e on e.item_id = it.id
    where it.contrato_id = v_contrato_id and it.origem = 'aquisicao';

    if coalesce(v_all_received, false) then
      update contratos set status = 'CONCLUIDO' where id = v_contrato_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_itens_entregas_sync_contrato_status on itens_entregas;
create trigger trg_itens_entregas_sync_contrato_status
after insert or update on itens_entregas
for each row execute function public.sync_contrato_status_aquisicao();

-- É função de trigger, não deve ser chamável diretamente via RPC.
revoke execute on function public.sync_contrato_status_aquisicao() from anon, authenticated, public;
