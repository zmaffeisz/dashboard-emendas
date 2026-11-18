const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/legacy/30-usuarios-licitacoes.js','utf8');
function scenario(){
  const elements={};const btn={disabled:false};
  const get=id=>elements[id]||(elements[id]={value:'',style:{},dataset:{},classList:{remove(){}}});
  const calls={processInserts:0,processUpdates:0,itemInserts:0,rpc:0,categories:0,resources:0};
  const messages=[];let cards=[],itemSeq=0,failItems=false,failRpcAt=0;
  function card(n){
    const controls={};const values={'.pi-desc':'Obra '+n,'.pi-siam':'','.pi-unidade-medida':'SERVIÇO','.pi-qtde':'1','.pi-valor':'1000','.pi-prazo':'','.pi-unidade':'10','.pi-fonte':'emenda'};
    const rows=[{dataset:{}}];
    return {dataset:{emendaId:'emenda'+n,emendaItemId:'previsto'+n},rows,
      querySelector(s){return controls[s]||(controls[s]={value:values[s]||'',style:{}});},querySelectorAll(){return rows;}};
  }
  const ctx=vm.createContext({document:{getElementById:get,querySelector:()=>btn,querySelectorAll:()=>cards},window:{},console,setTimeout:()=>{},
    _secoesOrganizacionais:[{id:4,sigla:'SMCP'}],
    sb:{from(table){
      if(table==='processos')return {
        insert(){calls.processInserts++;return {select(){return this;},async single(){return {data:{id:900}};}};},
        update(){calls.processUpdates++;return {eq(){return this;},select(){return this;},async single(){return {data:{id:900}};}};}
      };
      if(table==='itens')return {
        async insert(rows){if(failItems)return {error:new Error('Falha de gravação dos itens')};calls.itemInserts+=rows.length;return {};},
        update(){return {async eq(){return {};}};},
        delete(){return {in(){return this;},async is(){return {};}};}
      };
      throw new Error('Tabela inesperada: '+table);
    },async rpc(name,args){
      calls.rpc++;if(calls.rpc===failRpcAt)return {error:new Error('Falha temporária no rateio')};
      const data=args.p_recursos.map(r=>{if(!r.id)calls.resources++;return {...r,id:r.id||'recurso'+calls.resources,status:'ATIVO'};});
      return {data};
    }}
  });
  vm.runInContext(source,ctx);
  Object.assign(ctx,{
    _procLerServicoMensal:()=>({}),_procLinkPublicoSeguro:s=>s,
    _procValidarItensLocacao:()=>'',_procValidarPrazosEntrega:()=>'',
    _resolverCategoriaProcesso:async()=>{calls.categories++;return 21;},
    _procCodigoSiam:()=>null,_procCodigoSiamValido:()=>true,
    _procUnidadeMedidaValor:v=>v,_procRegistrarUnidadeMedida:()=>{},
    _procUuid:()=> 'novo'+(++itemSeq),
    _procLerRecursosCard:c=>[{id:c.rows[0].dataset.recursoId||null,fonte_tipo:'emenda',fonte_descricao:null,tipo:'PRINCIPAL',emenda_id:c.dataset.emendaId,emenda_item_id:c.dataset.emendaItemId,valor_alocado:1000}],
    showMsg:(...args)=>messages.push(args),loadLicitacoes:async()=>{}
  });
  const values={'proc-identificador':'123/2026','proc-tipo':'CPL','proc-natureza':'SERVIÇO','proc-categoria':'21','proc-tipo-servico':'Serviço por escopo fechado','proc-secao':'SMCP','proc-objeto':'Obra','proc-valor':'1000'};
  Object.entries(values).forEach(([k,v])=>get(k).value=v);
  return {ctx,calls,btn,messages,card,setCards:x=>cards=x,setFailItems:x=>failItems=x,setFailRpc:x=>failRpcAt=x};
}
(async()=>{
  const a=scenario(),c=a.card(1);a.setCards([c]);c.querySelector('.pi-unidade-medida').value='';
  await a.ctx.salvarProcesso();
  assert.equal(a.calls.processInserts,0,'Unidade de medida é validada antes de inserir o processo.');
  assert.equal(a.calls.categories,0,'Não grava nem resolve novo cadastro de categoria antes da validação.');
  assert(a.messages.some(m=>/unidade de medida/i.test(m[1])));
  assert.equal(a.btn.disabled,false);
  c.querySelector('.pi-unidade-medida').value='SERVIÇO';
  a.setFailItems(true);await a.ctx.salvarProcesso();
  assert.equal(a.calls.processInserts,1);assert.equal(a.calls.itemInserts,0);
  a.setFailItems(false);await a.ctx.salvarProcesso();
  assert.equal(a.calls.processInserts,1,'Falha posterior à criação reutiliza o processo na tentativa seguinte.');
  assert.equal(a.calls.processUpdates,1);assert.equal(a.calls.itemInserts,1);
  assert.equal(a.calls.resources,1);
  const b=scenario();b.setCards([b.card(1),b.card(2)]);b.setFailRpc(2);
  await b.ctx.salvarProcesso();
  assert.equal(b.calls.processInserts,1);assert.equal(b.calls.itemInserts,2);assert.equal(b.calls.resources,1);
  await b.ctx.salvarProcesso();
  assert.equal(b.calls.processInserts,1);assert.equal(b.calls.itemInserts,2,'Rateio com falha não duplica itens já gravados.');
  assert.equal(b.calls.resources,2,'Rateio já confirmado é atualizado pelo ID, sem outra fonte principal.');
  const d=scenario();d.setCards([d.card(1)]);
  await Promise.all([d.ctx.salvarProcesso(),d.ctx.salvarProcesso()]);
  assert.equal(d.calls.processInserts,1,'Cliques simultâneos não iniciam duas gravações.');
  assert.equal(d.btn.disabled,false);
  console.log('PASSOU: validação antes de gravar, correção e nova tentativa, falha em itens/rateio e clique duplo sem duplicar processo, item ou fonte.');
})().catch(e=>{console.error(e);process.exitCode=1;});
