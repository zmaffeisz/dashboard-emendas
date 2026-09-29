import assert from 'node:assert/strict';
import { filterFinanceiroRows, summarizeFinanceiroRows, readFinanceiroTable } from '../js/modules/contratos/financeiro.workspace.js';

const base={contract:'',search:'',status:'',start:'',end:'',link:'',sort:'recentes'};
const rows=[
  {id:'1',contract:{id:10},competencia:'2026-09',status:'aprovada',linked:true,gross:100,valor_glosa:10,net:90,search:'NF 108 José compressores',sortDate:'2026-09'},
  {id:'2',contract:{id:10},competencia:'08/2026',status:'recebida',linked:false,gross:200,net:200,search:'NF 109',sortDate:'2026-08'},
  {id:'3',contract:{id:20},competencia:null,status:'cancelada',linked:false,gross:50,net:50,search:'NF 110',sortDate:'2026-07'}
];
assert.deepEqual(filterFinanceiroRows(rows,{...base,search:'jose'}).map(r=>r.id),['1']);
assert.deepEqual(filterFinanceiroRows(rows,{...base,contract:'10',start:'2026-08',end:'2026-08'}).map(r=>r.id),['2']);
assert.deepEqual(filterFinanceiroRows(rows,{...base,link:'sem'}).map(r=>r.id),['2','3']);
assert.deepEqual(filterFinanceiroRows(rows,{...base,status:'cancelada'}).map(r=>r.id),['3']);
assert.equal(filterFinanceiroRows(rows,{...base,start:'2026-10',end:'2026-08'}).length,0);
const quarter={...rows[0],competencia:'Ciclo 2 (01/07/2026 a 30/09/2026)',ciclo_inicio:'2026-07-01',ciclo_fim:'2026-09-30'};
assert.equal(filterFinanceiroRows([quarter],{...base,start:'2026-08',end:'2026-08'}).length,1);
assert.equal(filterFinanceiroRows([{...rows[0],competencia:quarter.competencia,med:quarter}],{...base,start:'2026-08',end:'2026-08'}).length,1);
assert.equal(filterFinanceiroRows([quarter],{...base,start:'2026-10'}).length,0);
assert.deepEqual(filterFinanceiroRows(rows,{...base,sort:'valor'}).map(r=>r.id),['2','1','3']);
assert.deepEqual(summarizeFinanceiroRows(rows,'notas'),{count:3,gross:350,glosa:10,valid:90,unlinked:2});
assert.equal(summarizeFinanceiroRows([
  ...rows.map(r=>({...r,status:'aprovada_pelo_fiscal'})),
  ...['rascunho','recusada','cancelada'].map(status=>({...rows[0],status}))
],'medicoes').valid,340);

const calls=[];
const records=Array.from({length:1205},(_,id)=>({id,contrato_id:10}));
const client={from(table){return {select(){return this},in(column,ids){assert.equal(column,'contrato_id');this.ids=ids;return this},order(){return this},async range(start,end){calls.push([table,start,end]);return {data:records.filter(r=>this.ids.includes(r.contrato_id)).slice(start,end+1)};}};}};
assert.equal((await readFinanceiroTable(client,'notas_fiscais','*',[10])).length,1205);
assert.deepEqual(calls.map(c=>c[1]),[0,500,1000]);
assert.deepEqual(await readFinanceiroTable(client,'notas_fiscais','*',[]),[]);
const failing={from(){return {select(){return this},in(){return this},order(){return this},range(){return Promise.resolve({error:{message:'consulta indisponível'}})}}}};
await assert.rejects(()=>readFinanceiroTable(failing,'notas_fiscais','*',[10]),/consulta indisponível/);
console.log('PASSOU: filtros combinados, competências ausentes, somas sem duplicidade e consulta paginada.');
