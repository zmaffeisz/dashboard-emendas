const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('js/legacy/10-chamados-inventario.js','utf8');
const inicio=source.indexOf('function _invStatusHtml');
const fim=source.indexOf('function _invOcorrenciasLicitacaoHtml');
assert(inicio>=0&&fim>inicio,'Funções do detalhe do inventário não encontradas.');

const contexto={
  _sanEsc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  _invPrimeiro:(...valores)=>valores.find(v=>v!==null&&v!==undefined&&v!==''),
  _invTemValor:v=>v!==null&&v!==undefined&&v!=='',
  _invTexto:(...valores)=>valores.find(v=>v!==null&&v!==undefined&&v!=='')||null,
  _invData:v=>v||null,
  Date
};
vm.createContext(contexto);
vm.runInContext(source.slice(inicio,fim),contexto);

const em={item:'Micro-ondas 31 L',unidade:'UBS Sabiá',unidade_entrega:'UBS Sabiá'};
const inv={item:'Micro-ondas 31 L',unidade:'UBS Sabiá',situacao_atual:'ATIVO',data_entrega_unidade:null};

const heroAntes=contexto._invHeroHtml(em,inv);
const geralAntes=contexto._invVisaoGeralHtml(em,inv);
assert(!heroAntes.includes('Localização e situação atuais'),'Não deve mostrar o quadro atual antes da entrega.');
assert(!geralAntes.includes('Localização atual'),'Não deve mostrar localização atual na visão geral antes da entrega.');
assert(!geralAntes.includes('Situação atual'),'Não deve mostrar situação atual na visão geral antes da entrega.');
assert(geralAntes.includes('Unidade cadastrada na Emenda'),'Deve preservar a unidade planejada como dado de origem.');

inv.data_entrega_unidade='2026-08-25';
const heroDepois=contexto._invHeroHtml(em,inv);
const geralDepois=contexto._invVisaoGeralHtml(em,inv);
assert(heroDepois.includes('Localização e situação atuais'),'Deve mostrar o quadro atual após a entrega.');
assert(geralDepois.includes('Localização atual'),'Deve mostrar localização atual após a entrega.');
assert(geralDepois.includes('Situação atual'),'Deve mostrar situação atual após a entrega.');

console.log('PASSOU: localização e situação atuais aparecem somente após a entrega na unidade.');
