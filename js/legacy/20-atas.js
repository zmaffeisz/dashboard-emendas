// ═══ ATAS ═══
let atasReajustes=[];
let atasExecReajustes=[];
let atasVigencias=[];
let atasHistoricoRenovacoes=[];

function _ataHojeISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _ataReajustesDoItem(itemId){
  return atasReajustes
    .filter(r=>String(r.ata_item_id)===String(itemId)&&r.status==='ATIVO')
    .sort((a,b)=>String(a.data_vigencia).localeCompare(String(b.data_vigencia)));
}

function _ataValorUnitarioEm(item,dataISO=_ataHojeISO()){
  if(!item) return 0;
  const aplicavel=_ataReajustesDoItem(item.id)
    .filter(r=>String(r.data_vigencia)<=String(dataISO))
    .at(-1);
  return Number(aplicavel?.valor_unitario_novo??item.valor_unit_original??item.valor_unit)||0;
}

function _ataStatusEncerrado(status){
  return String(status||"").trim().toUpperCase().startsWith("ENCERRAD");
}

function _ataExecRecebida(exec){
  return !!String(exec?.dt_entrega||"").trim();
}

function _ataStatusOperacionalExec(exec,statusAta){
  const status=String(statusAta||"VIGENTE").trim()||"VIGENTE";
  // Encerrar a vigência impede novas solicitações, mas não encerra uma entrega já
  // solicitada. A execução só acompanha o encerramento depois do recebimento.
  return _ataStatusEncerrado(status)&&!_ataExecRecebida(exec)?"VIGENTE":status;
}

async function loadAtas(){
  document.getElementById("atas-loading").style.display="block";
  document.getElementById("atas-main").style.display="none";
  try{
    const [r1,r2,r3,r4,r5,r6,r7,r8,r9]=await Promise.all([
      sb.from("atas_itens").select("*").order("created_at"),
      sb.from("atas_execucao").select("*").order("created_at",{ascending:false}),
      sb.from("contratos").select("*").eq("tipo_instrumento","ATA"),
      sb.from("fornecedores").select("id,razao_social,cnpj_normalizado"),
      sb.from("atas_item_reajustes").select("*").order("data_vigencia"),
      sb.from("atas_execucao_reajustes").select("*").eq("status","ATIVO").order("criado_em",{ascending:false}),
      sb.from("contratos_vigencias").select("contrato_id,numero,data_inicio,data_fim,created_at"),
      sb.from("contratos_historico").select("contrato_id,tipo,data_evento,vigencia_nova_fim,created_at")
        .or("tipo.ilike.%prorroga%,tipo.ilike.%renova%"),
      sb.from("categorias_licitacao").select("id,nome").order("ordem").order("nome")
    ]);
    if(r1.error) throw r1.error;
    if(r2.error) throw r2.error;
    if(r3.error) throw r3.error;
    if(r4.error) throw r4.error;
    if(r5.error) throw r5.error;
    if(r6.error) throw r6.error;
    if(r7.error) throw r7.error;
    if(r8.error) throw r8.error;
    if(r9.error) throw r9.error;
    atasReajustes=r5.data||[];
    atasExecReajustes=r6.data||[];
    atasVigencias=r7.data||[];
    atasHistoricoRenovacoes=r8.data||[];
    const fornecedorPorId=new Map((r4.data||[]).map(f=>[String(f.id),f]));
    const categoriaPorId=new Map((r9.data||[]).map(c=>[String(c.id),c.nome]));
    atasContratos=(r3.data||[])
      .map(c=>{
      const fornecedor=fornecedorPorId.get(String(c.fornecedor_id))||null;
      return {...c,
        empresa:(fornecedor?.razao_social||c.prestador||"").trim(),
        cnpj_fornecedor:fornecedor?.cnpj_normalizado||c.cnpj||""
      };
    });
    const contratoPorId=new Map(atasContratos.map(c=>[String(c.id),c]));
    const renovacaoPorContrato=new Map();
    atasContratos.forEach(contrato=>{
      const contratoId=String(contrato.id);
      const vigencias=atasVigencias
        .filter(v=>String(v.contrato_id)===contratoId)
        .sort((a,b)=>(Number(a.numero)||0)-(Number(b.numero)||0)||String(a.data_inicio||a.created_at||'').localeCompare(String(b.data_inicio||b.created_at||'')));
      const historicos=atasHistoricoRenovacoes
        .filter(h=>String(h.contrato_id)===contratoId)
        .sort((a,b)=>String(b.data_evento||b.created_at||'').localeCompare(String(a.data_evento||a.created_at||'')));
      const segundaVigencia=vigencias.find(v=>Number(v.numero)>=2)||(vigencias.length>=2?vigencias[1]:null);
      const historico=historicos[0]||null;
      if(segundaVigencia||historico){
        renovacaoPorContrato.set(contratoId,{
          data:historico?.data_evento||segundaVigencia?.data_inicio||null,
          ate:historico?.vigencia_nova_fim||segundaVigencia?.data_fim||contrato.vencimento||null
        });
      }
    });
    atasItens=(r1.data||[]).map(r=>{
      const contrato=contratoPorId.get(String(r.contrato_id));
      if(!contrato) return null;
      const renovacao=renovacaoPorContrato.get(String(r.contrato_id))||null;
      // Um contrato encerrado prevalece para todos os itens. Enquanto estiver vigente,
      // cada item da ATA controla o seu próprio status de renovação/encerramento.
      const statusContrato=(contrato.status||"VIGENTE").trim();
      const statusItem=statusContrato.toUpperCase()==='VIGENTE'
        ?(r.status_contrato||statusContrato).trim()
        :statusContrato;
      const itemBase={
      id:r.id,
      contrato_id:r.contrato_id,
      categoria_id:r.categoria_id||contrato.categoria_id||null,
      categoria:categoriaPorId.get(String(r.categoria_id||contrato.categoria_id||''))||'',
      fornecedor_id:contrato.fornecedor_id,
      cpl:(contrato.cpl||"").trim(),
      sim:(contrato.numero_contrato||"").trim(),
      item:(r.item||"").trim(),
      codigo_siam:(r.codigo_siam||"").trim(),
      unidade_medida:(r.unidade_medida||"").trim(),
      marca:(r.marca_modelo||"").trim(),
      qtde_contratada:Number(r.qtde_contratada)||0,
      valor_unit_original:Number(r.valor_unit)||0,
      valor_unit:Number(r.valor_unit)||0,
      data_base_reajuste:contrato.data_base_reajuste||null,
      vencimento:(contrato.vencimento||"").trim(),
      status:statusItem,
      renovacao_em_tramite:!!r.renovacao_em_tramite,
      renovacao_em_tramite_em:r.renovacao_em_tramite_em||null,
      encerramento_planejado:!!r.encerramento_planejado,
      encerramento_planejado_em:r.encerramento_planejado_em||null,
      ata_renovada:!!renovacao,
      renovada_em:renovacao?.data||null,
      renovada_ate:renovacao?.ate||null,
      saldo_reiniciado_em:r.saldo_reiniciado_em||null,
      empresa:contrato.empresa,
      prazo_entrega:parseInt(r.prazo_entrega)||0,
      contrato
      };
      itemBase.valor_unit=_ataValorUnitarioEm(itemBase);
      return itemBase;
    }).filter(Boolean);
    const itemPorId=new Map(atasItens.map(i=>[String(i.id),i]));
    atasExec=(r2.data||[]).map(r=>{
      const ata=itemPorId.get(String(r.ata_item_id));
      if(!ata) return null;
      return {
      id:r.id,
      _sancao_id:r.id,
      ata_item_id:r.ata_item_id,
      contrato_id:ata.contrato_id,
      status:_ataStatusOperacionalExec(r,ata.status),
      status_ata:ata.status,
      cpl:ata.cpl,
      sim:ata.sim,
      item:ata.item,
      codigo_siam:ata.codigo_siam,
      // A execução preserva a marca vigente no momento do pedido. Apostilamentos
      // atualizam esta fotografia somente enquanto o recebimento não ocorreu.
      marca_modelo:(r.marca_modelo||ata.marca||'').trim(),
      unidade:(r.unidade||"").trim(),
      qtde:Number(r.qtde)||0,
      valor:Number(r.valor)||0,
      empenho:(r.empenho||"").trim(),
      data_af:(r.data_af||"").trim(),
      prev_entrega:(r.prev_entrega||"").trim(),
      dt_entrega:(r.dt_entrega||"").trim(),
      nf:(r.nf||"").trim(),
      obs_prazo:(r.obs_prazo||"").trim(),
      origem_recurso:(r.origem_recurso||"").trim(),
      codigo_siam_secretaria:(r.codigo_siam_secretaria||"").trim(),
      email_solicitante:(r.email_solicitante||"").trim(),
      emenda_id:r.emenda_id||null,
      emenda_item_id:r.emenda_item_id||null,
      af_numero:(r.af_numero||"").trim(),
      data_entrega_unidade:r.data_entrega_unidade||null,
      termo_arquivo:r.termo_arquivo||"",
      termo_responsavel:r.termo_responsavel||"",
      termo_cargo:r.termo_cargo||"",
      confirmacao_obs:r.confirmacao_obs||"",
      tipo_material:(r.tipo_material||"").trim().toUpperCase(),
      possui_patrimonio:r.possui_patrimonio,
      created_at:r.created_at||null,
      empresa:ata.empresa||"",
      cnpj:ata.cnpj_fornecedor||ata.contrato?.cnpj||"",
      valor_unit_registrado:Number(ata.valor_unit)||0,
      contrato:ata.contrato||null
    };}).filter(Boolean);
    popularFiltrosAtas();
    filtrarAtas();
    renderAlertas();
    document.getElementById("atas-loading").style.display="none";
    document.getElementById("atas-main").style.display="block";
  }catch(e){
    document.getElementById("atas-loading").innerHTML=`<div style="color:var(--red)">⚠️ Erro: ${e.message}</div>`;
  }
}

function _resolverAtaItemRef(cplOuId,sim,item){
  if(cplOuId&&typeof cplOuId==="object") return cplOuId;
  if(sim===undefined&&item===undefined) return atasItens.find(r=>String(r.id)===String(cplOuId))||null;
  return atasItens.find(r=>r.cpl===cplOuId&&r.sim===sim&&r.item===item)||null;
}

function getSaldo(cpl,sim,item){
  const at=_resolverAtaItemRef(cpl,sim,item);
  if(!at) return 0;
  const exec=getExecutado(at);
  return at.qtde_contratada-exec;
}

function _dataExecucaoParaSaldo(exec){
  return _toISODate(exec?.data_af)||_toISODate(exec?.dt_entrega)||_toISODate(exec?.created_at)||'';
}
function getExecutado(cpl,sim,item){
  const at=_resolverAtaItemRef(cpl,sim,item);
  if(!at) return 0;
  const marco=_toISODate(at.saldo_reiniciado_em);
  return atasExec
    .filter(r=>String(r.ata_item_id)===String(at.id))
    .filter(r=>!marco||_dataExecucaoParaSaldo(r)>=marco)
    .reduce((a,r)=>a+r.qtde,0);
}

function diasParaVencer(vencimento){
  if(!vencimento) return 9999;
  try{
    const partes=vencimento.split("/");
    let d;
    if(partes.length===3) d=new Date(partes[2],partes[1]-1,partes[0]);
    else if(/^\d{4}-\d{2}-\d{2}/.test(vencimento)){
      const [ano,mes,dia]=vencimento.slice(0,10).split("-").map(Number);
      d=new Date(ano,mes-1,dia);
    }else d=new Date(vencimento);
    if(Number.isNaN(d.getTime())) return 9999;
    d.setHours(0,0,0,0);
    const hoje=new Date();
    hoje.setHours(0,0,0,0);
    return Math.round((d-hoje)/(1000*60*60*24));
  }catch(e){return 9999;}
}

