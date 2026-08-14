// ═══ CARREGAR CHAMADOS E AC ═══
async function loadChamados(){
  localStorage.removeItem('chamados_data_corte');
  document.getElementById("chamados-loading").style.display="block";
  document.getElementById("chamados-main").style.display="none";
  try{
    await ensureLib('papa');
    // Carregar chamados
    const r1=await fetch(CHAMADOS_CSV_URL);
    const t1=await r1.text();
    const p1=Papa.parse(t1,{header:true,skipEmptyLines:true});
    chamadosRows=p1.data.filter(r=>r["Protocolo"]||r["Carimbo de data/hora"]).map(r=>({
      protocolo:(r["Protocolo"]||"").trim(),
      carimbo:(r["Carimbo de data/hora"]||"").trim(),
      data_solicitacao:(r["Data da solicitação:"]||r["Data da solicitação"]||"").trim(),
      unidade:(r["Unidade solicitante:"]||r["Unidade solicitante"]||"").trim(),
      endereco:(r["Endereço:"]||r["Endereço"]||"").trim(),
      telefone:(r["Telefone:"]||r["Telefone"]||"").trim(),
      responsavel:(r["Responsável na unidade:"]||r["Responsável na unidade"]||"").trim(),
      grau_urgencia:(r["Grau de urgência:"]||r["Grau de urgência"]||"").trim(),
      patrimonio:(r["Número do patrimônio:"]||r["Número Patrimônio (informação obrigatória)"]||r["Nº Patrimônio"]||"").trim(),
      equipamento:(r["Descrição do bem:"]||r["Descrição do bem"]||"").trim(),
      fabricante:(r["Fabricante/modelo:"]||r["Fabricante/modelo"]||"").trim(),
      serie:(r["Nº de série:"]||r["Nº de série"]||"").trim(),
      categoria:(r["Categoria:"]||r["Categoria"]||"").trim(),
      servico:(r["Serviço solicitado:"]||r["Serviço solicitado"]||"").trim(),
      problema:(r["Problema apresentado:"]||r["Problema apresentado"]||"").trim(),
      descricao:(r["Descrição completa e detalhada do problema:"]||r["Descrição completa"]||"").trim(),
      rechamado:(r["É rechamado?"]||"").trim(),
      data_rechamado:(r["Se sim, qual data?"]||"").trim(),
      observacao:(r["OBSERVAÇÕES"]||r["Observações"]||"").trim(),
    }));

    // Carregar controle
    try{
      const r2=await fetch(CONTROLE_CSV_URL+"&t="+Date.now()); // cache busting
      const t2=await r2.text();
      const p2=Papa.parse(t2,{header:true,skipEmptyLines:true});
      console.log("CONTROLE headers:", p2.meta.fields);
      console.log("CONTROLE linhas:", p2.data.length);
      controleRows=p2.data.filter(r=>r["Protocolo"]||r["PROTOCOLO"]).map(r=>({
        protocolo:(r["Protocolo"]||r["PROTOCOLO"]||"").trim(),
        status:(r["Status"]||r["STATUS"]||"Aberto").trim(),
        data_atendimento:(r["Data Atendimento"]||r["DATA ATENDIMENTO"]||"").trim(),
        empresa:(r["Empresa"]||r["EMPRESA"]||"").trim(),
        os:(r["Nº OS"]||r["O.S"]||r["OS"]||"").trim(),
        feito:(r["O que foi feito"]||r["OQ FOI FEITO"]||"").trim(),
        obs:(r["Observação"]||r["OBS"]||"").trim(),
      }));
      console.log("CONTROLE carregado:", controleRows.length, "registros");
    }catch(e){console.error("Erro controle:",e);controleRows=[];}

    // Ordenar por carimbo completo (data + hora) mais recente no topo
    chamadosRows.sort((a,b)=>{
      const parseCarimbo=(s)=>{
        if(!s) return null;
        // Formato: DD/MM/AAAA HH:MM:SS
        const m=s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if(m) return new Date(m[3],m[2]-1,m[1],m[4],m[5]);
        return parseDataBR(s.slice(0,10));
      };
      const da=parseCarimbo(a.carimbo||a.data_solicitacao||"");
      const db=parseCarimbo(b.carimbo||b.data_solicitacao||"");
      if(da&&db) return db-da;
      return 0;
    });
    popularFiltrosChamados();
    filtrarChamados();
    atualizarBadgeChamados();
    document.getElementById("chamados-loading").style.display="none";
    document.getElementById("chamados-main").style.display="block";
  }catch(e){
    document.getElementById("chamados-loading").innerHTML=`<div style="color:var(--red)">⚠️ Erro ao carregar chamados: ${e.message}</div>`;
  }
}

