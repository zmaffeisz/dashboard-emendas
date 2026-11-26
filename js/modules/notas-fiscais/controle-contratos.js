import { contractUsesMonthlyDocuments } from '../contratos/classificacao.js?v=20261126-1';

export const contratoParticipaControleMensal = contractUsesMonthlyDocuments;

export async function carregarContratosControleMensal(client) {
  const contratos = [];
  for (let offset = 0; ; offset += 500) {
    const {data, error} = await client.from('contratos')
      .select('id,cpl,numero_contrato,status,modelo_contrato,prefixo_chamado,modelo_execucao,periodicidade_pagamento,recebimento_escopo,prestador,fornecedor_id,processo_id,secao_id,vencimento,tipo_instrumento,fornecedores(id,razao_social,cnpj_normalizado),processos(id,identificador)')
      .order('cpl', {ascending: true}).order('id', {ascending: true}).range(offset, offset + 499);
    if (error) throw error;
    contratos.push(...(data || []).filter(contratoParticipaControleMensal));
    if (!data || data.length < 500) break;
  }
  return contratos;
}
