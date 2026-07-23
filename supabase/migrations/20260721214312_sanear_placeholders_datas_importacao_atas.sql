-- Saneia duas particularidades textuais da planilha após a carga histórica:
-- asteriscos significam ausência de documento e 27/042026 significa 27/04/2026.

update public.atas_execucao
set empenho = null,
    nf = null
where split_part(obs_prazo, ' | ', 1) = 'IMPORT-ATAS-XLSX29-L9';

update public.atas_execucao
set dt_entrega = '2026-04-27'
where split_part(obs_prazo, ' | ', 1) = 'IMPORT-ATAS-XLSX29-L240';

insert into public.notas_fiscais(
  numero, numero_normalizado, fornecedor_id, contrato_id, processo_id, emenda_id,
  data_recebimento, valor_total, valor_bruto, status, origem_sistema, origem_codigo,
  observacoes, secao_id
)
select
  'NF 10400', '10400', c.fornecedor_id, c.id, c.processo_id, ae.emenda_id,
  date '2026-04-27', ae.valor, ae.valor, 'recebida', 'importacao_planilha_atas_2026',
  'NF-' || c.id || '-10400',
  'Data de emissão e arquivo não disponíveis na planilha. Data de recebimento normalizada de 27/042026.',
  c.secao_id
from public.atas_execucao ae
join public.atas_itens ai on ai.id = ae.ata_item_id
join public.contratos c on c.id = ai.contrato_id
where split_part(ae.obs_prazo, ' | ', 1) = 'IMPORT-ATAS-XLSX29-L240'
  and not exists (
    select 1 from public.notas_fiscais nf
    where nf.contrato_id = c.id and nf.numero_normalizado = '10400'
  );

insert into public.nota_fiscal_itens(
  nota_fiscal_id, item_id, emenda_id, emenda_item_id, empenho_id,
  quantidade, valor_unitario, valor_total, observacoes, secao_id
)
select
  nf.id, null, ae.emenda_id, ae.emenda_item_id, ep.id,
  ae.qtde, ae.valor / nullif(ae.qtde, 0), ae.valor,
  'Importação histórica — linha 240', ae.secao_id
from public.atas_execucao ae
join public.atas_itens ai on ai.id = ae.ata_item_id
join public.contratos c on c.id = ai.contrato_id
join public.notas_fiscais nf on nf.contrato_id = c.id and nf.numero_normalizado = '10400'
left join public.empenhos ep on ep.numero = '9657' and ep.ano = 2026
where split_part(ae.obs_prazo, ' | ', 1) = 'IMPORT-ATAS-XLSX29-L240'
  and not exists (
    select 1 from public.nota_fiscal_itens nfi
    where nfi.nota_fiscal_id = nf.id and nfi.observacoes = 'Importação histórica — linha 240'
  );

do $$
declare
  v integer;
begin
  select count(*) into v
  from public.atas_execucao
  where obs_prazo like 'IMPORT-ATAS-XLSX29-L%'
    and nullif(trim(empenho), '') is null;
  if v <> 4 then raise exception 'Esperadas 4 execuções sem empenho, encontradas %', v; end if;

  select count(*) into v
  from public.atas_execucao
  where obs_prazo like 'IMPORT-ATAS-XLSX29-L%'
    and nullif(trim(dt_entrega), '') is not null
    and nullif(trim(nf), '') is not null;
  if v <> 270 then raise exception 'Esperadas 270 execuções recebidas, encontradas %', v; end if;
end $$;
