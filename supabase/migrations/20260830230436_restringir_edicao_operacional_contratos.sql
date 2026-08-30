begin;

create or replace function private.proteger_identidade_contrato()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if private.is_admin_approved() then
    return new;
  end if;

  if new.tipo_instrumento is distinct from old.tipo_instrumento
    or new.cpl is distinct from old.cpl
    or new.numero_contrato is distinct from old.numero_contrato
    or new.prestador is distinct from old.prestador
    or new.cnpj is distinct from old.cnpj
    or new.cnpj_fornecedor is distinct from old.cnpj_fornecedor
    or new.fornecedor_id is distinct from old.fornecedor_id
    or new.objeto is distinct from old.objeto
    or new.data_inicio is distinct from old.data_inicio
    or new.data_assinatura is distinct from old.data_assinatura
    or new.fonte is distinct from old.fonte
    or new.processo_id is distinct from old.processo_id
    or new.secao is distinct from old.secao
    or new.secao_id is distinct from old.secao_id
    or new.modelo_execucao is distinct from old.modelo_execucao
    or new.periodicidade_pagamento is distinct from old.periodicidade_pagamento
    or new.valor_inicial is distinct from old.valor_inicial
    or new.valor_inicial_num is distinct from old.valor_inicial_num
    or new.obs is distinct from old.obs
  then
    raise exception 'Dados cadastrais e seção do contrato só podem ser alterados por administrador.'
      using errcode = '42501';
  end if;

  if new.data_base_reajuste is distinct from old.data_base_reajuste
    and (
      exists (
        select 1
        from public.contratos_historico h
        where h.contrato_id = old.id
          and (
            lower(coalesce(h.tipo, '')) like '%reajust%'
            or lower(coalesce(h.action_type, '')) like '%reajust%'
          )
      )
      or exists (
        select 1
        from public.atas_item_reajustes ar
        join public.atas_itens ai on ai.id = ar.ata_item_id
        where ai.contrato_id = old.id
      )
    )
  then
    raise exception 'A data-base não pode ser alterada depois do primeiro reajuste.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_identidade_contrato on public.contratos;
create trigger proteger_identidade_contrato
before update on public.contratos
for each row
execute function private.proteger_identidade_contrato();

revoke all on function private.proteger_identidade_contrato() from public, anon, authenticated;

