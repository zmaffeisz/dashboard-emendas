import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyDeliveryTracking, canTrackDelivery, deliveryReference, createDeliveryTracking } from '../js/modules/execucao/entregas-situacoes.js';
const rows = [
  { tipo: 'Aquisição', entrega_id: '1', item_id: 'origem', status: 'atrasado', limiteISO: '2026-01-01', saldo_af: 2 },
  { tipo: 'ATA', exec_id: '2', status: 'atrasado' },
  { tipo: 'Serviço', item_id: '3', status: 'no prazo' },
  { tipo: 'Aquisição', entrega_id: '4', recebido: true, saldo_af: 0, status: 'recebido' },
  { tipo: 'Aquisição', entrega_id: '5', recebido: true, saldo_af: 1, status: 'recebido' },
  { tipo: 'ATA', exec_id: '6', cancelado: true, status: 'cancelado' }
];
const event = (target, situacao, n, descricao = '') => ({ ...target, situacao, descricao, id: String(n), registrado_em: '2026-11-26T10:00:0' + n + 'Z' });
const events = [event({ item_entrega_id: '1' }, 'pendente', 2, '<peças> & instalação'), event({ item_entrega_id: '1' }, 'sem_prazo', 1), event({ ata_execucao_id: '2' }, 'sem_prazo', 1), event({ item_id: '3' }, 'pendente', 1, 'Aguarda ajuste'), event({ item_entrega_id: '4' }, 'pendente', 1, 'Antigo'), event({ item_entrega_id: '5' }, 'pendente', 1, 'Saldo faltante'), event({ ata_execucao_id: '6' }, 'pendente', 1, 'Antigo')];
const decorated = applyDeliveryTracking(rows, events);
assert.deepEqual(decorated.map(r => r.status), ['pendente', 'sem prazo', 'pendente', 'recebido', 'pendente', 'cancelado']);
assert.equal(decorated[0].limiteISO, rows[0].limiteISO);
assert.equal(decorated[0].statusAutomatico, 'atrasado');
assert.deepEqual(deliveryReference(rows[0]), { item_entrega_id: '1' }, 'AF não compartilha situação com outras AFs do mesmo item');
assert(!canTrackDelivery(rows[3])); assert(canTrackDelivery(rows[4])); assert(!canTrackDelivery(rows[5]));
assert.equal(applyDeliveryTracking(decorated, [...events, event({ item_entrega_id: '1' }, 'automatico', 3)])[0].status, 'atrasado');

// Modal real: razão obrigatória, lote atômico, prevenção de clique duplo e
// repetição com a mesma chave após resposta perdida, inclusive falha ao recarregar.
const fields = new Map();
globalThis.document = { getElementById(id) { if (!fields.has(id)) fields.set(id, { value: '', textContent: '', focus() {}, classList: { add() {}, remove() {} } }); return fields.get(id); } };
globalThis.crypto ??= webcrypto;
const field = id => document.getElementById('ces-' + id);
let writable = true, reloads = 0, fail = true, reloadFail = false, gate, resolveGate;
const calls = [];
const controller = createDeliveryTracking({
  rows: () => decorated, canEdit: () => writable, notify() {}, reload: async () => { reloads++; if (reloadFail) throw new Error('falha de leitura'); },
  sb: { rpc: async (name, args) => { calls.push({ name, args }); if (gate) await gate; return fail ? { error: new Error('falha de rede') } : { data: args.p_alvos.length }; } }
});
controller.open(['a1', 't2'], 'pendente');
await controller.save(); assert.equal(calls.length, 0); assert.match(field('msg').textContent, /Descreva/);
field('descricao').value = 'Faltam peças';
await controller.save(); assert.equal(calls.length, 1); assert.equal(reloads, 0);
assert.equal(calls[0].name, 'registrar_situacao_entregas');
assert.deepEqual(calls[0].args.p_alvos, [{ item_entrega_id: '1' }, { ata_execucao_id: '2' }]);
fail = false; reloadFail = true;
await controller.save(); assert.equal(calls[1].args.p_requisicao, calls[0].args.p_requisicao); assert.match(field('msg').textContent, /Situação salva/);
reloadFail = false; gate = new Promise(resolve => { resolveGate = resolve; });
const pending = controller.save(); await controller.save();
assert.equal(calls.length, 3, 'Clique repetido não gera outra requisição'); resolveGate(); await pending;
assert.equal(calls[2].args.p_requisicao, calls[0].args.p_requisicao);
writable = false; controller.open(['a1'], 'sem_prazo'); await controller.save(); assert.equal(calls.length, 3);

// A renderização usa o mesmo status para etiqueta e filtro, escapando a descrição.
const source = readFileSync(new URL('../js/legacy/40-itens-entregas.js', import.meta.url), 'utf8');
const context = vm.createContext({
  document: { getElementById: id => ({ value: id === 'entregas-f-prazo' ? 'pendente' : '' }) },
  entregasRows: decorated, _diasRestantes: () => -20,
  _sanEsc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
});
for (const name of ['_prazoBadge', '_ceSituacaoElegivel', '_ceSituacaoStatusHtml']) vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0], context);
assert.match(context._ceSituacaoStatusHtml(decorated[0]), /&lt;peças&gt; &amp; instalação/);
assert.doesNotMatch(context._ceSituacaoStatusHtml(decorated[0]), /atrasado/);
assert.match(context._prazoBadge('pendente'), /#7C3AED/);
assert.match(context._prazoBadge('sem prazo'), /#0E7490/);
console.log('PASSOU: pendente/sem prazo, histórico, parcial/concluído, retorno automático, lote, idempotência, erro, clique duplo, permissões e escape.');
