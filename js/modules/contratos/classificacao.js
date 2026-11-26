// A classificação define o acompanhamento documental. Os fluxos de execução
// continuam independentes e preservam os campos operacionais já existentes.
export const CONTRACT_MODELS = Object.freeze([
  { key: 'aquisicao_entrega_unica', label: 'Aquisição com entrega única', measurementMode: 'recebimento' },
  { key: 'aquisicao_entrega_parcelada', label: 'Aquisição com entregas parceladas', measurementMode: 'entrega_parcelada' },
  { key: 'servico_continuo_mensal_fixo', label: 'Serviço contínuo com valor mensal fixo', measurementMode: 'competencia', usesRemainingMonths: true },
  { key: 'servico_continuo_trimestral_fixo', label: 'Serviço contínuo com valor trimestral fixo, preventiva/calibração e corretivas', measurementMode: 'competencia_trimestral', usesRemainingPeriods: true, periodMonths: 3 },
  { key: 'servico_continuo_demanda', label: 'Serviço contínuo por demanda', measurementMode: 'demanda' },
  { key: 'servico_pontual_pagamento_unico', label: 'Serviço pontual com pagamento único', measurementMode: 'etapa_marco' },
  { key: 'obra_engenharia', label: 'Obra ou serviço de engenharia', measurementMode: 'planilha_medicao' },
  { key: 'locacao_bens_moveis', label: 'Locação de bens móveis', measurementMode: 'competencia', usesRemainingMonths: true },
  { key: 'locacao_imovel', label: 'Locação de imóvel', measurementMode: 'competencia', usesRemainingMonths: true },
  { key: 'fornecimento_com_instalacao', label: 'Fornecimento com instalação', measurementMode: 'aceite_instalacao' },
  { key: 'servico_com_materiais_pecas', label: 'Serviço com materiais ou peças', measurementMode: 'medicao_mista' },
  { key: 'mao_obra_dedicacao_exclusiva', label: 'Mão de obra com dedicação exclusiva', measurementMode: 'competencia', usesRemainingMonths: true },
  { key: 'credenciamento', label: 'Credenciamento', measurementMode: 'procedimento_demanda' }
].map(model => Object.freeze({ usesRemainingMonths: false, monthlyDocuments: ![
  'aquisicao_entrega_unica', 'aquisicao_entrega_parcelada',
  'servico_pontual_pagamento_unico', 'fornecimento_com_instalacao'
].includes(model.key), ...model })));

export function getContractModel(contract = {}) {
  // O escopo parcial legado nunca vira pagamento único.
  if (contract.recebimento_escopo === 'parcial') return 'servico_escopo_fechado';
  if (contract.modelo_contrato || contract.contractModel) return contract.modelo_contrato || contract.contractModel;
  if (contract.recebimento_escopo === 'integral') return 'servico_pontual_pagamento_unico';
  if (contract.modelo_execucao === 'por_demanda') return 'servico_continuo_demanda';
  if (contract.modelo_execucao === 'continuo_trimestral_preventiva_corretiva' || contract.periodicidade_pagamento === 'TRIMESTRAL') return 'servico_continuo_trimestral_fixo';
  if (contract.modelo_execucao === 'continuo_mensal_fixo' || contract.periodicidade_pagamento === 'MENSAL') return 'servico_continuo_mensal_fixo';
  return contract.modelo || 'nao_classificado';
}

export function inferContractModelFromProcess(process = {}, scope = '') {
  const tipo = String(process.tipo_servico || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const tipos = {
    'servico mensal valor fixo': 'servico_continuo_mensal_fixo',
    'servico trimestral valor fixo': 'servico_continuo_trimestral_fixo',
    'servico por demanda/execucao': 'servico_continuo_demanda',
    'servico pontual com pagamento unico': 'servico_pontual_pagamento_unico',
    'servico por escopo fechado': scope === 'integral' ? 'servico_pontual_pagamento_unico' : 'servico_escopo_fechado',
    'locacao de bem movel': 'locacao_bens_moveis',
    'mao de obra com dedicacao exclusiva': 'mao_obra_dedicacao_exclusiva',
    'credenciamento': 'credenciamento',
    'obra ou servico de engenharia': 'obra_engenharia',
    'servico com materiais ou pecas': 'servico_com_materiais_pecas'
  };
  return tipos[tipo] || '';
}

export function contractUsesMonthlyDocuments(contract) {
  const status = String(contract.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['ENCERRADO', 'CONCLUIDO', 'CANCELADO', 'RESCINDIDO'].some(value => status.includes(value))) return false;
  if (String(contract.tipo_instrumento || '').toUpperCase() === 'ATA') return false;
  return CONTRACT_MODELS.some(model => model.key === getContractModel(contract) && model.monthlyDocuments);
}
