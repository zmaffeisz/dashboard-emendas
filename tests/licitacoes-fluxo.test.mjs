import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { derivarSituacaoAquisicao, carregarSituacoesAquisicoes } from '../js/modules/licitacoes/licitacoes-fluxo.js';

const origem = fs.readFileSync('js/legacy/50-cadastros-planilhas-chamados.js', 'utf8');
const ctx = vm.createContext({ Map, Set });
vm.runInContext(origem.slice(origem.indexOf('function _flowStatusLicitacaoFromFlow('), origem.indexOf('function _expandirLinhaEmendaPorUnidades(')), ctx);
const status = ctx._flowStatusFromFlow;
const item = { id: 'i1', processo_id: 313, qtde: 1, contrato_id: 424, status_lic_id: null };
const af = { id: 'e1', item_id: 'i1', qtde_autorizada: 1, af_data: '2026-07-30', status: 'af_emitida' };
const recebido = { ...af, qtde_recebida: 1, data_recebimento: '2026-08-03', status: 'recebido' };
const entregue = { ...recebido, data_entrega_unidade: '2026-08-05' };
const derivar = (entregas, it = item, empenhos = []) => derivarSituacaoAquisicao(it, entregas, empenhos, status);
for (const [entregas, esperado] of [
  [[], 'CONTRATADO - AGUARDANDO EMPENHO/AF'],
  [[af], 'AF EMITIDA - AGUARDANDO ENTREGA/CONFIRMACAO'],
  [[recebido], 'RECEBIDO - AGUARDANDO CONFIRMACAO NA UNIDADE'],
  [[entregue], 'ADQUIRIDO/ENTREGUE NA UNIDADE']
]) assert.equal(derivar(entregas).nome, esperado);
assert.equal(derivar([], item, [{ empenhos: { numero: '123' } }]).nome, 'AGUARDANDO AF');
assert.equal(derivar([af], { ...item, qtde: 2 }).nome, 'AF PARCIAL - SALDO AGUARDANDO AF');
assert.equal(derivar([recebido], { ...item, qtde: 2 }).nome, 'RECEBIDO PARCIAL - AGUARDANDO CONFIRMACAO NA UNIDADE');
assert.equal(derivar([entregue], { ...item, qtde: 2 }).nome, 'ENTREGA PARCIAL CONFIRMADA NA UNIDADE');
assert.equal(derivar([recebido]).desde, '2026-08-03');
assert.equal(derivar([entregue]).desde, '2026-08-05');
assert.equal(derivar([]).desde, null, 'Não inventa data de contratação.');
assert.equal(derivar([{ ...entregue, status: 'cancelada' }]).nome, 'CONTRATADO - AGUARDANDO EMPENHO/AF');
assert.equal(derivar([], { ...item, contrato_id: null }), null, 'Preserva a situação manual sem execução.');
assert.equal(derivar([{ ...recebido, tipo_material: 'CONSUMO' }]).nome, 'RECEBIDO NO ALMOXARIFADO - CONSUMO');
assert.equal(derivar([{ ...entregue, tipo_material: 'CONSUMO' }]).desde, '2026-08-03');

const chamadas = [];
function cliente(rows, erro = null) {
  return { from(tabela) {
    let ids;
    return { select() { return this; }, in(campo, valores) { ids = valores; return this; }, order() { return this; },
      async range(de, ate) {
        chamadas.push({ tabela, ids, de, ate });
        return { data: (rows[tabela] || []).filter(r => ids.includes(r.item_id)).slice(de, ate + 1), error: erro };
      }
    };
  } };
}
const paginadas = Array.from({ length: 1001 }, (_, i) => ({ ...recebido, id: String(i), qtde_autorizada: 1, qtde_recebida: 1 }));
const itens = [{ ...item, qtde: 1001 }, { id: 'servico', processo_id: 314, contrato_id: 5 }, { id: 'ata', processo_id: 315, contrato_id: 6 }];
const processos = [{ id: 313, natureza: 'AQUISIÇÃO' }, { id: 314, natureza: 'SERVIÇO' }, { id: 315, natureza: 'ATA DE RP' }];
await carregarSituacoesAquisicoes(cliente({ itens_entregas: paginadas }), itens, processos, status);
assert.equal(itens[0]._situacaoFluxo.nome, 'RECEBIDO - AGUARDANDO CONFIRMACAO NA UNIDADE');
assert(chamadas.some(c => c.tabela === 'itens_entregas' && c.de === 1000));
assert(chamadas.every(c => !c.ids.includes('servico') && !c.ids.includes('ata')));
assert.equal(itens[1]._situacaoFluxo, undefined, 'Não reutiliza o fluxo de aquisição para serviços.');
await assert.rejects(carregarSituacoesAquisicoes(cliente({}, new Error('leitura indisponível')), [{ ...item }], processos, status), /leitura indisponível/);

