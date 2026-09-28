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
const context = vm.createContext({
  document: {getElementById: id => id === 'lic-f-orgao'
    ? {selectedOptions: selections.map(value => ({value}))}
    : null},
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
