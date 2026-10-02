const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const src=fs.readFileSync('js/legacy/40-itens-entregas.js','utf8');
const secoes=[{id:1,sigla:'SUEQ - EQUIP'},{id:3,sigla:'SAC'}];
let permitidas=[secoes[0]],edit=true,aberturas=0;const alerts=[];
const processo={id:461,secao:'SAC',secao_id:3};
const ctx=vm.createContext({_secoesOrganizacionais:secoes,_secoesPermitidasContexto:()=>permitidas,podeEditar:()=>edit,
_licitacoesCache:[processo],alert:s=>alerts.push(s),abrirModalNovoContrato:async()=>aberturas++,
_ncFixarProcessoContrato:()=>{},window:{}});
vm.runInContext(src.slice(src.indexOf('function _ncResolverSecaoProcesso('),src.indexOf('function ncProcessoChange(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function gerarContratoDoProcesso('),src.indexOf('function _ncProcessoLabel(')),ctx);
(async()=>{
assert.equal(ctx._ncResolverSecaoProcesso({secao_id:3,secao:'texto desatualizado'}).sigla,'SAC');
assert.equal(ctx._ncResolverSecaoProcesso({secao:'SAC'}).id,3);
assert(ctx._ncValidarContextoProcesso(processo).includes('SAC'));
await ctx.gerarContratoDoProcesso(461);assert.equal(aberturas,0);assert(alerts[0].includes('cabeçalho'));
permitidas=secoes;assert.equal(ctx._ncValidarContextoProcesso(processo),'');
await ctx.gerarContratoDoProcesso(461);assert.equal(aberturas,1);
edit=false;await ctx.gerarContratoDoProcesso(461);assert.equal(aberturas,1);
edit=true;assert(ctx._ncValidarContextoProcesso({secao:'inexistente'}).includes('seção válida'));
assert.equal(processo.secao_id,3);assert.equal(processo.secao,'SAC');
console.log('Geração de contrato: seção canônica, contexto inadequado, contexto permitido, permissão de edição e seção inválida validados.');
})().catch(e=>{console.error(e);process.exitCode=1});
