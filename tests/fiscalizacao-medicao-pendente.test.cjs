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

assert.equal(context._fiscSituacaoPermiteMedicao('pendente'), true);
assert.equal(context._fiscSituacaoPermiteMedicao('conforme'), true);
assert.equal(context._fiscSituacaoPermiteMedicao('conforme_ressalva'), true);
assert.equal(context._fiscSituacaoPermiteMedicao('parcial'), true);
assert.equal(context._fiscSituacaoPermiteMedicao('nao_conforme'), false);
assert.equal(context._fiscSituacaoPermiteMedicao('nao_fiscalizado'), false);

vm.runInContext(`
  podeEditar=()=>true;
  fiscalizacaoFiltrados=[{
    protocolo:'SES-TABELA',
    empresa:'Empresa Técnica Ltda.',
    cpl_contrato:'327/2024',
    situacao_os:'nao_fiscalizado',
    _chamado:{
      carimbo:'10/08/2026, 10:00:00',
      unidade:'UBS Teste',
      equipamento:'Compressor',
      descricao:'Compressor sem energia e sem funcionamento.'
    }
  }];
  _renderFiscalizacao();
`, context);
assert.match(elements.get('fisc-body').innerHTML, /Empresa Técnica Ltda\./);
assert.match(elements.get('fisc-body').innerHTML, /Compressor sem energia e sem funcionamento\./);

vm.runInContext(`
  _fiscAtual='SES-TESTE';
  fiscalizacaoRows=[{
    protocolo:'SES-TESTE',
    situacao_os:'pendente',
    medicao_id:'medicao-1',
    nota_fiscal_id:'nf-1',
    termo_ateste_id:'termo-1'
  }];
  filtrarFiscalizacao=()=>{};
  atualizarBadgeFisc=()=>{};
  showMsg=()=>{};
`, context);

(async () => {
  await context.salvarFiscalizacaoOS();
  const row = JSON.parse(vm.runInContext('JSON.stringify(fiscalizacaoRows[0])', context));

  assert.equal(rpcCall.name, 'registrar_fiscalizacao_os');
  assert.equal(rpcCall.payload.p_situacao, 'conforme');
  assert.equal(row.situacao_os, 'conforme');
  assert.equal(row.medicao_id, 'medicao-1');
  assert.equal(row.nota_fiscal_id, 'nf-1');
  assert.equal(row.termo_ateste_id, 'termo-1');
  console.log('Fiscalização pendente: regras verificadas.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