let inventarioRows=[], inventarioCarregado=false, _invFiltered=[];
async function loadInventario(){
  document.getElementById('inv-loading').style.display='block';
  document.getElementById('inv-main').style.display='none';
  try{
    const [{data:aq,error:e1},{data:at,error:e2}]=await Promise.all([
      sb.from('itens_entregas')
        .select('*, empenhos(numero,valor_empenhado,data_emissao), notas_fiscais(numero,data_emissao,valor_total,arquivo_url), itens(id,descricao,marca,modelo,valor_estimado,valor_contratado,emenda_item_id, processos(identificador), contratos(cpl,numero_contrato), fornecedores(razao_social,cnpj_normalizado), unidades(nome), emenda_it:emenda_item_id(emenda,item,emendas:emenda_id(emenda,ano,parlamentar)))')
        .or('data_entrega_unidade.not.is.null,data_recebimento.not.is.null')
        .order('data_entrega_unidade',{ascending:false}),
      sb.from('atas_execucao')
        .select('*')
        .or('data_entrega_unidade.not.is.null,dt_entrega.not.is.null')
        .order('data_entrega_unidade',{ascending:false})
    ]);
    if(e1) throw e1;
    if(e2) throw e2;
    const rows=[];
    const aqUnidadesPorEntrega={};
    const aqEntregaIds=[...new Set((aq||[]).map(r=>r.id).filter(Boolean))];
    for(const ids of _chunkArray(aqEntregaIds,200)){
      const {data:uns}=await sb.from('itens_entregas_unidades')
        .select('id,entrega_id,patrimonio,numero_serie,unidade_seq,recebido_em,recebido_por,notas_fiscais(numero,data_emissao,valor_total,arquivo_url)')
        .in('entrega_id',ids)
        .order('unidade_seq',{ascending:true});
      (uns||[]).forEach(u=>{ (aqUnidadesPorEntrega[String(u.entrega_id)]=aqUnidadesPorEntrega[String(u.entrega_id)]||[]).push(u); });
    }
    (aq||[]).forEach(r=>{
      const it=r.itens||{};
      const ei=it.emenda_it||{};
      const em=ei.emendas||{};
      const base={
        tipo:'Aquisição', id:r.id,
        item:it.descricao||'',
        marca:it.marca||'',
        modelo:it.modelo||'',
        unidade:it.unidades?.nome||'',
        empresa:it.fornecedores?.razao_social||'',
        cnpj:it.fornecedores?.cnpj_normalizado||'',
        processo:it.processos?.identificador||'',
        contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
        cpl:it.contratos?.cpl||'',
        numero_contrato:it.contratos?.numero_contrato||'',
        qtde:Number(r.qtde_recebida)||0,
        valor_licitacao_unit:it.valor_estimado,
        valor_executado_unit:it.valor_contratado,
        patrimonio:r.patrimonio||'',
        numero_serie:r.numero_serie||'',
        empenho:r.empenhos?.numero||r.empenho||'',
        valor_empenhado:r.empenhos?.valor_empenhado||null,
        empenho_data:_toISODate(r.empenhos?.data_emissao),
        nota_fiscal:r.notas_fiscais?.numero||r.nota_fiscal||'',
        nota_fiscal_arquivo:r.notas_fiscais?.arquivo_url||'',
        nf_data:_toISODate(r.notas_fiscais?.data_emissao||r.nf_data),
        nf_valor:r.notas_fiscais?.valor_total||null,
        data_recebimento:_toISODate(r.data_recebimento),
        data_entrega_unidade:_toISODate(r.data_entrega_unidade),
        recebido_por:r.recebido_por||'',
        recebimento_tipo:r.recebimento_tipo||'',
        termo_responsavel:r.termo_responsavel||'',
        termo_cargo:r.termo_cargo||'',
        termo_arquivo:r.termo_arquivo||'',
        confirmacao_obs:r.confirmacao_obs||'',
        af_numero:r.af_numero||'',
        af_data:_toISODate(r.af_data),
        emenda:ei.emenda||'',
        emenda_ano:em.ano||'',
        parlamentar:em.parlamentar||'',
        emenda_item_desc:ei.item||'',
        emenda_item_id:it.emenda_item_id||null
      };
      const unidades=(aqUnidadesPorEntrega[String(r.id)]||[]).filter(_unidadeFisicaTemId);
      if(unidades.length){
        unidades.forEach((u,idx)=>rows.push({
          ...base,
          id:u.id||`${r.id}-u-${idx+1}`,
          _base_id:r.id,
          _unidadeFisica:true,
          qtde:1,
          patrimonio:u.patrimonio||'',
          numero_serie:u.numero_serie||'',
          nota_fiscal:u.notas_fiscais?.numero||base.nota_fiscal,
          nota_fiscal_arquivo:u.notas_fiscais?.arquivo_url||base.nota_fiscal_arquivo,
          nf_data:_toISODate(u.notas_fiscais?.data_emissao)||base.nf_data,
          nf_valor:u.notas_fiscais?.valor_total||base.nf_valor,
          data_recebimento:_toISODate(u.recebido_em)||base.data_recebimento,
          recebido_por:u.recebido_por||base.recebido_por
        }));
      }else{
        rows.push(base);
      }
    });
    const ataEmendaInfo={};
    const ataEmendaIds=[...new Set((at||[]).map(r=>r.emenda_item_id).filter(Boolean))];
    if(ataEmendaIds.length){
      const {data:emInfo}=await sb.from('emenda_itens')
        .select('id,item,emenda,unidade_beneficiada,unidade_entrega,empenho,nota_fiscal,patrimonio,emendas:emenda_id(emenda,ano,parlamentar)')
        .in('id',ataEmendaIds);
      (emInfo||[]).forEach(e=>{ ataEmendaInfo[String(e.id)]=e; });
    }
    const ataItemInfo={};
    const ataItemIds=[...new Set((at||[]).map(r=>r.ata_item_id).filter(Boolean))];
    if(ataItemIds.length){
      const {data:aiInfo}=await sb.from('atas_itens')
        .select('id,cpl,sim,item,marca_modelo,empresa,valor_unit,contratos(cpl,numero_contrato,prestador)')
        .in('id',ataItemIds);
      (aiInfo||[]).forEach(i=>{ ataItemInfo[String(i.id)]=i; });
    }
    const ataUnidadesPorExec={};
    const ataExecIds=[...new Set((at||[]).map(r=>r.id).filter(Boolean))];
    for(const ids of _chunkArray(ataExecIds,200)){
      const {data:uns}=await sb.from('atas_execucao_unidades')
        .select('id,exec_id,patrimonio,numero_serie,unidade_seq,recebido_em,recebido_por,notas_fiscais(numero,data_emissao,valor_total,arquivo_url)')
        .in('exec_id',ids)
        .order('unidade_seq',{ascending:true});
      (uns||[]).forEach(u=>{ (ataUnidadesPorExec[String(u.exec_id)]=ataUnidadesPorExec[String(u.exec_id)]||[]).push(u); });
    }
    (at||[]).forEach(r=>{
      const emInfo=ataEmendaInfo[String(r.emenda_item_id||'')]||{};
      const em=emInfo.emendas||{};
      const ai=ataItemInfo[String(r.ata_item_id||'')]||{};
      const processo=r.cpl||ai.cpl||ai.contratos?.cpl||'';
      const contrato=r.sim||ai.sim||ai.contratos?.numero_contrato||'';
      const item=r.item||ai.item||emInfo.item||'';
      const unidade=r.unidade||emInfo.unidade_entrega||emInfo.unidade_beneficiada||'';
      const empresa=ai.empresa||ai.contratos?.prestador||'';
      const nf=r.nf||emInfo.nota_fiscal||'';
      if(!item && !processo && !contrato) return;
      const base={
        tipo:'ATA', id:r.id,
        item,
        marca_modelo:ai.marca_modelo||'',
        unidade,
        empresa, cnpj:'',
        processo,
        contrato,
        cpl:processo, numero_contrato:contrato,
        qtde:Number(r.qtde)||0,
        valor_licitacao_unit:ai.valor_unit,
        valor_executado_unit:ai.valor_unit,
        patrimonio:emInfo.patrimonio||r.patrimonio||'',
        numero_serie:r.numero_serie||'',
        empenho:r.empenho||emInfo.empenho||'',
        valor_empenhado:null, empenho_data:null,
        nota_fiscal:nf,
        nota_fiscal_arquivo:'',
        nf_data:null, nf_valor:null,
        data_recebimento:_toISODate(r.dt_entrega),
        data_entrega_unidade:_toISODate(r.data_entrega_unidade),
        recebido_por:'', recebimento_tipo:'',
        termo_responsavel:r.termo_responsavel||'',
        termo_cargo:r.termo_cargo||'',
        termo_arquivo:r.termo_arquivo||'',
        confirmacao_obs:r.confirmacao_obs||'',
        af_numero:r.af_numero||'', af_data:_toISODate(r.data_af),
        emenda:emInfo.emenda||em.emenda||'', emenda_ano:em.ano||'', parlamentar:em.parlamentar||'', emenda_item_desc:emInfo.item||'',
        emenda_item_id:r.emenda_item_id||null
      };
      const unidades=(ataUnidadesPorExec[String(r.id)]||[]).filter(_unidadeFisicaTemId);
      if(unidades.length){
        unidades.forEach((u,idx)=>rows.push({
          ...base,
          id:u.id||`${r.id}-u-${idx+1}`,
          _base_id:r.id,
          _unidadeFisica:true,
          qtde:1,
          patrimonio:u.patrimonio||'',
          numero_serie:u.numero_serie||'',
          nota_fiscal:u.notas_fiscais?.numero||base.nota_fiscal,
          nota_fiscal_arquivo:u.notas_fiscais?.arquivo_url||base.nota_fiscal_arquivo,
          nf_data:_toISODate(u.notas_fiscais?.data_emissao)||base.nf_data,
          nf_valor:u.notas_fiscais?.valor_total||base.nf_valor,
          data_recebimento:_toISODate(u.recebido_em)||base.data_recebimento,
          recebido_por:u.recebido_por||base.recebido_por
        }));
      }else{
        rows.push(base);
      }
    });
    inventarioRows=rows;
    inventarioCarregado=true;
    _popularFiltrosInv();
    filtrarInventario();
    document.getElementById('inv-loading').style.display='none';
    document.getElementById('inv-main').style.display='block';
  }catch(e){
    document.getElementById('inv-loading').innerHTML=`<div style="color:var(--red)">⚠️ Erro ao carregar inventário: ${_sanEsc(e.message)}</div>`;
  }
}

