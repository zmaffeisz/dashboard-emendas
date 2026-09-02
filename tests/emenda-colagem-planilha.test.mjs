import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { prepararItensEmenda, COLUNAS_EMENDA } from '../js/modules/emendas/emendas-planilha.js';
const unidades=[{id:1,nome:'UBS São Bento'},{id:2,nome:'UBS Aparecidinha'}];
const status=['EM LICITAÇÃO','AGUARDANDO RESERVA'];
const preparar=rows=>prepararItensEmenda(rows,unidades,status);
const linha=['Monitor','R$ 2.400,50','em licitacao','ubs sao bento','2'];
let r=preparar([COLUNAS_EMENDA,linha,['Monitor','2400,50','EM LICITAÇÃO','UBS Aparecidinha','3'],linha]);
assert.equal(r.erros.length,0);
assert.equal(r.itens.length,1);
assert.equal(r.itens[0].valorUnitario,2400.5);
assert.equal(r.itens[0].status,'EM LICITAÇÃO');
assert.deepEqual(r.itens[0].unidades.map(u=>u.qtde),[4,3]);
assert.equal(r.itens[0].unidades.reduce((s,u)=>s+u.qtde*r.itens[0].valorUnitario,0),16803.5);
assert.equal(preparar([['Monitor','1.000','','UBS São Bento','1']]).itens[0].valorUnitario,1000);
assert.equal(preparar([['Monitor','1200.50','','UBS São Bento','1']]).itens[0].valorUnitario,1200.5);
assert.equal(preparar([['Monitor','1200','','UBS São Bento','0,5']]).itens[0].unidades[0].qtde,0.5);
for(const valor of ['0','-1','abc','1x2','1.2.3','Infinity','']){
  const invalida=[...linha]; invalida[1]=valor;
  assert(preparar([linha,invalida]).erros.length>0,valor);
  assert.equal(preparar([linha,invalida]).itens.length,0,'Nenhuma importação parcial em caso de erro.');
}
for(const [coluna,valor] of [[0,''],[2,'STATUS INEXISTENTE'],[3,'UBS inexistente'],[4,'0'],[4,'-2']]){
  const invalida=[...linha]; invalida[coluna]=valor;
  assert(preparar([invalida]).erros.length>0);
}
assert(preparar([linha.slice(0,4)]).erros.length>0);
assert(preparar([[...linha,'coluna extra']]).erros.length>0);
assert.equal(preparar([[...linha,'',''],['','','','','']]).itens.length,1);
assert(preparar([COLUNAS_EMENDA]).erros.length>0);
assert.equal(preparar([linha,['Monitor','50','','UBS São Bento','1']]).itens.length,2);
assert.equal(prepararItensEmenda([linha],[...unidades,{id:3,nome:'UBS São Bento'}],status).itens.length,0,'Não escolhe unidade ambígua.');
const source=fs.readFileSync('js/legacy/30-usuarios-licitacoes.js','utf8');
const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function _procLerTabelaColada('),source.indexOf('function _procLerClipboardPlanilha(')),ctx);
const tsv='"Monitor\nportátil"\t2.400,50\t\tUBS São Bento\t2\r\n';
r=preparar(ctx._procLerTabelaColada(tsv));
assert.equal(r.itens[0].descricao,'Monitor\nportátil');
assert.equal(r.itens[0].status,'');
console.log('PASSOU: colunas, moeda brasileira, agrupamento, totais, opcionais, validação integral e TSV com aspas/quebras.');
