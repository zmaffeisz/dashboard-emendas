const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/legacy/60-emendas-dashboard.js','utf8');
const elements={};
const element=id=>elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',style:{}});
const ctx=vm.createContext({
  document:{getElementById:element},
  allRows:[],filtered:[],cachedEmendas:[
    {id:'a',emenda:'373',ano:2026,tipo:'MUNICIPAL',parlamentar:'Parlamentar A',objeto:'Carteirinhas',valor_cedido:20000},
    {id:'b',emenda:'13',ano:2026,tipo:'MUNICIPAL',parlamentar:'Parlamentar B',objeto:'Reforma',valor_cedido:300000}
  ],
  headerFilters:{emenda:[],unidade:[]},
  HDR_FILTER_COLS:{emenda:{get:r=>r.emenda,disp:v=>v},unidade:{get:r=>r.unidade,disp:v=>v}},
  semCplFilter:false,_emExpand:{},
  _municipalAntigaVisivel:()=>true,
  matchBusca:(s,q)=>s.toLowerCase().includes(q),
  _sanEsc:s=>String(s??'').replace(/</g,'&lt;'),
  _isAdmin:()=>true,_emPodeGerarLicitacao:()=>true,podeEditar:()=>true,
  _emAtualizarSelecaoLicitacao:()=>{},
  fmtFull:n=>'R$ '+n,fmtM:n=>String(n),
  _valorComprometidoItem:r=>Number(r.vl_total_cadastrado)||0
});
function load(start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);}
load('function _emendaBuscaTexto(','function applyFilters(');
load('function _hdrUniqueValues(','function _ensureHdrDropdown(');
load('function renderEmPorEmenda(','// ═══ RENDER');
load('function renderMetrics(','function renderStatusList(');
load('function _saldoEmendaValor(','function getSaldoEmenda(');
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('_emSemItensFiltradas().length'),2);
run('renderEmPorEmenda();renderMetrics()');
assert.match(element('em-view-por-emenda').innerHTML,/373\/2026/);
assert.match(element('em-view-por-emenda').innerHTML,/13\/2026/);
assert.match(element('em-view-por-emenda').innerHTML,/Nenhum item cadastrado/);
assert.match(element('em-view-por-emenda').innerHTML,/Adicionar item/);
assert.doesNotMatch(element('em-view-por-emenda').innerHTML,/verTudoEmendaItem|em-licitacao-grupo|<tbody>/);
assert.equal(element('m-emendas').textContent,2);
assert.equal(element('m-itens').textContent,'0');
assert.equal(element('m-valor').textContent,'320000');
assert.equal(run("_saldoEmendaValor('a')"),20000);
assert.equal(run("_hdrUniqueValues('emenda').includes('373')"),true);
element('f-busca').value='carteirinhas';
assert.equal(run('_emSemItensFiltradas().length'),1);
run("headerFilters.emenda=['13']");
assert.equal(run('_emSemItensFiltradas().length'),0);
element('f-busca').value='';
run('headerFilters.emenda=[];headerFilters.unidade=["UBS A"]');
assert.equal(run('_emSemItensFiltradas().length'),0,'Filtro de unidade não inventa destino para emenda vazia.');
run('headerFilters.unidade=[]');
ctx._municipalAntigaVisivel=()=>false;
assert.equal(run('_emSemItensFiltradas().length'),0);
ctx._municipalAntigaVisivel=()=>true;
run("allRows=[{id:'item-real',emenda_id:'a',emenda:'373',valor_cedido:20000,vl_total_cadastrado:5000}]");
assert.equal(run('_emCadastrosSemItens().length'),1,'Cadastro deixa de ser vazio quando recebe seu primeiro item.');
assert.equal(run("_saldoEmendaValor('a')"),15000);
// Número igual em outro ano não pode apagar a emenda sem itens.
run("cachedEmendas.push({id:'c',emenda:'373',ano:2025,tipo:'MUNICIPAL',valor_cedido:100})");
assert.equal(run('_emCadastrosSemItens().length'),2);
run('renderEmPorEmenda()');
assert.match(element('em-view-por-emenda').innerHTML,/373\/2025/);
console.log('PASSOU: emendas sem itens visíveis, filtros, valores, saldo, ausência de itens fictícios e primeiro item.');