function getControle(protocolo){
  return controleRows.find(r=>r.protocolo===protocolo)||{status:"Aberto",data_atendimento:"",empresa:"",os:"",feito:"",obs:""};
}

function statusBadgeChamado(status){
  const m={
    "Aberto":["var(--red-bg)","var(--red-text)"],
    "Em andamento":["var(--amber-bg)","var(--amber-text)"],
    "Concluído":["var(--green-bg)","var(--green-text)"],
    "Pendente":["var(--amber-bg)","var(--amber-text)"],
    "Inválido":["var(--gray-bg)","var(--gray-text)"],
  };
  const c=m[status]||["var(--gray-bg)","var(--gray-text)"];
  return`<span class="badge" style="background:${c[0]};color:${c[1]}">${status}</span>`;
}

function popularFiltrosChamados(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${v}"${v===cur?" selected":""}>${v}</option>`).join("")};
  sel("fc-unidade",[...new Set(chamadosRows.map(r=>r.unidade).filter(Boolean))].sort());
  sel("fc-categoria",[...new Set(chamadosRows.map(r=>r.categoria).filter(Boolean))].sort());
  sel("fc-servico",[...new Set(chamadosRows.map(r=>r.servico).filter(Boolean))].sort());
}

function clearAllChamados(){
  ["fc-unidade","fc-categoria","fc-servico","fc-status","fc-busca"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  filtrarChamados();
}

function atualizarBadgeChamados(){
  const abertos=chamadosRows.filter(r=>getControle(r.protocolo).status==="Aberto").length;
  const badge=document.getElementById("badge-chamados");
  if(badge){
    if(abertos>0){badge.textContent=abertos;badge.style.display="inline";}
    else badge.style.display="none";
  }
}

function filtrarChamados(){
  const un=document.getElementById("fc-unidade")?.value||"";
  const cat=document.getElementById("fc-categoria")?.value||"";
  const serv=document.getElementById("fc-servico")?.value||"";
  const st=document.getElementById("fc-status")?.value||"";
  const busca=document.getElementById("fc-busca")?.value||"";
  const meses=parseInt(document.getElementById("fc-periodo")?.value||"12");

  const cutoff=new Date();
  if(meses>0) cutoff.setMonth(cutoff.getMonth()-meses);

  let rows=chamadosRows.filter(r=>{
    // Filtro de período
    if(meses>0){
      const d=parseDataBR(r.carimbo?.slice(0,10))||parseDataBR(r.data_solicitacao);
      if(d&&d<cutoff) return false;
    }
    if(un&&r.unidade!==un) return false;
    if(cat&&r.categoria!==cat) return false;
    if(serv&&r.servico!==serv) return false;
    const ctrl=getControle(r.protocolo);
    if(st&&ctrl.status!==st) return false;
    if(busca&&!matchBusca([r.equipamento,r.patrimonio,r.descricao,r.protocolo,r.unidade,r.responsavel,r.endereco,r.fabricante,r.serie].join(" "),busca)) return false;
    return true;
  });

  // Métricas
  const total=rows.length;
  const abertos=rows.filter(r=>getControle(r.protocolo).status==="Aberto").length;
  const andamento=rows.filter(r=>getControle(r.protocolo).status==="Em andamento").length;
  const concluidos=rows.filter(r=>getControle(r.protocolo).status==="Concluído").length;
  const pendentes=rows.filter(r=>getControle(r.protocolo).status==="Pendente").length;
  document.getElementById("cm-total").textContent=total;
  document.getElementById("cm-abertos").textContent=abertos;
  document.getElementById("cm-andamento").textContent=andamento;
  document.getElementById("cm-concluidos").textContent=concluidos;
  document.getElementById("cm-pendentes").textContent=pendentes;
  document.getElementById("chamados-count").textContent=`${total} chamados`;

  document.getElementById("chamados-body").innerHTML=rows.map(r=>{
    const temAC=acRows.some(a=>a.patrimonio&&a.patrimonio===r.patrimonio);
    const ctrl=getControle(r.protocolo);
    const aberto=ctrl.status==="Aberto";
    return`<tr style="${aberto?'background:var(--amber-bg)':''}">
      <td style="text-align:center">
        <input type="checkbox" ${aberto?'':'checked'}
          onchange="marcarChamadoAberto('${r.protocolo.replace(/'/g,"\'")}', this.checked)"
          title="${aberto?'Marcar como enviado à empresa':'Chamado já enviado'}"
          style="accent-color:var(--green);width:15px;height:15px;cursor:pointer">
      </td>
      <td><button onclick="gerarPDFChamado('${r.protocolo.replace(/'/g,"'")}' )" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--red-bg);background:var(--red-bg);color:var(--red-text);cursor:pointer" title="Gerar OS em PDF">📄</button></td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.protocolo||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.carimbo||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.data_solicitacao||r.carimbo?.slice(0,10)||"—")}</td>
      <td style="font-size:12px;white-space:nowrap">${_sanEsc(r.unidade||"—")}</td>
      <td style="font-size:11px" class="td-trunc" title="${_sanEsc(r.endereco||'')}">${_sanEsc(r.endereco||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.telefone||"—")}</td>
      <td style="font-size:11px" class="td-trunc">${_sanEsc(r.responsavel||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.grau_urgencia||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.patrimonio||"—")}${temAC?' <span class="badge badge-info">AC</span>':''}</td>
      <td class="td-trunc" title="${_sanEsc(r.equipamento||'')}">${_sanEsc(r.equipamento||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.fabricante||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.serie||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.categoria||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.servico||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.problema||"—")}</td>
      <td class="td-trunc" style="max-width:180px" title="${_sanEsc(r.descricao||'')}">${_sanEsc(r.descricao||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.rechamado||"—")}</td>
      <td>${statusBadgeChamado(ctrl.status)}</td>
      <td style="font-size:11px">${_sanEsc(ctrl.data_atendimento||"—")}</td>
      <td style="font-size:11px">${_sanEsc(ctrl.empresa||"—")}</td>
      <td style="font-size:11px">${_sanEsc(ctrl.os||"—")}</td>
      <td class="td-trunc" style="max-width:160px" title="${_sanEsc(ctrl.feito||'')}">${_sanEsc(ctrl.feito||"—")}</td>
      <td style="display:flex;align-items:center;gap:6px">
        ${podeEditar('chamados')?`<button onclick="abrirModalChamado('${r.protocolo.replace(/'/g,"\'")}','${r.equipamento.replace(/'/g,"\'")}','${r.unidade.replace(/'/g,"\'")}','${r.patrimonio}')" class="btn-secondary btn-compact" title="Atualizar atendimento">✏️ Atualizar</button>`:""}
        ${kebabMenuHtml([
          {label:'📧 Enviar por e-mail',onclick:`enviarEmailChamado('${r.protocolo}')`},
          {label:'📄 Gerar OS em PDF',onclick:`gerarPDFChamado('${r.protocolo.replace(/'/g,"\'")}')`}
        ])}
      </td>
    </tr>`;
  }).join("")||`<tr><td colspan="25"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum chamado encontrado</div></td></tr>`;
}

function enviarEmailChamado(protocolo){
  const r=chamadosRows.find(x=>x.protocolo===protocolo);
  if(!r){alert("Chamado não encontrado.");return;}
  const ctrl=getControle(protocolo)||{};
  // Busca e-mail da empresa pelo contrato vinculado no controle
  const cplVinc=ctrl.cpl_contrato||"";
  const contrato=cplVinc?contratosRows.find(c=>c.cpl===cplVinc):null;
  const emailEmpresa=contrato?.email_empresa||"";
  const assunto=`${r.protocolo} - ${r.unidade||''} - ${r.equipamento||''}`;
  const corpo=`Segue chamado de manutenção:\n\nProtocolo: ${r.protocolo}\nData de abertura: ${r.carimbo||r.data_solicitacao||'—'}\nEquipamento: ${r.equipamento||'—'}\nPatrimônio: ${r.patrimonio||'—'}\nUnidade: ${r.unidade||'—'}\nEndereço: ${r.endereco||'—'}\nProblema relatado: ${r.descricao||r.problema||'—'}\nUrgência: ${r.grau_urgencia||'—'}\n\nAtenciosamente,`;
  const emailsList=emailEmpresa.split(',').map(e=>e.trim()).filter(Boolean).join(',');
  const url=`mailto:${emailsList}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.location.href=url;
}

async function marcarTodosChamados(){
  if(currentProfile?.papel==="visualizador"){alert("Sem permissão.");return;}
  const checkboxes=document.querySelectorAll('#chamados-body input[type=checkbox]:not(:checked)');
  if(!checkboxes.length){alert("Nenhum chamado pendente.");return;}
  if(!await uiConfirm(`Marcar ${checkboxes.length} chamados como enviados à empresa?`)) return;
  const btn=document.querySelector('[onclick="marcarTodosChamados()"]');
  btn.disabled=true;btn.textContent="Salvando...";
  // Coletar protocolos
  const protocolos=[];
  for(const cb of checkboxes){
    const proto=cb.closest('tr')?.querySelector('td:nth-child(3)')?.textContent?.trim();
    if(!proto||proto==="—") continue;
    protocolos.push(proto);
  }
  const registros=protocolos.map(protocolo=>({protocolo,status:"Em andamento",data_atendimento:"",empresa:"",os:"",feito:"",obs:"",updated_at:new Date().toISOString()}));
  const {error}=await sb.from("chamados_controle").upsert(registros,{onConflict:"protocolo"});
  if(error){btn.disabled=false;btn.textContent="✅ Marcar todos como enviados";alert("Erro ao salvar chamados: "+error.message);return;}
  registros.forEach(novo=>{const idx=controleRows.findIndex(r=>r.protocolo===novo.protocolo);if(idx>=0)controleRows[idx]=novo;else controleRows.push(novo);});
  atualizarBadgeChamados();
  filtrarChamados();
  btn.disabled=false;btn.textContent="✅ Marcar todos como enviados";
  alert(`✓ ${protocolos.length} chamados marcados e salvos!`);
}

async function _prefixoContratoDoChamado(ctrl){
  const contratoId=ctrl?.contrato_id||null;
  const cpl=ctrl?.cpl_contrato||ctrl?.cpl||ctrl?.contrato||"";
  if(!contratoId&&!cpl) return "";
  const local=(contratosRows||[]).find(c=>(contratoId&&String(c.id)===String(contratoId))||c.cpl===cpl||c.numero_contrato===cpl);
  if(local?.prefixo_chamado) return String(local.prefixo_chamado).trim().toUpperCase();
  let query=sb.from("contratos").select("prefixo_chamado").limit(1);
  query=contratoId?query.eq("id",contratoId):query.eq("cpl",cpl);
  const {data,error}=await query;
  if(error){console.warn("Prefixo do contrato:",error.message);return "";}
  return String(data?.[0]?.prefixo_chamado||"").trim().toUpperCase();
}
function _parteNomePDF(valor){
  return String(valor||"").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").replace(/^-+|-+$/g,"").trim();
}
async function gerarPDFChamado(protocolo,controleOverride=null){
  const r=chamadosRows.find(x=>x.protocolo===protocolo);
  if(!r){alert("Chamado não encontrado.");return;}
  const ctrl=controleOverride||getControle(protocolo);

  const chk=(v)=>v?'(X)':'(  )';
  const chkExato=(v)=>v?'(X)':'(  )';
  const categorias=['Eletroeletrônico','Equipamento médico/odontológico','Mobiliário médico','Mobiliário geral','Outro'];
  const cat=r.categoria||"";
  const servicos=['Manutenção corretiva','Manutenção preventiva','Instalação','Desinstalação','Treinamento','Calibração','Outro'];
  const serv=r.servico||"";
  const prob=r.problema||"";
  const rechamado=r.rechamado||"";

  const html=`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="css/print-os.css">
</head>
<body>
<div class="page pdf-os">

  <div class="header">
    <img src="${"https://zmaffeisz.github.io/dashboard-emendas/ativo-brasao-sorocaba-colorido-contorno-branco%20(1).svg"}" class="brasao" alt="Brasão">
    <div class="header-text">
      <div class="pref">PREFEITURA DE SOROCABA</div>
      <div class="sec">SECRETARIA DA SAÚDE</div>
      <div class="setor">SEÇÃO DE AQUISIÇÃO E MANUTENÇÃO DE EQUIPAMENTOS E MOBILIÁRIOS DA SAÚDE</div>
    </div>
  </div>

  <table>
    <tr>
      <td colspan="2" class="titulo" style="width:65%">ORDEM DE SERVIÇO - MANUTENÇÃO DE BENS PERMANENTES</td>
      <td style="width:15%"><span class="label">Nº OS:</span></td>
      <td style="width:20%">${r.protocolo||""}</td>
    </tr>
  </table>

  <table>
    <tr>
      <td rowspan="5" class="rotulo">Identificação da Unidade</td>
      <td colspan="2"><span class="label">Unidade Solicitante:</span> ${r.unidade||""}</td>
      <td><span class="label">Data da Solicitação:</span> ${r.data_solicitacao||r.carimbo?.slice(0,10)||""}</td>
    </tr>
    <tr><td colspan="3"><span class="label">Endereço:</span> ${r.endereco||""}</td></tr>
    <tr><td colspan="3"><span class="label">Telefone:</span> ${r.telefone||""}</td></tr>
    <tr>
      <td colspan="2">
        <span class="label">Grau de Urgência</span><br>
        (  ) P1 &nbsp;&nbsp; (X) P2 &nbsp;&nbsp; (  ) P3
      </td>
      <td style="font-size:8px">P1 - Interrupção de Atendimento<br>P2 - Atendimento parcialmente prejudicado<br>P3 - Pouco urgente</td>
    </tr>
    <tr><td colspan="3"><span class="label">Responsável pela abertura do chamado:</span> ${r.responsavel||""}${r.email_retorno?` &nbsp;&nbsp; <span class="label">E-mail para retorno:</span> ${r.email_retorno}`:''}</td></tr>
  </table>

  <table>
    <tr>
      <td colspan="4"><span class="label">Número Patrimônio (informação obrigatória):</span> ${r.patrimonio||""}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Nome do equipamento:</span><br>${r.equipamento||""}</td>
      <td colspan="2"><span class="label">Fabricante:</span><br>${r.fabricante||""}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Modelo:</span> ${r.fabricante||""}</td>
      <td colspan="2"><span class="label">Nº de Série:</span> ${r.serie||""}</td>
    </tr>
  </table>

  <table>
    <tr>
      <td rowspan="8" class="rotulo">Dados do Bem Permanente</td>
      <td colspan="3"><span class="label">Categoria</span></td>
    </tr>
    ${categorias.map(c=>`<tr><td colspan="3">${chk(cat===c)} ${c}</td></tr>`).join("")}
    <tr>
      <td colspan="3">
        <span class="label">Serviço Solicitado</span><br>
        ${servicos.map(s=>`<span class="servico-opcao">${chk(serv===s)} ${s}</span>`).join("")}
      </td>
    </tr>
    <tr>
      <td colspan="3">
        <span class="label">Problema apresentado:</span>
        ${chk(prob==="No bem permanente")} No bem permanente &nbsp;&nbsp;
        ${chk(prob==="No acessório")} No acessório
      </td>
    </tr>
    <tr>
      <td colspan="3">
        <span class="label">Descrição completa e detalhada do problema:</span><br><br>
        <div style="min-height:60px;padding:4px">${r.descricao||""}</div>
      </td>
    </tr>
  </table>

  <table>
    <tr>
      <td colspan="2">
        <span class="label">É Rechamado?</span><br>
        ${chkExato(normalizar(rechamado).includes("sim"))} Sim - Data do chamado anterior: ${r.data_rechamado||"_______________"} &nbsp;&nbsp;&nbsp;
        ${chkExato(!normalizar(rechamado).includes("sim"))} Não
      </td>
    </tr>
  </table>

  <table>
    <tr>
      <td rowspan="6" class="rotulo">Pendências</td>
      <td style="background:#e0e0e0"><span class="label">Controle de Manutenção Externa - Retirada de bem permanente</span></td>
      <td><span class="label">Controle Nº:</span></td>
    </tr>
    <tr><td colspan="2"><span class="label">Acessórios acompanhantes:</span><br><br><br></td></tr>
    <tr><td colspan="2"><span class="label">Data da retirada:</span> ____/____/_______ às _____:_____ hs</td></tr>
    <tr><td colspan="2"><span class="label">Data da devolução:</span> ____/____/_______ às _____:_____ hs</td></tr>
    <tr><td colspan="2"><span class="label">Recebido por:</span><br><br></td></tr>
    <tr><td colspan="2"><span class="label">Nome da Empresa e o técnico que executou a ação:</span><br><br></td></tr>
  </table>

  <div class="footer">
    PALÁCIO DOS TROPEIROS – 2º andar<br>
    Av. Eng. Carlos Reinaldo Mendes 3.041 – Alto da Boa Vista – CEP 18013-280 – Sorocaba – SP<br>
    Fone: (15) 3238 2421 - e-mail: sueq.equipamentos@sorocaba.sp.gov.br
  </div>

  <div style="text-align:center;margin-top:12px">
    <button data-html2canvas-ignore="true" style="display:none">Imprimir</button>
  </div>

</div>
<\/body>
<\/html>`;

  try{
    const prefixo=await _prefixoContratoDoChamado(ctrl);
    const partes=[_parteNomePDF(r.protocolo),_parteNomePDF(prefixo),_parteNomePDF(r.unidade)].filter(Boolean);
    const nome=(partes.join(" - ")||"chamado")+".pdf";
    await ensureLib('html2pdf');
    const worker=html2pdf().set({margin:[10,10,10,10],html2canvas:{scale:2,useCORS:true,letterRendering:true,backgroundColor:"#ffffff"},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},pagebreak:{mode:["css","legacy"]}}).from(html,"string");
    const blob=await worker.outputPdf("blob");
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download=nome;link.style.display="none";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){
    console.error("Erro ao gerar PDF:",e);
    alert("Não foi possível gerar o PDF: "+(e.message||e));
  }
}

async function marcarChamadoAberto(protocolo, marcado){
  // marcado=true = checkbox checked = chamado enviado (Em andamento)
  // marcado=false = desmarcado = voltou para Aberto
  const novoStatus = marcado ? "Em andamento" : "Aberto";
  const dados = {
    protocolo,
    status: novoStatus,
    data_atendimento: "",
    empresa: "",
    os: "",
    feito: "",
    obs: ""
  };
  dados.updated_at=new Date().toISOString();
  const {error}=await sb.from("chamados_controle").upsert(dados,{onConflict:"protocolo"});
  if(error){alert("Erro ao salvar chamado: "+error.message);filtrarChamados();return;}
  const idx = controleRows.findIndex(r=>r.protocolo===protocolo);
  const novo = {protocolo, status:novoStatus, data_atendimento:"", empresa:"", os:"", feito:"", obs:""};
  if(idx>=0) controleRows[idx]=novo; else controleRows.push(novo);
  atualizarBadgeChamados();
  filtrarChamados();
}

let _chamadoAtual = null;
function abrirModalChamado(protocolo, equip, unidade, patrimonio){
  _chamadoAtual = protocolo;
  const ctrl=getControle(protocolo);
  document.getElementById("mc-info").textContent=`${protocolo} · ${equip} · ${unidade}${patrimonio?' · Pat: '+patrimonio:''}`;
  document.getElementById("mc-status").value=ctrl.status||"Aberto";
  document.getElementById("mc-data").value=ctrl.data_atendimento||"";
  document.getElementById("mc-empresa").value=ctrl.empresa||"";
  document.getElementById("mc-os").value=ctrl.os||"";
  document.getElementById("mc-feito").value=ctrl.feito||"";
  document.getElementById("mc-obs").value=ctrl.obs||"";
  document.getElementById("mc-msg").className="fmsg";
  document.getElementById("modal-chamado").classList.add("active");
}

function fecharModalChamado(){document.getElementById("modal-chamado").classList.remove("active")}
function fecharModalChamadoFora(e){if(e.target===document.getElementById("modal-chamado"))fecharModalChamado()}

async function salvarControleChamado(){
  if(currentProfile?.papel==="visualizador"){alert("Sem permissão.");return;}
  const protocolo=_chamadoAtual;
  if(!protocolo) return;
  const dados={
    protocolo,
    status:document.getElementById("mc-status").value,
    data_atendimento:document.getElementById("mc-data").value,
    empresa:document.getElementById("mc-empresa").value,
    os:document.getElementById("mc-os").value,
    feito:document.getElementById("mc-feito").value,
    obs:document.getElementById("mc-obs").value,
  };
  const btn=document.querySelector("#modal-chamado .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  dados.updated_at=new Date().toISOString();
  const {error}=await sb.from("chamados_controle").upsert(dados,{onConflict:"protocolo"});
  if(error){btn.disabled=false;btn.textContent="Salvar";showMsg("mc","Erro: "+error.message,"err");return;}
  // Atualizar localmente
  const idx=controleRows.findIndex(r=>r.protocolo===protocolo);
  const novo={protocolo,status:dados.status,data_atendimento:dados.data_atendimento,empresa:dados.empresa,os:dados.os,feito:dados.feito,obs:dados.obs};
  if(idx>=0) controleRows[idx]=novo; else controleRows.push(novo);
  filtrarChamados();
  showMsg("mc","✓ Salvo!","ok");
  btn.disabled=false;btn.textContent="Salvar";
  setTimeout(()=>fecharModalChamado(),1500);
}

// ═══ INVENTÁRIO GERAL ═══
function _popularFiltrosInv(){
  const unidades=[...new Set(inventarioRows.map(r=>r.unidade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const sel=document.getElementById('finv-unidade');
  if(sel) sel.innerHTML='<option value="">Todas</option>'+unidades.map(u=>`<option value="${_sanEsc(u)}">${_sanEsc(u)}</option>`).join('');
}

function clearAllInv(){
  ['finv-tipo','finv-unidade'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const b=document.getElementById('finv-busca');if(b)b.value='';
  filtrarInventario();
}

function filtrarInventario(){
  const tipo=document.getElementById('finv-tipo')?.value||'';
  const unidade=document.getElementById('finv-unidade')?.value||'';
  const q=(document.getElementById('finv-busca')?.value||'').toLowerCase();
  _invFiltered=inventarioRows.filter(r=>{
    if(tipo&&r.tipo!==tipo) return false;
    if(unidade&&r.unidade!==unidade) return false;
    if(q){const hay=[r.item,r.marca,r.modelo,r.marca_modelo,r.empresa,r.patrimonio,r.empenho,r.nota_fiscal,r.emenda,r.contrato,r.unidade,r.processo,r.numero_serie].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const total=_invFiltered.length;
  const aq=_invFiltered.filter(r=>r.tipo==='Aquisição').length;
  const ata=_invFiltered.filter(r=>r.tipo==='ATA').length;
  const unids=new Set(_invFiltered.map(r=>r.unidade).filter(Boolean)).size;
  document.getElementById('inv-total').textContent=total;
  document.getElementById('inv-aq').textContent=aq;
  document.getElementById('inv-ata').textContent=ata;
  document.getElementById('inv-unids').textContent=unids;
  document.getElementById('inv-count').textContent=total+' item(s)';
  renderInventario();
}

function renderInventario(){
  const tbody=document.getElementById('inv-body');
  if(!_invFiltered.length){
    tbody.innerHTML='<tr><td colspan="10"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum item no inventário ainda. Confirme a entrega na unidade para que os itens apareçam aqui.</div></td></tr>';
    return;
  }
  tbody.innerHTML=_invFiltered.map((r,i)=>{
    const tipoCor=r.tipo==='ATA'?'#A371F7':'#378ADD';
    const emendaLabel=r.emenda?(r.emenda+(r.emenda_ano?'/'+r.emenda_ano:'')):'—';
    return`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;white-space:nowrap"><span class="badge" style="background:${tipoCor}22;color:${tipoCor}">${_sanEsc(r.tipo)}</span></td>
      <td style="padding:6px 8px;max-width:220px;white-space:normal;word-break:break-word" title="${_sanEsc(r.item)}">${_sanEsc(r.item||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-size:12px">${_sanEsc(r.unidade||'—')}</td>
      <td style="padding:6px 8px;font-size:12px;max-width:160px;white-space:normal;word-break:break-word" title="${_sanEsc(r.empresa)}">${_sanEsc(r.empresa||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-weight:500">${_sanEsc(r.patrimonio||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">${r.data_entrega_unidade?fmtDate(r.data_entrega_unidade):'—'}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-size:11px;color:var(--text2)">${_sanEsc(r.empenho||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-size:11px;color:var(--text2)">${_sanEsc(emendaLabel)}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-size:11px">${_sanEsc(r.contrato||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">
        <button onclick="abrirDetalheInv(${i})" style="font-size:11px;padding:3px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Ver tudo</button>
        ${r.termo_arquivo?`<button onclick="abrirTermoEntrega('${encodeURIComponent(r.termo_arquivo)}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;margin-left:4px">📄 Termo</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function _invField(label,val){
  if(!val||val==='—') return '';
  return`<div style="display:flex;gap:.5rem;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--text2);min-width:180px;flex-shrink:0">${label}</span><span style="color:var(--text);font-weight:500">${val}</span></div>`;
}
function _fmtBRL(v){if(!v&&v!==0)return null;return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

async function baixarArquivoStoragePrivado(bucket,encodedPath){
  const path=decodeURIComponent(encodedPath||'');
  if(!bucket||!path) return;
  const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,60,{download:true});
  if(error||!data?.signedUrl){
    const msg='Não foi possível preparar o download do arquivo.'+(error?.message?(' '+error.message):'');
    if(window.toast) toast(msg,'error'); else alert(msg);
    return;
  }
  const link=document.createElement('a');
  link.href=data.signedUrl; link.rel='noopener'; link.style.display='none';
  document.body.appendChild(link); link.click(); link.remove();
}
function _invDocumentoAcoes(nfArquivo,termoArquivo){
  const botoes=[];
  if(nfArquivo) botoes.push(`<button type="button" class="btn-secondary" onclick="baixarArquivoStoragePrivado('notas-fiscais','${encodeURIComponent(nfArquivo)}')" style="font-size:12px;padding:6px 12px">⬇ Baixar nota fiscal</button>`);
  if(termoArquivo) botoes.push(`<button type="button" class="btn-secondary" onclick="baixarArquivoStoragePrivado('termos-entrega','${encodeURIComponent(termoArquivo)}')" style="font-size:12px;padding:6px 12px">⬇ Baixar termo de entrega</button>`);
  return botoes.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">${botoes.join('')}</div>`:'';
}

function _invTemValor(v){
  return v!==null&&v!==undefined&&String(v).trim()!==''&&String(v)!=='—';
}
function _invPrimeiro(...valores){
  return valores.find(_invTemValor);
}
function _invTexto(...valores){
  const valor=_invPrimeiro(...valores);
  return _invTemValor(valor)?_sanEsc(valor):null;
}
function _invData(...valores){
  const valor=_invPrimeiro(...valores);
  return _invTemValor(valor)?fmtDate(valor):null;
}
function _invDinheiro(...valores){
  const valor=_invPrimeiro(...valores);
  return _invTemValor(valor)?_fmtBRL(valor):null;
}
function _invDinheiroPositivo(...valores){
  const valor=valores.find(v=>_invTemValor(v)&&Number(v)>0);
  return valor!==undefined?_fmtBRL(valor):null;
}
function _invEmendaDoInventario(inv){
  if(!inv?.emenda_item_id||typeof allRows==='undefined') return null;
  const linhas=allRows||[];
  return linhas.find(x=>inv._unidadeFisica&&String(x._unidade_id||'')===String(inv.id))
    ||linhas.find(x=>String(x._base_id||x.id)===String(inv.emenda_item_id)&&!x._unidadeFisica)
    ||linhas.find(x=>String(x._base_id||x.id)===String(inv.emenda_item_id))
    ||null;
}
function _invInventarioDaEmenda(em){
  if(!em) return null;
  const linhas=inventarioRows||[];
  if(em._unidade_id){
    const unidade=linhas.find(x=>String(x.id)===String(em._unidade_id));
    if(unidade) return unidade;
  }
  const baseId=String(em._base_id||em.id);
  return linhas.find(x=>String(x.emenda_item_id||'')===baseId&&!x._unidadeFisica)
    ||linhas.find(x=>String(x.emenda_item_id||'')===baseId)
    ||null;
}
function _abrirDetalheItemUnificado(em,inv){
  if(!em&&!inv) return;
  const tipoInstrumento=inv?.tipo||'';
  const tipoCor=tipoInstrumento==='ATA'?'#A371F7':'#378ADD';
  const tipoHtml=tipoInstrumento
    ?`<span class="badge" style="background:${tipoCor}22;color:${tipoCor}">${_sanEsc(tipoInstrumento)}</span>`
    :null;
  const emendaNumero=_invPrimeiro(em?.emenda,inv?.emenda);
  const emendaAno=_invPrimeiro(em?.ano,inv?.emenda_ano);
  const emendaTipo=em?.tipo;
  const emendaHtml=emendaNumero
    ?`${_sanEsc(emendaNumero)}${emendaAno?`/${_sanEsc(emendaAno)}`:''}${emendaTipo?` · ${_sanEsc(emendaTipo)}`:''}`
    :null;
  const fornecedor=_invPrimeiro(inv?.empresa,em?.fornecedor_fluxo);
  const fornecedorHtml=fornecedor
    ?`${_sanEsc(fornecedor)}${inv?.cnpj?` <span style="color:var(--text3);font-size:11px">(CNPJ: ${_sanEsc(inv.cnpj)})</span>`:''}`
    :null;
  const quantidadePlanejada=_invPrimeiro(em?.qtde_cadastrada);
  const quantidadeExecutada=_invPrimeiro(em?.qtde,inv?.qtde);
  const campos=[
    ['Tipo do instrumento',tipoHtml],
    ['Item',_invTexto(em?.item,inv?.item,inv?.emenda_item_desc)],
    ['Item planejado',_invTexto(em?.item_cadastrado)],
    ['Marca',_invTexto(em?.marca,inv?.marca)],
    ['Modelo',_invTexto(em?.modelo,inv?.modelo)],
    ['Marca / Modelo',_invTexto(em?.marca_modelo,inv?.marca_modelo)],
    ['Emenda',emendaHtml],
    ['Parlamentar',_invTexto(em?.parlamentar,inv?.parlamentar)],
    ['Processo SEI da emenda',_invTexto(em?.sei_emenda)],
    ['Objeto da emenda',_invTexto(em?.objeto)],
    ['Valor cedido da emenda',_invDinheiro(em?.valor_cedido)],
    ['Unidade beneficiada',_invTexto(em?.unidade)],
    ['Quantidade planejada',_invTexto(quantidadePlanejada)],
    ['Quantidade executada / recebida',_invTexto(quantidadeExecutada)],
    ['Valor planejado do item',_invDinheiroPositivo(em?.vl_unitario_cadastrado)],
    ['Valor da licitação',_invDinheiroPositivo(inv?.valor_licitacao_unit,em?.valor_licitacao_detalhe_unit,em?.valor_licitacao_unit)],
    ['Valor executado',_invDinheiroPositivo(inv?.valor_executado_unit,em?.valor_contratado_unit,em?.vl_unitario)],
    ['Status da licitação',_invTexto(em?.status_licitacao)],
    ['Status completo',_invTexto(em?.status_raw)],
    ['Categoria do status',_invTexto(em?.status_cat)],
    ['CPL / Processo',_invTexto(em?.cpl,inv?.processo)],
    ['Tipo do processo',_invTexto(em?.processo_tipo)],
    ['Contrato / ATA',_invTexto(inv?.contrato,em?.contrato_sim)],
    ['Empresa / Fornecedor',fornecedorHtml],
    ['Empenho',_invTexto(em?.empenho,inv?.empenho)],
    ['Data de emissão do empenho',_invData(inv?.empenho_data)],
    ['Nota fiscal',_invTexto(em?.nota_fiscal,inv?.nota_fiscal)],
    ['Data da NF',_invData(inv?.nf_data)],
    ['Valor total da NF',_invDinheiro(inv?.nf_valor)],
    ['AF nº',_invTexto(inv?.af_numero)],
    ['Data da AF',_invData(inv?.af_data)],
    ['Patrimônio',_invTexto(inv?.patrimonio,em?.patrimonio)],
    ['Número de série',_invTexto(inv?.numero_serie)],
    ['Unidade de entrega',_invTexto(em?.unidade_entrega,inv?.unidade)],
    ['Data de recebimento (depósito)',_invData(inv?.data_recebimento)],
    ['Data de entrega na unidade',_invData(inv?.data_entrega_unidade,em?.data_entrega)],
    ['Recebido por',_invTexto(inv?.recebido_por)],
    ['Tipo de recebimento',_invTexto(inv?.recebimento_tipo)],
    ['Responsável na unidade',_invTexto(inv?.termo_responsavel)],
    ['Cargo do responsável',_invTexto(inv?.termo_cargo)],
    ['Ordem de pagamento',_invTexto(em?.ordem_pagamento)],
    ['Comprovante de pagamento',_invTexto(em?.comprovante_pagamento)],
    ['Observações',_invTexto(inv?.confirmacao_obs)]
  ].filter(([,v])=>_invTemValor(v));
  const itemTitulo=_invPrimeiro(em?.item,inv?.item,inv?.emenda_item_desc,'Item');
  const modal=document.getElementById('modal-inv-detalhe');
  document.body.appendChild(modal);
  document.getElementById('inv-detalhe-content').innerHTML=`
    <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">${_sanEsc(itemTitulo)}</div>
    ${!inv?'<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Item ainda não confirmado no Inventário — mostrando todas as informações já registradas na Emenda e no fluxo de contratação.</div>':''}
    <div>${campos.map(([l,v])=>_invField(l,v)).join('')}</div>
    ${_invDocumentoAcoes(inv?.nota_fiscal_arquivo,inv?.termo_arquivo)}`;
  modal.classList.add('active');
}

function abrirDetalheInv(idx){
  const inv=_invFiltered[idx];if(!inv)return;
  _abrirDetalheItemUnificado(_invEmendaDoInventario(inv),inv);
}
async function verInvDeEmendaItem(emendaItemId){
  if(!emendaItemId) return;
  if(!inventarioCarregado){ try{ await loadInventario(); }catch(_){} }
  const inv=(inventarioRows||[]).find(x=>String(x.emenda_item_id||'')===String(emendaItemId));
  if(!inv){ alert('Este item ainda não foi confirmado no inventário (entrega na unidade).'); return; }
  _abrirDetalheItemUnificado(_invEmendaDoInventario(inv),inv);
}
async function verTudoEmendaItem(id){
  const ref=String(id);
  const em=(allRows||[]).find(x=>String(x._unidade_row_id||'')===ref)
    ||(allRows||[]).find(x=>!x._unidadeFisica&&String(x.id)===ref)
    ||(allRows||[]).find(x=>String(x.id)===ref);
  if(!em){ alert('Item não encontrado.'); return; }
  if(!inventarioCarregado){
    try{ await loadInventario(); }
    catch(e){ console.warn('Inventário não carregado no detalhe da Emenda',e); }
  }
  _abrirDetalheItemUnificado(em,_invInventarioDaEmenda(em));
}
function abrirDetalheInvRow(inv){
  if(!inv)return;
  _abrirDetalheItemUnificado(_invEmendaDoInventario(inv),inv);
}
window.loadInventario=loadInventario;
window.filtrarInventario=filtrarInventario;
window.clearAllInv=clearAllInv;
window.abrirDetalheInv=abrirDetalheInv;
window.baixarArquivoStoragePrivado=baixarArquivoStoragePrivado;