function _ataAlertEsc(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

function _ataFormatarDataTramite(value){
  if(!value) return "—";
  const data=new Date(value);
  return Number.isNaN(data.getTime())?String(value):data.toLocaleDateString("pt-BR");
}

function _ataAlertContractKey(item){
  return String(item?.contrato_id||`${item?.cpl||""}::${item?.sim||""}`);
}

function _ataItemNaoAnalisado(item){
  return !!item&&!item.ata_renovada&&!_ataStatusEncerrado(item.status)&&!item.renovacao_em_tramite&&!item.encerramento_planejado;
}

function _ataItemAlertaVigencia(item){
  if(!item||_ataStatusEncerrado(item.status)) return false;
  const dias=diasParaVencer(item.vencimento);
  return dias<0||(dias>=0&&dias<=90);
}

let _ataAlertasSomenteNaoAnalisados={vencido:false,vencendo:false};

function _ataAgruparContratosAlerta(items){
  const grupos=new Map();
  items.forEach(item=>{
    const chave=_ataAlertContractKey(item);
    if(!grupos.has(chave)){
      grupos.set(chave,{
        contrato_id:item.contrato_id,
        cpl:item.cpl||"—",
        sim:item.sim||"—",
        empresa:item.empresa||"",
        vencimento:item.vencimento||"",
        dias:diasParaVencer(item.vencimento),
        itens:[]
      });
    }
    const grupo=grupos.get(chave);
    if(!grupo.itens.some(existente=>String(existente.id)===String(item.id))) grupo.itens.push(item);
  });
  return Array.from(grupos.values());
}

function _ataRenderGrupoAlerta(grupo,tipo,itensVisiveis=grupo.itens){
  const vencido=tipo==="vencido";
  const prazo=vencido
    ?`Vencido há ${Math.abs(grupo.dias)} ${Math.abs(grupo.dias)===1?"dia":"dias"}`
    :grupo.dias===0?"Vence hoje":`Vence em ${grupo.dias} ${grupo.dias===1?"dia":"dias"}`;
  const itens=Array.isArray(itensVisiveis)?itensVisiveis:[];
  const semDecisao=itens.filter(_ataItemNaoAnalisado).length;
  const emTramite=itens.filter(item=>item.renovacao_em_tramite&&!item.ata_renovada).length;
  const paraEncerrar=itens.filter(item=>item.encerramento_planejado&&!_ataStatusEncerrado(item.status)).length;
  const itensLabel=_ataAlertasSomenteNaoAnalisados[tipo]
    ?`${itens.length} ${itens.length===1?"item não analisado":"itens não analisados"}`
    :`${itens.length} ${itens.length===1?"item":"itens"}`;
  const listaItens=itens.length
    ?`<ul class="ata-alert-items">${itens.map(item=>`<li><span>${_ataAlertEsc(item.item||"Item sem descrição")}</span>${item.ata_renovada?`<span class="ata-alert-item-state ata-alert-item-renewed">Já renovada</span>`:_ataStatusEncerrado(item.status)?`<span class="ata-alert-item-state ata-alert-item-closed">Encerrado</span>`:item.renovacao_em_tramite?`<span class="ata-alert-item-state">Em renovação</span>`:item.encerramento_planejado?`<span class="ata-alert-item-state ata-alert-item-closing">Encerrar ao vencer</span>`:`<span class="ata-alert-item-state ata-alert-item-pending">Não analisado</span>`}</li>`).join("")}</ul>`
    :`<div class="ata-alert-empty">Nenhum item informado</div>`;
  const contratoId=_ataAlertEsc(grupo.contrato_id);
  const destaquePendente=grupo.itens.some(_ataItemNaoAnalisado);
  const todosAnalisados=grupo.itens.length>0&&!destaquePendente;
  const classesCard=`ata-alert-contract${destaquePendente?" ata-alert-contract-pending":""}${todosAnalisados?" ata-alert-contract-analyzed":""}`;
  return `<article class="${classesCard}" role="button" tabindex="0" onclick="abrirModalTramiteRenovacao('${contratoId}')" onkeydown="ataAlertaContratoKeydown(event,'${contratoId}')" aria-label="Abrir itens do contrato CPL ${_ataAlertEsc(grupo.cpl)}, SIM ${_ataAlertEsc(grupo.sim)}">
    <div class="ata-alert-contract-head">
      <div>
        <strong>CPL ${_ataAlertEsc(grupo.cpl)} / SIM ${_ataAlertEsc(grupo.sim)}</strong>
        ${grupo.empresa?`<div class="ata-alert-company">${_ataAlertEsc(grupo.empresa)}</div>`:""}
      </div>
      <span class="ata-alert-deadline">${_ataAlertEsc(prazo)}</span>
    </div>
    <div class="ata-alert-date">Vencimento: <strong>${_ataAlertEsc(grupo.vencimento||"—")}</strong></div>
    <div class="ata-alert-items-status">
      <span class="ata-alert-items-label">${itensLabel}</span>
      ${emTramite?`<span class="ata-alert-renewal-count">🔄 ${emTramite} em trâmite</span>`:""}
      ${paraEncerrar?`<span class="ata-alert-closing-count">⛔ ${paraEncerrar} para encerrar</span>`:""}
      ${semDecisao?`<span class="ata-alert-pending-count">● ${semDecisao} sem decisão</span>`:""}
    </div>
    ${listaItens}
    <div class="ata-alert-open-hint">Clique para revisar a decisão de cada item</div>
  </article>`;
}

function ataAlternarFiltroAlerta(tipo,event){
  event?.preventDefault();
  event?.stopPropagation();
  if(!Object.prototype.hasOwnProperty.call(_ataAlertasSomenteNaoAnalisados,tipo)) return;
  _ataAlertasSomenteNaoAnalisados[tipo]=!_ataAlertasSomenteNaoAnalisados[tipo];
  renderAlertas();
}

function ataTabelaItemAlertaClick(event,contratoId){
  if(event?.target?.closest?.("button,a,input,select,textarea")) return;
  if(contratoId===undefined||contratoId===null||contratoId==="") return;
  abrirModalTramiteRenovacao(contratoId);
}

function ataTabelaItemAlertaKeydown(event,contratoId){
  if(event.key!=="Enter"&&event.key!==" ") return;
  event.preventDefault();
  ataTabelaItemAlertaClick(event,contratoId);
}

function _ataRenderAlertaExpansivel(tipo,grupos){
  if(!grupos.length) return "";
  const vencido=tipo==="vencido";
  const somenteNaoAnalisados=!!_ataAlertasSomenteNaoAnalisados[tipo];
  const gruposExibidos=somenteNaoAnalisados
    ?grupos.filter(grupo=>grupo.itens.some(_ataItemNaoAnalisado))
    :grupos;
  const quantidade=gruposExibidos.length;
  const tituloBase=vencido
    ?`${quantidade} ${quantidade===1?"contrato vencido":"contratos vencidos"}`
    :`${quantidade} ${quantidade===1?"contrato vencendo":"contratos vencendo"} em até 90 dias`;
  const titulo=somenteNaoAnalisados?`${tituloBase} com itens não analisados`:tituloBase;
  const ordenados=[...gruposExibidos].sort((a,b)=>{
    const prioridadeA=a.itens.some(_ataItemNaoAnalisado)?0:1;
    const prioridadeB=b.itens.some(_ataItemNaoAnalisado)?0:1;
    return prioridadeA-prioridadeB||(vencido?b.dias-a.dias:a.dias-b.dias);
  });
  const conteudo=ordenados.length
    ?ordenados.map(grupo=>_ataRenderGrupoAlerta(grupo,tipo,somenteNaoAnalisados?grupo.itens.filter(_ataItemNaoAnalisado):grupo.itens)).join("")
    :`<div class="ata-alert-filter-empty">Nenhum contrato com item não analisado.</div>`;
  return `<details class="ata-alert ata-alert-${vencido?"danger":"warning"} ata-alert-${tipo}" data-ata-alerta-tipo="${tipo}">
    <summary class="ata-alert-summary">
      <span class="ata-alert-summary-main">
        <span class="ata-alert-icon" aria-hidden="true">${vencido?"⛔":"⚠"}</span>
        <span class="ata-alert-title">${titulo}</span>
        <button type="button" class="ata-alert-filter-btn${somenteNaoAnalisados?" active":""}" aria-pressed="${somenteNaoAnalisados}" title="${somenteNaoAnalisados?"Mostrar todos os contratos e itens":"Mostrar somente contratos com itens não analisados"}" onclick="ataAlternarFiltroAlerta('${tipo}',event)">${somenteNaoAnalisados?"Mostrar todos":"Mostrar apenas não analisados"}</button>
      </span>
      <span class="ata-alert-action"><span class="ata-alert-show">Ver detalhes</span><span class="ata-alert-hide">Ocultar</span><span class="ata-alert-chevron" aria-hidden="true">⌄</span></span>
    </summary>
    <div class="ata-alert-content">
      ${conteudo}
    </div>
  </details>`;
}

function renderAlertas(){
  const ativos=atasItens.filter(r=>!_ataStatusEncerrado(r.status));
  const vencidos=_ataAgruparContratosAlerta(ativos.filter(r=>diasParaVencer(r.vencimento)<0));
  const vencendo=_ataAgruparContratosAlerta(ativos.filter(r=>{
    const dias=diasParaVencer(r.vencimento);
    return dias>=0&&dias<=90;
  }));
  const alertas=document.getElementById("atas-alertas");
  const estadosAbertos=Object.fromEntries(["vencido","vencendo"].map(tipo=>[
    tipo,!!alertas?.querySelector(`.ata-alert-${tipo}`)?.open
  ]));
  alertas.innerHTML=
    _ataRenderAlertaExpansivel("vencido",vencidos)+
    _ataRenderAlertaExpansivel("vencendo",vencendo);
  Object.entries(estadosAbertos).forEach(([tipo,aberto])=>{
    const detalhes=alertas.querySelector(`.ata-alert-${tipo}`);
    if(detalhes) detalhes.open=aberto;
  });
}

let _ataTramiteContratoId=null;

function ataAlertaContratoKeydown(event,contratoId){
  if(event.key!=="Enter"&&event.key!==" ") return;
  event.preventDefault();
  abrirModalTramiteRenovacao(contratoId);
}

function _ataTramiteItensContrato(){
  return atasItens
    .filter(item=>String(item.contrato_id)===String(_ataTramiteContratoId))
    .sort((a,b)=>String(a.item||"").localeCompare(String(b.item||""),"pt-BR"));
}

function abrirModalTramiteRenovacao(contratoId){
  const itens=atasItens.filter(item=>String(item.contrato_id)===String(contratoId));
  if(!itens.length) return;
  _ataTramiteContratoId=contratoId;
  const primeiro=itens[0];
  const podeEditarAtas=podeEditar("atas");
  const vigenciaVencida=diasParaVencer(primeiro.vencimento)<0;
  document.getElementById("atr-info").innerHTML=`
    <strong>CPL ${_ataAlertEsc(primeiro.cpl||"—")} / SIM ${_ataAlertEsc(primeiro.sim||"—")}</strong>
    <span>${_ataAlertEsc(primeiro.empresa||"Empresa não informada")}</span>
    <span>Vencimento: ${_ataAlertEsc(primeiro.vencimento||"—")}</span>
    <em class="${vigenciaVencida?"ata-renewal-expired":""}">${vigenciaVencida?"Vigência vencida: as ações finais estão disponíveis abaixo, por item.":"Planejamento: renovação e encerramento efetivos só ficam disponíveis após o vencimento."}</em>
    ${podeEditarAtas?"":"<em>Modo de consulta: você não possui permissão para alterar esta aba.</em>"}`;
  document.getElementById("atr-lista").innerHTML=_ataTramiteItensContrato().map(item=>{
    const encerrado=_ataStatusEncerrado(item.status);
    const bloqueado=encerrado||item.ata_renovada;
    const disabled=!podeEditarAtas||bloqueado;
    const saldo=getSaldo(item);
    const decisao=item.renovacao_em_tramite?"renovar":item.encerramento_planejado?"encerrar":"pendente";
    const estado=item.ata_renovada
      ?`<span class="ata-renewal-option-state ata-renewal-option-renewed">✓ Já renovada · limite atingido</span>`
      :encerrado
        ?`<span class="ata-renewal-option-state ata-renewal-option-closed">Item encerrado</span>`
        :item.renovacao_em_tramite
          ?`<span class="ata-renewal-option-state">Em trâmite desde ${_ataAlertEsc(item.renovacao_em_tramite_em?_ataFormatarDataTramite(item.renovacao_em_tramite_em):"data não informada")}</span>`
          :item.encerramento_planejado
            ?`<span class="ata-renewal-option-state ata-renewal-option-closed">Encerramento decidido em ${_ataAlertEsc(item.encerramento_planejado_em?_ataFormatarDataTramite(item.encerramento_planejado_em):"data não informada")}</span>`
          :"";
    const nome=`atr-decisao-${_ataAlertEsc(item.id)}`;
    const opcoes=disabled?"":`<div class="ata-renewal-decisions" role="radiogroup" aria-label="Decisão para ${_ataAlertEsc(item.item||"item")}">
      <label class="ata-renewal-decision ata-renewal-decision-pending"><input type="radio" class="atr-item-decision" name="${nome}" value="pendente" data-item-id="${_ataAlertEsc(item.id)}" ${decisao==="pendente"?"checked":""} onchange="ataTramiteAtualizarResumo()"><span>Não analisado</span></label>
      <label class="ata-renewal-decision ata-renewal-decision-renew"><input type="radio" class="atr-item-decision" name="${nome}" value="renovar" data-item-id="${_ataAlertEsc(item.id)}" ${decisao==="renovar"?"checked":""} onchange="ataTramiteAtualizarResumo()"><span>Em renovação</span></label>
      <label class="ata-renewal-decision ata-renewal-decision-close"><input type="radio" class="atr-item-decision" name="${nome}" value="encerrar" data-item-id="${_ataAlertEsc(item.id)}" ${decisao==="encerrar"?"checked":""} onchange="ataTramiteAtualizarResumo()"><span>Encerrar ao vencer</span></label>
    </div>`;
    const acoes=vigenciaVencida&&podeEditarAtas&&!bloqueado?`<div class="ata-renewal-item-actions">
      <button type="button" class="btn-secondary btn-compact" onclick="ataTramiteExecutarAcao('renovar','${_ataAlertEsc(item.id)}')">🔄 Prorrogar vigência</button>
      <button type="button" class="btn-secondary btn-compact ata-renewal-close-button" onclick="ataTramiteExecutarAcao('encerrar','${_ataAlertEsc(item.id)}')">⛔ Encerrar item</button>
    </div>`:"";
    return `<div class="ata-renewal-option${disabled?" ata-renewal-option-disabled":""}">
      <span class="ata-renewal-option-body">
        <strong>${_ataAlertEsc(item.item||"Item sem descrição")}</strong>
        <span>${_ataAlertEsc(item.marca||"Marca/modelo não informado")}${item.codigo_siam?` · SIAM ${_ataAlertEsc(item.codigo_siam)}`:""} · Saldo ${_ataAlertEsc(saldo)}</span>
        ${estado}
      </span>
      ${opcoes}
      ${acoes}
    </div>`;
  }).join("");
  document.getElementById("atr-salvar").style.display=podeEditarAtas?"inline-flex":"none";
  const msg=document.getElementById("atr-msg");
  msg.textContent="";msg.className="fmsg";
  ataTramiteAtualizarResumo();
  document.getElementById("modal-ata-tramite-renovacao").classList.add("active");
}

function fecharModalTramiteRenovacao(){
  document.getElementById("modal-ata-tramite-renovacao")?.classList.remove("active");
  _ataTramiteContratoId=null;
}

function ataTramiteAtualizarResumo(){
  const selecionados=Array.from(document.querySelectorAll("#atr-lista .atr-item-decision:checked"));
  const renovar=selecionados.filter(input=>input.value==="renovar").length;
  const encerrar=selecionados.filter(input=>input.value==="encerrar").length;
  const pendentes=selecionados.filter(input=>input.value==="pendente").length;
  document.getElementById("atr-resumo").textContent=`${renovar} em renovação · ${encerrar} para encerrar · ${pendentes} sem decisão`;
}

function ataTramiteExecutarAcao(acao,itemId){
  fecharModalTramiteRenovacao();
  setTimeout(()=>acao==="renovar"?renovarAta(itemId):encerrarAtaItem(itemId),80);
}

async function salvarTramiteRenovacao(){
  if(bloquearSeVisualiz("atas")) return;
  const itens=_ataTramiteItensContrato();
  if(!itens.length) return;
  const decisoes=new Map(Array.from(document.querySelectorAll("#atr-lista .atr-item-decision:checked")).map(input=>[String(input.dataset.itemId),input.value]));
  const editaveis=itens.filter(item=>!item.ata_renovada&&!_ataStatusEncerrado(item.status)&&decisoes.has(String(item.id)));
  const paraRenovar=editaveis.filter(item=>decisoes.get(String(item.id))==="renovar"&&!item.renovacao_em_tramite);
  const paraEncerrar=editaveis.filter(item=>decisoes.get(String(item.id))==="encerrar"&&!item.encerramento_planejado);
  const paraPendente=editaveis.filter(item=>decisoes.get(String(item.id))==="pendente"&&(item.renovacao_em_tramite||item.encerramento_planejado));
  if(!paraRenovar.length&&!paraEncerrar.length&&!paraPendente.length){
    showMsg("atr","Nenhuma alteração para salvar.","ok");
    return;
  }
  const btn=document.getElementById("atr-salvar");
  btn.disabled=true;btn.textContent="Salvando...";
  let alterou=false;
  try{
    if(paraRenovar.length){
      const {data,error}=await sb.from("atas_itens")
        .update({renovacao_em_tramite:true,renovacao_em_tramite_em:new Date().toISOString(),encerramento_planejado:false,encerramento_planejado_em:null})
        .in("id",paraRenovar.map(item=>item.id)).select("id");
      if(error) throw error;
      if((data||[]).length!==paraRenovar.length) throw new Error("Nem todos os itens puderam ser marcados para renovação. Verifique sua permissão.");
      alterou=true;
    }
    if(paraEncerrar.length){
      const {data,error}=await sb.from("atas_itens")
        .update({renovacao_em_tramite:false,renovacao_em_tramite_em:null,encerramento_planejado:true,encerramento_planejado_em:new Date().toISOString()})
        .in("id",paraEncerrar.map(item=>item.id)).select("id");
      if(error) throw error;
      if((data||[]).length!==paraEncerrar.length) throw new Error("Nem todos os itens puderam ser marcados para encerramento. Verifique sua permissão.");
      alterou=true;
    }
    if(paraPendente.length){
      const {data,error}=await sb.from("atas_itens")
        .update({renovacao_em_tramite:false,renovacao_em_tramite_em:null,encerramento_planejado:false,encerramento_planejado_em:null})
        .in("id",paraPendente.map(item=>item.id)).select("id");
      if(error) throw error;
      if((data||[]).length!==paraPendente.length) throw new Error("Nem todos os itens puderam voltar para não analisado. Verifique sua permissão.");
      alterou=true;
    }
    await loadAtas();
    showMsg("atr","✓ Decisões dos itens atualizadas.","ok");
    setTimeout(fecharModalTramiteRenovacao,700);
  }catch(error){
    if(alterou) await loadAtas();
    showMsg("atr","Erro: "+(error.message||error),"err");
  }finally{
    btn.disabled=false;btn.textContent="Salvar decisões";
  }
}

// Filtros estilo Google Sheets para ATAs / Execuções
const ATA_FILTER_COLS = {
  cpl:{get:r=>r.cpl||'',disp:v=>v||'(vazio)'},
  sim:{get:r=>r.sim||'',disp:v=>v||'(vazio)'},
  item:{get:r=>r.item||'',disp:v=>v||'(vazio)'},
  unidade_medida:{get:r=>r.unidade_medida||'',disp:v=>v||'(vazio)'},
  marca:{get:r=>r.marca||'',disp:v=>v||'(vazio)'},
  qtde_contratada:{get:r=>r.qtde_contratada??'',disp:v=>v!==''?v:'(vazio)'},
  exec:{get:r=>getExecutado(r.cpl,r.sim,r.item),disp:v=>v!==''?v:'(vazio)'},
  saldo:{get:r=>getSaldo(r.cpl,r.sim,r.item),disp:v=>v!==''?v:'(vazio)'},
  valor_unit:{get:r=>r.valor_unit||'',disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  data_base_reajuste:{get:r=>r.data_base_reajuste||'',disp:v=>v?fmtDate(v):'(vazio)'},
  vencimento:{get:r=>r.vencimento||'',disp:v=>v||'(vazio)'},
  status:{get:r=>r.status||'',disp:v=>v||'(vazio)'},
  empresa:{get:r=>r.empresa||'',disp:v=>v||'(vazio)'},
};
const EXEC_FILTER_COLS = {
  cpl:{get:r=>r.cpl||'',disp:v=>v||'(vazio)'},
  sim:{get:r=>r.sim||'',disp:v=>v||'(vazio)'},
  item:{get:r=>r.item||'',disp:v=>v||'(vazio)'},
  unidade:{get:r=>r.unidade||'',disp:v=>v||'(vazio)'},
  qtde:{get:r=>r.qtde??'',disp:v=>v!==''?v:'(vazio)'},
  valor:{get:r=>r.valor||'',disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  empenho:{get:r=>r.empenho||'',disp:v=>v||'(vazio)'},
  data_af:{get:r=>r.data_af||'',disp:v=>v||'(vazio)'},
  prev_entrega:{get:r=>r.prev_entrega||'',disp:v=>v||'(vazio)'},
  dt_entrega:{get:r=>r.dt_entrega||'',disp:v=>v||'(vazio)'},
  dias_prazo:{get:r=>calcDiasPrazo(r)??'',disp:v=>v!==''?`${v}d`:'(vazio)'},
  nf:{get:r=>r.nf||'',disp:v=>v||'(vazio)'},
};
let ataHeaderFilters=Object.fromEntries(Object.keys(ATA_FILTER_COLS).map(k=>[k,[]]));
let execHeaderFilters=Object.fromEntries(Object.keys(EXEC_FILTER_COLS).map(k=>[k,[]]));
let _sheetFilterKind=null,_sheetFilterCol=null,_sheetFilterPending=[];
let _atasTableVisible={itens:false,execs:false};

function toggleTabelaAtas(tipo){
  const wrap=document.getElementById(tipo==='itens'?'atas-itens-wrap':'atas-execs-wrap');
  const btn=document.getElementById(tipo==='itens'?'btn-toggle-atas-itens':'btn-toggle-atas-execs');
  if(!wrap||!btn) return;
  _atasTableVisible[tipo]=!_atasTableVisible[tipo];
  wrap.style.display=_atasTableVisible[tipo]?'block':'none';
  btn.textContent=_atasTableVisible[tipo]?'Ocultar':'Mostrar';
  btn.classList.toggle('active',_atasTableVisible[tipo]);
  setTimeout(_setTableOffset,0);
}
function _sheetCfg(kind){return kind==='ata'?ATA_FILTER_COLS:EXEC_FILTER_COLS;}
function _sheetRows(kind){return kind==='ata'?atasItens:atasExec;}
function _sheetFilters(kind){return kind==='ata'?ataHeaderFilters:execHeaderFilters;}
function _sheetPrefix(kind){return kind==='ata'?'hfa':'hfe';}
function _sheetUnique(kind,col){
  const cfg=_sheetCfg(kind)[col];
  return [...new Set(_sheetRows(kind).map(cfg.get).map(v=>v==null?'':String(v)))]
    .sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}
function _ensureSheetDropdown(){
  let dd=document.getElementById('sheet-hdr-dropdown'); if(dd) return dd;
  dd=document.createElement('div'); dd.id='sheet-hdr-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`<div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_sheetHdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_sheetHdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div><hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="sheet-hdr-search" placeholder="🔍 Buscar..." oninput="_sheetHdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_sheetHdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="sheet-hdr-count">0</span></a> — <a href="#" onclick="_sheetHdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="sheet-hdr-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeSheetFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmSheetFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd); return dd;
}
function _openSheetFilter(e,kind,col){
  e.stopPropagation(); const dd=_ensureSheetDropdown();
  if(_sheetFilterKind===kind&&_sheetFilterCol===col&&dd.style.display==='block'){closeSheetFilter();return;}
  _sheetFilterKind=kind; _sheetFilterCol=col;
  const all=_sheetUnique(kind,col), cur=_sheetFilters(kind)[col]||[];
  _sheetFilterPending=cur.length?[...cur]:[...all];
  document.getElementById('sheet-hdr-search').value=''; _sheetHdrRenderList();
  const rect=e.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const ddW=dd.offsetWidth||240; let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px'; dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('sheet-hdr-search').focus(),50);
}
function openAtaFilter(e,col){_openSheetFilter(e,'ata',col);}
function openExecFilter(e,col){_openSheetFilter(e,'exec',col);}
function _sheetHdrRenderList(){
  const kind=_sheetFilterKind,col=_sheetFilterCol; if(!kind||!col) return;
  const q=normalizar(document.getElementById('sheet-hdr-search').value);
  const all=_sheetUnique(kind,col), disp=_sheetCfg(kind)[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('sheet-hdr-count').textContent=all.length;
  document.getElementById('sheet-hdr-list').innerHTML=vis.map(v=>{
    const checked=_sheetFilterPending.includes(v)?'checked':''; const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px;color:var(--text)"><input type="checkbox" value="${safe}" ${checked} onchange="_sheetHdrToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _sheetHdrToggle(cb){if(cb.checked){if(!_sheetFilterPending.includes(cb.value))_sheetFilterPending.push(cb.value);}else{_sheetFilterPending=_sheetFilterPending.filter(x=>x!==cb.value);}}
function _sheetHdrSelectAll(all){if(!_sheetFilterKind||!_sheetFilterCol)return;_sheetFilterPending=all?_sheetUnique(_sheetFilterKind,_sheetFilterCol):[];_sheetHdrRenderList();}
function _sheetHdrSort(asc){
  const kind=_sheetFilterKind,col=_sheetFilterCol;
  if(!kind||!col) return;
  if(kind==='ata'){
    _sortAtasCol=col; _sortAtasAsc=asc;
    document.querySelectorAll('[id^="sort-atas-"]').forEach(el=>el.textContent="");
    const el=document.getElementById("sort-atas-"+col);
    if(el) el.textContent=asc?" ↑":" ↓";
    closeSheetFilter(); filtrarAtas();
    return;
  }
  _sortExecCol=col; _sortExecAsc=asc;
  document.querySelectorAll('[id^="sort-exec-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-exec-"+col);
  if(el) el.textContent=asc?" ↑":" ↓";
  closeSheetFilter(); filtrarExecs();
}
function confirmSheetFilter(){
  const kind=_sheetFilterKind,col=_sheetFilterCol; if(!kind||!col)return;
  const all=_sheetUnique(kind,col), filters=_sheetFilters(kind);
  filters[col]=(_sheetFilterPending.length===0||_sheetFilterPending.length===all.length)?[]:[..._sheetFilterPending];
  closeSheetFilter(); _sheetUpdateHdrBtns(); filtrarAtas();
}
function closeSheetFilter(){const dd=document.getElementById('sheet-hdr-dropdown');if(dd)dd.style.display='none';_sheetFilterKind=null;_sheetFilterCol=null;}
function _sheetUpdateHdrBtns(){
  Object.keys(ATA_FILTER_COLS).forEach(col=>{const btn=document.getElementById('hfa-'+col);if(btn)btn.classList.toggle('active',(ataHeaderFilters[col]||[]).length>0);});
  Object.keys(EXEC_FILTER_COLS).forEach(col=>{const btn=document.getElementById('hfe-'+col);if(btn)btn.classList.toggle('active',(execHeaderFilters[col]||[]).length>0);});
}
document.addEventListener('click',function(e){const dd=document.getElementById('sheet-hdr-dropdown');if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!(e.target.closest&&e.target.closest('.hdr-filter-btn'))){closeSheetFilter();}});

function popularFiltrosAtas(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${v}"${v===cur?" selected":""}>${v}</option>`).join("")};
  sel("fat-cpl",[...new Set(atasItens.map(r=>r.cpl).filter(Boolean))].sort());
  sel("fat-sim",[...new Set(atasItens.map(r=>r.sim).filter(Boolean))].sort());
  sel("fat-empresa",[...new Set(atasItens.map(r=>r.empresa).filter(Boolean))].sort());
  const categoriaSel=document.getElementById('fat-categoria');
  const categoriasAtuais=[...(categoriaSel?.selectedOptions||[])].map(o=>o.value).filter(Boolean);
  const categorias=[...new Set(atasItens.map(r=>r.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(categoriaSel) categoriaSel.innerHTML=(!atasItens.every(r=>r.categoria)?'<option value="__sem__">Sem categoria</option>':'')+categorias.map(v=>`<option value="${_sanEsc(v)}">${_sanEsc(v)}</option>`).join('');
  if(categoriaSel){
    [...categoriaSel.options].forEach(o=>o.selected=categoriasAtuais.includes(o.value));
    if(typeof enhanceMultiSelect==='function') enhanceMultiSelect(categoriaSel,{placeholder:'Pesquisar categorias...'});
  }
  // Agrupar encerrados num único filtro
  const statusUnicos=[...new Set([...atasItens,...atasExec].map(r=>{
    if(r.status&&r.status.toUpperCase().startsWith("ENCERRADO")) return "ENCERRADO";
    return r.status;
  }).filter(Boolean))].sort();
  sel("fat-status",statusUnicos);
  if(!_atasStatusInit){
    _atasStatusInit=true;
    const elSt=document.getElementById("fat-status");
    if(elSt&&!elSt.value&&statusUnicos.includes("VIGENTE")) elSt.value="VIGENTE";
  }
  _sheetUpdateHdrBtns();
}
let _atasStatusInit=false;

function clearAllAtas(){
  ["fat-cpl","fat-sim","fat-empresa","fat-busca"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  const categoria=document.getElementById('fat-categoria');
  if(categoria){[...categoria.options].forEach(o=>o.selected=false);categoria._ss?.render();}
  const elSt=document.getElementById("fat-status");
  if(elSt) elSt.value=[...elSt.options].some(o=>o.value==="VIGENTE")?"VIGENTE":"";
  Object.keys(ataHeaderFilters).forEach(k=>ataHeaderFilters[k]=[]);
  Object.keys(execHeaderFilters).forEach(k=>execHeaderFilters[k]=[]);
  _sheetUpdateHdrBtns();
  filtrarAtas();
}

function _ataBuscaItemTexto(r){
  return [r.item,r.codigo_siam,r.unidade_medida,r.marca,r.cpl,r.sim,r.empresa,r.categoria,r.status].filter(Boolean).join(' ');
}

function _ataBuscaExecTexto(r){
  return [
    r.item,r.codigo_siam,r.marca_modelo,r.cpl,r.sim,r.empresa,r.unidade,
    r.codigo_siam_secretaria,r.email_solicitante,_ataOrigemRecursoLabel(r.origem_recurso),
    r.empenho,r.nf,r.af_numero,r.data_af,r.dt_entrega,r.prev_entrega
  ].filter(Boolean).join(' ');
}

function filtrarAtas(){
  const podeEdAtas=podeEditar('atas');
  const cpl=document.getElementById("fat-cpl")?.value||"";
  const sim=document.getElementById("fat-sim")?.value||"";
  const emp=document.getElementById("fat-empresa")?.value||"";
  const categorias=[...(document.getElementById("fat-categoria")?.selectedOptions||[])].map(o=>o.value).filter(Boolean);
  const st=document.getElementById("fat-status")?.value||"";
  const busca=document.getElementById("fat-busca")?.value||"";

  let rows=atasItens.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    if(emp&&r.empresa!==emp) return false;
    if(categorias.length&&!((!r.categoria&&categorias.includes('__sem__'))||categorias.includes(r.categoria))) return false;
    for(const [col,sel] of Object.entries(ataHeaderFilters)){
      if(!sel.length) continue;
      const cfg=ATA_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // "Todos" (st vazio) mostra vigentes e encerrados; "ENCERRADO" mostra só encerrados; outro valor filtra exato
    if(st==="ENCERRADO"&&!(r.status&&r.status.toUpperCase().startsWith("ENCERRADO"))) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(busca&&!matchBusca(_ataBuscaItemTexto(r),busca)) return false;
    return true;
  });
  // Ordenação
  if(_sortAtasCol){
    rows.sort((a,b)=>{
      let va,vb;
      if(_sortAtasCol==="exec"){va=getExecutado(a.cpl,a.sim,a.item);vb=getExecutado(b.cpl,b.sim,b.item);}
      else if(_sortAtasCol==="saldo"){va=getSaldo(a.cpl,a.sim,a.item);vb=getSaldo(b.cpl,b.sim,b.item);}
      else{va=a[_sortAtasCol]||"";vb=b[_sortAtasCol]||"";}
      if(typeof va==="number"&&typeof vb==="number") return _sortAtasAsc?va-vb:vb-va;
      // Ordenação de datas no formato DD/MM/YYYY
      if(["vencimento","data_base_reajuste"].includes(_sortAtasCol)){
        const da=parseDataBR(va),db=parseDataBR(vb);
        if(da&&db) return _sortAtasAsc?da-db:db-da;
        if(da) return -1;
        if(db) return 1;
      }
      return _sortAtasAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }

  const totalSaldo=rows.reduce((a,r)=>a+getSaldo(r.cpl,r.sim,r.item),0);
  const totalExec=rows.reduce((a,r)=>a+getExecutado(r.cpl,r.sim,r.item),0);
  const vencendo90=new Set(rows.filter(r=>{
    const dias=diasParaVencer(r.vencimento);
    return dias>=0&&dias<=90&&!_ataStatusEncerrado(r.status);
  }).map(_ataAlertContractKey)).size;

  document.getElementById("at-total").textContent=rows.length;
  document.getElementById("at-saldo").textContent=totalSaldo;
  document.getElementById("at-exec").textContent=totalExec;
  document.getElementById("at-vence").textContent=vencendo90;
  document.getElementById("atas-count").textContent=`${rows.length} itens`;
  window._ataRowsFiltered=rows;

  const dias90=new Date();dias90.setDate(dias90.getDate()+90);

  document.getElementById("atas-body").innerHTML=rows.map(r=>{
    const exec=getExecutado(r.cpl,r.sim,r.item);
    const saldo=r.qtde_contratada-exec;
    const dias=diasParaVencer(r.vencimento);
    const vcor=dias<=0?"var(--red)":dias<=90?"var(--amber)":"var(--green)";
    const pct=r.qtde_contratada?Math.round(exec/r.qtde_contratada*100):0;
    const stColor=r.status==="VIGENTE"?"var(--green)":r.status==="ENCERRADO"?"var(--red)":"var(--amber)";
    const temPedidoAberto=atasExec.some(e=>String(e.ata_item_id)===String(r.id)&&!_ataExecRecebida(e));
    const itemAlertaVigencia=_ataItemAlertaVigencia(r);
    const contratoId=_ataAlertEsc(r.contrato_id);
    const atributosClique=itemAlertaVigencia
      ?` class="ata-alert-table-row" tabindex="0" title="Clique para revisar as decisões deste contrato" onclick="ataTabelaItemAlertaClick(event,'${contratoId}')" onkeydown="ataTabelaItemAlertaKeydown(event,'${contratoId}')"`
      :"";
    return`<tr${atributosClique}>
      <td style="font-size:11px;white-space:nowrap">${r.cpl}</td>
      <td style="font-size:11px;white-space:nowrap">${r.sim}</td>
      <td class="td-trunc" title="${_sanEsc(r.item)}${r.codigo_siam?' · SIAM '+_sanEsc(r.codigo_siam):''}" style="max-width:220px">
        ${_sanEsc(r.item)}${r.codigo_siam?`<div style="font-size:10px;color:var(--blue);font-weight:600">SIAM ${_sanEsc(r.codigo_siam)}</div>`:''}
        ${r.categoria?`<div style="font-size:9px;color:var(--text3);font-weight:600;margin-top:2px">${_sanEsc(r.categoria)}</div>`:''}
        ${r.ata_renovada?`<div style="margin-top:4px"><span class="badge" style="background:var(--amber-bg);color:var(--amber-text);font-size:9px;white-space:nowrap" title="Esta Ata de RP já utilizou sua única renovação${r.renovada_ate?` e está vigente até ${fmtDate(r.renovada_ate)}`:''}.">✓ JÁ RENOVADA · LIMITE ATINGIDO</span></div>`:r.renovacao_em_tramite?`<div style="margin-top:4px"><span class="badge ata-renewal-badge" title="Este item já foi incluído no trâmite administrativo de renovação${r.renovacao_em_tramite_em?` em ${_ataFormatarDataTramite(r.renovacao_em_tramite_em)}`:""}.">🔄 RENOVAÇÃO EM TRÂMITE</span></div>`:r.encerramento_planejado?`<div style="margin-top:4px"><span class="badge ata-closing-badge" title="Este item foi analisado e deverá ser encerrado ao fim da vigência${r.encerramento_planejado_em?` em ${_ataFormatarDataTramite(r.encerramento_planejado_em)}`:""}.">⛔ ENCERRAR AO VENCER</span></div>`:""}
      </td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.unidade_medida||"—")}</td>
      <td style="font-size:11px">${r.marca||"—"}</td>
      <td style="text-align:right">${r.qtde_contratada}</td>
      <td style="text-align:right">
        ${exec}
        <div style="height:4px;background:var(--surface2);border-radius:2px;margin-top:3px;width:60px">
          <div style="height:4px;background:${pct>=90?'var(--red)':pct>=70?'var(--amber)':'var(--green)'};border-radius:2px;width:${Math.min(pct,100)}%"></div>
        </div>
      </td>
      <td style="text-align:right;font-weight:500;color:${saldo<=0?'var(--red)':saldo<=5?'var(--amber)':'var(--text)'}">${saldo}</td>
      <td style="text-align:right;font-size:11px">${r.valor_unit?fmtFull(r.valor_unit):"—"}</td>
      <td style="font-size:11px;white-space:nowrap">${r.data_base_reajuste?fmtDate(r.data_base_reajuste):"—"}</td>
      <td style="font-size:11px;color:${vcor};font-weight:500">${r.vencimento||"—"}${dias<=90&&dias>0?` (${dias}d)`:''}${dias<=0?' ⛔':''}</td>
      <td><span class="badge" style="background:${stColor}22;color:${stColor}">${r.status}</span></td>
      <td style="font-size:11px">${r.empresa||"—"}</td>
      <td>
        ${(r.status&&r.status.toUpperCase().startsWith("ENCERRADO"))||!podeEdAtas?`
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="verExecsItem('${r.id}')" class="btn-secondary btn-compact" title="Ver solicitações deste item">📋 Solicitações</button>
          ${podeEdAtas&&temPedidoAberto?`<button onclick="abrirTrocaMarcaItemAta('${r.id}')" class="btn-secondary btn-compact" title="Trocar a marca dos pedidos ainda não recebidos">🏷️ Trocar marca</button>`:''}
        </div>
        `:`
        <div style="display:flex;align-items:center;gap:6px">
        <button onclick="abrirModalEditAta('${r.id}')" class="btn-secondary btn-compact" title="Adicionar solicitação">✏️ Solicitação</button>
        ${kebabMenuHtml([
          podeEditar('atas')?{label:'🏷️ Trocar marca',onclick:`abrirTrocaMarcaItemAta('${r.id}')`,title:'Registrar apostilamento de troca de marca/modelo'}:null,
          podeEditar('atas')?{label:'📈 Reajustar',onclick:`abrirReajusteItemAta('${r.id}')`,title:'Registrar novo valor para este item a partir de uma data'}:null,
          {label:'📋 Solicitações',onclick:`verExecsItem('${r.id}')`,title:'Ver solicitações deste item'},
          _isAdmin()?{label:'✏️ Editar contrato (admin)',onclick:`_ataAbrirEditarContrato('${r.contrato_id}')`,title:'Edição administrativa completa do contrato'}:null,
          podeEditar('contratos')?{label:'✏️ Dados operacionais',onclick:`_ataAbrirDadosOperacionaisContrato('${r.contrato_id}')`,title:'Editar e-mails, prefixo, contato, data-base e registrar observação'}:null,
          podeEditar('contratos')?{label:'👤 Fiscalizadores',onclick:`_ataAbrirFiscalizadoresContrato('${r.contrato_id}')`,title:'Adicionar ou remover fiscalizadores com registro no histórico'}:null,
          podeEditar('contratos')?{label:'🔗 Vinculações',onclick:`_ataAbrirEmailContrato('${r.contrato_id}')`,title:'Configurar e-mail e prefixo de chamado'}:null,
          saldo<=0?{label:'⛔ Encerrar item',onclick:`encerrarAtaItem('${r.id}')`,title:'Saldo zerado: encerrar antecipadamente somente este item da ATA',danger:true,divider:true}:null
        ])}
        </div>
        `}
      </td>
    </tr>`;
  }).join("")||`<tr><td colspan="14"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum item de ata encontrado</div></td></tr>`;

  // Tabela de execuções filtradas
  let execRows=atasExec.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    for(const [col,sel] of Object.entries(execHeaderFilters)){
      if(!sel.length) continue;
      const cfg=EXEC_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // Execuções pendentes continuam operacionais mesmo após o encerramento da ata/item.
    // "Todos" mostra ambas; "ENCERRADO" recebe apenas execuções já entregues.
    const rEncerrado=r.status&&r.status.toUpperCase().startsWith("ENCERRADO");
    if(st==="ENCERRADO"&&!rEncerrado) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(busca&&!matchBusca(_ataBuscaExecTexto(r),busca)) return false;
    return true;
  });
  // Ordenação execuções (padrão: data_af mais recente no topo)
  execRows.sort((a,b)=>{
    let va=a[_sortExecCol]||"",vb=b[_sortExecCol]||"";
    if(_sortExecCol==="dias_prazo"){va=calcDiasPrazo(a)??9999;vb=calcDiasPrazo(b)??9999;return _sortExecAsc?va-vb:vb-va;}
    if(typeof va==="number"&&typeof vb==="number") return _sortExecAsc?va-vb:vb-va;
    // Ordenação de datas
    if(["data_af","prev_entrega","dt_entrega"].includes(_sortExecCol)){
      const da=parseDataBR(va),db=parseDataBR(vb);
      if(da&&db) return _sortExecAsc?da-db:db-da;
      if(da) return _sortExecAsc?-1:1;
      if(db) return _sortExecAsc?1:-1;
    }
    return _sortExecAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  _renderExecRows(execRows);
}

function parseDataBR(s){
  if(!s) return null;
  try{
    s=s.trim();
    if(s.includes("/")){
      const p=s.split("/");
      let ano=parseInt(p[2]);
      // Corrigir ano com 2 dígitos: 25 → 2025, 26 → 2026
      if(ano<100) ano+=2000;
      return new Date(ano,parseInt(p[1])-1,parseInt(p[0]));
    }
    if(s.includes("-")){
      const p=s.split("-");
      let ano=parseInt(p[0]);
      if(ano<100) ano+=2000;
      return new Date(ano,parseInt(p[1])-1,parseInt(p[2]));
    }
    return null;
  }catch(e){return null;}
}

function filtrarExecs(){
  const busca=document.getElementById("fat-busca")?.value||"";
  const cpl=document.getElementById("fat-cpl")?.value||"";
  const sim=document.getElementById("fat-sim")?.value||"";
  const st=document.getElementById("fat-status")?.value||"";
  let execRows=atasExec.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    for(const [col,sel] of Object.entries(execHeaderFilters)){
      if(!sel.length) continue;
      const cfg=EXEC_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // O status da execução considera o recebimento, sem reabrir a ata para novas solicitações.
    const rEncerrado=r.status&&r.status.toUpperCase().startsWith("ENCERRADO");
    if(st==="ENCERRADO"&&!rEncerrado) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(_filtroPendentes&&r.dt_entrega) return false;
    if(busca&&!matchBusca(_ataBuscaExecTexto(r),busca)) return false;
    return true;
  });
  // Ordenação
  execRows.sort((a,b)=>{
    if(_sortExecCol==="dias_prazo"){
      const va=calcDiasPrazo(a)??9999,vb=calcDiasPrazo(b)??9999;
      return _sortExecAsc?va-vb:vb-va;
    }
    let va=a[_sortExecCol]||"",vb=b[_sortExecCol]||"";
    if(typeof va==="number"&&typeof vb==="number") return _sortExecAsc?va-vb:vb-va;
    if(["data_af","prev_entrega","dt_entrega"].includes(_sortExecCol)){
      const da=parseDataBR(va),db=parseDataBR(vb);
      if(da&&db) return _sortExecAsc?da-db:db-da;
      if(da) return _sortExecAsc?-1:1;
      if(db) return _sortExecAsc?1:-1;
    }
    return _sortExecAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  _renderExecRows(execRows);
}

const _atasExecExpandidas=new Set();
const _atasExecDetalhes=new Map();

function _ataReajustePendenteExec(exec){
  const aplicaveis=_ataReajustesDoItem(exec?.ata_item_id)
    .filter(r=>String(r.data_vigencia)<=_ataHojeISO())
    .sort((a,b)=>String(b.data_vigencia).localeCompare(String(a.data_vigencia)));
  return aplicaveis.find(r=>!atasExecReajustes.some(er=>
    er.status==='ATIVO'
    && String(er.ata_reajuste_id)===String(r.id)
    && String(er.ata_execucao_id)===String(exec.id)
  ))||null;
}

function _renderExecRows(execRows){
  document.getElementById("exec-count").textContent=`${execRows.length} solicitações`;
  document.getElementById("exec-body").innerHTML=execRows.map(r=>{
    const dias=calcDiasPrazo(r);
    let prazoCel;
    if(r.dt_entrega) prazoCel='<td style="font-size:11px;color:var(--green)">✓ Entregue</td>';
    else if(dias===null) prazoCel='<td style="font-size:11px;color:var(--text3)">—</td>';
    else if(dias<0) prazoCel=`<td style="font-size:11px;color:var(--red);font-weight:500">⛔ ${Math.abs(dias)}d atraso</td>`;
    else if(dias<=7) prazoCel=`<td style="font-size:11px;color:var(--red);font-weight:500">⚠️ ${dias}d</td>`;
    else if(dias<=15) prazoCel=`<td style="font-size:11px;color:var(--amber);font-weight:500">⏰ ${dias}d</td>`;
    else prazoCel=`<td style="font-size:11px;color:var(--text2)">${dias}d</td>`;
    const consumo=String(r.tipo_material||'').toUpperCase()==='CONSUMO';
    const aberta=!consumo&&_atasExecExpandidas.has(String(r.id));
    const detalhe=aberta?_renderDetalheExecAta(r):'';
    const acaoLinha=consumo
      ?`abrirVidaConsumoExecAta('${_sanEsc(r.id)}',event)`
      :`toggleDetalheExecAta('${_sanEsc(r.id)}',event)`;
    const excluirBtn=_execAtaPodeExcluir(r)?`<button type="button" onclick="event.stopPropagation();excluirExec('${_sanEsc(r.id)}')" class="btn-compact btn-action-square" style="border:1px solid var(--red-bg);color:var(--red-text);background:var(--red-bg);cursor:pointer" title="Excluir solicitação ainda sem AF" aria-label="Excluir solicitação ainda sem AF">🗑️</button>`:'';
    const temReajuste=atasExecReajustes.some(er=>er.status==='ATIVO'&&String(er.ata_execucao_id)===String(r.id));
    const reajustePendente=_ataReajustePendenteExec(r);
    const reajusteBtn=podeEditar('atas')
      ?(temReajuste&&!reajustePendente
        ?`<button type="button" class="btn-secondary btn-compact btn-action-square" disabled title="Esta execução já recebeu o reajuste aplicável" aria-label="Execução reajustada">✓</button>`
        :`<button type="button" class="btn-secondary btn-compact btn-action-square" onclick="event.stopPropagation();abrirReajusteExecucaoAta('${_sanEsc(r.id)}')" title="Reajustar esta execução" aria-label="Reajustar esta execução">📈</button>`)
      :'';
    const aceiteBtn=String(r.origem_recurso||'').toLowerCase()==='carona'
      ?`<button type="button" class="btn-secondary btn-compact" onclick="event.stopPropagation();emitirAceiteCarona('${_sanEsc(r.id)}',this)" title="Gerar PDF do aceite de adesão para esta Carona">📄 Aceite</button>`
      :'';
    return `<tr class="ata-exec-row${aberta?' ata-exec-row-open':''}" data-exec-id="${_sanEsc(r.id)}" onclick="${acaoLinha}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${acaoLinha}}" role="button" tabindex="0" ${consumo?'':`aria-expanded="${aberta?'true':'false'}"`} title="${consumo?'Abrir a vida deste lote de material de consumo':`Clique para ${aberta?'recolher':'ver todos os detalhes'}`}">
    ${_renderSancaoExecCheckbox(r)}
    <td style="font-size:11px">${_sanEsc(r.cpl)}</td>
    <td style="font-size:11px">${_sanEsc(r.sim)}</td>
    <td class="td-trunc" style="max-width:180px" title="${_sanEsc(r.item)}${r.codigo_siam?' · SIAM '+_sanEsc(r.codigo_siam):''}">${_sanEsc(r.item)}${r.codigo_siam?`<div style="font-size:10px;color:var(--blue);font-weight:600">SIAM ${_sanEsc(r.codigo_siam)}</div>`:''}</td>
    <td style="font-size:12px">${_sanEsc(r.unidade)}</td>
    <td style="text-align:right">${r.qtde}</td>
    <td style="text-align:right;font-size:11px">${r.valor?fmtFull(r.valor):"—"}</td>
    <td style="font-size:11px">${_sanEsc(r.empenho||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.data_af||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.prev_entrega||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${r.dt_entrega?_sanEsc(r.dt_entrega):'<span style="color:var(--red);font-size:10px;font-weight:500">⚠️ AGUARD.</span>'}</td>
    ${prazoCel}
    <td style="font-size:11px">${_sanEsc(r.nf||"—")}</td>
    <td style="white-space:nowrap"><div style="display:flex;gap:4px;align-items:center">${aceiteBtn}${reajusteBtn}${excluirBtn}</div></td>
  </tr>${detalhe}`;
  }).join("");
  window._execRowsFiltered=execRows;
}

async function toggleDetalheExecAta(execId,event){
  if(event?.target?.closest?.('button,a,input,select,textarea,label')) return;
  const key=String(execId);
  if(_atasExecExpandidas.has(key)){
    _atasExecExpandidas.delete(key);
    _renderExecRows(window._execRowsFiltered||[]);
    return;
  }
  _atasExecExpandidas.add(key);
  _renderExecRows(window._execRowsFiltered||[]);
  if(!_atasExecDetalhes.has(key)){
    try{
      const detalhe=await _carregarDetalheExecAta(key);
      _atasExecDetalhes.set(key,detalhe);
    }catch(e){
      _atasExecDetalhes.set(key,{erro:e.message||String(e),unidades:[],notas:new Map(),emenda:null,empenhos:[]});
    }
    if(_atasExecExpandidas.has(key)) _renderExecRows(window._execRowsFiltered||[]);
  }
}

async function _carregarDetalheExecAta(execId){
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec) throw new Error('Execução não encontrada.');
  const vazio=()=>Promise.resolve({data:null,error:null});
  const [rUnidades,rEmpExec,rEmenda,rEmpEmenda]=await Promise.all([
    sb.from('atas_execucao_unidades').select('*').eq('exec_id',execId).order('unidade_seq',{ascending:true}),
    sb.from('empenho_itens').select('*,empenhos(id,numero,ano,valor_empenhado,data_emissao,observacoes)').eq('exec_id',execId),
    exec.emenda_item_id?sb.from('emenda_itens').select('*,emendas(tipo,emenda,numero,parlamentar,ano,objeto)').eq('id',exec.emenda_item_id).maybeSingle():vazio(),
    exec.emenda_item_id?sb.from('empenho_itens').select('*,empenhos(id,numero,ano,valor_empenhado,data_emissao,observacoes)').eq('emenda_item_id',exec.emenda_item_id):vazio()
  ]);
  for(const resposta of [rUnidades,rEmpExec,rEmenda,rEmpEmenda]) if(resposta.error) throw resposta.error;
  const unidades=rUnidades.data||[];
  const nfIds=[...new Set(unidades.map(u=>u.nota_fiscal_id).filter(Boolean))];
  const notas=new Map();
  if(nfIds.length){
    const {data,error}=await sb.from('notas_fiscais').select('*').in('id',nfIds);
    if(error) throw error;
    (data||[]).forEach(n=>notas.set(String(n.id),n));
  }
  let notaExec=[...notas.values()][0]||null;
  if(!notaExec&&exec.nf){
    const normalizado=typeof normalizarNumeroDocumento==='function'
      ?normalizarNumeroDocumento(exec.nf)
      :String(exec.nf).replace(/\D/g,'');
    let consulta=sb.from('notas_fiscais').select('*').eq('numero_normalizado',normalizado);
    if(exec.contrato_id) consulta=consulta.eq('contrato_id',exec.contrato_id);
    const {data,error}=await consulta.order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    notaExec=data||null;
    if(notaExec) notas.set(String(notaExec.id),notaExec);
  }
  const emenda=rEmenda.data||null;
  const empenhos=[...(rEmpExec.data||[]),...(rEmpEmenda.data||[])].filter((v,i,a)=>a.findIndex(x=>String(x.id)===String(v.id))===i);
  return {unidades,notas,notaExec,emenda,empenhos};
}

async function abrirVidaConsumoExecAta(execId,event){
  if(event?.target?.closest?.('button,a,input,select,textarea,label')) return;
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec||String(exec.tipo_material||'').toUpperCase()!=='CONSUMO') return;
  try{
    let detalhe=_atasExecDetalhes.get(String(execId));
    if(!detalhe){
      detalhe=await _carregarDetalheExecAta(execId);
      _atasExecDetalhes.set(String(execId),detalhe);
    }
    if(detalhe.erro) throw new Error(detalhe.erro);
    const ei=detalhe.emenda||{};
    const emenda=ei.emendas||{};
    const quantidade=Number(exec.qtde)||0;
    const nota=detalhe.notaExec||[...detalhe.notas.values()][0]||{};
    const empenhos=[...new Set([exec.empenho,...detalhe.empenhos.map(v=>{
      const emp=v.empenhos||{};
      return emp.numero?(String(emp.numero)+(emp.ano?'/'+emp.ano:'')):'';
    })].filter(Boolean))].join('; ');
    const em={
      id:exec.emenda_item_id||exec.id,
      item:exec.item,
      marca_modelo:exec.marca_modelo,
      qtde:quantidade,
      vl_unitario:quantidade?Number(exec.valor||0)/quantidade:null,
      vl_total:Number(exec.valor)||null,
      unidade:ei.unidade_beneficiada||ei.unidade_entrega||exec.unidade,
      unidade_entrega:exec.unidade,
      emenda:ei.emenda||emenda.emenda||'',
      ano:emenda.ano||'',
      parlamentar:emenda.parlamentar||'',
      objeto:emenda.objeto||'',
      cpl:exec.cpl,
      contrato_sim:exec.sim,
      fornecedor_fluxo:exec.empresa,
      empenho:empenhos,
      nota_fiscal:nota.numero||exec.nf
    };
    const inv={
      tipo:'ATA', id:exec.id, _base_id:exec.id,
      _loteConsumo:true, _unidadeFisica:false, tipo_material:'CONSUMO',
      item:exec.item, marca_modelo:exec.marca_modelo,
      unidade:exec.unidade, empresa:exec.empresa, cnpj:exec.cnpj,
      processo:exec.cpl, contrato:exec.sim, qtde:quantidade,
      valor_licitacao_unit:exec.valor_unit_registrado,
      valor_executado_unit:quantidade?Number(exec.valor||0)/quantidade:null,
      valor_executado_total:Number(exec.valor)||null,
      empenho:empenhos,
      nota_fiscal:nota.numero||exec.nf,
      nota_fiscal_arquivo:nota.arquivo_url||'',
      nf_data:nota.data_emissao||null,
      nf_valor:nota.valor_total||null,
      data_recebimento:exec.dt_entrega||null,
      af_numero:exec.af_numero||'', af_data:exec.data_af||null,
      emenda:em.emenda, emenda_ano:em.ano, parlamentar:em.parlamentar,
      emenda_item_desc:ei.item||exec.item,
      emenda_item_id:exec.emenda_item_id||null,
      confirmacao_obs:exec.confirmacao_obs||exec.obs_prazo||''
    };
    if(typeof abrirDetalheLoteConsumoAta!=='function') throw new Error('O modal Vida do item não está disponível. Atualize a página e tente novamente.');
    abrirDetalheLoteConsumoAta(em,inv);
  }catch(e){
    if(window.toast) toast('Não foi possível abrir a vida do item: '+(e.message||e),'error');
    else alert('Não foi possível abrir a vida do item: '+(e.message||e));
  }
}

function _ataDetalheCampo(label,valor){
  if(valor==null||String(valor).trim()==='') return '';
  return `<div class="ata-exec-detail-field"><span>${_sanEsc(label)}</span><strong>${_sanEsc(String(valor))}</strong></div>`;
}

function _ataOrigemRecursoLabel(origem){
  return ({emenda:'Emenda parlamentar',recurso_proprio:'Recurso próprio',carona:'Carona'})[origem]||origem||'Não informada';
}

function _ataNumeroExtensoFeminino(valor){
  const n=Math.trunc(Number(valor));
  if(!Number.isFinite(n)||n<0||n>999) return '';
  const unidades=['zero','uma','duas','três','quatro','cinco','seis','sete','oito','nove'];
  const especiais=['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dezenas=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const centenas=['','cento','duzentas','trezentas','quatrocentas','quinhentas','seiscentas','setecentas','oitocentas','novecentas'];
  if(n<10) return unidades[n];
  if(n<20) return especiais[n-10];
  if(n<100) return dezenas[Math.floor(n/10)]+(n%10?' e '+unidades[n%10]:'');
  if(n===100) return 'cem';
  return centenas[Math.floor(n/100)]+(n%100?' e '+_ataNumeroExtensoFeminino(n%100):'');
}

function _ataQuantidadeAceite(valor){
  const n=Number(valor)||0;
  const numero=Number.isInteger(n)?String(n).padStart(2,'0'):n.toLocaleString('pt-BR');
  const extenso=Number.isInteger(n)?_ataNumeroExtensoFeminino(n):'';
  return extenso?numero+' ('+extenso+')':numero;
}

function _ataNumeroDocumento(valor,tipo){
  let texto=String(valor||'').trim();
  if(tipo==='cpl') texto=texto.replace(/^cpl\s*(?:n[º°o.]?\s*)?/i,'');
  else texto=texto.replace(/^(?:ata(?:\s+de\s+rp)?|siam)\s*(?:n[º°o.]?\s*)?/i,'');
  return texto.trim()||'—';
}

function _ataFormatarCnpj(valor){
  const digitos=String(valor||'').replace(/\D/g,'');
  if(digitos.length!==14) return String(valor||'').trim();
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
}

function _ataDataExtenso(data=new Date()){
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(data);
}

function _ataTextoPdf(valor){
  return String(valor??'').replace(/\s+/g,' ').trim();
}

function montarTextoAceiteCarona(exec){
  const quantidade=Number(exec?.qtde)||0;
  const total=Number(exec?.valor)||0;
  const unitario=quantidade?total/quantidade:(Number(exec?.valor_unit_registrado)||0);
  const ata=_ataNumeroDocumento(exec?.sim,'ata');
  const cpl=_ataNumeroDocumento(exec?.cpl,'cpl');
  const unidade=_ataTextoPdf(exec?.unidade)||'unidade solicitante';
  const codigo=_ataTextoPdf(exec?.codigo_siam_secretaria)||'não informado';
  const item=_ataTextoPdf(exec?.item)||'item registrado';
  const marca=_ataTextoPdf(exec?.marca_modelo);
  const qtdTexto=_ataQuantidadeAceite(quantidade);
  const unidadeTexto=quantidade===1?'unidade':'unidades';
  return 'Considerando a solicitação apresentada pela '+unidade+', identificada pelo Código SIAM nº '+codigo+
    ', AUTORIZO a adesão à Ata de Registro de Preços nº '+ata+', decorrente da CPL nº '+cpl+
    ', para o fornecimento de '+qtdTexto+' '+unidadeTexto+' do item "'+item+'"'+
    (marca?', marca/modelo '+marca:'')+', pelo valor unitário registrado de '+fmtFull(unitario)+
    ' e valor total autorizado de '+fmtFull(total)+
    ', com destinação à unidade solicitante, nas condições, especificações e demais valores registrados na referida Ata.';
}
window.montarTextoAceiteCarona=montarTextoAceiteCarona;

let _ataTimbradoAceitePromise=null;
function _ataCarregarTimbradoAceite(){
  if(_ataTimbradoAceitePromise) return _ataTimbradoAceitePromise;
  _ataTimbradoAceitePromise=new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Não foi possível carregar o timbrado da Secretaria da Saúde.'));
    img.src='assets/timbrado-ses/timbrado-ses-fundo.png';
  });
  return _ataTimbradoAceitePromise;
}

async function _ataCriarPdfAceiteCarona(exec,secretario,fiscal,opcoes={}){
  await ensureLib('jspdf');
  const [{jsPDF},timbrado]=[window.jspdf,await _ataCarregarTimbradoAceite()];
  const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
  pdf.addImage(timbrado,'PNG',0,0,210,297,undefined,'FAST');
  const x=30, largura=150;
  const ata=_ataNumeroDocumento(exec.sim,'ata');
  const cpl=_ataNumeroDocumento(exec.cpl,'cpl');
  const quantidade=Number(exec.qtde)||0;
  const total=Number(exec.valor)||0;
  const unitario=quantidade?total/quantidade:(Number(exec.valor_unit_registrado)||0);
  const cnpj=_ataFormatarCnpj(exec.cnpj);
  const texto=montarTextoAceiteCarona(exec);
  const setFonte=(tamanho=9,estilo='normal',cor=[20,20,20])=>{
    pdf.setFont('helvetica',estilo);
    pdf.setFontSize(tamanho);
    pdf.setTextColor(...cor);
  };

  setFonte(12,'bold');
  pdf.text('ACEITE DE ADESÃO À ATA DE REGISTRO DE PREÇOS',105,54,{align:'center'});
  setFonte(9,'bold');
  pdf.text('Assunto: Autorização para adesão (Carona) à Ata de RP nº '+ata,x,68);
  setFonte(9,'normal');
  pdf.text('Sorocaba, '+_ataDataExtenso()+'.',x+largura,79,{align:'right'});

  setFonte(10,'normal');
  const linhasTexto=pdf.splitTextToSize(texto,largura);
  // O alinhamento justificado do jsPDF produz `Infinity Tw` quando um dado contém
  // quebra de linha e cria uma linha com uma única palavra. O texto é normalizado
  // acima e renderizado à esquerda para manter o PDF válido em qualquer leitor.
  pdf.text(linhasTexto,x,92,{maxWidth:largura,lineHeightFactor:1.42});
  let y=92+(linhasTexto.length*5.05)+7;

  const detalhes=[
    ['Unidade solicitante',_ataTextoPdf(exec.unidade)],
    ['Código SIAM da unidade',_ataTextoPdf(exec.codigo_siam_secretaria)],
    ['E-mail do solicitante',_ataTextoPdf(exec.email_solicitante)],
    ['Processo / CPL','CPL nº '+cpl],
    ['Ata de Registro de Preços','Ata nº '+ata],
    ['Item',[_ataTextoPdf(exec.item),_ataTextoPdf(exec.marca_modelo)].filter(Boolean).join(' - ')],
    ['Quantidade',_ataQuantidadeAceite(quantidade)+' '+(quantidade===1?'unidade':'unidades')],
    ['Valor unitário',fmtFull(unitario)],
    ['Valor total autorizado',fmtFull(total)],
    ['Fornecedor',_ataTextoPdf(exec.empresa)],
    ['CNPJ',cnpj],
    ['Empenho',exec.empenho],
    ['AF',exec.af_numero]
  ].filter(([,valor])=>valor!=null&&String(valor).trim()!==''&&String(valor).trim()!=='—');

  detalhes.forEach(([label,valor])=>{
    const labelLargura=42;
    setFonte(8.1,'normal');
    const linhas=pdf.splitTextToSize(_ataTextoPdf(valor),largura-labelLargura-4);
    const altura=Math.max(7,linhas.length*3.6+3);
    pdf.setFillColor(247,247,247);
    pdf.setDrawColor(190,190,190);
    pdf.rect(x,y,labelLargura,altura,'FD');
    pdf.rect(x+labelLargura,y,largura-labelLargura,altura);
    setFonte(8.1,'bold');
    pdf.text(label,x+2,y+4.7);
    setFonte(8.1,'normal');
    pdf.text(linhas,x+labelLargura+2,y+4.7);
    y+=altura;
  });

  const assinaturaY=Math.min(242,Math.max(220,y+17));
  const coluna=68, esquerda=32, direita=110;
  pdf.setDrawColor(60,60,60);
  pdf.setLineWidth(.25);
  pdf.line(esquerda,assinaturaY,esquerda+coluna,assinaturaY);
  pdf.line(direita,assinaturaY,direita+coluna,assinaturaY);
  setFonte(9,'bold');
  const fiscalLinhas=pdf.splitTextToSize(_ataTextoPdf(fiscal),coluna-4);
  const secretarioLinhas=pdf.splitTextToSize(_ataTextoPdf(secretario.nome),coluna-4);
  pdf.text(fiscalLinhas,esquerda+coluna/2,assinaturaY+5,{align:'center'});
  pdf.text(secretarioLinhas,direita+coluna/2,assinaturaY+5,{align:'center'});
  setFonte(9,'normal');
  pdf.text('Fiscal de Contrato',esquerda+coluna/2,assinaturaY+5+(fiscalLinhas.length*4),{align:'center'});
  pdf.text(_ataTextoPdf(secretario.cargo),direita+coluna/2,assinaturaY+5+(secretarioLinhas.length*4),{align:'center',maxWidth:coluna});

  const nomeArquivo=('aceite_carona_ata_'+ata+'_siam_'+exec.codigo_siam_secretaria+'_'+_ataHojeISO()+'.pdf')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_');
  if(opcoes.salvar!==false) pdf.save(nomeArquivo);
  return pdf;
}

async function emitirAceiteCarona(execId,btn){
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec){ toast('Solicitação de Carona não encontrada.','error'); return; }
  if(String(exec.origem_recurso||'').toLowerCase()!=='carona'){
    toast('O aceite de adesão está disponível somente para solicitações de Carona.','error');
    return;
  }
  if(!String(exec.codigo_siam_secretaria||'').trim()){
    toast('Informe o Código SIAM da unidade solicitante antes de emitir o aceite.','error');
    return;
  }
  const fiscal=String(currentProfile?.nome||'').trim();
  if(!fiscal){
    toast('Cadastre seu nome completo no perfil antes de emitir o aceite.','error');
    return;
  }
  const textoOriginal=btn?.textContent||'📄 Aceite';
  if(btn){btn.disabled=true;btn.textContent='Gerando...';}
  try{
    const secretario=await obterSecretarioAtual({recarregar:true});
    if(!secretario?.nome||!secretario?.cargo){
      throw new Error('Cadastre o nome e o cargo do Secretário na aba Cadastros antes de emitir o aceite.');
    }
    await _ataCriarPdfAceiteCarona(exec,secretario,fiscal);
    toast('PDF do aceite gerado.','success');
  }catch(e){
    toast(e.message||'Não foi possível gerar o aceite.','error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent=textoOriginal;}
  }
}
window.emitirAceiteCarona=emitirAceiteCarona;

function _renderHistoricoReajustesExecAta(execId){
  const registros=atasExecReajustes
    .filter(r=>r.status==='ATIVO'&&String(r.ata_execucao_id)===String(execId))
    .sort((a,b)=>String(b.criado_em||'').localeCompare(String(a.criado_em||'')));
  if(!registros.length) return '';
  return `<div style="margin-top:12px;padding:9px 11px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2)">
    <div style="font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text3);margin-bottom:6px">Histórico de reajustes</div>
    ${registros.map(r=>{
      const regra=atasReajustes.find(x=>String(x.id)===String(r.ata_reajuste_id))||{};
      return `<div style="font-size:11px;color:var(--text2);line-height:1.55">
        <strong style="color:var(--text)">Reajuste ${regra.data_vigencia?`desde ${fmtDate(regra.data_vigencia)}`:''}</strong>
        · ${_ataOrigemRecursoLabel(r.origem_recurso)}
        · diferença ${fmtFull(r.valor_reajuste_total)}
        · empenho ${_sanEsc(r.empenho||'—')}
        · NF ${_sanEsc(r.nota_fiscal||'—')}
        ${r.criado_em?`· registrado em ${fmtDate(_toISODate(r.criado_em))}`:''}
      </div>`;
    }).join('<div style="height:1px;background:var(--border);margin:5px 0"></div>')}
  </div>`;
}

function _renderDetalheExecAta(exec){
  const detalhe=_atasExecDetalhes.get(String(exec.id));
  if(!detalhe) return `<tr class="ata-exec-detail-row"><td colspan="14"><div class="ata-exec-detail-loading"><span class="spinner"></span> Carregando patrimônios e informações completas...</div></td></tr>`;
  if(detalhe.erro) return `<tr class="ata-exec-detail-row"><td colspan="14"><div style="padding:12px;color:var(--red)">Erro ao carregar detalhes: ${_sanEsc(detalhe.erro)}</div></td></tr>`;
  const em=detalhe.emenda||{};
  const emendaCab=em.emendas||{};
  const empenhos=[...new Set([exec.empenho,...detalhe.empenhos.map(v=>v.empenhos?.numero+(v.empenhos?.ano?'/'+v.empenhos.ano:''))].filter(Boolean))].join('; ');
  const resumo=[
    ['Origem do recurso',_ataOrigemRecursoLabel(exec.origem_recurso)],
    ['Empresa',exec.empresa],['CNPJ',exec.cnpj],['Contrato / ATA',exec.sim],['Processo / CPL',exec.cpl],
    ['Item',exec.item],['Marca / Modelo',exec.marca_modelo],['Unidade',exec.unidade],['Código SIAM',exec.codigo_siam_secretaria],['E-mail do solicitante',exec.email_solicitante],['Quantidade',exec.qtde],['Valor total',exec.valor?fmtFull(exec.valor):''],
    ['Empenho(s)',empenhos],['AF',exec.af_numero],['Data da AF',exec.data_af],['Previsão de entrega',exec.prev_entrega],
    ['Recebimento',exec.dt_entrega],['Nota fiscal',exec.nf],['Possui patrimônio',exec.possui_patrimonio===true?'Sim':exec.possui_patrimonio===false?'Não':'Não informado'],
    ['Entrega na unidade',exec.data_entrega_unidade],['Responsável na unidade',exec.termo_responsavel],['Cargo',exec.termo_cargo],
    ['Emenda',emendaCab.emenda?`${emendaCab.emenda}${emendaCab.ano?'/'+emendaCab.ano:''}`:''],['Parlamentar',emendaCab.parlamentar],
    ['Observações',exec.confirmacao_obs||exec.obs_prazo]
  ];
  const linhas=detalhe.unidades.map((u,i)=>{
    const nf=detalhe.notas.get(String(u.nota_fiscal_id))||{};
    return `<tr onclick="verTudoUnidadeExecAta('${_sanEsc(exec.id)}','${_sanEsc(u.id)}')" title="Clique para ver os detalhes desta unidade" style="cursor:pointer">
      <td>${u.unidade_seq||i+1}</td><td><strong>${_sanEsc(u.patrimonio||'—')}</strong></td><td>${_sanEsc(u.numero_serie||'—')}</td><td>${_sanEsc(u.unidade_nome||exec.unidade||'—')}</td>
      <td>${_sanEsc(nf.numero||exec.nf||'—')}</td><td>${u.recebido_em?fmtDate(u.recebido_em):'—'}</td><td>${_sanEsc(u.recebido_por||'—')}</td>
      <td>${u.data_entrega_unidade?fmtDate(u.data_entrega_unidade):'—'}</td>
    </tr>`;
  }).join('');
  const unidadesHtml=detalhe.unidades.length?`<div class="ata-exec-units-wrap"><table class="ata-exec-units-table"><thead><tr><th>#</th><th>Patrimônio</th><th>Nº de série</th><th>Unidade de destino</th><th>NF</th><th>Recebido em</th><th>Recebido por</th><th>Entrega na unidade</th></tr></thead><tbody>${linhas}</tbody></table></div>`:`<div class="ata-exec-consolidated">${exec.possui_patrimonio===false?'Item sem patrimônio: quantidade mantida consolidada.':'Nenhuma unidade física/patrimônio registrado nesta execução.'}</div>`;
  return `<tr class="ata-exec-detail-row"><td colspan="14"><div class="ata-exec-detail-panel">
    <div class="ata-exec-detail-title"><span>Patrimônios e unidades recebidas</span><span>${detalhe.unidades.length} unidade(s) física(s)</span></div>${unidadesHtml}${_renderHistoricoReajustesExecAta(exec.id)}
  </div></td></tr>`;
}

function verTudoUnidadeExecAta(execId,unidadeId){
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  const detalhe=_atasExecDetalhes.get(String(execId));
  const u=detalhe?.unidades?.find(x=>String(x.id)===String(unidadeId));
  if(!exec||!u) return;
  const nf=detalhe.notas.get(String(u.nota_fiscal_id))||{};
  const em=detalhe.emenda||{}, ec=em.emendas||{};
  const campos=[
    ['Item',exec.item],['Marca / Modelo',exec.marca_modelo],['Patrimônio',u.patrimonio],['Número de série',u.numero_serie],['Sequência da unidade',u.unidade_seq],
    ['Unidade de destino',u.unidade_nome||exec.unidade],['Empresa / Fornecedor',exec.empresa],['CNPJ',exec.cnpj],['Processo / CPL',exec.cpl],
    ['Contrato / ATA',exec.sim],['Quantidade da execução',exec.qtde],['Valor total',exec.valor?fmtFull(exec.valor):''],
    ['Origem do recurso',_ataOrigemRecursoLabel(exec.origem_recurso)],['Código SIAM',exec.codigo_siam_secretaria],['E-mail do solicitante',exec.email_solicitante],['Empenho',exec.empenho],
    ['AF',exec.af_numero],['Data da AF',exec.data_af],['Previsão de entrega',exec.prev_entrega],['Data do recebimento',u.recebido_em||exec.dt_entrega],
    ['Recebido por',u.recebido_por],['Nota fiscal',nf.numero||exec.nf],['Data da NF',nf.data_emissao],['Valor da NF',nf.valor_total?_fmtBRL(nf.valor_total):''],
    ['Emenda',ec.emenda?`${ec.emenda}${ec.ano?'/'+ec.ano:''}`:''],['Parlamentar',ec.parlamentar],['Item da Emenda',em.item],
    ['Data de entrega na unidade',u.data_entrega_unidade||exec.data_entrega_unidade],['Responsável na unidade',exec.termo_responsavel],['Cargo',exec.termo_cargo],['Observações',u.obs||exec.confirmacao_obs]
  ].filter(([,v])=>v!=null&&String(v).trim()!=='');
  const modal=document.getElementById('modal-inv-detalhe');
  document.body.appendChild(modal);
  document.getElementById('inv-detalhe-content').innerHTML=`<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">${_sanEsc(exec.item||'Item')} · Patrimônio ${_sanEsc(u.patrimonio||'—')}</div><div>${campos.map(([l,v])=>_invField(_sanEsc(l),_sanEsc(String(v)))).join('')}</div>${_renderHistoricoReajustesExecAta(exec.id)}${_invDocumentoAcoes(nf.arquivo_url,exec.termo_arquivo)}`;
  modal.classList.add('active');
}

window.toggleDetalheExecAta=toggleDetalheExecAta;
window.verTudoUnidadeExecAta=verTudoUnidadeExecAta;
window.abrirVidaConsumoExecAta=abrirVidaConsumoExecAta;

function _execAtaPodeExcluir(r){
  if(!r||!podeEditar('atas')) return false;
  return ![
    r.af_numero,r.data_af,r.prev_entrega,r.nf,r.dt_entrega,r.data_entrega_unidade,
    r.termo_arquivo,r.termo_responsavel,r.termo_cargo,r.confirmacao_obs
  ].some(v=>v!=null&&String(v).trim()!=='') && r.possui_patrimonio==null;
}

function calcDiasPrazo(r){
  if(r.dt_entrega) return null; // já entregue, não calcular
  // Se tem prev_entrega definida, usa ela como prazo
  if(r.prev_entrega){
    const dPrev=parseDataBR(r.prev_entrega);
    if(dPrev) return Math.round((dPrev-new Date())/(1000*60*60*24));
  }
  // Senão usa data_af + prazo_entrega do item
  const at=atasItens.find(x=>x.cpl===r.cpl&&x.sim===r.sim&&x.item===r.item);
  const prazo=at?.prazo_entrega||0;
  if(!prazo||!r.data_af) return null;
  const dAF=parseDataBR(r.data_af);
  if(!dAF) return null;
  dAF.setDate(dAF.getDate()+prazo);
  return Math.round((dAF-new Date())/(1000*60*60*24));
}

// Sanções são geradas exclusivamente a partir de Atas Rp Vigentes > Execuções / Solicitações.
let sancaoEmpresaTravada = "";

function _sancaoAtaDoExec(r){
  return atasItens.find(a=>String(a.id)===String(r.ata_item_id))||null;
}
function _sancaoExecKey(r){
  return String(r?._sancao_id||[r?.cpl,r?.sim,r?.item,r?.unidade,r?.empenho,r?.data_af].join("|"));
}
function _sancaoExecPendente(r){ return !!r&&!r.dt_entrega; }
function _sancaoExecDisabled(r){
  if(!podeEditar('atas')||!_sancaoExecPendente(r)) return true;
  const ata=_sancaoAtaDoExec(r), empresa=ata?.empresa||"";
  if(!empresa) return true;
  return !!sancaoCplTravado&&(r.cpl!==sancaoCplTravado||empresa!==sancaoEmpresaTravada)&&!sancaoSelecionados.has(_sancaoExecKey(r));
}
function _sancaoExecTitulo(r){
  if(!podeEditar('atas')) return "Sem permissão para editar Atas Rp Vigentes";
  if(r?.dt_entrega) return "Item já entregue";
  const empresa=_sancaoAtaDoExec(r)?.empresa||"";
  if(!empresa) return "Empresa não informada no item da ATA";
  if(sancaoCplTravado&&(r.cpl!==sancaoCplTravado||empresa!==sancaoEmpresaTravada)) return `Seleção limitada a ${sancaoCplTravado} · ${sancaoEmpresaTravada}`;
  return "Selecionar esta solicitação pendente";
}
function _renderSancaoExecCheckbox(r){
  if(String(r?.tipo_material||'').toUpperCase()==='CONSUMO'){
    return '<td style="text-align:center;color:var(--blue);font-size:13px" title="Abrir Vida do item">🔎</td>';
  }
  const aberta=typeof _atasExecExpandidas!=='undefined'&&_atasExecExpandidas.has(String(r.id));
  return `<td style="text-align:center;color:var(--text3);font-size:16px"><span class="ata-exec-chevron${aberta?' open':''}">›</span></td>`;
}
function _execsSancaoSelecionadas(){
  return atasExec.filter(r=>sancaoSelecionados.has(_sancaoExecKey(r)));
}
function alternarItemSancaoExec(key,cb){
  const r=atasExec.find(x=>_sancaoExecKey(x)===key); if(!r) return;
  if(cb.checked){
    if(_sancaoExecDisabled(r)){cb.checked=false;alert(_sancaoExecTitulo(r));return;}
    const empresa=_sancaoAtaDoExec(r)?.empresa||"";
    if(!sancaoCplTravado){sancaoCplTravado=r.cpl;sancaoEmpresaTravada=empresa;}
    sancaoSelecionados.add(key);
  }else{
    sancaoSelecionados.delete(key);
    if(!sancaoSelecionados.size){sancaoCplTravado="";sancaoEmpresaTravada="";sancaoContrato=null;}
  }
  atualizarSelecaoSancaoAta(); filtrarExecs();
}
function atualizarSelecaoSancaoAta(){
  const n=sancaoSelecionados.size, resumo=document.getElementById("sancao-selecao-resumo"), btn=document.getElementById("btn-gerar-sancao");
  if(!resumo||!btn) return;
  if(!n){resumo.style.display="none";btn.style.display="none";resumo.textContent="";return;}
  resumo.textContent=`${n} item(ns) · ${sancaoCplTravado} · ${sancaoEmpresaTravada}`;
  resumo.style.display="inline";btn.style.display=podeEditar('atas')?"inline-flex":"none";
}
function _diasAtrasoExecs(itens){
  const atrasos=itens.map(calcDiasPrazo).filter(d=>typeof d==="number"&&d<0).map(d=>Math.abs(d));
  return atrasos.length?Math.max(...atrasos):null;
}
async function abrirModalSolicitacaoSancaoAta(){
  if(!sancaoSelecionados.size||bloquearSeVisualiz('atas')) return;
  _sancaoAquisicaoRow=null; _sancaoAquisicaoContrato=null; _ceAdvAtivo=false; // garante que o dispatcher use o gerador de ATA
  const itens=_execsSancaoSelecionadas(); if(!itens.length) return;
  sancaoContrato=await _resolverContratoSancao(sancaoCplTravado,itens[0]?.contrato_id);
  const c=sancaoContrato||{}, primeiro=itens[0], numero=c.numero_contrato||primeiro.sim||"—";
  const modal=document.getElementById("modal-solicitar-sancao"); document.body.appendChild(modal);
  document.getElementById("sancao-contrato-info").innerHTML=`<strong>Processo/CPL:</strong> ${_sanEsc(sancaoCplTravado)} &nbsp;·&nbsp; <strong>Contrato/SIM:</strong> ${_sanEsc(numero)}<br><strong>Empresa:</strong> ${_sanEsc(sancaoEmpresaTravada)} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||"—")}<br><strong>Objeto:</strong> ${_sanEsc(c.objeto||[...new Set(itens.map(i=>i.item))].join(", "))}`;
  document.querySelectorAll('input[name="sancao-tipo"]').forEach(el=>el.checked=false);
  document.querySelector('input[name="sancao-motivo"][value="Atraso na entrega"]').checked=true;
  ["sancao-motivo-livre","sancao-clausula","sancao-artigo","sancao-percentual"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("sancao-dias").value=_diasAtrasoExecs(itens)??"";
  document.getElementById("sancao-itens-modal").innerHTML=itens.map(i=>{
    const ata=_sancaoAtaDoExec(i), unit=ata?.valor_unit||0;
    return `<div style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px"><strong>${_sanEsc(i.item)}</strong> · ${_sanEsc(i.unidade||"—")}<br><span style="color:var(--text3)">Qtde: ${i.qtde||"—"} · Unitário: ${unit?fmtFull(unit):"—"} · Total: ${i.valor?fmtFull(i.valor):"—"} · Empenho: ${_sanEsc(i.empenho||"—")} · Previsão: ${_sanEsc(i.prev_entrega||"—")}</span></div>`;
  }).join("");
  const msg=document.getElementById("sancao-doc-msg");msg.className="fmsg";msg.textContent="";atualizarCamposSancao();modal.classList.add("active");
}
async function gerarSolicitacaoSancaoAta(){
  if(bloquearSeVisualiz('atas')) return;
  const itens=_execsSancaoSelecionadas(), tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||"", motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||"";
  const motivoLivre=document.getElementById("sancao-motivo-livre").value.trim(), clausula=document.getElementById("sancao-clausula").value.trim(), artigo=document.getElementById("sancao-artigo").value.trim();
  const percentualRaw=document.getElementById("sancao-percentual").value, diasRaw=document.getElementById("sancao-dias").value, msg=document.getElementById("sancao-doc-msg"), c=sancaoContrato||{}, primeiro=itens[0]||{};
  if(!itens.length){msg.textContent="Selecione ao menos uma solicitação.";msg.className="fmsg err";return;}
  if(!tipo||!motivo){msg.textContent="Escolha o tipo e o motivo da sanção.";msg.className="fmsg err";return;}
  if(motivo==="Outro motivo"&&!motivoLivre){msg.textContent="Descreva o outro motivo.";msg.className="fmsg err";return;}
  if(!sancaoEmpresaTravada){msg.textContent="Empresa não localizada na ATA.";msg.className="fmsg err";return;}
  const janela=window.open("","_blank");if(!janela){msg.textContent="Permita pop-ups e tente novamente.";msg.className="fmsg err";return;}
  janela.document.write('<!doctype html><meta charset="utf-8"><title>Gerando documento...</title><p style="font-family:Arial;padding:24px">Registrando solicitação...</p>');
  const btn=document.getElementById("btn-confirmar-sancao");btn.disabled=true;btn.textContent="Registrando...";
  const snapshot={artigo_adicional:artigo||null,itens:itens.map(i=>{const a=_sancaoAtaDoExec(i);return{id:_sancaoExecKey(i),cpl:i.cpl,sim:i.sim,item:i.item,unidade:i.unidade,qtde:i.qtde,vl_unitario:a?.valor_unit||null,vl_total:i.valor,empenho:i.empenho,data_af:i.data_af,prev_entrega:i.prev_entrega,dt_entrega:i.dt_entrega};})};
  const registro={cpl_contrato:sancaoCplTravado,contrato_id:c.id||null,empresa:sancaoEmpresaTravada,tipo_sancao:tipo,motivo,motivo_livre:motivo==="Outro motivo"?motivoLivre:null,clausula_contratual:clausula||null,percentual_multa:tipo==="Multa"&&percentualRaw!==""?Number(percentualRaw):null,dias_atraso:diasRaw!==""?Number(diasRaw):null,itens_ids:JSON.stringify(itens.map(_sancaoExecKey)),itens_json:JSON.stringify(snapshot),solicitado_por:currentProfile?.nome||currentProfile?.email||"Usuário do sistema",gerado_em:new Date().toISOString().slice(0,10)};
  const {data:_san,error}=await sb.from("sancoes_solicitadas").insert(registro).select().single();btn.disabled=false;btn.textContent="Gerar documento";
  if(error){janela.close();msg.textContent="Erro ao registrar: "+error.message;msg.className="fmsg err";return;}
  if(_san) await sb.from("sancao_itens").insert(snapshot.itens.map(it=>({sancao_id:_san.id,ref_origem:it.id,descricao:it.item,cpl:it.cpl,sim:it.sim,unidade:it.unidade,qtde:it.qtde,vl_unitario:it.vl_unitario,vl_total:it.vl_total,empenho:it.empenho,data_af:it.data_af,prev_entrega:it.prev_entrega,dt_entrega:it.dt_entrega})));
  const incisos={"Advertência":"I","Multa":"II","Impedimento de licitar e contratar":"III","Declaração de inidoneidade":"IV"}, total=itens.reduce((s,i)=>s+(Number(i.valor)||0),0), hoje=new Date().toLocaleDateString("pt-BR"), numero=c.numero_contrato||primeiro.sim||"—";
  const fundamento=motivo==="Atraso na entrega"?"ao ensejar o retardamento da entrega do objeto contratual sem motivo justificado":_sanEsc(motivoLivre);
  const linhas=itens.map((i,idx)=>{const a=_sancaoAtaDoExec(i),d=calcDiasPrazo(i);return `<tr><td>${idx+1}</td><td><strong>${_sanEsc(i.cpl)}</strong><br>${_sanEsc(sancaoEmpresaTravada)}</td><td>${_sanEsc(i.item)}</td><td>${_sanEsc(i.unidade||"—")}</td><td>${i.qtde||"—"}</td><td>${a?.valor_unit?fmtFull(a.valor_unit):"—"}</td><td>${i.valor?fmtFull(i.valor):"—"}</td><td>${_sanEsc(i.empenho||"—")}</td><td>${d<0?Math.abs(d)+" dias de atraso":"Aguardando entrega"}</td></tr>`;}).join("");
  janela.document.open();janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Sanção - ${_sanEsc(sancaoCplTravado)}</title><link rel="stylesheet" href="css/print-sancao.css"></head><body><header><strong>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO ADMINISTRATIVA</h1><p>Gerado em ${hoje}</p></header><div class="ident"><div>Processo/CPL: <strong>${_sanEsc(sancaoCplTravado)}</strong></div><div>Contrato/SIM nº: <strong>${_sanEsc(numero)}</strong></div><div>Empresa contratada: <strong>${_sanEsc(sancaoEmpresaTravada)}</strong></div><div>CNPJ: ${_sanEsc(c.cnpj||"—")}</div><div>Objeto: ${_sanEsc(c.objeto||[...new Set(itens.map(i=>i.item))].join(", "))}</div></div><h2>Fundamentação legal</h2><p class="corpo">A contratada incorreu na infração prevista no art. 155, inciso VII, da Lei nº 14.133/2021, ${fundamento}, sujeitando-se às sanções previstas no art. 156, inciso ${incisos[tipo]} da mesma Lei. ${clausula?`Ademais, a conduta viola a ${_sanEsc(clausula)} do instrumento contratual.`:""} ${artigo?_sanEsc(artigo)+".":""}</p><h2>Execuções / Solicitações relacionadas</h2><table><thead><tr><th>#</th><th>Processo / Empresa</th><th>Item</th><th>Unidade</th><th>Qtde</th><th>Valor unit.</th><th>Valor total</th><th>Empenho</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table><div class="total">TOTAL: ${fmtFull(total)}</div><h2>Solicitação</h2><p class="corpo">Diante do exposto, esta Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde solicita à Secretaria de Administração a instauração de processo administrativo sancionador e aplicação de <strong>${_sanEsc(tipo.toUpperCase())}</strong> à empresa <strong>${_sanEsc(sancaoEmpresaTravada)}</strong>, inscrita no CNPJ ${_sanEsc(c.cnpj||"—")}, referente ao(s) item(ns) discriminado(s) acima, garantidos o contraditório e a ampla defesa, nos termos do art. 157 da Lei nº 14.133/2021.</p>${tipo==="Multa"&&percentualRaw!==""?`<p class="corpo">A multa sugerida é de <strong>${_sanEsc(percentualRaw)}% ao dia de atraso</strong> sobre o valor do(s) item(ns) em atraso, conforme previsto no instrumento contratual.</p>`:""}<div class="assinatura"><strong>${_sanEsc(registro.solicitado_por)}</strong><br>Secretaria da Saúde - Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);janela.document.close();
  document.getElementById("modal-solicitar-sancao").classList.remove("active");sancaoSelecionados.clear();sancaoCplTravado="";sancaoEmpresaTravada="";sancaoContrato=null;atualizarSelecaoSancaoAta();filtrarExecs();
}


let _arItemId=null;
let _arCargaSeq=0;
let _aerExecId=null;
let _aerReajusteId=null;
let _aerEmendasCache=[];

function _ataValorAntesDaVigencia(item,dataISO){
  const anterior=_ataReajustesDoItem(item?.id)
    .filter(r=>String(r.data_vigencia)<String(dataISO))
    .at(-1);
  return Number(anterior?.valor_unitario_novo??item?.valor_unit_original??item?.valor_unit)||0;
}

function _ataProximaVigenciaSugerida(item){
  const base=item?.data_base_reajuste;
  if(!base) return '';
  const anteriores=_ataReajustesDoItem(item.id);
  const ano=anteriores.length
    ?Number(String(anteriores.at(-1).data_vigencia).slice(0,4))+1
    :new Date().getFullYear();
  return `${ano}-${String(base).slice(5,10)}`;
}

async function abrirReajusteItemAta(itemId){
  if(bloquearSeVisualiz('atas')) return;
  const item=_resolverAtaItemRef(itemId);
  if(!item) return;
  _arItemId=item.id;
  document.getElementById('ar-info').textContent=`${item.cpl} · ${item.sim} · ${item.item}`;
  document.getElementById('ar-data-base').value=item.data_base_reajuste?fmtDate(item.data_base_reajuste):'Não informada — preencha a vigência manualmente';
  document.getElementById('ar-data-vigencia').value=_ataProximaVigenciaSugerida(item);
  document.getElementById('ar-percentual').value='';
  document.getElementById('ar-valor-novo').value='';
  document.getElementById('ar-observacoes').value='';
  document.getElementById('ar-msg').className='fmsg';
  atualizarResumoReajusteAta();
  document.getElementById('modal-ata-reajuste').classList.add('active');
  await carregarCandidatosReajusteAta();
}

function atualizarResumoReajusteAta(){
  const item=_resolverAtaItemRef(_arItemId);
  const data=document.getElementById('ar-data-vigencia')?.value||_ataHojeISO();
  const anterior=_ataValorAntesDaVigencia(item,data);
  const novo=Number(document.getElementById('ar-valor-novo')?.value)||0;
  const antEl=document.getElementById('ar-valor-anterior');
  const difEl=document.getElementById('ar-diferenca');
  if(antEl) antEl.value=anterior?anterior.toFixed(2):'';
  if(difEl) difEl.value=novo>anterior?fmtFull(novo-anterior):'—';
}

function _ataNormNumero(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
}

async function carregarCandidatosReajusteAta(){
  atualizarResumoReajusteAta();
  const item=_resolverAtaItemRef(_arItemId);
  const vigencia=document.getElementById('ar-data-vigencia')?.value||'';
  const wrap=document.getElementById('ar-candidatos');
  if(!item||!vigencia){
    wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Informe a vigência para consultar as execuções.</div>';
    return;
  }
  const seq=++_arCargaSeq;
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px"><span class="spinner"></span> Consultando AFs, recebimentos e notas fiscais...</div>';
  const execs=atasExec.filter(e=>String(e.ata_item_id)===String(item.id));
  if(!execs.length){
    wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Este item ainda não possui execuções.</div>';
    return;
  }
  const [unRes,nfRes]=await Promise.all([
    sb.from('atas_execucao_unidades').select('exec_id,recebido_em,nota_fiscal_id').eq('ata_item_id',item.id),
    sb.from('notas_fiscais').select('id,numero,data_emissao,data_recebimento').eq('contrato_id',item.contrato_id)
  ]);
  if(seq!==_arCargaSeq) return;
  if(unRes.error||nfRes.error){
    wrap.innerHTML=`<div style="padding:1rem;color:var(--red);font-size:12px">Não foi possível consultar as execuções: ${_sanEsc((unRes.error||nfRes.error).message)}</div>`;
    return;
  }
  const notas=nfRes.data||[];
  const notaPorId=new Map(notas.map(n=>[String(n.id),n]));
  const unidadesPorExec=new Map();
  (unRes.data||[]).forEach(u=>{
    const key=String(u.exec_id);
    if(!unidadesPorExec.has(key)) unidadesPorExec.set(key,[]);
    unidadesPorExec.get(key).push(u);
  });
  const candidatos=execs.map(exec=>{
    const unidades=unidadesPorExec.get(String(exec.id))||[];
    const notasExec=unidades.map(u=>notaPorId.get(String(u.nota_fiscal_id))).filter(Boolean);
    const nfTexto=_ataNormNumero(exec.nf);
    if(nfTexto){
      notas.filter(n=>_ataNormNumero(n.numero)===nfTexto).forEach(n=>{
        if(!notasExec.some(x=>String(x.id)===String(n.id))) notasExec.push(n);
      });
    }
    const afISO=_toISODate(exec.data_af);
    const nfPosterior=notasExec.some(n=>String(n.data_emissao||'')>=vigencia);
    const afPosterior=!!afISO&&afISO>=vigencia;
    const pendenteComAF=!exec.dt_entrega&&!!(exec.af_numero||afISO)&&_ataHojeISO()>=vigencia;
    const motivos=[
      afPosterior?'AF posterior à vigência':'',
      nfPosterior?'NF emitida após a vigência':'',
      pendenteComAF?'AF emitida e ainda não recebida':''
    ].filter(Boolean);
    return {exec,notasExec,motivos};
  }).filter(x=>x.motivos.length);
  if(!candidatos.length){
    wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Nenhuma execução atende aos critérios nesta data.</div>';
    return;
  }
  wrap.innerHTML=`<table style="width:100%;font-size:11px"><thead><tr><th>AF / data</th><th>Unidade</th><th>Qtde</th><th>NF / emissão</th><th>Motivo</th><th>Situação</th></tr></thead><tbody>${candidatos.map(({exec,notasExec,motivos})=>{
    const pago=atasExecReajustes.some(er=>er.status==='ATIVO'&&String(er.ata_execucao_id)===String(exec.id));
    const nfs=notasExec.map(n=>`${_sanEsc(n.numero||'—')} · ${n.data_emissao?fmtDate(n.data_emissao):'sem data'}`).join('<br>')||_sanEsc(exec.nf||'—');
    return `<tr><td>${_sanEsc(exec.af_numero||'—')}<br>${_sanEsc(exec.data_af||'—')}</td><td>${_sanEsc(exec.unidade||'—')}</td><td style="text-align:right">${exec.qtde}</td><td>${nfs}</td><td>${motivos.map(m=>`<div>• ${_sanEsc(m)}</div>`).join('')}</td><td>${pago?'<span class="badge" style="background:var(--green-bg);color:var(--green-text)">Reajuste registrado</span>':'<span class="badge" style="background:var(--amber-bg);color:var(--amber-text)">Disponível na execução</span>'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

async function salvarReajusteItemAta(){
  if(bloquearSeVisualiz('atas')) return;
  const item=_resolverAtaItemRef(_arItemId);
  const data=document.getElementById('ar-data-vigencia').value;
  const percentual=Number(document.getElementById('ar-percentual').value);
  const novo=Number(document.getElementById('ar-valor-novo').value);
  const obs=document.getElementById('ar-observacoes').value.trim();
  const anterior=_ataValorAntesDaVigencia(item,data);
  if(!item||!data){showMsg('ar','Informe a vigência do reajuste (*).','err');return;}
  if(document.getElementById('ar-percentual').value===''){showMsg('ar','Informe manualmente a porcentagem (*).','err');return;}
  if(!novo||novo<=anterior){showMsg('ar','O novo valor deve ser maior que o valor vigente.','err');return;}
  const btn=document.getElementById('ar-salvar');btn.disabled=true;btn.textContent='Salvando...';
  const {error}=await sb.rpc('registrar_reajuste_item_ata',{
    p_ata_item_id:item.id,p_data_vigencia:data,p_percentual:percentual,
    p_valor_unitario_novo:novo,p_observacoes:obs||null
  });
  btn.disabled=false;btn.textContent='Salvar reajuste';
  if(error){showMsg('ar','Erro: '+error.message,'err');return;}
  showMsg('ar','✓ Reajuste registrado. Novas solicitações usarão o valor conforme a vigência.','ok');
  await loadAtas();
  setTimeout(()=>document.getElementById('modal-ata-reajuste').classList.remove('active'),900);
}

let _ataTrocaMarcaItemId=null;
let _ataTrocaMarcaExecucoes=[];

function _ataRenderHistoricoMarcas(rows){
  const wrap=document.getElementById('atm-historico');
  if(!wrap) return;
  if(!rows?.length){
    wrap.innerHTML='<div style="font-size:11px;color:var(--text3)">Nenhuma troca de marca registrada para este item.</div>';
    return;
  }
  wrap.innerHTML=rows.map(r=>`<div style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2);font-size:11px">
    <div style="font-weight:600;color:var(--text)">${_sanEsc(r.marca_modelo_anterior||'—')} → ${_sanEsc(r.marca_modelo_nova||'—')}</div>
    <div style="margin-top:2px;color:var(--text2)">${_sanEsc(r.apostilamento||'Apostilamento')} · ${r.data_apostilamento?fmtDate(r.data_apostilamento):'sem data'} · ${Number(r.execucoes_atualizadas)||0} pedido(s) atualizado(s)</div>
    ${r.observacoes?`<div style="margin-top:3px;color:var(--text3)">${_sanEsc(r.observacoes)}</div>`:''}
  </div>`).join('');
}

function _ataTrocaMarcaSelecionados(){
  return [...document.querySelectorAll('#atm-execucoes .atm-exec-check:checked')].map(el=>el.value);
}

function _ataAtualizarResumoSelecaoMarca(){
  const checks=[...document.querySelectorAll('#atm-execucoes .atm-exec-check')];
  const selecionados=new Set(checks.filter(el=>el.checked).map(el=>String(el.value)));
  const qtde=_ataTrocaMarcaExecucoes
    .filter(r=>selecionados.has(String(r.id)))
    .reduce((s,r)=>s+(Number(r.qtde)||0),0);
  const resumo=document.getElementById('atm-selecao-resumo');
  if(resumo) resumo.textContent=selecionados.size
    ?`${selecionados.size} pedido(s) selecionado(s) · ${qtde} unidade(s)`
    :'Nenhum pedido existente selecionado; a nova marca valerá somente para pedidos futuros.';
  const todos=document.getElementById('atm-selecionar-todos');
  if(todos){
    todos.checked=checks.length>0&&selecionados.size===checks.length;
    todos.indeterminate=selecionados.size>0&&selecionados.size<checks.length;
    todos.disabled=!checks.length;
  }
}

function _ataToggleExecucoesMarca(marcar){
  document.querySelectorAll('#atm-execucoes .atm-exec-check').forEach(el=>{el.checked=!!marcar;});
  _ataAtualizarResumoSelecaoMarca();
}

function _ataRenderExecucoesMarca(rows){
  const wrap=document.getElementById('atm-execucoes');
  if(!wrap) return;
  _ataTrocaMarcaExecucoes=rows||[];
  if(!_ataTrocaMarcaExecucoes.length){
    wrap.innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0">Não há pedidos abertos para este item. A troca valerá somente para pedidos futuros.</div>';
    _ataAtualizarResumoSelecaoMarca();
    return;
  }
  wrap.innerHTML=_ataTrocaMarcaExecucoes.map(r=>{
    const af=r.af_numero?`AF ${r.af_numero}`:'Aguardando AF';
    const previsao=r.prev_entrega?` · previsão ${fmtDate(r.prev_entrega)}`:'';
    return `<label style="display:flex;align-items:flex-start;gap:9px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2);cursor:pointer">
      <input type="checkbox" class="atm-exec-check" value="${_sanEsc(r.id)}" checked onchange="_ataAtualizarResumoSelecaoMarca()" style="margin-top:2px;accent-color:var(--blue)">
      <span style="min-width:0;flex:1;font-size:11px">
        <strong style="display:block;color:var(--text);font-size:12px">${_sanEsc(r.unidade||'Unidade não informada')} · ${Number(r.qtde)||0} unidade(s)</strong>
        <span style="display:block;margin-top:2px;color:var(--text2)">${_sanEsc(af)}${previsao}</span>
        <span style="display:block;margin-top:2px;color:var(--text3)">Marca atual: ${_sanEsc(r.marca_modelo||'—')}</span>
      </span>
    </label>`;
  }).join('');
  _ataAtualizarResumoSelecaoMarca();
}

async function abrirTrocaMarcaItemAta(itemId){
  if(bloquearSeVisualiz('atas')) return;
  const item=_resolverAtaItemRef(itemId);
  if(!item) return;
  _ataTrocaMarcaItemId=item.id;
  document.getElementById('atm-info').innerHTML=`<b>${_sanEsc(item.item||'Item')}</b><br>${_sanEsc(item.cpl||'—')} · ${_sanEsc(item.sim||'—')}`;
  document.getElementById('atm-atual').value=item.marca||'';
  document.getElementById('atm-nova').value='';
  document.getElementById('atm-apostilamento').value='';
  document.getElementById('atm-data').value=_ataHojeISO();
  document.getElementById('atm-obs').value='';
  showMsg('atm','','');
  _ataRenderHistoricoMarcas(null);
  _ataTrocaMarcaExecucoes=[];
  document.getElementById('atm-execucoes').innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0"><span class="spinner"></span> Consultando pedidos abertos...</div>';
  document.getElementById('atm-selecao-resumo').textContent='';
  const todos=document.getElementById('atm-selecionar-todos');
  todos.checked=false; todos.indeterminate=false; todos.disabled=true;
  document.getElementById('modal-ata-troca-marca').classList.add('active');
  const [historicoRes,execRes]=await Promise.all([
    sb.from('atas_item_marca_apostilamentos')
      .select('marca_modelo_anterior,marca_modelo_nova,apostilamento,data_apostilamento,observacoes,execucoes_atualizadas')
      .eq('ata_item_id',item.id)
      .order('data_apostilamento',{ascending:false})
      .order('criado_em',{ascending:false})
      .limit(5),
    sb.from('atas_execucao')
      .select('id,unidade,qtde,af_numero,data_af,prev_entrega,dt_entrega,marca_modelo,created_at')
      .eq('ata_item_id',item.id)
      .order('created_at',{ascending:true})
  ]);
  if(String(_ataTrocaMarcaItemId)!==String(item.id)) return;
  if(historicoRes.error){
    document.getElementById('atm-historico').innerHTML=`<div style="font-size:11px;color:var(--red)">Não foi possível carregar o histórico: ${_sanEsc(historicoRes.error.message)}</div>`;
  }else{
    _ataRenderHistoricoMarcas(historicoRes.data||[]);
  }
  if(execRes.error){
    document.getElementById('atm-execucoes').innerHTML=`<div style="font-size:11px;color:var(--red)">Não foi possível carregar os pedidos: ${_sanEsc(execRes.error.message)}</div>`;
    return;
  }
  const execucoes=execRes.data||[];
  const recebidas=new Set();
  for(const ids of _chunkArray(execucoes.map(r=>r.id).filter(Boolean),200)){
    const {data,error}=await sb.from('atas_execucao_unidades')
      .select('exec_id')
      .in('exec_id',ids)
      .not('recebido_em','is',null);
    if(error){
      document.getElementById('atm-execucoes').innerHTML=`<div style="font-size:11px;color:var(--red)">Não foi possível confirmar os recebimentos: ${_sanEsc(error.message)}</div>`;
      return;
    }
    (data||[]).forEach(u=>recebidas.add(String(u.exec_id)));
  }
  if(String(_ataTrocaMarcaItemId)!==String(item.id)) return;
  _ataRenderExecucoesMarca(execucoes.filter(r=>!_ataExecRecebida(r)&&!recebidas.has(String(r.id))));
}

async function salvarTrocaMarcaItemAta(){
  if(bloquearSeVisualiz('atas')) return;
  const nova=document.getElementById('atm-nova').value.trim();
  const apostilamento=document.getElementById('atm-apostilamento').value.trim();
  const dataApostilamento=document.getElementById('atm-data').value;
  if(!nova||!apostilamento||!dataApostilamento){
    showMsg('atm','Preencha a nova marca/modelo, a referência e a data do apostilamento.','err');
    return;
  }
  const execucaoIds=_ataTrocaMarcaSelecionados();
  const confirmar=await uiConfirm(`A nova marca/modelo será aplicada aos pedidos futuros e a ${execucaoIds.length} pedido(s) aberto(s) selecionado(s). Pedidos não selecionados e pedidos já recebidos manterão a marca anterior.\n\nDeseja continuar?`);
  if(!confirmar) return;
  const btn=document.getElementById('atm-salvar');
  const label=btn.textContent;
  btn.disabled=true;
  btn.textContent='Salvando...';
  showMsg('atm','Registrando apostilamento...','');
  try{
    const {data,error}=await sb.rpc('registrar_troca_marca_item_ata_seletiva',{
      p_ata_item_id:_ataTrocaMarcaItemId,
      p_marca_modelo_nova:nova,
      p_apostilamento:apostilamento,
      p_data_apostilamento:dataApostilamento,
      p_execucao_ids:execucaoIds,
      p_observacoes:document.getElementById('atm-obs').value.trim()||null
    });
    if(error) throw error;
    const resultado=Array.isArray(data)?data[0]:data;
    const atualizadas=Number(resultado?.execucoes_atualizadas)||0;
    await loadAtas();
    itensEntregasCarregado=false;
    if(window._activeTab==='itens'&&typeof loadItensEntregas==='function') await loadItensEntregas();
    showMsg('atm',`✓ Marca alterada. ${atualizadas} pedido(s) ainda não recebido(s) atualizado(s).`,'ok');
    if(window.toast) toast(`Marca alterada em ${atualizadas} pedido(s) pendente(s).`,'success');
    setTimeout(()=>document.getElementById('modal-ata-troca-marca').classList.remove('active'),1300);
  }catch(e){
    showMsg('atm','Erro: '+e.message,'err');
  }finally{
    btn.disabled=false;
    btn.textContent=label;
  }
}

function aerOrigemChange(){
  const origem=document.querySelector('input[name="aer-origem"]:checked')?.value||'recurso_proprio';
  document.getElementById('aer-emenda-wrap').style.display=origem==='emenda'?'':'none';
}

function atualizarTotalExecReajusteAta(){
  const anterior=Number(document.getElementById('aer-valor-anterior')?.value)||0;
  const novo=Number(document.getElementById('aer-valor-novo')?.value)||0;
  const qtde=Number(document.getElementById('aer-quantidade')?.value)||0;
  document.getElementById('aer-total').value=novo>anterior&&qtde>0?fmtFull((novo-anterior)*qtde):'—';
}

async function abrirReajusteExecucaoAta(execId){
  if(bloquearSeVisualiz('atas')) return;
  const exec=atasExec.find(e=>String(e.id)===String(execId));
  const item=_resolverAtaItemRef(exec?.ata_item_id);
  if(!exec||!item) return;
  _aerExecId=exec.id;
  const reajuste=_ataReajustePendenteExec(exec);
  _aerReajusteId=reajuste?.id||null;
  const anterior=exec.qtde?Number(exec.valor||0)/Number(exec.qtde):Number(item.valor_unit_original)||0;
  const info=document.getElementById('aer-reajuste-existente');
  document.getElementById('aer-info').textContent=`${item.cpl} · ${item.sim} · ${item.item} · ${exec.unidade||'sem unidade'} · AF ${exec.af_numero||'não informada'}`;
  document.getElementById('aer-data-vigencia').value=reajuste?.data_vigencia||_ataProximaVigenciaSugerida(item)||'';
  document.getElementById('aer-percentual').value=reajuste?.percentual??'';
  document.getElementById('aer-valor-anterior').value=anterior.toFixed(2);
  document.getElementById('aer-valor-novo').value=reajuste?.valor_unitario_novo??'';
  document.getElementById('aer-quantidade').value=exec.qtde||'';
  document.getElementById('aer-empenho').value='';
  document.getElementById('aer-nf').value='';
  ['aer-data-vigencia','aer-percentual','aer-valor-novo'].forEach(id=>document.getElementById(id).readOnly=!!reajuste);
  if(reajuste){
    info.style.display='block';
    info.innerHTML=`Reajuste já cadastrado para o item: vigência <strong>${fmtDate(reajuste.data_vigencia)}</strong>, percentual informado <strong>${_sanEsc(reajuste.percentual)}%</strong> e novo valor <strong>${fmtFull(reajuste.valor_unitario_novo)}</strong>.`;
  }else{
    info.style.display='block';
    info.textContent='Nenhum reajuste pendente foi encontrado para esta execução. Informe os dados abaixo; o reajuste do item será cadastrado junto com o pagamento complementar.';
  }
  if(!_aerEmendasCache.length){
    const {data,error}=await sb.from('emendas').select('id,emenda,ano,parlamentar,valor_cedido').order('ano',{ascending:false});
    if(!error) _aerEmendasCache=data||[];
  }
  document.getElementById('aer-emenda').innerHTML='<option value="">Selecione a emenda...</option>'+_aerEmendasCache.map(e=>`<option value="${e.id}">${_sanEsc(e.emenda||e.id)}${e.ano?'/'+e.ano:''}${e.parlamentar?' · '+_sanEsc(e.parlamentar):''}</option>`).join('');
  const rp=document.querySelector('input[name="aer-origem"][value="recurso_proprio"]');if(rp)rp.checked=true;
  aerOrigemChange();
  atualizarTotalExecReajusteAta();
  document.getElementById('aer-msg').className='fmsg';
  document.getElementById('modal-ata-exec-reajuste').classList.add('active');
}

async function salvarReajusteExecucaoAta(){
  if(bloquearSeVisualiz('atas')) return;
  const exec=atasExec.find(e=>String(e.id)===String(_aerExecId));
  const item=_resolverAtaItemRef(exec?.ata_item_id);
  if(!exec||!item) return;
  const origem=document.querySelector('input[name="aer-origem"]:checked')?.value||'recurso_proprio';
  const emendaId=origem==='emenda'?(document.getElementById('aer-emenda').value||null):null;
  const data=document.getElementById('aer-data-vigencia').value;
  const percentual=Number(document.getElementById('aer-percentual').value);
  const novo=Number(document.getElementById('aer-valor-novo').value);
  const quantidade=Number(exec.qtde)||0;
  const anterior=Number(document.getElementById('aer-valor-anterior').value)||0;
  const empenho=document.getElementById('aer-empenho').value.trim();
  const notaFiscal=document.getElementById('aer-nf').value.trim();
  if(!data||document.getElementById('aer-percentual').value===''||!novo){showMsg('aer','Informe data, porcentagem e novo valor (*).','err');return;}
  if(novo<=anterior){showMsg('aer','O valor reajustado deve ser maior que o valor original desta execução.','err');return;}
  if(!quantidade){showMsg('aer','A execução precisa ter quantidade válida para receber o reajuste.','err');return;}
  if(!empenho){showMsg('aer','Informe o número do novo empenho específico do reajuste (*).','err');return;}
  if(!notaFiscal){showMsg('aer','Informe o número da nota fiscal do reajuste (*).','err');return;}
  if(!podeEditar('empenhos')){showMsg('aer','Seu usuário precisa de permissão para editar Empenhos, pois este reajuste criará um novo empenho.','err');return;}
  if(origem==='emenda'&&!emendaId){showMsg('aer','Selecione a emenda que pagará o reajuste (*).','err');return;}
  if(origem==='emenda'&&!podeEditar('dashboard')){showMsg('aer','Para criar a linha na emenda, seu usuário também precisa de permissão para editar Emendas.','err');return;}
  const btn=document.getElementById('aer-salvar');btn.disabled=true;btn.textContent='Registrando...';
  let reajusteId=_aerReajusteId;
  if(!reajusteId){
    const {data:novoReajuste,error}=await sb.rpc('registrar_reajuste_item_ata',{
      p_ata_item_id:item.id,p_data_vigencia:data,p_percentual:percentual,
      p_valor_unitario_novo:novo,p_observacoes:'Cadastrado a partir da execução '+exec.id
    });
    if(error){btn.disabled=false;btn.textContent='Registrar pagamento do reajuste';showMsg('aer','Erro ao cadastrar o reajuste do item: '+error.message,'err');return;}
    const registroReajuste=Array.isArray(novoReajuste)?novoReajuste[0]:novoReajuste;
    reajusteId=registroReajuste?.id;
    if(!reajusteId){btn.disabled=false;btn.textContent='Registrar pagamento do reajuste';showMsg('aer','O reajuste do item não retornou um identificador válido.','err');return;}
  }
  const {error}=await sb.rpc('registrar_reajuste_execucao_ata',{
    p_ata_reajuste_id:reajusteId,p_ata_execucao_id:exec.id,
    p_origem_recurso:origem,p_emenda_id:emendaId,p_quantidade:quantidade,
    p_empenho:empenho,p_nota_fiscal:notaFiscal
  });
  btn.disabled=false;btn.textContent='Registrar pagamento do reajuste';
  if(error){showMsg('aer','Erro: '+error.message,'err');return;}
  showMsg('aer',origem==='emenda'?'✓ Reajuste, novo empenho e linha da emenda registrados.':'✓ Reajuste e novo empenho registrados com recurso próprio.','ok');
  await loadAtas();
  if(origem==='emenda'&&typeof loadData==='function'){try{await loadData();}catch(e){console.error(e);}}
  setTimeout(()=>document.getElementById('modal-ata-exec-reajuste').classList.remove('active'),900);
}

window.abrirReajusteItemAta=abrirReajusteItemAta;
window.carregarCandidatosReajusteAta=carregarCandidatosReajusteAta;
window.atualizarResumoReajusteAta=atualizarResumoReajusteAta;
window.salvarReajusteItemAta=salvarReajusteItemAta;
window.abrirReajusteExecucaoAta=abrirReajusteExecucaoAta;
window.aerOrigemChange=aerOrigemChange;
window.atualizarTotalExecReajusteAta=atualizarTotalExecReajusteAta;
window.salvarReajusteExecucaoAta=salvarReajusteExecucaoAta;

let _renovarItemId=null;
function renovarAta(itemId){
  if(bloquearSeVisualiz('atas')) return;
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  if(at.ata_renovada){
    alert(`Esta Ata de RP já foi renovada${at.renovada_ate?` até ${fmtDate(at.renovada_ate)}`:''}. A renovação é permitida uma única vez.`);
    return;
  }
  if(diasParaVencer(at.vencimento)>=0){
    alert(`A prorrogação só pode ser registrada depois do vencimento da vigência atual (${at.vencimento||"data não informada"}). Antes disso, as compras ainda pertencem ao período vigente.`);
    return;
  }
  const ativosContrato=atasItens.filter(item=>String(item.contrato_id)===String(at.contrato_id)&&!_ataStatusEncerrado(item.status)&&!item.ata_renovada);
  const paraEncerrar=ativosContrato.filter(item=>item.encerramento_planejado);
  if(paraEncerrar.length){
    alert(`Antes de prorrogar, encerre ${paraEncerrar.length} ${paraEncerrar.length===1?"item marcado como “Encerrar ao vencer”":"itens marcados como “Encerrar ao vencer”"}. Assim, somente os itens escolhidos entrarão na nova vigência.`);
    return;
  }
  const semDecisao=ativosContrato.filter(item=>!item.renovacao_em_tramite);
  if(semDecisao.length){
    alert(`Antes de prorrogar, revise todos os itens deste contrato. Ainda ${semDecisao.length===1?"há 1 item sem decisão":"há "+semDecisao.length+" itens sem decisão"}.`);
    return;
  }
  _renovarItemId=at.id;
  const vencAtual=at.vencimento||"";
  document.getElementById("rv-info").textContent=`${at.cpl} · ${at.sim} · ${at.item}`;
  document.getElementById("rv-atual").value=vencAtual;

  // Popular saldo info
  const exec=getExecutado(at);
  const saldo=getSaldo(at);
  const qtde=at?.qtde_contratada||0;
  document.getElementById("rv-qtde-contratada").textContent=qtde;
  document.getElementById("rv-executado").textContent=exec;
  document.getElementById("rv-saldo-atual").textContent=saldo;
  document.getElementById("rv-qtde-label").textContent=qtde;
  document.getElementById("rv-saldo-label").textContent=saldo;
  document.getElementById("rv-manter").checked=true;

  // Sugerir +1 ano automaticamente
  let novaData="";
  try{
    const partes=vencAtual.split("/");
    if(partes.length===3){
      let ano=parseInt(partes[2]);
      if(ano<100) ano+=2000;
      const d=new Date(ano+1,parseInt(partes[1])-1,parseInt(partes[0]));
      novaData=d.toISOString().split("T")[0];
    }
  }catch(e){}
  document.getElementById("rv-nova").value=novaData;
  document.getElementById("rv-status").value="VIGENTE";
  document.getElementById("rv-msg").className="fmsg";
  document.getElementById("modal-renovar").classList.add("active");
}

async function salvarRenovacao(){
  if(bloquearSeVisualiz()) return;
  const at=_resolverAtaItemRef(_renovarItemId);
  if(!at) return;
  const novaData=document.getElementById("rv-nova").value;
  const novoStatus=document.getElementById("rv-status").value||"VIGENTE";
  if(!novaData){showMsg("rv","Informe a nova data (*)","err");return}
  // Formatar para DD/MM/YYYY
  const [y,m,d]=novaData.split("-");
  const novaFormatada=`${d}/${m}/${y}`;
  const btn=document.querySelector("#modal-renovar .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const reiniciarSaldo=document.getElementById("rv-reiniciar").checked;
  try{
    // Revalida no banco imediatamente antes de salvar para evitar uma segunda
    // renovação quando a tela estiver desatualizada em outra sessão.
    const [vigenciasRes,historicoRes,contratoRes,itensRes]=await Promise.all([
      sb.from("contratos_vigencias").select("id,numero").eq("contrato_id",at.contrato_id).limit(2),
      sb.from("contratos_historico").select("id,tipo").eq("contrato_id",at.contrato_id)
        .or("tipo.ilike.%prorroga%,tipo.ilike.%renova%").limit(1),
      sb.from("contratos").select("id,vencimento").eq("id",at.contrato_id).maybeSingle(),
      sb.from("atas_itens").select("id,item,status_contrato,renovacao_em_tramite,encerramento_planejado")
        .eq("contrato_id",at.contrato_id)
    ]);
    if(vigenciasRes.error) throw vigenciasRes.error;
    if(historicoRes.error) throw historicoRes.error;
    if(contratoRes.error) throw contratoRes.error;
    if(itensRes.error) throw itensRes.error;
    if(!contratoRes.data) throw new Error("O contrato não foi encontrado para validar o vencimento.");
    if(diasParaVencer(contratoRes.data.vencimento)>=0) throw new Error(`A prorrogação só pode ser registrada depois do vencimento da vigência atual (${contratoRes.data.vencimento||"data não informada"}).`);
    const itensAtivos=(itensRes.data||[]).filter(item=>!_ataStatusEncerrado(item.status_contrato));
    const encerramentosPendentes=itensAtivos.filter(item=>item.encerramento_planejado);
    if(encerramentosPendentes.length) throw new Error(`Encerre primeiro ${encerramentosPendentes.length} ${encerramentosPendentes.length===1?"item marcado como “Encerrar ao vencer”":"itens marcados como “Encerrar ao vencer”"}.`);
    const decisoesPendentes=itensAtivos.filter(item=>!item.renovacao_em_tramite);
    if(decisoesPendentes.length) throw new Error(`Revise todos os itens antes de prorrogar: ${decisoesPendentes.length} ${decisoesPendentes.length===1?"item ainda está sem decisão":"itens ainda estão sem decisão"}.`);
    const vigencias=vigenciasRes.data||[];
    const jaRenovada=vigencias.some(v=>Number(v.numero)>=2)||vigencias.length>=2||(historicoRes.data||[]).length>0;
    if(jaRenovada) throw new Error("Esta Ata de RP já foi renovada. A renovação é permitida uma única vez.");

    const {error:errContrato}=await sb.from("contratos")
      .update({vencimento:novaFormatada,status:novoStatus})
      .eq("id",at.contrato_id);
    if(errContrato) throw errContrato;
    // A conclusão da renovação encerra automaticamente qualquer marcação de
    // trâmite. Quando escolhido, também reinicia o saldo sem apagar o histórico.
    const atualizacaoItens={
      renovacao_em_tramite:false,
      renovacao_em_tramite_em:null,
      encerramento_planejado:false,
      encerramento_planejado_em:null
    };
    if(reiniciarSaldo) atualizacaoItens.saldo_reiniciado_em=novaData;
    const {error:errItens}=await sb.from("atas_itens")
      .update(atualizacaoItens)
      .eq("contrato_id",at.contrato_id);
    if(errItens) throw errItens;
    const {error:errHist}=await sb.from("contratos_historico").insert({
      contrato_id:at.contrato_id,
      tipo:"Prorrogação de ATA",
      data_evento:novaData,
      obs:`Nova data fim: ${novaFormatada}; saldo ${reiniciarSaldo?`reiniciado em ${novaData}, com histórico preservado`:"mantido"}`
    });
    if(errHist) throw errHist;
    await Promise.all([loadAtas(),contratosCarregado?loadContratos():Promise.resolve()]);
    showMsg("rv","✓ Vigência atualizada no contrato.","ok");
    setTimeout(()=>document.getElementById("modal-renovar").classList.remove("active"),1200);
  }catch(e){
    showMsg("rv","Erro: "+(e.message||e),"err");
  }finally{
    btn.disabled=false;btn.textContent="Salvar";
  }
}

// ═══ ORDENAÇÃO ATAS ═══
let _sortAtasCol='vencimento',_sortAtasAsc=true;
function sortAtas(col){
  if(_sortAtasCol===col)_sortAtasAsc=!_sortAtasAsc;else{_sortAtasCol=col;_sortAtasAsc=true;}
  document.querySelectorAll('[id^="sort-atas-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-atas-"+col);
  if(el) el.textContent=_sortAtasAsc?" ↑":" ↓";
  filtrarAtas();
}

// ═══ ORDENAÇÃO EXECUÇÕES ═══
let _sortExecCol='data_af',_sortExecAsc=false; // padrão: mais recentes no topo
function sortExecs(col){
  if(_sortExecCol===col)_sortExecAsc=!_sortExecAsc;else{_sortExecCol=col;_sortExecAsc=false;}
  document.querySelectorAll('[id^="sort-exec-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-exec-"+col);
  if(el) el.textContent=_sortExecAsc?" ↑":" ↓";
  filtrarExecs();
}

// ═══ FILTRO PENDENTES ═══
let _filtroPendentes=false;
function togglePendentes(){
  _filtroPendentes=!_filtroPendentes;
  const btn=document.getElementById("btn-pendentes");
  if(_filtroPendentes){
    btn.style.background="var(--red)";btn.style.color="#fff";btn.style.borderColor="var(--red)";
  } else {
    btn.style.background="var(--surface)";btn.style.color="var(--red)";btn.style.borderColor="var(--red)";
  }
  filtrarExecs();
}

// ═══ EXPORTAR EXCEL ═══
async function exportarAtas(){
  await ensureLib('xlsx');
  const colunas=["CPL","SIM","CATEGORIA_LICITACAO","CODIGO_SIAM","ITEM","UNIDADE_MEDIDA","MARCA_MODELO","QTDE_CONTRATADA","VALOR_UNIT","VENCIMENTO","STATUS_CONTRATO","EMPRESA","PRAZO_ENTREGA","EXECUTADO","SALDO"];
  const rows=window._ataRowsFiltered||atasItens;
  const dados=rows.map(r=>[r.cpl,r.sim,r.categoria||'',r.codigo_siam||'',r.item,r.unidade_medida||'',r.marca,r.qtde_contratada,r.valor_unit,r.vencimento,r.status,r.empresa,r.prazo_entrega||"",getExecutado(r.cpl,r.sim,r.item),getSaldo(r.cpl,r.sim,r.item)]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  const wb={SheetNames:["ATAs"],Sheets:{ATAs:ws}};
  XLSX.writeFile(wb,"atas_"+new Date().toLocaleDateString("pt-BR").replace(/\//g,"-")+".xlsx");
}

async function exportarExecs(){
  await ensureLib('xlsx');
  const colunas=["CPL","SIM","CODIGO_SIAM","ITEM","UNIDADE","QTDE","VALOR","EMPENHO","DATA_AF","PREV_ENTREGA","DT_ENTREGA","NF"];
  const rows=window._execRowsFiltered||atasExec;
  const dados=rows.map(r=>[r.cpl,r.sim,r.codigo_siam||'',r.item,r.unidade,r.qtde,r.valor,r.empenho,r.data_af,r.prev_entrega,r.dt_entrega,r.nf]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  const wb={SheetNames:["Execucoes"],Sheets:{Execucoes:ws}};
  XLSX.writeFile(wb,"execucoes_"+new Date().toLocaleDateString("pt-BR").replace(/\//g,"-")+".xlsx");
}

// ═══ ENCERRAR CONTRATO (CONTRATOS SUPABASE) ═══
let _encerrarCtId=null;
function abrirEncerrarCt(id){
  if(bloquearSeVisualiz()) return;
  const r=contratosRows.find(x=>String(x.id)===String(id));
  if(!r) return;
  _encerrarCtId=id;
  // Preencher info
  document.getElementById("ect-info").innerHTML=`
    <div><strong>${r.prestador||"—"}</strong></div>
    <div style="color:var(--text3);margin-top:2px">${r.objeto||"—"}</div>
    <div style="margin-top:4px;display:flex;gap:1rem">
      <span>📋 ${r.cpl||"—"}</span>
      <span>📅 Venc: ${r.vencimento||"—"}</span>
      <span>💰 ${r.valor_atual||r.valor_inicial||"—"}</span>
    </div>`;
  // Data padrão = hoje
  document.getElementById("ect-data").value=new Date().toISOString().split("T")[0];
  document.getElementById("ect-motivo").value="";
  document.getElementById("ect-cpl-sub").value="";
  document.getElementById("ect-obs").value="";
  const msg=document.getElementById("ect-msg");
  msg.className="fmsg";msg.textContent="";
  document.getElementById("modal-encerrar-ct").classList.add("active");
}
async function confirmarEncerramentoCt(){
  if(bloquearSeVisualiz()) return;
  if(!_encerrarCtId) return;
  const motivo=document.getElementById("ect-motivo").value;
  const data=document.getElementById("ect-data").value;
  const cplSub=document.getElementById("ect-cpl-sub").value.trim();
  const obs=document.getElementById("ect-obs").value.trim();
  if(!motivo){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Selecione o motivo.";return;
  }
  if(!data){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Informe a data de encerramento.";return;
  }
  const btn=document.querySelector("#modal-encerrar-ct .btn-primary");
  btn.disabled=true;btn.textContent="Encerrando...";
  try{
    // 1. Atualizar status na tabela contratos
    const {error:errCt}=await sb.from("contratos").update({status:"ENCERRADO"}).eq("id",_encerrarCtId);
    if(errCt) throw errCt;
    // 2. Registrar no histórico
    const obsHist=[motivo, cplSub?"CPL substituto: "+cplSub:"", obs].filter(Boolean).join(" | ");
    await sb.from("contratos_historico").insert({
      contrato_id:_encerrarCtId,
      tipo:"Encerramento",
      data_evento:data,
      obs:obsHist
    });
    // 3. Atualizar local
    const local=contratosRows.find(r=>String(r.id)===String(_encerrarCtId));
    if(local) local.status="ENCERRADO";
    filtrarContratos();
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg ok";msg.textContent="✓ Contrato encerrado!";
    setTimeout(()=>document.getElementById("modal-encerrar-ct").classList.remove("active"),1500);
  }catch(e){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Erro: "+(e.message||e);
  }finally{
    btn.disabled=false;btn.textContent="⛔ Encerrar contrato";
  }
}

// Abrem os modais de "Editar contrato" / "Vinculações" (originalmente da aba Contratos) a
// partir de Atas Rp Vigentes. Garantem que contratosRows esteja carregado, já que o usuário
// pode acessar Atas sem nunca ter visitado a aba Contratos.
async function _ataAbrirEditarContrato(contratoId){
  if(!_isAdmin()&&!podeEditar('contratos')){ alert('⛔ Você não tem permissão para editar contratos.'); return; }
  if(!contratosCarregado) await loadContratos();
  abrirEditarContrato(contratoId);
}
async function _ataAbrirEmailContrato(contratoId){
  if(!podeEditar('contratos')){ alert('⛔ Você não tem permissão para editar contratos.'); return; }
  if(!contratosCarregado) await loadContratos();
  abrirEmailContrato(contratoId);
}
async function _ataAbrirDadosOperacionaisContrato(contratoId){
  if(!podeEditar('contratos')){ alert('⛔ Você não tem permissão para editar contratos.'); return; }
  await abrirDadosOperacionaisContrato(contratoId);
}
async function _ataAbrirFiscalizadoresContrato(contratoId){
  if(!podeEditar('contratos')){ alert('⛔ Você não tem permissão para editar contratos.'); return; }
  await abrirFiscalizadoresContratoDireto(contratoId);
}

// ═══ ENCERRAR ITEM DE ATA ═══
let _encerrarAtaItemId=null;
function _ataPodeEncerrarItem(ataItem){
  return !!ataItem&&(diasParaVencer(ataItem.vencimento)<0||getSaldo(ataItem)<=0);
}
function encerrarAtaItem(ataItemId){
  if(bloquearSeVisualiz()) return;
  const ataItem=atasItens.find(r=>String(r.id)===String(ataItemId));
  if(!ataItem||String(ataItem.status||'').toUpperCase().startsWith('ENCERRADO')) return;
  if(!_ataPodeEncerrarItem(ataItem)){
    alert(`Este item ainda não venceu e possui saldo ${getSaldo(ataItem)}. O encerramento só é liberado depois do vencimento ou quando o saldo chegar a zero.`);
    return;
  }
  _encerrarAtaItemId=ataItem.id;
  document.getElementById("enc-info").textContent=`${ataItem.cpl||""} · ${ataItem.sim||""} · ${ataItem.item||""}`;
  const regra=document.getElementById("enc-regra");
  if(regra) regra.textContent=diasParaVencer(ataItem.vencimento)<0
    ?`Vigência vencida em ${ataItem.vencimento||"data não informada"}.`
    :"Encerramento antecipado liberado porque o saldo deste item está zerado.";
  document.getElementById("enc-motivo").value="";
  document.getElementById("enc-msg").className="fmsg";
  document.getElementById("modal-encerrar").classList.add("active");
}
async function confirmarEncerramento(){
  if(bloquearSeVisualiz()) return;
  if(!_encerrarAtaItemId) return;
  const btn=document.querySelector("#modal-encerrar .btn-primary");
  btn.disabled=true;btn.textContent="Encerrando...";
  const motivo=document.getElementById("enc-motivo").value.trim();
  try{
    const {data:itemAtual,error:erroItem}=await sb.from("atas_itens")
      .select("id,contrato_id,qtde_contratada,saldo_reiniciado_em,status_contrato")
      .eq("id",_encerrarAtaItemId).maybeSingle();
    if(erroItem) throw erroItem;
    if(!itemAtual) throw new Error("O item não foi encontrado para validar o encerramento.");
    if(_ataStatusEncerrado(itemAtual.status_contrato)) throw new Error("Este item já está encerrado.");
    const [contratoRes,execucoesRes]=await Promise.all([
      sb.from("contratos").select("id,vencimento").eq("id",itemAtual.contrato_id).maybeSingle(),
      sb.from("atas_execucao").select("qtde,data_af,dt_entrega,created_at").eq("ata_item_id",itemAtual.id)
    ]);
    if(contratoRes.error) throw contratoRes.error;
    if(execucoesRes.error) throw execucoesRes.error;
    if(!contratoRes.data) throw new Error("O contrato não foi encontrado para validar o vencimento.");
    const marco=_toISODate(itemAtual.saldo_reiniciado_em);
    const executado=(execucoesRes.data||[])
      .filter(exec=>!marco||_dataExecucaoParaSaldo(exec)>=marco)
      .reduce((total,exec)=>total+(Number(exec.qtde)||0),0);
    const saldoAtual=(Number(itemAtual.qtde_contratada)||0)-executado;
    if(diasParaVencer(contratoRes.data.vencimento)>=0&&saldoAtual>0){
      throw new Error(`Encerramento bloqueado: o item ainda não venceu e possui saldo ${saldoAtual}.`);
    }
    const {data:encerrado,error}=await sb.from("atas_itens").update({
      status_contrato:"ENCERRADO",
      data_encerramento:new Date().toISOString().slice(0,10),
      motivo_encerramento:motivo||null,
      renovacao_em_tramite:false,
      renovacao_em_tramite_em:null,
      encerramento_planejado:false,
      encerramento_planejado_em:null
    }).eq("id",_encerrarAtaItemId).select("id");
    if(error) throw error;
    if((encerrado||[]).length!==1) throw new Error("O item não pôde ser encerrado. Verifique sua permissão.");
    await Promise.all([loadAtas(),contratosCarregado?loadContratos():Promise.resolve()]);
    showMsg("enc","✓ Item encerrado!","ok");
    setTimeout(()=>document.getElementById("modal-encerrar").classList.remove("active"),1200);
  }catch(e){
    showMsg("enc","Erro: "+(e.message||e),"err");
  }finally{
    btn.disabled=false;btn.textContent="⛔ Encerrar";
  }
}

// ═══ EXCLUIR EXECUÇÃO ═══
async function excluirExec(execId){
  if(bloquearSeVisualiz()) return;
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec) return;
  const {data:atual,error:erroConsulta}=await sb.from('atas_execucao').select('*').eq('id',exec.id).maybeSingle();
  if(erroConsulta){ alert('Não foi possível conferir a solicitação: '+erroConsulta.message); return; }
  if(!atual){ alert('Esta solicitação não existe mais.'); await loadAtas(); return; }
  const {count:unidades,error:erroUnidades}=await sb.from('atas_execucao_unidades').select('id',{count:'exact',head:true}).eq('exec_id',exec.id);
  if(erroUnidades){ alert('Não foi possível validar as unidades vinculadas antes da exclusão.'); return; }
  if(!_execAtaPodeExcluir(atual)||(Number(unidades)||0)>0){
    if(window.toast) toast('Exclusão bloqueada: esta solicitação já possui AF ou etapa posterior.','error');
    await loadAtas();
    return;
  }
  if(!await uiConfirm(`Excluir esta solicitação?\n${exec.item} · ${exec.unidade}\n\nEsta ação não pode ser desfeita.`)) return;
  const {data,error}=await sb.rpc('excluir_execucao_ata_pre_af',{p_exec_id:exec.id});
  if(error){alert("Erro ao excluir solicitação: "+error.message);return;}
  if(!data){alert("A solicitação não foi excluída. Verifique sua permissão na aba ATAs.");return;}
  atasExec=atasExec.filter(r=>String(r.id)!==String(exec.id));
  _atasExecExpandidas.delete(String(exec.id));
  _atasExecDetalhes.delete(String(exec.id));
  filtrarAtas();
}

// ═══ PRORROGAR PRAZO DE ENTREGA ═══
let _prorrogarExecId=null, _prorrogarEntregaId=null;
function abrirModalProrrogarPrazo(execId){
  if(!podeEditar('atas')&&!podeEditar('itens')){ alert('⛔ Você não tem permissão para alterar esta execução.'); return; }
  const r=entregasRows.find(x=>String(x.exec_id)===String(execId))
    || (atasExec||[]).find(x=>String(x.id)===String(execId));
  if(!r) return;
  _prorrogarExecId=r.id||r.exec_id; _prorrogarEntregaId=null;
  document.getElementById("pp-info").textContent=`${r.item} · ${r.unidade} · prazo atual ${r?.prev_entrega||r?.limiteISO?fmtDate(r?.prev_entrega||r?.limiteISO):'não informado'}`;
  document.getElementById("pp-data").value=r?.prev_entrega||r?.limiteISO||"";
  document.getElementById("pp-obs").value="";
  document.getElementById("pp-msg").className="fmsg";
  document.getElementById("modal-prorrogar-prazo").classList.add("active");
}
function abrirModalProrrogarPrazoAquisicao(entregaId){
  if(bloquearSeVisualiz('itens')) return;
  const r=entregasRows.find(x=>String(x.entrega_id)===String(entregaId));
  if(!r) return;
  _prorrogarEntregaId=r.entrega_id; _prorrogarExecId=null;
  document.getElementById("pp-info").textContent=`${r.item} · ${r.unidade} · prazo atual ${r.limiteISO?fmtDate(r.limiteISO):'não informado'}`;
  document.getElementById("pp-data").value=r.limiteISO||"";
  document.getElementById("pp-obs").value="";
  document.getElementById("pp-msg").className="fmsg";
  document.getElementById("modal-prorrogar-prazo").classList.add("active");
}
async function salvarProrrogarPrazo(){
  if(bloquearSeVisualiz()) return;
  const data=document.getElementById("pp-data").value;
  const obs=document.getElementById("pp-obs").value.trim();
  if(!data){showMsg("pp","Informe a nova data (*)","err");return}
  const btn=document.querySelector("#modal-prorrogar-prazo .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  if(_prorrogarEntregaId){
    const r=entregasRows.find(x=>String(x.entrega_id)===String(_prorrogarEntregaId));
    if(!r){btn.disabled=false;btn.textContent="Salvar";return;}
    const prazoAnterior=r.limiteISO;
    const {data:salvo,error}=await sb.rpc("prorrogar_prazo_entrega",{p_item_entrega_id:r.entrega_id,p_ata_execucao_id:null,p_novo_prazo:data,p_observacao:obs||null});
    btn.disabled=false;btn.textContent="Salvar";
    if(error){showMsg("pp","Erro: "+error.message,"err");return;}
    if(!salvo){showMsg("pp","Informe uma data diferente do prazo atual.","err");return;}
    Object.assign(r,{limiteISO:data,prazoOriginalISO:r.prazoOriginalISO||prazoAnterior,status:_prazoStatus(data,r.recebido,r.cancelado)});
    r.prazosHistorico=[...(r.prazosHistorico||[]),{prazo_anterior:prazoAnterior,prazo_novo:data,observacao:obs}];
    renderItensEntregas();
  }else{
    const r=entregasRows.find(x=>String(x.exec_id)===String(_prorrogarExecId))
      || (atasExec||[]).find(x=>String(x.id)===String(_prorrogarExecId));
    if(!r){btn.disabled=false;btn.textContent="Salvar";return;}
    const execId=r.id||r.exec_id;
    const prazoAnterior=r.prev_entrega||r.limiteISO;
    const obsPrazo=obs?"Prorrogado: "+obs:(r.obs_prazo||"");
    const {data:salvo,error}=await sb.rpc("prorrogar_prazo_entrega",{p_item_entrega_id:null,p_ata_execucao_id:execId,p_novo_prazo:data,p_observacao:obs||null});
    btn.disabled=false;btn.textContent="Salvar";
    if(error){showMsg("pp","Erro: "+error.message,"err");return;}
    if(!salvo){showMsg("pp","Informe uma data diferente do prazo atual.","err");return;}
    Object.assign(r,{prev_entrega:data,limiteISO:data,obs_prazo:obsPrazo,prazoOriginalISO:r.prazoOriginalISO||prazoAnterior,status:_prazoStatus(data,r.recebido,false)});
    r.prazosHistorico=[...(r.prazosHistorico||[]),{prazo_anterior:prazoAnterior,prazo_novo:data,observacao:obs}];
    const ataRow=entregasRows.find(x=>String(x.exec_id)===String(execId));
    if(ataRow&&ataRow!==r){
      Object.assign(ataRow,{limiteISO:data,obs_prazo:obsPrazo,prazoOriginalISO:ataRow.prazoOriginalISO||prazoAnterior,status:_prazoStatus(data,ataRow.recebido,false)});
      ataRow.prazosHistorico=[...(ataRow.prazosHistorico||[]),{prazo_anterior:prazoAnterior,prazo_novo:data,observacao:obs}];
    }
    const execRow=(atasExec||[]).find(x=>String(x.id)===String(execId));
    if(execRow&&execRow!==r) Object.assign(execRow,{prev_entrega:data,obs_prazo:obsPrazo});
    if(typeof filtrarExecs==="function") filtrarExecs();
    renderItensEntregas();
  }
  showMsg("pp","✓ Prazo prorrogado!","ok");
  setTimeout(()=>document.getElementById("modal-prorrogar-prazo").classList.remove("active"),1000);
}

// ═══ AUTO PREENCHER CPL/SIM AO SELECIONAR ITEM ═══
function autoPreencherCplSim(){
  const itemId=document.getElementById("ne2-item").value;
  const at=_resolverAtaItemRef(itemId);
  document.getElementById("ne2-unidade-medida").value=at?.unidade_medida||"";
  document.getElementById("ne2-cpl").value=at?.cpl||"";
  document.getElementById("ne2-sim").value=at?.sim||"";
  if(at){
    // Calcular valor auto quando digitar qtde
    document.getElementById("ne2-qtde").oninput=()=>calcValorExec();
  }
}

function verExecsItem(itemId){
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  document.getElementById("fat-cpl").value=at.cpl;
  document.getElementById("fat-sim").value=at.sim;
  document.getElementById("fat-busca").value=at.item;
  filtrarAtas();
  document.getElementById("exec-body").scrollIntoView({behavior:"smooth"});
}

async function abrirModalNovaAta(contratoId=null){
  if(!podeEditar('atas')){alert("Sem permissão para cadastrar itens de ATA.");return;}
  if(!atasContratos.length){
    const [ctRes,forRes]=await Promise.all([
      sb.from("contratos").select("*").eq("tipo_instrumento","ATA").order("cpl"),
      sb.from("fornecedores").select("id,razao_social,cnpj_normalizado")
    ]);
    if(ctRes.error||forRes.error){alert("Erro ao carregar contratos de ATA: "+(ctRes.error?.message||forRes.error?.message));return;}
    const fornecedores=new Map((forRes.data||[]).map(f=>[String(f.id),f]));
    atasContratos=(ctRes.data||[]).map(c=>({...c,empresa:fornecedores.get(String(c.fornecedor_id))?.razao_social||c.prestador||""}));
  }
  ["na-item","na-unidade-medida","na-marca","na-qtde","na-valor","na-prazo"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  const sel=document.getElementById("na-contrato");
  sel.innerHTML='<option value="">Selecione a ATA...</option>'+atasContratos
    .slice().sort((a,b)=>(a.cpl||"").localeCompare(b.cpl||"",'pt-BR',{numeric:true}))
    .map(c=>`<option value="${c.id}">${_sanEsc(c.cpl||"Sem CPL")} · ${_sanEsc(c.numero_contrato||"Sem número")} · ${_sanEsc(c.empresa||"")}</option>`).join("");
  sel.value=contratoId?String(contratoId):"";
  naContratoChange();
  document.getElementById("na-msg").className="fmsg";
  document.getElementById("modal-nova-ata").classList.add("active");
}

function naContratoChange(){
  const id=document.getElementById("na-contrato")?.value;
  const c=atasContratos.find(x=>String(x.id)===String(id));
  const resumo=document.getElementById("na-contrato-resumo");
  if(!c){resumo.style.display="none";resumo.textContent="";return;}
  resumo.style.display="block";
  resumo.innerHTML=`<strong>${_sanEsc(c.empresa||"")}</strong><br>${_sanEsc(c.cpl||"")} · ${_sanEsc(c.numero_contrato||"")} · ${_sanEsc(c.status||"")} · vence em ${_sanEsc(c.vencimento||"—")}`;
}

function popularItensExec(){
  const cpl=document.getElementById("ne2-cpl").value;
  const sim=document.getElementById("ne2-sim").value;
  const itens=atasItens.filter(r=>(!cpl||r.cpl===cpl)&&(!sim||r.sim===sim));
  const el=document.getElementById("ne2-item");
  el.innerHTML='<option value="">Selecione...</option>'+itens.map(i=>`<option value="${i.id}">${_sanEsc(i.item)}</option>`).join("");
}

function calcValorExec(){
  const atItem=_resolverAtaItemRef(document.getElementById("ne2-item").value)||{};
  const qtde=parseFloat(document.getElementById("ne2-qtde").value)||0;
  const valorUnitario=_ataValorUnitarioEm(atItem,_ataHojeISO());
  if(atItem&&valorUnitario&&qtde) document.getElementById("ne2-valor").value=(valorUnitario*qtde).toFixed(2);
}

async function abrirModalNovaExec(){
  if(bloquearSeVisualiz('atas')) return;
  // Recarrega a lista a cada abertura para refletir imediatamente alterações
  // feitas no cadastro central de Secretarias durante a mesma sessão.
  _neSecretariasCaronaCache=[];
  _neSecretariasCaronaCarregadas=false;
  const secretariaSel=document.getElementById('ne2-secretaria');
  if(secretariaSel){ secretariaSel.disabled=false; secretariaSel.innerHTML='<option value="">Selecione a secretaria...</option>'; }
  const itensUnicos=atasItens.filter(r=>!String(r.status||"").toUpperCase().startsWith("ENCERRADO")).sort((a,b)=>a.item.localeCompare(b.item,'pt-BR'));
  const itemSel=document.getElementById("ne2-item");
  itemSel.innerHTML='<option value="">Selecione o item...</option>'+itensUnicos.map(r=>`<option value="${r.id}">${_sanEsc(r.item)}${r.unidade_medida?` · ${_sanEsc(r.unidade_medida)}`:''} (${_sanEsc(r.cpl)} / ${_sanEsc(r.sim)})</option>`).join("");
  document.getElementById("ne2-cpl").value="";
  document.getElementById("ne2-sim").value="";
  ["ne2-unidade-medida","ne2-unidade","ne2-secretaria","ne2-codigo-siam-secretaria","ne2-email-solicitante","ne2-qtde","ne2-valor","ne2-data-af","ne2-dt-entrega"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  // A origem deve ser escolhida explicitamente para evitar solicitações
  // registradas com o tipo de recurso incorreto.
  if(!_neEmendasCache.length){ const {data}=await sb.from('emendas').select('id,emenda,ano,parlamentar,unidade,unidade_id').order('ano',{ascending:false}); _neEmendasCache=data||[]; }
  document.getElementById("ne2-emenda").innerHTML='<option value="">Selecione a emenda...</option>'+_neEmendasCache.map(e=>`<option value="${e.id}">${_sanEsc(e.emenda||'?')}${e.ano?('/'+e.ano):''}${e.parlamentar?(' · '+_sanEsc(e.parlamentar)):''}</option>`).join("");
  document.getElementById("ne2-emenda-item").innerHTML='<option value="">Selecione...</option>';
  document.querySelectorAll('input[name="ne2-origem"]').forEach(rb=>{rb.checked=false;});
  neOrigemChange();
  document.getElementById("ne2-msg").className="fmsg";
  document.getElementById("modal-nova-exec").classList.add("active");
}
let _neEmendasCache=[];
let _neSecretariasCaronaCache=[];
let _neSecretariasCaronaCarregadas=false;
function _neOrigem(){ return document.querySelector('input[name="ne2-origem"]:checked')?.value||''; }
function _neSecretariaCaronaLabel(secretaria){
  return [secretaria?.sigla,secretaria?.nome].filter(Boolean).join(' — ');
}
async function _neCarregarSecretariasCarona(){
  const sel=document.getElementById('ne2-secretaria');
  if(!sel||_neSecretariasCaronaCarregadas) return;
  sel.disabled=true;
  sel.innerHTML='<option value="">Carregando secretarias...</option>';
  const {data,error}=await sb.from('secretarias').select('id,sigla,nome').eq('ativo',true).order('sigla');
  if(error){
    sel.innerHTML='<option value="">Não foi possível carregar as secretarias</option>';
    showMsg('ne2','Erro ao carregar o cadastro central de Secretarias: '+error.message,'err');
    return;
  }
  _neSecretariasCaronaCache=data||[];
  _neSecretariasCaronaCarregadas=true;
  sel.innerHTML='<option value="">Selecione a secretaria...</option>'+_neSecretariasCaronaCache.map(s=>
    `<option value="${_sanEsc(String(s.id))}">${_sanEsc(_neSecretariaCaronaLabel(s))}</option>`
  ).join('');
  sel.disabled=false;
}
function neOrigemChange(){
  const origem=_neOrigem();
  const emenda=origem==='emenda';
  const carona=origem==='carona';
  document.getElementById("ne2-emenda-wrap").style.display=emenda?'':'none';
  document.getElementById("ne2-emenda-item-wrap").style.display=emenda?'':'none';
  document.getElementById("ne2-unidade-wrap").classList.toggle('full',!carona);
  document.getElementById("ne2-codigo-siam-secretaria-wrap").style.display=carona?'':'none';
  document.getElementById("ne2-email-solicitante-wrap").style.display=carona?'':'none';
  const uni=document.getElementById("ne2-unidade");
  const secretaria=document.getElementById("ne2-secretaria");
  document.getElementById("ne2-unidade-label").textContent=carona?'Secretaria solicitante *':'Unidade de destino *';
  uni.style.display=carona?'none':'';
  secretaria.style.display=carona?'':'none';
  uni.readOnly=emenda; uni.style.background=emenda?'var(--surface2)':'';
  document.getElementById("ne2-unidade-auto").style.display=emenda?'block':'none';
  if(!carona) document.getElementById("ne2-codigo-siam-secretaria").value='';
  if(!carona) document.getElementById("ne2-email-solicitante").value='';
  if(!emenda){ uni.value=''; }
  if(!carona) secretaria.value='';
  if(carona) _neCarregarSecretariasCarona();
}
async function _neEmendaItensJaUsados(ids,{incluirPlanejamento=true}={}){
  const set=new Set();
  const clean=(ids||[]).filter(Boolean);
  if(!clean.length) return set;
  const consultas=[
    sb.from('itens').select('emenda_item_id').in('emenda_item_id',clean),
    sb.from('atas_execucao').select('emenda_item_id').in('emenda_item_id',clean)
  ];
  if(incluirPlanejamento) consultas.push(sb.from('ata_planejamento_emendas').select('emenda_item_id').in('emenda_item_id',clean).neq('status','CANCELADO'));
  const [itRes,ataRes,planRes]=await Promise.all(consultas);
  (itRes.data||[]).forEach(r=>{ if(r.emenda_item_id) set.add(String(r.emenda_item_id)); });
  (ataRes.data||[]).forEach(r=>{ if(r.emenda_item_id) set.add(String(r.emenda_item_id)); });
  (planRes?.data||[]).forEach(r=>{ if(r.emenda_item_id) set.add(String(r.emenda_item_id)); });
  return set;
}
function _isUnidadeVarias(v){
  const s=(v||'').toString().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return s==='VARIAS';
}
function _preferUnidadeExec(unidadeBeneficiada, unidadeEntrega, fallback=''){
  const entrega=(unidadeEntrega||'').toString().trim();
  const beneficiada=(unidadeBeneficiada||'').toString().trim();
  if(entrega&&!_isUnidadeVarias(entrega)) return entrega;
  if(beneficiada) return beneficiada;
  return entrega||fallback||'';
}
async function neEmendaChange(){
  const eid=document.getElementById("ne2-emenda").value;
  const sel=document.getElementById("ne2-emenda-item");
  sel.innerHTML='<option value="">Selecione...</option>';
  document.getElementById("ne2-unidade").value='';
  if(!eid) return;
  const {data}=await sb.from('emenda_itens').select('id,item,qtde,unidade_beneficiada,unidade_entrega').eq('emenda_id',eid).order('item');
  const ids=(data||[]).map(i=>i.id);
  const [usados,planRes]=await Promise.all([
    _neEmendaItensJaUsados(ids,{incluirPlanejamento:false}),
    ids.length?sb.from('ata_planejamento_emendas').select('emenda_item_id,status,ata_item_id,quantidade_prevista,atas_itens(item)').in('emenda_item_id',ids).neq('status','CANCELADO'):Promise.resolve({data:[]})
  ]);
  window._nePlanejamentosByItem=Object.fromEntries((planRes.data||[]).map(p=>[String(p.emenda_item_id),p]));
  sel.innerHTML='<option value="">Selecione...</option>'+(data||[]).map(i=>{
    const plano=window._nePlanejamentosByItem[String(i.id)];
    const locked=usados.has(String(i.id))||plano?.status==='PLANEJAMENTO';
    const unidade=_preferUnidadeExec(i.unidade_beneficiada,i.unidade_entrega,'sem unidade')||'sem unidade';
    const complemento=plano?.status==='PLANEJAMENTO'?' · futura Ata ainda em licitação':(plano?.status==='ATA_VIGENTE_AGUARDANDO_REQUISICAO'?` · planejamento: ${plano.atas_itens?.item||'Ata vigente'}`:(locked?' · já vinculado':''));
    const txt=`${i.item||'item'}${i.qtde?(' · qtde '+i.qtde):''} · ${unidade}${complemento}`;
    return `<option value="${i.id}" ${locked?'disabled':''} data-locked="${locked?'1':'0'}">${_sanEsc(txt)}</option>`;
  }).join("");
}
async function neEmendaItemChange(){
  const eid=document.getElementById("ne2-emenda").value;
  const iid=document.getElementById("ne2-emenda-item").value;
  const uni=document.getElementById("ne2-unidade");
  const em=_neEmendasCache.find(e=>String(e.id)===String(eid));
  let unidade=em?.unidade||'';
  if(iid){ const {data}=await sb.from('emenda_itens').select('unidade_beneficiada,unidade_entrega').eq('id',iid).single(); unidade=_preferUnidadeExec(data?.unidade_beneficiada,data?.unidade_entrega,unidade); }
  uni.value=unidade||'';
  const plano=(window._nePlanejamentosByItem||{})[String(iid)];
  if(plano?.status==='ATA_VIGENTE_AGUARDANDO_REQUISICAO'&&plano.ata_item_id){
    const item=document.getElementById('ne2-item');
    if(item&&[...item.options].some(o=>String(o.value)===String(plano.ata_item_id))){ item.value=plano.ata_item_id; autoPreencherCplSim(); }
    const qtde=document.getElementById('ne2-qtde'); if(qtde&&!qtde.value) qtde.value=plano.quantidade_prevista||'';
    calcValorExec();
  }
}

let _editExecId=null;
async function abrirModalEditExec(execId){
  if(!podeEditar('atas')&&!podeEditar('itens')){ alert('⛔ Você não tem permissão para alterar esta execução.'); return; }
  const entregaAta=entregasRows.find(r=>String(r.exec_id)===String(execId)&&r.tipo==='ATA');
  if(entregaAta) return abrirRecebimentoAta(execId);
  let r=atasExec.find(x=>String(x.id)===String(execId));
  if(!r){
    // aberto a partir da aba "Controle de Entregas", onde atasExec não está carregado:
    // busca a execução direto do banco e a injeta para que salvarEditExec a encontre.
    const {data}=await sb.from("atas_execucao").select("*").eq("id",execId).single();
    if(data){ r=data; atasExec.push(r); }
  }
  if(!r) return;
  _editExecId=r.id;
  document.getElementById("ee-info").textContent=`${r.cpl} · ${r.sim} · ${r.item} · ${r.unidade}`;
  document.getElementById("ee-empenho").value=r.empenho||"";
  document.getElementById("ee-data-af").value=r.data_af||"";
  document.getElementById("ee-prev").value=r.prev_entrega||"";
  document.getElementById("ee-dt-entrega").value=r.dt_entrega||"";
  document.getElementById("ee-nf").value=r.nf||"";
  document.getElementById("ee-msg").className="fmsg";
  const _eem=document.getElementById("modal-edit-exec");
  if(_eem.parentElement!==document.body) document.body.appendChild(_eem); // sai de dentro de #panel-atas p/ aparecer em qualquer aba
  _eem.classList.add("active");
}

function abrirModalEditAta(itemId){
  if(bloquearSeVisualiz('atas')) return;
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  abrirModalNovaExec();
  setTimeout(()=>{
    document.getElementById("ne2-item").value=at.id;
    autoPreencherCplSim();
  },50);
}

async function salvarNovaAta(){
  if(bloquearSeVisualiz('atas')) return;
  const contratoId=Number(document.getElementById("na-contrato").value)||null;
  const item=document.getElementById("na-item").value.trim();
  const unidadeMedida=_procUnidadeMedidaValor(document.getElementById("na-unidade-medida").value);
  const qtde=parseFloat(document.getElementById("na-qtde").value)||0;
  if(!contratoId||!item||!unidadeMedida||!qtde){showMsg("na","Selecione a ATA e preencha Item, Unidade de medida e Quantidade (*)","err");return}
  _procRegistrarUnidadeMedida(unidadeMedida);
  const btn=document.querySelector("#modal-nova-ata .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={contrato_id:contratoId,item,unidade_medida:unidadeMedida,
    marca_modelo:document.getElementById("na-marca").value.trim(),
    qtde_contratada:qtde,
    valor_unit:parseFloat(document.getElementById("na-valor").value)||0,
    prazo_entrega:parseInt(document.getElementById("na-prazo").value)||null
  };
  const {data,error}=await sb.from("atas_itens").insert(dados).select("id").single();
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("na","Erro: "+error.message,"err");return;}
  if(!data?.id){showMsg("na","O item não foi salvo. Verifique sua permissão.","err");return;}
  await loadAtas();
  showMsg("na","✓ Item vinculado à ATA!","ok");
  if(_ctAtual&&String(_ctAtual.id)===String(contratoId)) await abrirDetalheContrato(contratoId);
  setTimeout(()=>document.getElementById("modal-nova-ata").classList.remove("active"),1000);
}

async function salvarNovaExec(){
  if(bloquearSeVisualiz('atas')) return;
  const at=_resolverAtaItemRef(document.getElementById("ne2-item").value);
  const origem=_neOrigem();
  if(!origem){showMsg("ne2","Selecione a origem do recurso (*).","err");return;}
  const secretariaId=document.getElementById("ne2-secretaria").value;
  const secretariaCarona=_neSecretariasCaronaCache.find(s=>String(s.id)===String(secretariaId))||null;
  const unidade=(origem==='carona'
    ?_neSecretariaCaronaLabel(secretariaCarona)
    :document.getElementById("ne2-unidade").value).trim();
  const qtde=parseFloat(document.getElementById("ne2-qtde").value)||0;
  const codigoSiamSecretaria=document.getElementById("ne2-codigo-siam-secretaria").value.trim();
  const emailSolicitanteEl=document.getElementById("ne2-email-solicitante");
  const emailSolicitante=emailSolicitanteEl.value.trim().toLowerCase();
  const emendaId=document.getElementById("ne2-emenda").value||null;
  const emendaItemId=document.getElementById("ne2-emenda-item").value||null;
  if(origem==='carona'&&!secretariaCarona){showMsg("ne2","Selecione a secretaria solicitante no cadastro central (*)","err");return}
  if(!at||!unidade||!qtde){showMsg("ne2",`Selecione o item da ATA e preencha ${origem==='carona'?'Secretaria':'Unidade'} e Quantidade (*)`,"err");return}
  if(origem==='carona'&&!codigoSiamSecretaria){showMsg("ne2","Informe o Código SIAM da secretaria (*)","err");return}
  if(origem==='carona'&&!emailSolicitante){showMsg("ne2","Informe o e-mail do solicitante (*)","err");return}
  if(origem==='carona'&&!emailSolicitanteEl.checkValidity()){showMsg("ne2","Informe um e-mail válido para o solicitante.","err");return}
  if(origem==='emenda' && (!emendaId||!emendaItemId)){showMsg("ne2","Selecione a emenda e o item da emenda (*)","err");return}
  if(origem==='emenda' && emendaItemId){
    const usados=await _neEmendaItensJaUsados([emendaItemId],{incluirPlanejamento:false});
    if(usados.has(String(emendaItemId))){
      showMsg("ne2","Este item da emenda já está vinculado a outro processo/solicitação. Escolha outro item.","err");
      return;
    }
    const {data:plano}=await sb.from('ata_planejamento_emendas').select('status,ata_item_id').eq('emenda_item_id',emendaItemId).neq('status','CANCELADO').maybeSingle();
    if(plano?.status==='PLANEJAMENTO'){
      showMsg('ne2','Este item acompanha uma futura Ata que ainda está em licitação. Aguarde a formalização da Ata.','err'); return;
    }
    if(plano?.status==='ATA_VIGENTE_AGUARDANDO_REQUISICAO'&&String(plano.ata_item_id)!==String(at.id)){
      showMsg('ne2','Este planejamento está vinculado a outro item da Ata. Selecione o item indicado pelo planejamento.','err'); return;
    }
  }
  const saldo=getSaldo(at);
  if(qtde>saldo){showMsg("ne2",`Quantidade maior que o saldo disponível (${saldo}).`,"err");return;}
  const btn=document.querySelector("#modal-nova-exec .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={ata_item_id:at.id,unidade,qtde,
    valor:parseFloat(document.getElementById("ne2-valor").value)||0,
    origem_recurso:origem,
    codigo_siam_secretaria:origem==='carona'?codigoSiamSecretaria:null,
    email_solicitante:origem==='carona'?emailSolicitante:null,
    emenda_id:origem==='emenda'?emendaId:null,
    emenda_item_id:origem==='emenda'?emendaItemId:null,
    data_af:document.getElementById("ne2-data-af").value||null,
    dt_entrega:document.getElementById("ne2-dt-entrega").value||null
  };
  const rpcNome=origem==='carona'?'criar_solicitacao_ata_execucao_carona':'criar_solicitacao_ata_execucao';
  const rpcArgs={
    p_ata_item_id:dados.ata_item_id,
    p_unidade:dados.unidade,
    p_qtde:dados.qtde,
    p_valor:dados.valor,
    p_origem_recurso:dados.origem_recurso,
    p_emenda_id:dados.emenda_id,
    p_emenda_item_id:dados.emenda_item_id,
    p_data_af:dados.data_af,
    p_dt_entrega:dados.dt_entrega
  };
  if(origem==='carona'){
    rpcArgs.p_codigo_siam_secretaria=dados.codigo_siam_secretaria;
    rpcArgs.p_email_solicitante=dados.email_solicitante;
  }
  const {data,error}=await sb.rpc(rpcNome,rpcArgs);
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("ne2","Erro: "+error.message,"err");return;}
  const salvo=Array.isArray(data)?data[0]:data;
  if(!salvo?.exec_id){showMsg("ne2","A solicitação não foi salva. Verifique sua permissão.","err");return;}
  await loadAtas();
  if(origem==='emenda'){
    if(typeof loadData==='function'){ try{ await loadData(); }catch(e){ console.error('loadData apos solicitacao ATA:',e); } }
  }
  // ═══ Atualização in-loco em entregasRows
  const execId=salvo.exec_id;
  const emendaItemVinculado=origem==='emenda'?(salvo.emenda_item_id||emendaItemId):null;
  const rowATA={tipo:'ATA',exec_id:execId,ata_item_id:at.id,emenda_id:origem==='emenda'?emendaId:null,emenda_item_id:emendaItemVinculado,
    processo:at.cpl||'',contrato:at.sim||'',
    empresa:at.empresa||'',item:at.item||'',marca:at.marca||'',modelo:'',
    origem_recurso:origem,email_solicitante:dados.email_solicitante||'',
    unidade,af_numero:'',af_dataISO:_toISODate(dados.data_af),
    qtde,limiteISO:'',recebido:false,cancelado:false,prazo_entrega_dias:at.prazo_entrega||at.prazo_entrega_dias||null,
    _ataPendenteAF:true,status:'aguardando AF',_novaExec:true};
  entregasRows.unshift(rowATA);
  itensEntregasCarregado=false;
  if(window._activeTab==='itens'){
    try{ renderItensEntregas(); }catch(e){}
    try{ await loadItensEntregas(); }catch(e){ console.error('bg atas->entregas:',e); }
  }
  showMsg("ne2","✓ Solicitação salva!"+(salvo.parcial?" Saldo restante mantido na emenda.":""),"ok");
  setTimeout(()=>document.getElementById("modal-nova-exec").classList.remove("active"),1000);
}

async function salvarEditExec(){
  if(bloquearSeVisualiz('atas')) return;
  const exec=atasExec.find(r=>String(r.id)===String(_editExecId));
  if(!exec) return;
  const btn=document.querySelector("#modal-edit-exec .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={
    empenho:document.getElementById("ee-empenho").value.trim(),
    data_af:document.getElementById("ee-data-af").value,
    prev_entrega:document.getElementById("ee-prev").value,
    dt_entrega:document.getElementById("ee-dt-entrega").value,
    nf:document.getElementById("ee-nf").value.trim()
  };
  const {data,error}=await sb.from("atas_execucao").update(dados).eq("id",exec.id).select("id");
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("ee","Erro: "+error.message,"err");return;}
  if(!data?.length){showMsg("ee","A execução não foi atualizada. Verifique sua permissão.","err");return;}
  Object.assign(exec,dados);
  filtrarAtas();
  // se o modal foi aberto pela aba "Controle de Entregas", recarrega aquela lista
  itensEntregasCarregado=false;
  if(window._activeTab==='itens' && typeof loadItensEntregas==='function') loadItensEntregas();
  showMsg("ee","✓ Salvo!","ok");
  setTimeout(()=>document.getElementById("modal-edit-exec").classList.remove("active"),900);
}

// ── Emitir AF para item de ATA (gera nº de AF, igual ao fluxo da aquisição) ──
async function abrirModalAtaAF(execId){
  if(!podeEditar('itens')&&!podeEditar('atas')){ alert("⛔ Você não tem permissão para emitir AF."); return; }
  let r=atasExec.find(x=>String(x.id)===String(execId));
  if(!r){
    const {data}=await sb.from("atas_execucao").select("*").eq("id",execId).single();
    if(data){ r=data; atasExec.push(r); }
  }
  if(!r){ if(window.toast)toast('Execução não encontrada','error'); return; }
  document.getElementById('ataaf-exec-id').value=r.id;
  document.getElementById('ataaf-info').innerHTML=`<b>${_sanEsc(r.item||'—')}</b><br>${_sanEsc(r.cpl||'—')} · ${_sanEsc(r.sim||'—')} · ${_sanEsc(r.unidade||'—')}`;
  document.getElementById('ataaf-numero').value=r.af_numero||'';
  document.getElementById('ataaf-data').value=r.data_af||'';
  document.getElementById('ataaf-prev').value=r.prev_entrega||'';
  document.getElementById('ataaf-empenho').value=r.empenho||'';
  const msg=document.getElementById('ataaf-msg'); msg.textContent=''; msg.className='fmsg';
  document.getElementById('modal-ata-af').classList.add('active');
}
async function salvarAtaAF(){
  if(!podeEditar('itens')&&!podeEditar('atas')){ alert("⛔ Você não tem permissão para emitir AF."); return; }
  const execId=document.getElementById('ataaf-exec-id').value;
  const numero=document.getElementById('ataaf-numero').value.trim();
  const afData=document.getElementById('ataaf-data').value;
  const prev=document.getElementById('ataaf-prev').value;
  const empenho=document.getElementById('ataaf-empenho').value.trim();
  const msg=document.getElementById('ataaf-msg');
  if(!numero){ msg.textContent='Informe o número da AF.'; msg.style.color='var(--red)'; return; }
  if(!afData){ msg.textContent='Informe a data da AF.'; msg.style.color='var(--red)'; return; }
  if(!prev){ msg.textContent='Informe a previsão de entrega.'; msg.style.color='var(--red)'; return; }
  const btn=document.getElementById('ataaf-salvar'); btn.disabled=true; btn.textContent='Salvando...';
  const dados={af_numero:numero, data_af:afData, prev_entrega:prev, empenho:empenho};
  const {data,error}=await sb.from('atas_execucao').update(dados).eq('id',execId).select('id');
  btn.disabled=false; btn.textContent='Emitir AF';
  if(error){ msg.textContent='Erro: '+error.message; msg.style.color='var(--red)'; return; }
  if(!data?.length){ msg.textContent='Não foi possível emitir a AF. Verifique sua permissão.'; msg.style.color='var(--red)'; return; }
  const exec=atasExec.find(x=>String(x.id)===String(execId)); if(exec) Object.assign(exec,dados);
  msg.style.color='var(--green)'; msg.textContent='✓ AF emitida!';
  if(typeof filtrarAtas==='function') filtrarAtas();
  if(window._activeTab==='itens' && typeof loadItensEntregas==='function'){ itensEntregasCarregado=false; try{ await loadItensEntregas(); }catch(e){ console.error(e); } }
  // Atualiza a aba Emendas se o item tiver vínculo com emenda
  const execAtual=atasExec.find(x=>String(x.id)===String(execId));
  if(execAtual?.emenda_item_id){
    sb.from("emenda_itens").update({cpl:execAtual.cpl||'', status:'AF EMITIDA - AGUARDANDO ENTREGA/CONFIRMACAO'}).eq("id",execAtual.emenda_item_id).then(r=>{if(r.error)console.error(r.error);});
    if(typeof loadData==='function') loadData().catch(e=>console.error('bg loadData:',e));
  }
  setTimeout(()=>document.getElementById('modal-ata-af').classList.remove('active'),800);
}
