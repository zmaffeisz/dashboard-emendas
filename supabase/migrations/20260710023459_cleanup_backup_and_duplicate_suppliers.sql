-- Limpeza validada no clone de teste contratos-dag.
-- Mantém o cadastro mais antigo de cada razão social duplicada sem alterar seu CNPJ
-- e redireciona vínculos existentes antes de excluir os duplicados.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $cleanup$
declare
  v_nome text;
  v_keep_id bigint;
  v_duplicate_ids bigint[];
begin
  foreach v_nome in array array['AFIP'::text,'CONNECT HEART'::text]
  loop
    select min(id)
      into v_keep_id
      from public.fornecedores
     where upper(regexp_replace(btrim(razao_social),'\s+',' ','g')) = v_nome;

    select array_agg(id order by id)
      into v_duplicate_ids
      from public.fornecedores
     where upper(regexp_replace(btrim(razao_social),'\s+',' ','g')) = v_nome
       and id <> v_keep_id;

    if coalesce(cardinality(v_duplicate_ids),0) = 0 then
      continue;
    end if;

    update public.contratos set fornecedor_id=v_keep_id where fornecedor_id=any(v_duplicate_ids);
    update public.itens set fornecedor_id=v_keep_id where fornecedor_id=any(v_duplicate_ids);
    update public.empenhos set fornecedor_id=v_keep_id where fornecedor_id=any(v_duplicate_ids);
    update public.notas_fiscais set fornecedor_id=v_keep_id where fornecedor_id=any(v_duplicate_ids);
    update public.fornecedor_contatos set fornecedor_id=v_keep_id where fornecedor_id=any(v_duplicate_ids);
    delete from public.fornecedores where id=any(v_duplicate_ids);
  end loop;
end
$cleanup$;

-- O schema não possui dependências externas, grants para anon/authenticated ou uso no app.
drop table if exists backup_20260701.contratos;
drop table if exists backup_20260701.empresas;
drop table if exists backup_20260701.itens;
drop table if exists backup_20260701.medicoes;
drop table if exists backup_20260701.notas_fiscais;
drop table if exists backup_20260701.pagamentos;
drop schema if exists backup_20260701;
