-- Registra vários recebimentos de aquisição sob uma única nota fiscal.
-- Todas as gravações relacionais são atômicas; o arquivo é enviado antes pelo frontend
-- e removido por ele caso esta função rejeite o lote.

create or replace function public.registrar_recebimento_aquisicao_lote(
  p_nota jsonb,
  p_itens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_unidade jsonb;
  v_entrega record;
  v_nf_id uuid;
  v_nf_numero text;
  v_nf_normalizado text;
  v_arquivo_url text;
  v_data_emissao date;
  v_data_recebimento date;
  v_valor_total numeric;
  v_observacoes text;
  v_recebido_por text;
  v_entrega_id uuid;
  v_empenho_id uuid;
  v_empenho_numero text;
  v_quantidade numeric;
  v_saldo numeric;
  v_total_recebido numeric;
  v_possui_patrimonio boolean;
  v_unidades jsonb;
  v_patrimonio text;
  v_numero_serie text;
  v_primeiro_patrimonio text;
  v_patrimonios text[] := array[]::text[];
  v_entregas_ids uuid[] := array[]::uuid[];
  v_contrato_id integer;
  v_fornecedor_id bigint;
  v_processo_id bigint;
  v_secao_id bigint;
  v_emenda_id uuid;
  v_emenda_comum boolean := true;
  v_item_chave text;
  v_item_chave_atual text;
  v_seq integer;
  v_total_itens integer;
  v_processados integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.can_access_tab('itens', 'edit') then
    raise exception 'Sem permissão para registrar recebimentos.';
  end if;

  if jsonb_typeof(p_nota) <> 'object' then
    raise exception 'Dados da nota fiscal inválidos.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'A lista de itens do recebimento é inválida.';
  end if;

  v_total_itens := jsonb_array_length(p_itens);
  if v_total_itens < 2 then
    raise exception 'Selecione ao menos dois itens para o recebimento em lote.';
  end if;

  begin
    v_nf_id := nullif(p_nota->>'id', '')::uuid;
    v_data_emissao := nullif(p_nota->>'data_emissao', '')::date;
    v_data_recebimento := nullif(p_nota->>'data_recebimento', '')::date;
    v_valor_total := nullif(p_nota->>'valor_total', '')::numeric;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'Dados numéricos ou datas da nota fiscal são inválidos.';
  end;

  v_nf_numero := nullif(btrim(p_nota->>'numero'), '');
  v_nf_normalizado := nullif(btrim(p_nota->>'numero_normalizado'), '');
  v_arquivo_url := nullif(btrim(p_nota->>'arquivo_url'), '');
  v_observacoes := nullif(btrim(p_nota->>'observacoes'), '');
  v_recebido_por := nullif(btrim(p_nota->>'recebido_por'), '');

  if v_nf_id is null or v_nf_numero is null or v_nf_normalizado is null then
    raise exception 'Informe o número da nota fiscal.';
  end if;
  if v_data_emissao is null or v_data_recebimento is null then
    raise exception 'Informe as datas da nota fiscal e do recebimento.';
  end if;
  if v_arquivo_url is null or left(v_arquivo_url, length(v_nf_id::text) + 1) <> v_nf_id::text || '/' then
    raise exception 'O anexo da nota fiscal é obrigatório.';
  end if;
  if v_valor_total is not null and v_valor_total < 0 then
    raise exception 'O valor total da nota fiscal não pode ser negativo.';
  end if;

  -- Primeira passagem: trava e valida todo o lote antes de gravar qualquer linha.
  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    begin
      v_entrega_id := nullif(v_item->>'entrega_id', '')::uuid;
      v_empenho_id := nullif(v_item->>'empenho_id', '')::uuid;
      v_quantidade := nullif(v_item->>'quantidade', '')::numeric;
      v_possui_patrimonio := (v_item->>'possui_patrimonio')::boolean;
    exception when invalid_text_representation then
      raise exception 'Há identificadores ou quantidades inválidos no lote.';
    end;

    if v_entrega_id is null or v_entrega_id = any(v_entregas_ids) then
      raise exception 'O lote contém uma entrega ausente ou repetida.';
    end if;
    v_entregas_ids := array_append(v_entregas_ids, v_entrega_id);

    select
      ie.id,
      ie.item_id,
      ie.af_numero,
      ie.qtde_autorizada,
      coalesce(ie.qtde_recebida, 0) as qtde_recebida,
      ie.nota_fiscal_id,
      ie.empenho_id as empenho_atual_id,
      i.origem,
      i.contrato_id,
      i.fornecedor_id,
      i.processo_id,
      i.emenda_id,
      i.emenda_item_id,
      i.descricao,
      i.marca,
      i.modelo,
      i.valor_contratado,
      i.valor_estimado,
      i.unidade_destino_id,
      i.secao_id,
      u.nome as unidade_nome
    into v_entrega
    from public.itens_entregas ie
    join public.itens i on i.id = ie.item_id
    left join public.unidades u on u.id = i.unidade_destino_id
    where ie.id = v_entrega_id
    for update of ie;

    if not found then
      raise exception 'Uma das AFs selecionadas não foi encontrada.';
    end if;
    if v_entrega.origem <> 'aquisicao' then
      raise exception 'O recebimento em lote aceita apenas itens de aquisição.';
    end if;
    if nullif(btrim(v_entrega.af_numero), '') is null then
      raise exception 'Todos os itens precisam ter AF emitida.';
    end if;
    if v_entrega.nota_fiscal_id is not null then
      raise exception 'Um dos itens já possui nota fiscal vinculada.';
    end if;
    if v_quantidade is null or v_quantidade <= 0 then
      raise exception 'Todas as quantidades recebidas devem ser maiores que zero.';
    end if;
    if v_possui_patrimonio is null then
      raise exception 'Informe se os itens possuem patrimônio.';
    end if;
    v_saldo := coalesce(v_entrega.qtde_autorizada, 0) - v_entrega.qtde_recebida;
    if v_quantidade > v_saldo then
      raise exception 'A quantidade recebida excede o saldo de uma das AFs.';
    end if;
    if v_empenho_id is null then
      raise exception 'Todos os itens precisam ter empenho vinculado.';
    end if;

    select e.numero
    into v_empenho_numero
    from public.empenhos e
    where e.id = v_empenho_id
      and (
        v_entrega.empenho_atual_id = e.id
        or exists (
          select 1
          from public.empenho_itens ei
          where ei.item_id = v_entrega.item_id
            and ei.empenho_id = e.id
        )
      );
    if v_empenho_numero is null then
      raise exception 'O empenho informado não está vinculado ao respectivo item.';
    end if;

    v_item_chave_atual := lower(btrim(coalesce(v_entrega.descricao, ''))) || '|' ||
      lower(btrim(coalesce(v_entrega.marca, ''))) || '|' ||
      lower(btrim(coalesce(v_entrega.modelo, '')));
    if v_contrato_id is null then
      v_contrato_id := v_entrega.contrato_id;
      v_fornecedor_id := v_entrega.fornecedor_id;
      v_processo_id := v_entrega.processo_id;
      v_secao_id := v_entrega.secao_id;
      v_emenda_id := v_entrega.emenda_id;
      v_item_chave := v_item_chave_atual;
    else
      if v_entrega.contrato_id is distinct from v_contrato_id
         or v_entrega.fornecedor_id is distinct from v_fornecedor_id
         or v_entrega.processo_id is distinct from v_processo_id then
        raise exception 'Os itens devem pertencer ao mesmo contrato, fornecedor e processo.';
      end if;
      if v_item_chave_atual is distinct from v_item_chave then
        raise exception 'Os itens do recebimento em lote devem ter a mesma descrição, marca e modelo.';
      end if;
      if v_entrega.emenda_id is distinct from v_emenda_id then
        v_emenda_comum := false;
      end if;
    end if;

    v_unidades := coalesce(v_item->'unidades', '[]'::jsonb);
    if jsonb_typeof(v_unidades) <> 'array' then
      raise exception 'A lista de patrimônios de um dos itens é inválida.';
    end if;
    if v_possui_patrimonio then
      if v_quantidade <> trunc(v_quantidade) then
        raise exception 'Itens com patrimônio exigem quantidade inteira.';
      end if;
      if jsonb_array_length(v_unidades) <> v_quantidade::integer then
        raise exception 'Informe um patrimônio para cada unidade física recebida.';
      end if;
      for v_unidade in select value from jsonb_array_elements(v_unidades)
      loop
        v_patrimonio := nullif(btrim(v_unidade->>'patrimonio'), '');
        if v_patrimonio is null then
          raise exception 'Todos os patrimônios são obrigatórios.';
        end if;
        if v_patrimonio = any(v_patrimonios) then
          raise exception 'Há patrimônio repetido no lote: %.', v_patrimonio;
        end if;
        if exists (select 1 from public.itens_entregas_unidades where patrimonio = v_patrimonio)
           or exists (select 1 from public.atas_execucao_unidades where patrimonio = v_patrimonio) then
          raise exception 'O patrimônio % já está cadastrado.', v_patrimonio;
        end if;
        v_patrimonios := array_append(v_patrimonios, v_patrimonio);
      end loop;
    elsif jsonb_array_length(v_unidades) > 0 then
      raise exception 'Item sem patrimônio não deve conter unidades patrimoniais.';
    end if;
  end loop;

  if v_contrato_id is null then
    raise exception 'Contrato do lote não identificado.';
  end if;
  if exists (
    select 1
    from public.notas_fiscais nf
    where nf.contrato_id = v_contrato_id
      and nf.fornecedor_id is not distinct from v_fornecedor_id
      and coalesce(nf.numero_normalizado, regexp_replace(coalesce(nf.numero, ''), '\D', '', 'g')) = v_nf_normalizado
  ) then
    raise exception 'Esta nota fiscal já está cadastrada para o contrato e fornecedor.';
  end if;

  if not v_emenda_comum then
    v_emenda_id := null;
  end if;

  insert into public.notas_fiscais (
    id, numero, numero_normalizado, fornecedor_id, contrato_id, processo_id, emenda_id,
    data_emissao, data_recebimento, valor_total, status, origem_sistema, arquivo_url,
    observacoes, created_at, updated_at, secao_id
  ) values (
    v_nf_id, v_nf_numero, v_nf_normalizado, v_fornecedor_id, v_contrato_id, v_processo_id, v_emenda_id,
    v_data_emissao, v_data_recebimento, v_valor_total, 'recebida', 'recebimento_lote', v_arquivo_url,
    v_observacoes, now(), now(), v_secao_id
  );

  -- Segunda passagem: todas as validações já passaram e as AFs permanecem travadas.
  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_entrega_id := (v_item->>'entrega_id')::uuid;
    v_empenho_id := (v_item->>'empenho_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_possui_patrimonio := (v_item->>'possui_patrimonio')::boolean;
    v_unidades := coalesce(v_item->'unidades', '[]'::jsonb);

    select
      ie.id,
      ie.item_id,
      ie.qtde_autorizada,
      coalesce(ie.qtde_recebida, 0) as qtde_recebida,
      i.emenda_id,
      i.emenda_item_id,
      i.valor_contratado,
      i.valor_estimado,
      i.unidade_destino_id,
      i.secao_id,
      u.nome as unidade_nome,
      e.numero as empenho_numero
    into v_entrega
    from public.itens_entregas ie
    join public.itens i on i.id = ie.item_id
    join public.empenhos e on e.id = v_empenho_id
    left join public.unidades u on u.id = i.unidade_destino_id
    where ie.id = v_entrega_id;

    v_total_recebido := v_entrega.qtde_recebida + v_quantidade;

    insert into public.nota_fiscal_itens (
      nota_fiscal_id, item_id, emenda_id, emenda_item_id, empenho_id,
      quantidade, valor_unitario, valor_total, secao_id
    ) values (
      v_nf_id, v_entrega.item_id, v_entrega.emenda_id, v_entrega.emenda_item_id, v_empenho_id,
      v_quantidade,
      coalesce(v_entrega.valor_contratado, v_entrega.valor_estimado),
      coalesce(v_entrega.valor_contratado, v_entrega.valor_estimado) * v_quantidade,
      v_entrega.secao_id
    );

    update public.itens_entregas
    set empenho_id = v_empenho_id,
        empenho = v_entrega.empenho_numero,
        nota_fiscal_id = v_nf_id,
        nota_fiscal = v_nf_numero,
        nf_data = v_data_emissao,
        qtde_recebida = v_total_recebido,
        data_recebimento = v_data_recebimento,
        recebido_por = v_recebido_por,
        recebimento_tipo = case when v_total_recebido >= coalesce(v_entrega.qtde_autorizada, 0) then 'total' else 'parcial' end,
        possui_patrimonio = v_possui_patrimonio,
        patrimonio = case when v_possui_patrimonio then patrimonio else null end,
        numero_serie = case when v_possui_patrimonio then numero_serie else null end,
        status = case when v_total_recebido >= coalesce(v_entrega.qtde_autorizada, 0) then 'recebido' else 'recebido_parcial' end
    where id = v_entrega_id;

    select coalesce(max(unidade_seq), 0)
    into v_seq
    from public.itens_entregas_unidades
    where entrega_id = v_entrega_id;

    v_primeiro_patrimonio := null;
    if v_possui_patrimonio then
      for v_unidade in select value from jsonb_array_elements(v_unidades)
      loop
        v_seq := v_seq + 1;
        v_patrimonio := nullif(btrim(v_unidade->>'patrimonio'), '');
        v_numero_serie := nullif(btrim(v_unidade->>'numero_serie'), '');
        if v_primeiro_patrimonio is null then v_primeiro_patrimonio := v_patrimonio; end if;
        insert into public.itens_entregas_unidades (
          entrega_id, item_id, unidade_id, unidade_nome, quantidade,
          patrimonio, numero_serie, nota_fiscal_id, unidade_seq,
          recebido_em, recebido_por, secao_id
        ) values (
          v_entrega_id, v_entrega.item_id, v_entrega.unidade_destino_id, v_entrega.unidade_nome, 1,
          v_patrimonio, v_numero_serie, v_nf_id, v_seq,
          v_data_recebimento, v_recebido_por, v_entrega.secao_id
        );
      end loop;
    end if;

    if v_entrega.emenda_item_id is not null then
      update public.emenda_itens
      set nota_fiscal = case when nullif(btrim(nota_fiscal), '') is null then v_nf_numero else nota_fiscal end,
          empenho = case when nullif(btrim(empenho), '') is null then v_entrega.empenho_numero else empenho end,
          patrimonio = case when nullif(btrim(patrimonio), '') is null then v_primeiro_patrimonio else patrimonio end
      where id = v_entrega.emenda_item_id;
    end if;

    v_processados := v_processados + 1;
  end loop;

  return jsonb_build_object(
    'nota_fiscal_id', v_nf_id,
    'numero', v_nf_numero,
    'itens_registrados', v_processados
  );
end;
$$;

revoke all on function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb) to authenticated;

comment on function public.registrar_recebimento_aquisicao_lote(jsonb, jsonb)
  is 'Registra atomicamente várias AFs de aquisição sob uma única NF e preserva os vínculos por item, empenho e unidade física.';

notify pgrst, 'reload schema';