create or replace function public.obter_dados_operacionais_contrato(p_contrato_id integer)
returns table (
  id integer,
  email_empresa text,
  prefixo_chamado text,
  contato text,
  data_base_reajuste date,
  data_base_bloqueada boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.email_empresa,
    c.prefixo_chamado,
    c.contato,
    c.data_base_reajuste,
    (
      exists (
        select 1
        from public.contratos_historico h
        where h.contrato_id = c.id
          and (
            lower(coalesce(h.tipo, '')) like '%reajust%'
            or lower(coalesce(h.action_type, '')) like '%reajust%'
          )
      )
      or exists (
        select 1
        from public.atas_item_reajustes ar
        join public.atas_itens ai on ai.id = ar.ata_item_id
        where ai.contrato_id = c.id
      )
    ) as data_base_bloqueada
  from public.contratos c
  where c.id = p_contrato_id
    and (
      private.is_admin_approved()
      or private.can_access_domain(c.secao_id, array['contratos']::text[], 'edit')
    );

  if not found then
    raise exception 'Contrato não encontrado ou sem permissão de edição.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.atualizar_dados_operacionais_contrato(
  p_contrato_id integer,
  p_dados jsonb
)
returns table (
  id integer,
  email_empresa text,
  prefixo_chamado text,
  contato text,
  data_base_reajuste date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_atual public.contratos%rowtype;
  v_email text;
  v_prefixo text;
  v_contato text;
  v_data_base date;
  v_observacao text;
  v_alteracoes text[] := array[]::text[];
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados operacionais inválidos.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_dados) as chaves(chave)
    where chave not in ('email_empresa', 'prefixo_chamado', 'contato', 'data_base_reajuste', 'observacao')
  ) then
    raise exception 'A atualização contém campos não permitidos.' using errcode = '42501';
  end if;

  select c.* into v_atual
  from public.contratos c
  where c.id = p_contrato_id
    and (
      private.is_admin_approved()
      or private.can_access_domain(c.secao_id, array['contratos']::text[], 'edit')
    )
  for update;

  if not found then
    raise exception 'Contrato não encontrado ou sem permissão de edição.' using errcode = '42501';
  end if;

  v_email := case when p_dados ? 'email_empresa'
    then nullif(btrim(p_dados ->> 'email_empresa'), '') else v_atual.email_empresa end;
  v_prefixo := case when p_dados ? 'prefixo_chamado'
    then nullif(upper(btrim(p_dados ->> 'prefixo_chamado')), '') else v_atual.prefixo_chamado end;
  v_contato := case when p_dados ? 'contato'
    then nullif(btrim(p_dados ->> 'contato'), '') else v_atual.contato end;
  v_data_base := case when p_dados ? 'data_base_reajuste'
    then nullif(p_dados ->> 'data_base_reajuste', '')::date else v_atual.data_base_reajuste end;
  v_observacao := nullif(btrim(p_dados ->> 'observacao'), '');

  if v_prefixo is not null and v_prefixo !~ '^[A-Z]+$' then
    raise exception 'O prefixo deve conter somente letras.' using errcode = '23514';
  end if;

  if v_data_base is distinct from v_atual.data_base_reajuste
    and (
      exists (
        select 1 from public.contratos_historico h
        where h.contrato_id = v_atual.id
          and (
            lower(coalesce(h.tipo, '')) like '%reajust%'
            or lower(coalesce(h.action_type, '')) like '%reajust%'
          )
      )
      or exists (
        select 1
        from public.atas_item_reajustes ar
        join public.atas_itens ai on ai.id = ar.ata_item_id
        where ai.contrato_id = v_atual.id
      )
    )
  then
    raise exception 'A data-base não pode ser alterada depois do primeiro reajuste.' using errcode = '23514';
  end if;

  if v_email is distinct from v_atual.email_empresa then v_alteracoes := array_append(v_alteracoes, 'e-mails'); end if;
  if v_prefixo is distinct from v_atual.prefixo_chamado then v_alteracoes := array_append(v_alteracoes, 'prefixo de chamado'); end if;
  if v_contato is distinct from v_atual.contato then v_alteracoes := array_append(v_alteracoes, 'contato operacional'); end if;
  if v_data_base is distinct from v_atual.data_base_reajuste then v_alteracoes := array_append(v_alteracoes, 'data-base do reajuste'); end if;

  update public.contratos c
  set email_empresa = v_email,
      prefixo_chamado = v_prefixo,
      contato = v_contato,
      data_base_reajuste = v_data_base
  where c.id = v_atual.id;

  if cardinality(v_alteracoes) > 0 or v_observacao is not null then
    insert into public.contratos_historico (
      contrato_id, cpl, tipo, titulo, action_type, status_evento,
      data_evento, obs, usuario, secao_id
    ) values (
      v_atual.id,
      v_atual.cpl,
      case when cardinality(v_alteracoes) > 0 then 'Atualização operacional' else 'Observação interna' end,
      case when cardinality(v_alteracoes) > 0 then 'Dados operacionais atualizados' else 'Observação interna registrada' end,
      'dados_operacionais',
      'formalizado',
      current_date,
      concat_ws('. ',
        case when cardinality(v_alteracoes) > 0 then 'Campos alterados: ' || array_to_string(v_alteracoes, ', ') end,
        case when v_observacao is not null then 'Observação: ' || v_observacao end
      ),
      coalesce((select auth.jwt() ->> 'email'), (select auth.uid())::text),
      v_atual.secao_id
    );
  end if;

  return query
  select c.id, c.email_empresa, c.prefixo_chamado, c.contato, c.data_base_reajuste
  from public.contratos c
  where c.id = v_atual.id;
end;
$$;

revoke all on function public.obter_dados_operacionais_contrato(integer) from public, anon;
revoke all on function public.atualizar_dados_operacionais_contrato(integer, jsonb) from public, anon;
grant execute on function public.obter_dados_operacionais_contrato(integer) to authenticated;
grant execute on function public.atualizar_dados_operacionais_contrato(integer, jsonb) to authenticated;

comment on function public.obter_dados_operacionais_contrato(integer) is
  'Retorna somente os campos liberados no editor operacional e informa se a data-base já está protegida por reajuste.';
comment on function public.atualizar_dados_operacionais_contrato(integer, jsonb) is
  'Atualiza somente e-mail, prefixo, contato e data-base, registrando as mudanças e observações no histórico.';

notify pgrst, 'reload schema';

commit;


