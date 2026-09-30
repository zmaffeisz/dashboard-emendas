const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/legacy/40-itens-entregas.js', 'utf8');
function trecho(inicio, fim) {
  const pos = source.indexOf(inicio);
  assert(pos >= 0 && source.indexOf(fim, pos) > pos);
  return source.slice(pos, source.indexOf(fim, pos));
}

async function carregar(tabelas, erroUnidades = false) {
  const elementos = {
    'confirmacao-wrap': { innerHTML: '' }, 'conf-count': {},
    'conf-busca': { value: '' }, 'conf-f-status': { value: 'todos' }
  };
  const consultas = [];
  const contexto = {
    document: { getElementById: id => elementos[id] },
    userCanView: () => true, _isAdmin: () => false,
    _confLimparSelecaoInvalida: () => {}, _confAtualizarSelecaoUI: () => {},
    _confStatus: r => r.data_entrega_unidade ? 'confirmado' : 'pendente',
    _confPodeEditarRow: () => true, _confSelecionavel: () => true,
    _confKey: r => `${r.tipo}:${r.id}`, _confSelecionados: new Set(),
    _confExpandidos: new Set(),
    _confBadge: status => status, fmtDate: s => s,
    _sanEsc: s => String(s), matchBusca: (texto, busca) => texto.includes(busca),
    sb: { from(tabela) {
      const filtros = [], ordens = [];
      let intervalo;
      const query = {
        select: () => query, not: () => query,
        in: (coluna, ids) => { filtros.push(r => ids.includes(r[coluna])); return query; },
        order: (coluna, opts) => { ordens.push([coluna, opts.ascending]); return query; },
        range: (inicio, fim) => { intervalo = [inicio, fim]; return query; },
        then(resolve, reject) {
          consultas.push({ tabela, intervalo });
          if (erroUnidades && tabela === 'atas_execucao_unidades') {
            return Promise.resolve({ error: { message: 'consulta indisponível' } }).then(resolve, reject);
          }
          let data = (tabelas[tabela] || []).filter(r => filtros.every(f => f(r)));
          data.sort((a, b) => {
            for (const [coluna, asc] of ordens) {
              const diff = typeof a[coluna] === 'number'
                ? a[coluna] - b[coluna] : String(a[coluna]).localeCompare(String(b[coluna]));
              if (diff) return asc ? diff : -diff;
            }
            return 0;
          });
          if (intervalo) data = data.slice(intervalo[0], intervalo[1] + 1);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    } }
  };
  vm.createContext(contexto);
  vm.runInContext('let confirmacaoRows=[], confirmacoesCarregado=false, _confRowsVisiveis=[];\n'
    + trecho('function _toISODate(', 'function _unidadeFisicaTemId(')
    + trecho('function _chunkArray(', 'function _diasRestantes(')
    + trecho('function _confToggleDetalhes(', 'function renderConfirmacoes(')
    + trecho('async function loadConfirmacoes(', 'function abrirConfirmacaoSelecionados('), contexto);
  await contexto.loadConfirmacoes();
  return { contexto, elementos, consultas, rows: vm.runInContext('confirmacaoRows', contexto) };
}

const execucao = (id, emenda_item_id = null) => ({
  id, emenda_item_id, item: 'Bem permanente', data_af: '2026-07-02', dt_entrega: '2026-08-25', nf: 'NF 2875', qtde: 1
});

(async () => {
  const tabelas = {
    atas_execucao: [{ ...execucao('micro', 'em1'), unidade: 'Nome alterado depois', unidade_snapshot: { nome: 'Unidade na emissão', endereco: 'Endereço na emissão', coordenador: { nome: 'Coordenador na emissão' } } }, execucao('ox', 'em2'), execucao('outro', 'em2'),
      execucao('legado', 'em2'), execucao('sem-numero'),
      { ...execucao('consumo'), tipo_material: 'CONSUMO' },
      { ...execucao('pendente'), dt_entrega: null }],
    emenda_itens: [{ id: 'em1', patrimonio: null }, { id: 'em2', patrimonio: 'RESUMO ANTIGO' }],
    atas_execucao_unidades: [
      { exec_id: 'ox', patrimonio: '398265', unidade_seq: 2 },
      { exec_id: 'micro', patrimonio: '399392', unidade_seq: 1 },
      { exec_id: 'ox', patrimonio: '398264', unidade_seq: 1 },
      { exec_id: 'outro', patrimonio: ' 400000 ', unidade_seq: 1 },
      { exec_id: 'sem-numero', patrimonio: null, unidade_seq: 1 }
    ],
    itens_entregas: [{ id: 'aq', af_numero: 'AF 1', qtde_recebida: 1, nota_fiscal: '10', patrimonio: '123', itens: { unidades: { nome: 'Nome atual' } }, unidade_snapshot: { nome: 'Nome anterior' } }]
  };
  const resultado = await carregar(tabelas);
  const porId = Object.fromEntries(resultado.rows.map(r => [r.id, r]));
  assert.equal(porId.micro.patrimonio, '399392');
  assert.equal(porId.ox.patrimonio, '398264; 398265');
  assert.equal(porId.outro.patrimonio, '400000', 'Pedidos da mesma Emenda não devem misturar números.');
  assert.equal(porId.legado.patrimonio, 'RESUMO ANTIGO');
  assert.equal(porId['sem-numero'].patrimonio, '');
  assert.equal(porId.aq.patrimonio, '123');
  assert.equal(porId.aq.unidade, 'Nome anterior', 'Aquisição usa a unidade congelada, mesmo após edição do cadastro.');
  assert.equal(porId.micro.unidade, 'Unidade na emissão', 'ATA usa a unidade congelada.');
  const historicoHtml = resultado.contexto._confDetalhesHtml(porId.micro);
  assert(historicoHtml.includes('Endereço na emissão') && historicoHtml.includes('Coordenador na emissão'));
  assert(!historicoHtml.includes('Nome alterado depois'));
  assert(!porId.consumo && !porId.pendente);
  assert(resultado.elementos['confirmacao-wrap'].innerHTML.includes('Pat: 399392'));
  const chaveOx = resultado.contexto._confKey(porId.ox);
  const encodedOx = encodeURIComponent(chaveOx);
  for (const controle of ['Confirmar', 'Editar', 'Abrir', 'E-mail', 'checkbox']) {
    resultado.contexto._confAcionarLinha({ type: 'click', target: { closest: () => ({ controle }) } }, encodedOx);
    assert(!resultado.contexto._confExpandidos.has(chaveOx), `${controle} não deve expandir a linha.`);
  }
  resultado.contexto._confAcionarLinha({ type: 'click', target: { closest: () => null } }, encodedOx);
  assert(resultado.contexto._confExpandidos.has(chaveOx), 'Clicar numa célula deve expandir a linha.');
  const alvoLinha = { closest: () => null };
  let preveniuEspaco = false;
  resultado.contexto._confAcionarLinha({
    type: 'keydown', key: ' ', target: alvoLinha, currentTarget: alvoLinha,
    preventDefault: () => { preveniuEspaco = true; }
  }, encodedOx);
  assert(preveniuEspaco && !resultado.contexto._confExpandidos.has(chaveOx));
  resultado.contexto._confSelecionados.add(chaveOx);
  resultado.contexto._confToggleDetalhes(encodeURIComponent(chaveOx));
  assert(resultado.elementos['confirmacao-wrap'].innerHTML.includes('aria-expanded="true"'));
  assert(resultado.elementos['confirmacao-wrap'].innerHTML.includes('<dd>398264; 398265</dd>'));
  assert(resultado.elementos['confirmacao-wrap'].innerHTML.includes('<dd>2026-07-02</dd>'));
  resultado.contexto._confToggleDetalhes(encodeURIComponent(resultado.contexto._confKey(porId.micro)));
  assert.equal((resultado.elementos['confirmacao-wrap'].innerHTML.match(/class="conf-detalhes"/g) || []).length, 2);
  resultado.elementos['conf-busca'].value = '399392';
  resultado.contexto.renderConfirmacoes();
  assert.equal(resultado.elementos['conf-count'].textContent, '1 registro(s)');
  assert(resultado.elementos['confirmacao-wrap'].innerHTML.includes('Pat: 399392'));
  resultado.elementos['conf-busca'].value = '';
  resultado.contexto.renderConfirmacoes();
  assert.equal((resultado.elementos['confirmacao-wrap'].innerHTML.match(/class="conf-detalhes"/g) || []).length, 2);
  resultado.contexto._confToggleDetalhes(encodeURIComponent(chaveOx));
  assert(!resultado.elementos['confirmacao-wrap'].innerHTML.includes('<dd>398264; 398265</dd>'));
  assert(resultado.contexto._confSelecionados.has(chaveOx), 'Recolher não pode desmarcar a confirmação.');

  const unidades = Array.from({ length: 1001 }, (_, i) => ({
    exec_id: 'lote', patrimonio: `P${i + 1}`, unidade_seq: i + 1
  })).reverse();
  const lote = await carregar({ atas_execucao: [execucao('lote')], atas_execucao_unidades: unidades });
  assert.equal(lote.rows[0].patrimonio.split('; ').length, 1001);
  assert(lote.rows[0].patrimonio.endsWith('; P1001'));
  assert.equal(lote.consultas.filter(q => q.tabela === 'atas_execucao_unidades').length, 2);

  const falha = await carregar(tabelas, true);
  assert(falha.elementos['confirmacao-wrap'].innerHTML.includes('Erro (patrimônios das atas)'));
  assert.equal(falha.rows.length, 0);
  console.log('PASSOU: patrimônios por pedido, legados, busca, paginação, expansão/recolhimento e seleção preservada.');
})().catch(error => { console.error(error); process.exitCode = 1; });
