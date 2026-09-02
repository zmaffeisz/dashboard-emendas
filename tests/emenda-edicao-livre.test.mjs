import assert from 'node:assert/strict';
import {prepararAlteracoes} from '../js/modules/emendas/emendas-edicao.js';
const livre={id:'livre',versao:'v1',item:'Monitor',qtde:2,valor:500,bloqueio:null};
const preso={...livre,id:'preso',bloqueio:'Execução de ata vinculada'};
assert.deepEqual(prepararAlteracoes([livre],[livre]),[]);
assert.equal(prepararAlteracoes([livre],[{...livre,qtde:'3',valor:'600.5'}])[0].valor,600.5);
assert.equal(prepararAlteracoes([livre],[{...livre,excluir:true}])[0].excluir,true);
assert.deepEqual(prepararAlteracoes([preso],[preso]),[]);
const espacos={...preso,item:' Monitor '};
assert.deepEqual(prepararAlteracoes([espacos],[espacos]),[],'Espaços legados não tornam um item bloqueado alterado.');
assert.throws(()=>prepararAlteracoes([preso],[{...preso,excluir:true}]),/vinculado/);
assert.throws(()=>prepararAlteracoes([preso],[{...preso,qtde:3}]),/vinculado/);
for(const change of [{qtde:0},{qtde:-1},{valor:NaN},{valor:Infinity},{item:''},{valor:0}]){
  assert.throws(()=>prepararAlteracoes([livre],[{...livre,...change}]),/Confira/);
}
assert.throws(()=>prepararAlteracoes([livre],[{...livre,id:'outro'}]),/inválido/);
assert.throws(()=>prepararAlteracoes([livre],[livre,livre]),/repetido/);
console.log('PASSOU: edições/exclusões livres, valores, campos inalterados e bloqueio de vinculados.');
