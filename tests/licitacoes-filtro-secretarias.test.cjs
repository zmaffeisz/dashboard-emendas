const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/legacy/30-usuarios-licitacoes.js', 'utf8');
const helpersStart = source.indexOf('function _licSecretariasSelecionadas()');
const helpersEnd = source.indexOf('function _licItemExecutado(', helpersStart);
const start = source.indexOf('function _licItemExecutado(');
const end = source.indexOf('function renderLicitacoes()', start);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && end > start);

const selections = [];
const contratados = {checked: false};
const context = vm.createContext({
  document: {getElementById: id => id === 'lic-f-orgao'
    ? {selectedOptions: selections.map(value => ({value}))}
    : id === 'lic-f-contratados' ? contratados : null},
  _cpSituacao: item => ({orgao: item.orgao}),
  _cpItens: [
    {processo_id: 1, orgao: 'SES'},
    {processo_id: 2, orgao: 'AUDI'},
    {processo_id: 3, orgao: 'CGM'}
  ],
  _licitacoesCache: [{id: 1}, {id: 2}, {id: 3}],
  _cpStatusById: {},
  _ataPlanejamentosLicitacao: [],
  _procServicoPeriodicoItens: () => []
});
vm.runInContext(source.slice(helpersStart, helpersEnd) + source.slice(start, end), context);

const ids = () => [...context._licProcessosVisiveis()].map(row => row.p.id);
assert.deepEqual(ids(), [1, 2, 3]);
selections.push('SES', 'CGM');
assert.deepEqual(ids(), [1, 3]);
selections.splice(0, selections.length, 'AUDI');
assert.deepEqual(ids(), [2]);
selections.length = 0;
assert.deepEqual(ids(), [1, 2, 3]);
console.log('Filtro de secretarias: seleção múltipla e todas sem seleção validadas.');

context._licitacoesCache = [
  {id: 10, n_contratos: 1}, // Cabeçalho importado, já em execução.
  {id: 11, n_contratos: 0}, // Novo processo sem itens continua visível.
  {id: 12, n_contratos: 1}, // Contratação parcial mantém o saldo na licitação.
  {id: 13, n_contratos: 1}  // Todos os itens contratados.
];
context._cpItens = [
  {id: 1, processo_id: 12, contrato_id: 100},
  {id: 2, processo_id: 12},
  {id: 3, processo_id: 13, contrato_id: 101}
];
assert.deepEqual(ids(), [11, 12]);
contratados.checked = true;
assert.deepEqual(ids(), [10, 11, 12, 13]);
contratados.checked = false;
assert.deepEqual(ids(), [11, 12]);
console.log('Contratos sem itens ocultos por padrão; novos processos e saldos parciais preservados.');
