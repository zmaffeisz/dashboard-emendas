const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/legacy/40-itens-entregas.js', 'utf8');
const inicio = source.indexOf('}).sort((a,b)=>{', source.indexOf('function renderItensEntregas()'));
const fim = source.indexOf('\n  });', inicio);
assert(inicio >= 0 && fim > inicio, 'Ordenação do Controle de Entregas não encontrada.');
const comparar = vm.runInNewContext(source.slice(inicio + '}).sort('.length, fim) + '\n}', {
  _diasRestantes: valor => valor ?? null
});
const rows = [
  { id: 'atraso4', status: 'atrasado', limiteISO: -4 },
  { id: 'noPrazo', status: 'no prazo', limiteISO: 10 },
  { id: 'afAta', tipo: 'ATA', status: 'aguardando AF' },
  { id: 'atraso30', status: 'atrasado', limiteISO: -30 },
  { id: 'hoje', status: 'vence hoje', limiteISO: 0 },
  { id: 'afAquisicao', tipo: 'Aquisição', status: 'aguardando AF' },
  { id: 'semPrazo', status: 'sem prazo' },
  { id: 'recebido', status: 'recebido' },
  { id: 'cancelado', status: 'cancelado' }
];
assert.deepEqual(rows.sort(comparar).map(r => r.id), [
  'afAta', 'afAquisicao', 'atraso30', 'atraso4', 'hoje', 'noPrazo', 'semPrazo', 'recebido', 'cancelado'
]);
console.log('PASSOU: aguardando AF primeiro para ATA e aquisição; demais grupos e maior atraso preservados.');
