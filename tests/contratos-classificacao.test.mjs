import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as classification from '../js/modules/contratos/classificacao.js';
import { createContractRecord } from '../js/modules/contratos/contratos.data.js';
const { CONTRACT_MODELS, getContractModel, contractUsesMonthlyDocuments: participates } = classification;

assert.equal(CONTRACT_MODELS.length, 13);
assert.equal(classification.inferContractModelFromProcess({tipo_servico:'Serviço mensal valor fixo'}),'servico_continuo_mensal_fixo');
assert.equal(classification.inferContractModelFromProcess({tipo_servico:'Serviço pontual com pagamento único'}),'servico_pontual_pagamento_unico');
assert.equal(classification.inferContractModelFromProcess({tipo_servico:'Serviço por escopo fechado'},'parcial'),'servico_escopo_fechado');
assert.equal(classification.inferContractModelFromProcess({tipo_servico:'Serviço por escopo fechado'},'integral'),'servico_pontual_pagamento_unico');
assert(!CONTRACT_MODELS.some(m => m.key === 'tecnologia_software_licenca'));
for (const model of CONTRACT_MODELS) {
  const c = { modelo_contrato: model.key, tipo_instrumento: 'CONTRATO', status: 'VIGENTE' };
  assert.equal(participates(c), model.monthlyDocuments, model.label);
  for (const status of ['ENCERRADO', 'CONCLUÍDO', 'CANCELADO', 'RESCINDIDO']) assert.equal(participates({ ...c, status }), false);
  assert.equal(participates({ ...c, tipo_instrumento: 'ATA' }), false);
}
assert(participates({ modelo_contrato: 'obra_engenharia' }));
assert(participates({ modelo_contrato: 'locacao_imovel' }));
assert(!participates({ prefixo_chamado: 'OSC' }));
assert(!participates({ modelo_contrato: 'aquisicao_entrega_unica', prefixo_chamado: 'OSC', periodicidade_pagamento: 'MENSAL' }));
assert.equal(getContractModel({ modelo_contrato: 'locacao_bens_moveis', periodicidade_pagamento: 'MENSAL' }), 'locacao_bens_moveis');
assert.equal(getContractModel({ recebimento_escopo: 'parcial' }), 'servico_escopo_fechado');
assert(!participates({ recebimento_escopo: 'parcial' }));
assert.equal(getContractModel({ recebimento_escopo: 'integral' }), 'servico_pontual_pagamento_unico');
for (const [modelo_execucao, model] of [['por_demanda', 'servico_continuo_demanda'], ['continuo_mensal_fixo', 'servico_continuo_mensal_fixo'], ['continuo_trimestral_preventiva_corretiva', 'servico_continuo_trimestral_fixo']]) {
  assert.equal(getContractModel({ modelo_execucao }), model);
  assert.equal(createContractRecord({ modelo_execucao }).contractModel, model);
}

// Exercita a gravação real do editor: locação/obra não viram manutenção mensal.
const source = readFileSync(new URL('../js/legacy/70-fiscalizacao-sancoes-contratos.js', import.meta.url), 'utf8');
const elements = new Map();
const el = id => { if (!elements.has(id)) elements.set(id, { value: '', style: {} }); return elements.get(id); };
const updates = [];
const context = vm.createContext({
  document: { getElementById: el }, window: {}, _isAdmin: () => true,
  _ctEhTrimestral: c => c?.periodicidade_pagamento === 'TRIMESTRAL',
  contratosRows: [{ id: 1 }], _secoesOrganizacionais: [], showMsg() {},
  sb: { from: () => ({ update: row => ({ eq: async () => { updates.push(row); return { error: null }; } }) }) },
  contratosCarregado: true, loadContratos: async () => {}, atasContratos: [], setTimeout() {}
});
vm.runInContext(source.slice(source.indexOf('let _ctEdicaoId=null;'), source.indexOf('let _ctEmailId=null;')), context);
vm.runInContext('_ctEdicaoId=1;', context);
el('ec-fiscalizacao').selectedOptions = [];
el('ec-numero').value = '1/2026'; el('ec-tipo').value = 'CONTRATO';
for (const key of ['locacao_bens_moveis', 'obra_engenharia', 'servico_com_materiais_pecas', 'credenciamento']) {
  el('ec-classificacao').value = key;
  await context.salvarEdicaoContrato();
  const row = updates.at(-1);
  assert.equal(row.modelo_contrato, key);
  assert(!('modelo_execucao' in row)); assert(!('periodicidade_pagamento' in row)); assert(!('recebimento_escopo' in row));
}
el('ec-classificacao').value = '';
await context.salvarEdicaoContrato();
assert(!('modelo_contrato' in updates.at(-1)), 'Manter classificação não reescreve o modelo');
context.contratosRows[0].modelo_contrato='servico_continuo_mensal_fixo';
context.contratosRows[0].modelo_execucao='continuo_mensal_fixo';
context.contratosRows[0].periodicidade_pagamento='MENSAL';
el('ec-classificacao').value='servico_continuo_mensal_fixo';
await context.salvarEdicaoContrato();
assert(!('modelo_execucao' in updates.at(-1)), 'Salvar mensal existente preserva o fluxo');
assert(!('periodicidade_pagamento' in updates.at(-1)));
console.log('PASSOU: 13 modelos, controle por classificação, engenharia/locações, escopo legado e editor sem conversão para manutenção.');
