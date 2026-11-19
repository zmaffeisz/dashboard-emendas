export function contratoParticipaControleMensal(contrato) {
  const status = String(contrato.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['ENCERRADO', 'CONCLUIDO', 'CANCELADO', 'RESCINDIDO'].some(value => status.includes(value))) return false;
  if (String(contrato.tipo_instrumento || '').toUpperCase() === 'ATA' || contrato.recebimento_escopo) return false;
  return ['por_demanda', 'continuo_mensal_fixo', 'continuo_trimestral_preventiva_corretiva'].includes(contrato.modelo_execucao)
    || ['MENSAL', 'TRIMESTRAL'].includes(String(contrato.periodicidade_pagamento || '').toUpperCase())
    || Boolean(String(contrato.prefixo_chamado || '').trim());
}

export async function carregarContratosControleMensal(client) {
  const contratos = [];
  for (let offset = 0; ; offset += 500) {
    const {data, error} = await client.from('contratos')
      .select('id,cpl,numero_contrato,status,prefixo_chamado,modelo_execucao,periodicidade_pagamento,recebimento_escopo,prestador,fornecedor_id,processo_id,secao_id,vencimento,tipo_instrumento,fornecedores(id,razao_social,cnpj_normalizado),processos(id,identificador)')
      .order('cpl', {ascending: true}).order('id', {ascending: true}).range(offset, offset + 499);
    if (error) throw error;
    contratos.push(...(data || []).filter(contratoParticipaControleMensal));
    if (!data || data.length < 500) break;
  }
  return contratos;
}
