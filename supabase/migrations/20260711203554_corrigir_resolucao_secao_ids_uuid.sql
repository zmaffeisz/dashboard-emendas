create or replace function private.set_record_secao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v bigint;
  k text;
  parent text;
begin
  v := nullif(j->>'secao_id', '')::bigint;

  if tg_table_name in ('chamados','chamados_controle','chamados_anexos','fiscalizacao_historico','termos_ateste','termo_chamados') then
    select id into v from public.secoes where sigla = 'SUEQ - EQUIP';
  end if;

  if v is null and tg_table_name in ('processos','contratos') and nullif(j->>'secao', '') is not null then
    select id into v
      from public.secoes
     where upper(btrim(sigla)) = upper(btrim(j->>'secao'))
     limit 1;
  end if;

  if v is null then
    foreach k in array array[
      'processo_id','contrato_id','emenda_id','item_id','ata_item_id','exec_id',
      'entrega_id','empenho_id','nota_fiscal_id','medicao_id','sancao_id',
      'chamado_id','termo_id'
    ] loop
      if nullif(j->>k, '') is not null then
        parent := case k
          when 'processo_id' then 'processos'
          when 'contrato_id' then 'contratos'
          when 'emenda_id' then 'emendas'
          when 'item_id' then 'itens'
          when 'ata_item_id' then 'atas_itens'
          when 'exec_id' then 'atas_execucao'
          when 'entrega_id' then 'itens_entregas'
          when 'empenho_id' then 'empenhos'
          when 'nota_fiscal_id' then 'notas_fiscais'
          when 'medicao_id' then 'contratos_medicoes'
          when 'sancao_id' then 'sancoes_solicitadas'
          when 'chamado_id' then 'chamados'
          when 'termo_id' then 'termos_ateste'
        end;

        if to_regclass('public.' || parent) is not null then
          -- Os pais misturam PK bigint e UUID. Comparar pela representacao textual
          -- evita converter UUID para bigint e mantem um unico gatilho compartilhado.
          execute format('select secao_id from public.%I where id::text = $1', parent)
             into v
            using j->>k;
          exit when v is not null;
        end if;
      end if;
    end loop;
  end if;

  v := coalesce(v, private.current_context_secao_id(), private.current_profile_secao_id());

  if v is null and tg_table_name in ('chamados','chamados_controle','chamados_anexos') then
    select id into v from public.secoes where sigla = 'SUEQ - EQUIP';
  end if;

  new := jsonb_populate_record(new, jsonb_build_object('secao_id', v));
  return new;
end
$$;

revoke all on function private.set_record_secao() from public;
