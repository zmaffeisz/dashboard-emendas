const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/legacy/30-usuarios-licitacoes.js','utf8');
const elements={};
const el=id=>elements[id]||(elements[id]={value:'',style:{},dataset:{},required:false,closest:()=>({querySelector:()=>({textContent:''})})});
let cards=[],inserts=[],updates=[],rateios=[];
const context=vm.createContext({
  PROC_TIPO_SERVICO_MENSAL_FIXO:'Serviço mensal valor fixo',
  PROC_TIPO_SERVICO_TRIMESTRAL_FIXO:'Serviço trimestral valor fixo',
  PROC_TIPO_SERVICO_DEMANDA_NORM:'servico por demanda/execucao',
  PROC_FONTES:[['emenda','Emenda'],['recurso_proprio','Recurso próprio'],['outra','Outro']],
  document:{getElementById:el,querySelectorAll:()=>cards},
  _procValidarItensLocacao:()=>'',_procCodigoSiam:v=>v||null,
  _procCodigoSiamValido:()=>true,_procUnidadeMedidaValor:v=>v||'',
  _procRegistrarUnidadeMedida:()=>{},_procUuid:()=> 'item-novo',
  _procItensLoaded:[],_procLerRecursosCard:()=>[{fonte_tipo:'emenda',tipo:'PRINCIPAL',emenda_id:'emenda',emenda_item_id:'previsto',valor_alocado:300000}],
  _procSetValorEstimadoServicoMensal:()=>{},_procServicoMensalIds:()=>[],
  _procEnsureServicoMensalItemRow:()=>{},procRecalcServicoMensal:()=>{},
  procRecalcRateio:()=>{},_renderProcEmendaSaldoResumo:()=>{},
  sb:{from:table=>({
    async insert(rows){inserts.push(...rows);return {error:null};},
    update(row){return {async eq(k,id){updates.push({id,...row});return {error:null};}};}
  }),async rpc(name,args){rateios.push({name,args});return {error:null};}}
});
function load(start,end){const pos=source.indexOf(start);assert(pos>=0,start);vm.runInContext(source.slice(pos,end?source.indexOf(end,pos):undefined),context);}
load('function _procEhServicoMensalFixo(','function _procProcessoEhTrimestral(');
load('function _procEhServicoDemanda(','function _procSetValorEstimadoServicoMensal(');
load('function procTipoServicoChange(','function _renderProcItensVazio(');
load('function _procEhAta(','function _procValidarItensLocacao(');
load('function _procAplicarModoAta(','function _procEmendaOpts(');
load('async function _persistProcItens(');
function card({linked=true,existing=false}={}){
  const values={'.pi-desc':'Reforma da UBS','.pi-siam':'', '.pi-unidade-medida':'SERVIÇO','.pi-qtde':'1','.pi-valor':'300000','.pi-prazo':'','.pi-unidade':'10','.pi-fonte':linked?'emenda':'sem_emenda','.pi-fonte-desc':''};
  const controls={};
  return {dataset:{itemId:existing?'existente':'',emendaId:linked?'emenda':'',emendaItemId:linked?'previsto':''},querySelector(selector){return controls[selector]||(controls[selector]={value:values[selector]??'',style:{}});}};
}
async function check(tipo){
  inserts=[];updates=[];rateios=[];
  el('proc-natureza').value='SERVIÇO';el('proc-tipo-servico').value=tipo;
  cards=[card()];
  context.procNaturezaChange();
  assert.equal(el('proc-itens-section').style.display,'block');
  assert.equal(el('proc-btn-puxar-emenda').style.display,'');
  assert.equal(cards[0].querySelector('.pi-fonte-row').style.display,'');
  assert.equal(cards[0].querySelector('.pi-prazo').required,false);
  assert.equal(el('proc-valor').value,'300000.00');
  await context._persistProcItens(20,'SERVIÇO');
  assert.equal(inserts.length,1);
  const saved=inserts[0];
  assert.equal(saved.emenda_id,'emenda');assert.equal(saved.emenda_item_id,'previsto');
  assert.equal(saved.fonte_tipo,'emenda');assert.equal(saved.unidade_destino_id,10);
  assert.equal(saved.origem,tipo.includes('demanda')?'servico_demanda':'servico');
  assert.equal(saved.prazo_entrega_dias,null);
  assert.equal(rateios[0].name,'salvar_licitacao_item_recursos');
  assert.equal(rateios[0].args.p_recursos[0].valor_alocado,300000);
  // Reabrir/salvar um item existente mantém os mesmos vínculos.
  cards=[card({existing:true})];
  await context._persistProcItens(20,'SERVIÇO');
  assert.equal(updates[0].emenda_item_id,'previsto');
}
(async()=>{
  for(const tipo of ['Serviço por escopo fechado','Serviço por demanda/execução'])await check(tipo);
  cards=[];el('proc-valor').dataset.calculadoPorItens='';el('proc-valor').value='123456';
  context.procTipoServicoChange();
  assert.equal(el('proc-valor').value,'123456','Não apaga a estimativa global de serviço antigo sem itens.');
  cards=[card({linked:false})];inserts=[];rateios=[];
  await context._persistProcItens(20,'SERVIÇO');
  assert.equal(inserts[0].fonte_tipo,'sem_emenda');assert.equal(inserts[0].emenda_id,null);assert.equal(rateios.length,0);
  for(const tipo of ['Serviço mensal valor fixo','Serviço trimestral valor fixo']){
    el('proc-tipo-servico').value=tipo;
    assert.equal(context._procUsaItensServico(),false,'Não migra o mensal/trimestral para itens de escopo.');
  }
  el('proc-natureza').value='AQUISIÇÃO';el('proc-tipo-servico').value='';
  cards=[card()];context._procAplicarModoAta();
  assert.equal(cards[0].querySelector('.pi-prazo').required,true);
  await assert.rejects(context._persistProcItens(20,'AQUISIÇÃO'),/prazo de entrega/);
  el('proc-natureza').value='ATA DE RP';cards=[];context._procAplicarModoAta();
  assert.equal(el('proc-btn-puxar-emenda').style.display,'none');
  console.log('PASSOU: escopo/demanda exibem importação e preservam origem, itens e rateio; regras de aquisição, ATA e periódicos preservadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
