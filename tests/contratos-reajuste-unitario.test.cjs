const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/legacy/70-fiscalizacao-sancoes-contratos.js', 'utf8');
const fields = {};
const row = { dataset: { item: 'item' }, querySelector: selector => fields[selector] };
const item = { id: 'item', descricao: 'Compressor', qtde: 22, valor_contratado: 30 };
const elements = { 'cie-meses': { value: '20' }, 'cie-data': { value: '2025-02-01' }, 'cie-msg': {} };
const events = [], writes = [];
let readError = null, contractError = null;
let savedItems = [{ qtde: 22, valor_contratado: 31.34, status: 'contratado' }, { qtde: 1, valor_contratado: 100, status: 'contratado' }, { qtde: 5, valor_contratado: 900, status: 'cancelado' }];
const context = vm.createContext({
  document: { getElementById: id => elements[id], querySelectorAll: () => [row] },
  window: {}, _ctItensAtual: [item], _ctAtual: { id: 274 },
  _ctNum: v => Number(String(v ?? '').replace(',', '.')) || 0,
  _ctMoney: String, ctEventoUsaMesesRestantes: () => true,
  _ctEhTrimestral: () => false, bloquearSeVisualiz: () => false,
  _ctPeriodicidade: () => 'MENSAL', _ctValorAtual: () => 298848,
  ctRegistrarHistoricoContrato: async event => { events.push(event); return {}; },
  sb: { from: table => ({
    select: () => ({ eq: async () => ({ data: savedItems, error: readError }) }),
    update: data => ({ eq: () => {
      writes.push({ table, data });
      return table === 'contratos' ? { select: async () => ({ data: [{ id: 274 }], error: contractError }) } : Promise.resolve({});
    } })
  }) },
  loadContratos: async () => {}, contratosRows: [], setTimeout() {},
});
vm.runInContext(source.slice(source.indexOf('const CIE_LIMITE_ADITIVO_PCT'), source.indexOf('function ctAtualizarLiquidoMedicao')), context);
context._cieAtualizarTotais = () => ({ baseReajustada: 320000 });
function input(unit = '', pct = '', ad = '', su = '') {
  for (const [key, value] of Object.entries({ '.cie-re-novo-unit': unit, '.cie-re-pct': pct, '.cie-ad-qtde': ad, '.cie-su-qtde': su })) fields[key] = { value };
}
const calc = () => context._cieImpactosItem(item, row);
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
(async () => {
  input('', '4.46');
  assert.equal(calc().impactoReajuste, 0);
  assert.equal(calc().novoValorUnitario, 30);
  input('31.34', '4.46');
  near(calc().impactoReajuste, 589.60);
  near(context._cieBaseReajustadaSessao(15840, 660).baseReajustada, 16547.52);
  fields['.cie-re-pct'].value = '999';
  near(calc().impactoReajuste, 589.60);
  near(context._cieBaseReajustadaSessao(15840, 660).baseReajustada, 16547.52);
  await context.salvarItensEventosContrato();
  assert.equal(events[0].percentual, 999);
  assert.equal(events[0].valor_unitario_periodo, 31.34);
  near(events[0].valor_impacto, 589.60);
  assert.equal(writes[0].data.valor_contratado, 31.34);
  assert.equal(writes[1].data.valor_mensal_num, 789.48);
  assert.equal(writes[1].data.valor_periodico_num, 789.48);
  near(writes[1].data.valor_atual_num, 298848+589.60);
  input('31.34', '', '2', '1');
  near(calc().impactoTotal, (23*31.34-22*30)*20);
  input('0'); assert.equal(calc().novoValorUnitario, 0); assert.equal(calc().reajusteAlterado, true);
  input('29'); assert.equal(calc().impactoReajuste, -440);
  for (const value of ['-1', 'abc', 'Infinity']) { input(value); assert.equal(calc().valorInvalido, true); }
  events.length = 0; writes.length = 0;
  await context.salvarItensEventosContrato(); assert.equal(writes.length, 0);
  input('31.34'); item.qtde = 0;
  await context.salvarItensEventosContrato();
  assert.equal(events[0].valor_impacto, 0);
  assert.equal(writes[0].data.valor_contratado, 31.34);
  events.length = 0; writes.length = 0;
  input('', '4.46'); await context.salvarItensEventosContrato();
  assert.equal(events.length, 0); assert.equal(writes.length, 0);
  item.qtde = 22; input('31.34');
  context._ctPeriodicidade = () => 'TRIMESTRAL';
  await context.salvarItensEventosContrato();
  assert.equal(writes.at(-1).data.valor_periodico_num, 789.48);
  assert.equal('valor_mensal_num' in writes.at(-1).data, false);
  context._ctPeriodicidade = () => null; writes.length = 0;
  await context.salvarItensEventosContrato();
  assert.equal('valor_periodico_num' in writes.at(-1).data, false);
  context._ctPeriodicidade = () => 'MENSAL';
  readError = new Error('Falha na leitura'); writes.length = 0;
  await context.salvarItensEventosContrato();
  assert.equal(writes.some(w => w.table === 'contratos'), false);
  assert.match(elements['cie-msg'].textContent, /Falha na leitura/);
  readError = null; contractError = new Error('Falha no contrato');
  await context.salvarItensEventosContrato();
  assert.match(elements['cie-msg'].textContent, /Falha no contrato/);
  contractError = null; savedItems = [{ qtde: 1, valor_contratado: 0, valor_estimado: 100 }];
  await context.salvarItensEventosContrato();
  assert.equal(writes.at(-1).data.valor_mensal_num, 0);
  console.log('Reajuste por valor unitário: cálculos e salvamento verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