const elementos = {};
const arquivos = [];
Object.assign(ctx, {
  document: { getElementById: id => elementos[id] || null }, window: {},
  _sanEsc: s => String(s ?? ''), ensureLib: async () => {},
  _procServicoPeriodicoItens: () => [],
  XLSX: { utils: { book_new: () => [], aoa_to_sheet: rows => ({ rows }), encode_col: n => String(n), book_append_sheet: (wb, ws) => wb.push(ws) }, writeFile: wb => arquivos.push(wb) }
});
vm.runInContext(fs.readFileSync('js/legacy/30-usuarios-licitacoes.js', 'utf8'), ctx);
ctx.itemRecebido = { ...item, descricao: 'Bisturi Elétrico', status_lic_texto: 'Situação antiga', status_lic_desde: '2026-07-01', _situacaoFluxo: derivar([recebido]) };
ctx.itemManual = { id: 'i2', processo_id: 313, status_lic_texto: 'AGUARDANDO ENTREGA DOS ITENS', status_lic_secretaria_id: 30 };
vm.runInContext(`_cpSecretariaById={30:{sigla:'SES'}}; _cpItens=[itemRecebido,itemManual]; _licitacoesCache=[{id:313,identificador:'Novo PAC'}];`, ctx);
assert.equal(ctx._cpSituacao(ctx.itemRecebido).nome, derivar([recebido]).nome);
assert.equal(ctx._cpRollup([ctx.itemRecebido, ctx.itemManual]).nome, 'Vários');
assert.equal(ctx._licItemExecutado(ctx.itemRecebido), false, 'Etapa operacional não oculta item de processo misto.');
assert.equal(ctx._licExcelData('2026-08-03'), '03/08/2026');
assert(!ctx._cpSituacaoResumoHtml(ctx.itemRecebido).includes('Situação antiga'));
assert.equal(ctx._licProcessosVisiveis().length, 1);
await ctx.exportarLicitacoesExcel();
const [cabecalho, linha] = arquivos[0][0].rows;
assert.equal(linha[cabecalho.indexOf('SITUAÇÃO DETALHADA')], derivar([recebido]).nome);
assert.equal(linha[cabecalho.indexOf('SITUAÇÃO DESDE')], '03/08/2026');
assert.equal(linha[cabecalho.indexOf('JÁ GEROU CONTRATO')], 'Sim');
await ctx.exportarLicitacoesProcessosExcel();
assert(arquivos[1][0].rows[1][7].includes('RECEBIDO - AGUARDANDO CONFIRMACAO NA UNIDADE'));
vm.runInContext('_cpItens=[itemRecebido]', ctx);
assert.equal(ctx._licProcessosVisiveis().length, 0, 'Preserva ocultação padrão dos processos totalmente contratados.');
elementos['lic-f-contratados'] = { checked: true };
assert.equal(ctx._licProcessosVisiveis().length, 1);
vm.runInContext("_licOcorrenciasByItem={i1:{tipo:'FRACASSADO'}}", ctx);
assert.equal(ctx._cpSituacao(ctx.itemRecebido).nome, 'FRACASSADO', 'Ocorrência prevalece.');
console.log('PASSOU: etapas compartilhadas com Emendas, parciais, canceladas, consumo, paginação, filtros, resumo, datas e ambas as exportações.');
