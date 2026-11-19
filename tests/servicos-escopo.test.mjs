import assert from 'node:assert/strict';
import { createServicosEscopo, resumoEscopo } from '../js/modules/execucao/servicos-escopo.js';

const item = { id: 'item-1', contrato_id: 1, origem: 'servico', descricao: 'Reforma <teste>', qtde: 1, valor_contratado: 1000,
  contratos: { id: 1, recebimento_escopo: 'parcial', numero_contrato: '1/2026', prestador: 'Empresa' },
  processos: { tipo_servico: 'Serviço por escopo fechado', identificador: 'SEI teste' } };
const meds = [
  { escopo_item_id: item.id, status: 'aprovada_pelo_fiscal', valor_bruto: 400, valor_liquido: 380 },
  { escopo_item_id: item.id, status: 'cancelada', valor_bruto: 600, valor_liquido: 600, escopo_conclusao: true },
  { escopo_item_id: 'outro', status: 'aprovada_pelo_fiscal', valor_bruto: 999, valor_liquido: 999 }
];
assert.deepEqual(resumoEscopo(item, meds), { total: 1000, bruto: 400, liquido: 380, saldo: 600, concluido: false, medicoes: [meds[0]] });
assert.equal(resumoEscopo(item, [...meds, { escopo_item_id: item.id, status: 'aprovada_com_glosa', valor_bruto: 600, valor_liquido: 580, escopo_conclusao: true }]).concluido, true);

const elements = new Map(), listeners = new Map();
function element() {
  return { value: '', checked: false, textContent: '', innerHTML: '', classList: { add() {}, remove() {} },
    setAttribute() {}, addEventListener(type, fn) { this[type] = fn; } };
}
globalThis.document = {
  addEventListener(type, fn) { listeners.set(type, fn); },
  createElement: element,
  body: { append(el) { elements.set(el.id, el); } },
  getElementById(id) { return elements.get(id) || null; }
};
for (const key of ['nf','empenho','data','periodo-inicio','periodo-fim','fiscal','descricao','glosa','motivo-glosa','conclusao','justificativa','msg']) elements.set('se-' + key, element());
const records = { itens: [item], contratos_medicoes: [], notas_fiscais: [{ id: 'nf-1', status: 'recebida', valor_total: 400 }], empenho_itens: [] };
function query(table) {
  const q = { select() { return q; }, eq() { return q; }, not() { return q; }, in() { return q; }, order() { return q; }, range() { return q; },
    single() { q.one = true; return q; },
    then(resolve, reject) { return Promise.resolve({ data: q.one ? records[table][0] : records[table], error: null }).then(resolve, reject); } };
  return q;
}
let rpcCalls = [], refreshes = 0, rejectNext = true, gate;
const context = { sb: { from: query, async rpc(name, args) {
  rpcCalls.push({ name, ...args });
  if (gate) await gate;
  if (rejectNext) { rejectNext = false; return { error: new Error('Resposta de rede perdida') }; }
  return { data: { id: args.p_dados.id } };
} }, esc: value => String(value ?? '').replaceAll('<', '&lt;'), money: n => String(n), today: () => '2026-11-18',
  prazo: () => 'sem prazo', canEdit: () => true, refresh: async () => { refreshes++; }, notify() {}, reason: async () => 'Teste de correção', pdf() {} };
const app = createServicosEscopo(context);
const rows = await app.load();
assert.equal(rows.length, 1);
const rendered = app.renderRow(rows[0]);
assert.equal((rendered.match(/<td /g) || []).length, 15);
assert.match(rendered, /Reforma &lt;teste>/);
assert.doesNotMatch(rendered, /patrim|numero_serie|Emitir AF|checkbox/);
await app.open(item.id);
const root = elements.get('modal-servico-escopo');
assert.match(root.innerHTML, /Período executado/);
assert.doesNotMatch(root.innerHTML, /Patrimônio|Número de série|tipo_material/);
elements.get('se-nf').value = 'nf-1';
elements.get('se-descricao').value = 'Primeira etapa';
const button = { dataset: { escopoAction: 'receive' }, disabled: false };
const event = { target: { closest: () => button } };
await root.click(event);
assert.match(elements.get('se-msg').textContent, /rede perdida/);
const originalId = rpcCalls[0].p_dados.id;
let release;
gate = new Promise(resolve => { release = resolve; });
const saving = root.click(event);
await root.click(event);
assert.equal(rpcCalls.length, 2, 'Clique simultâneo não pode gerar outra chamada');
release();
await saving;
assert.equal(rpcCalls[1].p_dados.id, originalId, 'Reenvio após erro conserva o identificador idempotente');
assert.equal(refreshes, 1);
context.canEdit = () => false;
const readonly = createServicosEscopo({ ...context, canEdit: () => false });
await readonly.open(item.id);
assert.doesNotMatch(root.innerHTML, /data-escopo-action="receive"/);
console.log('PASSOU: saldos e conclusão, canceladas, tela sem bens físicos, escape, permissão, clique duplo e repetição após erro.');
