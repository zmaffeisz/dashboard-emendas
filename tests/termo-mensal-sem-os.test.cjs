const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
const element = (id, value = '') => {
  const item = {
    id,
    value,
    disabled: false,
    textContent: '',
    className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
  };
  elements.set(id, item);
  return item;
};

element('mfo-situacao', 'conforme');
element('mfo-data-atendimento', '2026-08-10');
element('mfo-servico', 'Pendência sanada pela empresa');
element('mfo-ocorrencias', 'Regularização conferida');
element('modal-fisc-os');
element('fm-total');
element('fm-nao');
element('fm-pend');
element('fm-conf');
element('fisc-count');
element('fisc-body');
const saveButton = element('save-button');

let rpcCall = null;
const document = {
  addEventListener() {},
  getElementById(id) { return elements.get(id) || null; },
  querySelector(selector) {
    return selector === '#modal-fisc-os .btn-primary' ? saveButton : null;
  },
  querySelectorAll() { return []; },
  documentElement: { style: { setProperty() {} } },
};
const window = {
  addEventListener() {},
  location: { hash: '' },
};
class MutationObserver {
  observe() {}
  disconnect() {}
}
const context = vm.createContext({
  document,
  window,
  location: window.location,
  MutationObserver,
  console,
  setTimeout() {},
  clearTimeout() {},
  setHeaderH() {},
  _sanEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  },
  currentProfile: { nome: 'Fiscal de teste' },
  sb: {
    rpc: async (name, payload) => {
      rpcCall = { name, payload };
      return { error: null };
    },
  },
});

const source = fs.readFileSync('js/legacy/70-fiscalizacao-sancoes-contratos.js', 'utf8');
vm.runInContext(source, context, { filename: '70-fiscalizacao-sancoes-contratos.js' });


let html = '';
let alertas = [];
let consulta = {data: [], error: null};
context.alert = message => alertas.push(message);
context.fmtFull = value => String(value);
context.fmtDate = value => value;
context.window.open = () => ({document: {write(value) {html = value;}, close() {}}});
context.sb.from = table => {
  assert.equal(table, 'chamados_controle');
  return {select: () => ({eq: async (column, id) => {
    assert.equal(column, 'medicao_id');
    assert.equal(id, 'med-1');
    return consulta;
  }})};
};
vm.runInContext(`
  _ctAtual={id:'contrato-1',modelo_execucao:'continuo_mensal_fixo',cpl:'123',prestador:'Empresa'};
  _ctMedicoesAtual=[{id:'med-1',competencia:'2026-08',valor_liquido:2080,fiscal_responsavel:'Fiscal',data_medicao:'2026-08-31'}];
  _ctNotasAtual=[{medicao_id:'med-1',numero:'NF-123'}];
  _ctTermosAtual=[];
  fiscalizacaoRows=[];
`, context);
(async () => {
  assert.equal(context._fiscMesTermo('08/2026'), 'agosto de 2026');
  assert.equal(context._fiscMesTermo('2026-08-01'), 'agosto de 2026');
  assert.equal(context._ctPermiteTermoMensalSemOS({modelo_execucao:'continuo_mensal_fixo'}), true);
  assert.equal(context._ctPermiteTermoMensalSemOS({modelo_contrato:'servico_demanda'}), false);
  assert.equal(context._ctPermiteTermoMensalSemOS({periodicidade_pagamento:'TRIMESTRAL'}), false);
  await context.baixarTermoAtesteMedicao('med-1');
  assert.match(html, /Não houve ordens de serviço de manutenção corretiva/);
  assert.match(html, /agosto de 2026/);
  assert.match(html, /NF-123/);
  assert.match(html, /2080/);
  assert.doesNotMatch(html, /<table>|medicao-med-1|ordens de servico listadas acima/);
  consulta={data:[{protocolo:'OS-456',situacao_os:'conforme',servico_realizado:'Reparo'}],error:null};
  await context.baixarTermoAtesteMedicao('med-1');
  assert.match(html, /OS-456/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /Não houve ordens/);
  html='';
  consulta={data:null,error:{message:'Falha de rede'}};
  await context.baixarTermoAtesteMedicao('med-1');
  assert.equal(html, '');
  assert.equal(alertas.length, 1);
  vm.runInContext(`
    _ctAtual.periodicidade_pagamento='TRIMESTRAL';
    _ctMedicoesAtual[0].data_execucao_preventiva='2026-08-20';
    _ctMedicoesAtual[0].relatorio_servico_referencia='REL-1';
    _ctTermosAtual=[{medicao_id:'med-1',protocolos:[]}];
  `, context);
  await context.baixarTermoAtesteMedicao('med-1');
  assert.match(html, /REL-1/);
  assert.doesNotMatch(html, /Não houve ordens/);
  console.log('Termo mensal: sem OS, com OS, erro de consulta e trimestral validados.');
})().catch(error => {console.error(error);process.exitCode=1;});
