import { chaveRecebimento, referenciasDoDestino, emailRequisicao, estadoRequisicao, emailJaEscrito } from './requisicao.model.js?v=20261001-1';
import { gerarPdfRequisicao } from './requisicao.pdf.js?v=20260930-1';

export function createRequisicaoWorkspace(adapter) {
  const { sb, esc, toast } = adapter;
  const bucket = 'requisicoes-materiais';
  let registros = [], erroCarga = '', estado = null, ocupado = false, versao = 0, versaoCarga = 0;
  const el = id => document.getElementById(id);
  const reqs = row => registros.filter(r => r.referencias.some(ref => chaveRecebimento(ref) === chaveRecebimento(row)));
  function conferir(res) { if (res.error) throw new Error(res.error.message); return res.data; }
  function aviso(erro) { toast(erro.message || String(erro), 'error'); }
  async function carregar() {
    const ticket = ++versaoCarga, novos = [];
    try {
      for (let offset = 0;; offset += 500) {
        const dados = conferir(await sb.from('requisicoes_materiais').select('*,requisicoes_materiais_emails(*)').order('gerado_em', { ascending: false }).range(offset, offset + 499)) || [];
        novos.push(...dados);
        if (dados.length < 500) break;
      }
      if (ticket === versaoCarga) { registros = novos; erroCarga = ''; }
    } catch (e) { if (ticket === versaoCarga) { registros = []; erroCarga = e.message; } }
  }
  function celula(row) {
    if (row.origem_recurso === 'carona') return '—';
    const key = encodeURIComponent(chaveRecebimento(row));
    const s = estadoRequisicao(reqs(row), row), pode = adapter.podeEditar(row);
    const trigger = (texto, extra = '') => `<button type="button" ${extra} aria-haspopup="menu" aria-expanded="false" aria-controls="req-menu" onclick="RequisicaoMateriais.menu('${key}',event)">${texto}</button>`;
    let acoes;
    if (erroCarga) acoes = `<button type="button" onclick="RequisicaoMateriais.historico('${key}')">Consultar requisição</button>`;
    else if (!s.prontos.length && !s.incompletos.length) acoes = pode ? `<button type="button" onclick="RequisicaoMateriais.abrir('${key}')">Gerar termo</button>` : '';
    else if (!s.prontos.length) acoes = trigger('Retomar requisição ▾');
    else if (s.enviado) acoes = trigger('Requisição ▾');
    else {
      const atual = s.atuais.length === 1 ? s.atuais[0] : null;
      const baixar = atual ? `RequisicaoMateriais.baixar('${atual.id}')` : `RequisicaoMateriais.menu('${key}',event,'baixar')`;
      const escrever = atual ? `RequisicaoMateriais.email('${atual.id}')` : `RequisicaoMateriais.menu('${key}',event,'email')`;
      const reescrever = s.atuais.some(doc => emailJaEscrito(doc, s.historico));
      acoes = `<div class="req-download"><button type="button" onclick="${baixar}">Baixar PDF</button>${trigger('▾', 'class="req-seta" aria-label="Mais opções da requisição" title="Refazer termo e consultar histórico"')}</div>${pode ? `<button type="button" class="req-escrever" onclick="${escrever}">${reescrever ? 'Reescrever e-mail' : 'Escrever e-mail'}</button>` : ''}`;
    }
    const novaIncompleta = s.prontos.length && s.incompletos.some(d => Date.parse(d.gerado_em) > Date.parse(s.prontos[0].gerado_em));
    return `<div class="req-celula"><span class="req-status ${s.enviado ? 'req-enviado' : ''}">${esc(erroCarga ? 'Histórico indisponível' : novaIncompleta ? 'Nova versão incompleta' : s.status)}</span><div class="req-acoes-linha">${acoes}</div></div>`;
  }
  let menuOrigem = null;
  function fecharMenu() {
    const popup = el('req-menu');
    if (popup?.matches(':popover-open')) popup.hidePopover();
    menuOrigem?.setAttribute('aria-expanded', 'false');
  }
  function menu(key, event, filtro = '') {
    if (ocupado) return;
    const origem = event.currentTarget;
    if (origem === menuOrigem && el('req-menu')?.matches(':popover-open')) { fecharMenu(); return; }
    fecharMenu();
    const row = adapter.rows().find(r => chaveRecebimento(r) === decodeURIComponent(key));
    if (!row) return;
    const s = estadoRequisicao(reqs(row), row), pode = adapter.podeEditar(row);
    let popup = el('req-menu');
    if (!popup) {
      popup = document.createElement('div'); popup.id = 'req-menu'; popup.className = 'req-menu';
      popup.setAttribute('popover', 'auto'); popup.setAttribute('role', 'menu');
      popup.setAttribute('aria-label', 'Opções da requisição'); document.body.appendChild(popup);
      popup.addEventListener('toggle', e => { if (e.newState === 'closed' && !popup.matches(':popover-open')) menuOrigem?.setAttribute('aria-expanded', 'false'); });
      popup.addEventListener('keydown', e => {
        const botoes = [...popup.querySelectorAll('button:not(:disabled)')];
        const index = botoes.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const proximo = e.key === 'Home' ? 0 : e.key === 'End' ? botoes.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + botoes.length) % botoes.length;
          botoes[proximo]?.focus();
        } else if (e.key === 'Escape') { fecharMenu(); menuOrigem?.focus(); }
      });
    }
    const botao = (texto, acao) => `<button type="button" role="menuitem" onclick="RequisicaoMateriais.fecharMenu();${acao}">${texto}</button>`;
    popup.innerHTML = s.atuais.map(doc => `<section>${s.atuais.length > 1 ? `<p class="req-menu-grupo">${esc(doc.unidade_snapshot.nome)} · ${esc(doc.dados_itens.reduce((n, i) => n + Number(i.qtde), 0))} bem(ns)</p>` : ''}${filtro !== 'email' ? botao('Baixar PDF', `RequisicaoMateriais.baixar('${doc.id}')`) : ''}${pode && filtro !== 'baixar' ? botao(emailJaEscrito(doc, s.historico) ? 'Reescrever e-mail' : 'Escrever e-mail', `RequisicaoMateriais.email('${doc.id}')`) : ''}${pode && !filtro ? botao('Refazer termo', `RequisicaoMateriais.refazer('${doc.id}')`) : ''}</section>`).join('')
      + (!filtro ? s.incompletos.filter(doc => doc.solicitante_id === adapter.usuario()?.id && pode).map(doc => botao('Retomar geração incompleta', `RequisicaoMateriais.retomar('${doc.id}')`)).join('')
        + `<div class="req-menu-historico">${botao('E-mails enviados', `RequisicaoMateriais.historico('${key}','emails')`)}${botao(s.prontos.length > s.atuais.length ? 'Termos anteriores' : 'Ver termo e detalhes', `RequisicaoMateriais.historico('${key}')`)}</div>` : '');
    menuOrigem = origem; origem.setAttribute('aria-expanded', 'true');
    popup.showPopover();
    const rect = origem.getBoundingClientRect(), tamanho = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.right - tamanho.width, window.innerWidth - tamanho.width - 8))}px`;
    popup.style.top = `${Math.max(8, rect.bottom + tamanho.height + 8 <= window.innerHeight ? rect.bottom + 5 : rect.top - tamanho.height - 5)}px`;
    popup.querySelector('button')?.focus();
  }
  function atualizarSelecao(rows) {
    const btn = el('conf-gerar-requisicao-selecionados'); if (!btn) return;
    btn.hidden = !rows.length;
    btn.disabled = rows.some(r => r.origem_recurso === 'carona');
    btn.textContent = `Gerar requisição dos selecionados (${rows.length})`;
    el('conf-requisicao-ajuda').hidden = !rows.length;
  }
  function modal() {
    fecharMenu();
    let dialog = el('req-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'req-dialog'; dialog.className = 'req-dialog';
      dialog.addEventListener('cancel', e => { e.preventDefault(); if (!ocupado) fechar(); });
      document.body.appendChild(dialog);
    }
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  function fechar() { if (ocupado) return; versao++; estado = null; el('req-dialog')?.close(); }
  async function refazer(id) {
    const doc = registros.find(r => r.id === id);
    if (!doc?.pdf_pronto || ocupado) return;
    await abrir(null, doc);
  }
  async function abrir(key, origemDoc = null) {
    if (ocupado) return;
    const rows = origemDoc ? origemDoc.referencias : key ? adapter.rows().filter(r => chaveRecebimento(r) === decodeURIComponent(key)) : adapter.selecionados();
    if (!rows.length || rows.some(r => !adapter.podeEditar(r))) return;
    const ticket = ++versao;
    modal().innerHTML = '<h2>Requisição de materiais</h2><p>Carregando recebimentos e unidades...</p><button type="button" onclick="RequisicaoMateriais.fechar()">Fechar</button>';
    try {
      const [itens, unidades] = await Promise.all([
        sb.rpc('preparar_requisicao_materiais', { p_itens: rows.map(r => ({ tipo: r.tipo, id: r.id })) }).then(conferir),
        sb.from('unidades').select('id,nome').eq('ativo', true).order('nome').then(conferir)
      ]);
      if (ticket !== versao) return;
      estado = { itens, unidades, origemDoc, ficha: null, preview: null, refs: null, escolhidos: new Set() };
      const conhecidos = [...new Set(itens.flatMap(i => i.unidades_fisicas?.some(f => f.unidade_id) ? i.unidades_fisicas.map(f => f.unidade_id).filter(Boolean) : [i.unidade_id].filter(Boolean)))];
      modal().innerHTML = `<header><h2>${origemDoc ? 'Refazer termo de requisição' : 'Requisição de materiais em reserva'}</h2><button type="button" aria-label="Fechar" onclick="RequisicaoMateriais.fechar()">×</button></header>
        ${origemDoc ? '<p class="req-versao-aviso">Esta será uma nova versão. O PDF e os e-mails anteriores permanecem disponíveis. Confira os dados atuais da unidade antes de gerar novamente.</p>' : ''}
        <p>Escolha o destino cadastrado. Se não identificar a unidade, cadastre-a em <b>Cadastros → Unidades</b>. Preencha também coordenador, endereço e telefone.</p>
        <label class="req-campo">Unidade de destino<select id="req-unidade" onchange="RequisicaoMateriais.destino()"><option value="">Selecione uma unidade cadastrada</option>${unidades.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select></label>
        <div id="req-bens"></div><div id="req-previa" aria-live="polite"></div>
        <label class="req-campo">Observações (opcional)<textarea id="req-obs" maxlength="3000" rows="2"></textarea></label>
        <label class="req-conferencia"><input id="req-conferido" type="checkbox"> Conferi se o coordenador, endereço e telefone continuam atualizados.</label>
        <p>O nome do solicitante será <b>${esc(adapter.perfil()?.nome || 'seu nome completo cadastrado')}</b>. Os dados conferidos e o PDF ficarão preservados neste termo.</p>
        <p id="req-msg" role="status"></p><footer><button type="button" onclick="RequisicaoMateriais.fechar()">Cancelar</button><button id="req-gerar" type="button" disabled onclick="RequisicaoMateriais.gerar()">Gerar e baixar PDF</button></footer>`;
      if (origemDoc) { el('req-unidade').value = origemDoc.unidade_id; el('req-obs').value = origemDoc.observacao || ''; el('req-gerar').textContent = 'Gerar nova versão e baixar PDF'; }
      else if (conhecidos.length === 1) el('req-unidade').value = conhecidos[0];
      await destino(!!origemDoc);
    } catch (e) { if (ticket !== versao) return; modal().innerHTML = `<h2>Requisição de materiais</h2><p>${esc(e.message)}</p><button onclick="RequisicaoMateriais.fechar()">Fechar</button>`; }
  }
  function renderBens() {
    const uid = el('req-unidade').value;
    el('req-bens').innerHTML = estado.itens.map(i => {
      const fisicas = i.unidades_fisicas || [];
      return `<section class="req-bens"><b>${esc(i.item)}</b> · ${esc(i.contrato || i.processo || '')}${!fisicas.length ? `<p>Quantidade: ${i.qtde} · Unidade vinculada: ${esc(i.unidade_nome || 'Não identificada')}</p>` : `<p>Selecione os bens deste recebimento para o destino acima. Bens de outra unidade ficam bloqueados.</p><div class="req-bens-lista">${fisicas.map((f, n) => {
        const destinoId = f.unidade_id || i.unidade_id;
        const bloqueado = !uid || (destinoId && String(destinoId) !== uid);
        return `<label><input type="checkbox" data-bem="${f.id}" ${bloqueado ? 'disabled' : ''} ${estado.escolhidos.has(f.id) ? 'checked' : ''} onchange="RequisicaoMateriais.bem(this.dataset.bem,this.checked)"> Patrimônio ${esc(f.patrimonio || `não informado (bem ${n + 1})`)} · ${esc(f.unidade_nome || (destinoId ? i.unidade_nome : 'Destino não identificado'))}</label>`;
      }).join('')}</div>`}</section>`;
    }).join('');
  }
  async function destino(preservar = false) {
    if (!estado || ocupado) return;
    const uid = el('req-unidade').value;
    estado.escolhidos.clear();
    estado.itens.forEach(i => (i.unidades_fisicas || []).forEach(f => {
      const id = f.unidade_id || i.unidade_id;
      if (preservar && estado.origemDoc) {
        const ref = estado.origemDoc.referencias.find(r => chaveRecebimento(r) === chaveRecebimento(i));
        const salvos = ref?.unidades_ids || estado.origemDoc.dados_itens.find(r => chaveRecebimento(r) === chaveRecebimento(i))?.unidades_fisicas?.map(r => r.id);
        if ((!salvos || salvos.includes(f.id)) && (!id || String(id) === uid)) estado.escolhidos.add(f.id);
        return;
      }
      // Bens sem destino precisam ser escolhidos explicitamente.
      if (id && String(id) === uid) estado.escolhidos.add(f.id);
    }));
    renderBens(); await previa();
  }
  async function bem(id, marcado) { if (ocupado) return; marcado ? estado.escolhidos.add(id) : estado.escolhidos.delete(id); await previa(); }
  async function previa() {
    const ticket = ++versao, s = estado;
    el('req-gerar').disabled = true; el('req-conferido').checked = false;
    s.ficha = null; s.preview = null; s.refs = null;
    const uid = el('req-unidade').value;
    if (!uid) { el('req-previa').textContent = 'Selecione a unidade de destino.'; return; }
    el('req-previa').textContent = 'Atualizando a prévia...';
    try {
      const refs = referenciasDoDestino(s.itens, uid, s.escolhidos);
      const [ficha, itens] = await Promise.all([
        sb.rpc('ficha_unidade_requisicao', { p_id: Number(uid) }).then(conferir),
        sb.rpc('preparar_requisicao_materiais', { p_itens: refs }).then(conferir)
      ]);
      if (ticket !== versao || estado !== s) return;
      if (!ficha) throw new Error('Selecione uma unidade ativa cadastrada.');
      if (itens.some(i => i.unidade_id && String(i.unidade_id) !== uid || i.destinos_multiplos)) throw new Error('Selecione apenas bens destinados à mesma unidade.');
      if (itens.length > 1 && itens.some(i => !i.unidade_id)) throw new Error('Há destinos não identificados. Gere o termo desses registros individualmente, identificando sua unidade.');
      s.ficha = ficha; s.preview = itens; s.refs = refs;
      const completo = ficha.coordenador?.nome && ficha.endereco && ficha.telefone;
      el('req-previa').innerHTML = `<section class="req-resumo"><h3>Confira o destino da entrega</h3><dl>${[['Unidade', ficha.nome], ['Coordenador', ficha.coordenador?.nome], ['Endereço', ficha.endereco], ['Telefone', ficha.telefone], ['E-mail', ficha.email || ficha.coordenador?.email]].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v || 'Não cadastrado')}</dd>`).join('')}</dl><p><b>Confira se permanece o mesmo coordenador antes de gerar.</b></p></section><table><thead><tr><th>Qtde</th><th>Material</th><th>Patrimônios</th></tr></thead><tbody>${itens.map(i => `<tr><td>${i.qtde}</td><td>${esc(i.item)}</td><td>${esc((i.patrimonios || []).map(p => p || 'Não informado').join('; ') || 'Não informado')}</td></tr>`).join('')}</tbody></table>${completo ? '' : '<p class="req-erro">Complete coordenador, endereço e telefone em Cadastros → Unidades antes de gerar.</p>'}`;
      el('req-gerar').disabled = !completo;
      el('req-msg').textContent = '';
    } catch (e) { if (ticket === versao) el('req-previa').textContent = e.message; }
  }
  async function pdf(doc) {
    await adapter.ensureLib('pdfLib');
    const resposta = await fetch(new URL('../../../assets/templates/requisicao-materiais.pdf', import.meta.url));
    if (!resposta.ok) throw new Error('Não foi possível carregar o modelo do termo.');
    return gerarPdfRequisicao(doc, globalThis.PDFLib, await resposta.arrayBuffer());
  }
  function download(blob, doc) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `Requisicao - ${doc.unidade_snapshot.nome.replace(/[^\p{L}\p{N} ._-]/gu, '')} - ${doc.id.slice(0, 8)}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function finalizar(doc) {
    let blob;
    const existente = await sb.storage.from(bucket).download(doc.pdf_path);
    if (!existente.error) blob = existente.data;
    else {
      blob = new Blob([await pdf(doc)], { type: 'application/pdf' });
      conferir(await sb.storage.from(bucket).upload(doc.pdf_path, blob, { contentType: 'application/pdf', upsert: false }));
    }
    conferir(await sb.from('requisicoes_materiais').update({ pdf_pronto: true }).eq('id', doc.id).select('id').single());
    await carregar(); adapter.render(); download(blob, doc);
  }
  function travar(valor) {
    ocupado = valor;
    el('req-dialog')?.querySelectorAll('button,input,select,textarea').forEach(e => { e.disabled = valor; });
  }
  async function gerar() {
    if (ocupado || !estado?.preview) return;
    if (!el('req-conferido').checked) { el('req-msg').textContent = 'Marque a conferência do coordenador e dos contatos.'; return; }
    const refeito = !!estado.origemDoc;
    // Carrega a biblioteca antes de reservar o registro, reduzindo gerações incompletas.
    travar(true); el('req-msg').textContent = 'Gerando e guardando o termo...';
    try {
      await adapter.ensureLib('pdfLib');
      const doc = conferir(await sb.from('requisicoes_materiais').insert({
        unidade_id: Number(el('req-unidade').value), unidade_snapshot: estado.ficha,
        referencias: estado.refs, dados_itens: estado.preview, coordenador_conferido: true,
        observacao: el('req-obs').value.trim()
      }).select('*').single());
      estado = null; await finalizar(doc); travar(false); fechar();
      toast(refeito ? 'Nova versão salva. O termo anterior foi preservado; prepare o e-mail desta versão.' : 'Termo gerado e salvo. O PDF pode ser baixado novamente a qualquer momento.', 'success');
    } catch (e) {
      travar(false); el('req-msg').textContent = e.message + ' Abra as opções da requisição para retomar uma geração incompleta.';
      await carregar(); adapter.render();
      // Uma reserva que falhou após o INSERT só pode ser retomada, nunca duplicada pelo mesmo botão.
      if (!estado) el('req-gerar').disabled = true;
    }
  }
  async function baixar(id) {
    const doc = registros.find(r => r.id === id); if (!doc?.pdf_pronto) return;
    try { download(conferir(await sb.storage.from(bucket).download(doc.pdf_path)), doc); } catch (e) { aviso(e); }
  }
  async function retomar(id) {
    const doc = registros.find(r => r.id === id); if (!doc || doc.pdf_pronto || ocupado) return;
    travar(true);
    try { await finalizar(doc); toast('Termo salvo e disponível para download.', 'success'); travar(false); await historico(encodeURIComponent(chaveRecebimento(doc.referencias[0]))); }
    catch (e) { aviso(e); } finally { travar(false); }
  }
  async function email(id) {
    if (ocupado) return;
    const doc = registros.find(r => r.id === id); if (!doc?.pdf_pronto) return;
    const conteudo = emailRequisicao(doc);
    travar(true);
    try {
      conferir(await sb.from('requisicoes_materiais_emails').insert({ requisicao_id: id, ...conteudo }).select('id').single());
      await carregar(); adapter.render();
      adapter.abrirEmail(`mailto:?subject=${encodeURIComponent(conteudo.titulo)}&body=${encodeURIComponent(conteudo.corpo)}`);
      toast('Marcado como enviado ao almoxarifado. Anexe o PDF ao e-mail.', 'success');
      if (el('req-dialog')?.open) { travar(false); await historico(encodeURIComponent(chaveRecebimento(doc.referencias[0])), 'emails'); }
    } catch (e) { aviso(e); } finally { travar(false); }
  }
  async function historico(key, aba = 'termos') {
    if (ocupado) return;
    const ticket = ++versao;
    modal().innerHTML = '<p>Carregando requisição...</p>';
    await carregar();
    if (ticket !== versao) return;
    const row = adapter.rows().find(r => chaveRecebimento(r) === decodeURIComponent(key));
    if (!row) { fechar(); return; }
    const s = estadoRequisicao(reqs(row), row), atuais = new Set(s.atuais.map(d => d.id));
    const emails = aba === 'emails';
    const docs = emails ? s.historico.filter(d => d.requisicoes_materiais_emails?.length) : s.historico;
    modal().innerHTML = `<header><h2>${emails ? 'E-mails enviados' : 'Termos gerados'} — ${esc(row.item)}</h2><button onclick="RequisicaoMateriais.fechar()">Fechar</button></header>
      <nav class="req-abas" aria-label="Histórico da requisição"><button aria-pressed="${!emails}" onclick="RequisicaoMateriais.historico('${key}','termos')">Termos gerados</button><button aria-pressed="${emails}" onclick="RequisicaoMateriais.historico('${key}','emails')">E-mails enviados</button></nav>
      ${erroCarga ? `<p class="req-erro">${esc(erroCarga)}</p>` : ''}
      ${emails ? '<p>O registro de envio corresponde ao clique em Escrever ou Reescrever e-mail.</p>' : ''}
      ${docs.map(doc => `<article class="req-resumo"><h3>${esc(doc.unidade_snapshot.nome)} <span class="req-versao">${!doc.pdf_pronto ? 'Geração incompleta' : atuais.has(doc.id) ? 'Termo atual' : 'Termo anterior'}</span></h3>
        <p>Gerado em ${esc(new Date(doc.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} por ${esc(doc.solicitante_nome)}</p>
        <p>${esc(doc.unidade_snapshot.coordenador?.nome)} · ${esc(doc.unidade_snapshot.endereco)} · ${esc(doc.unidade_snapshot.telefone)}</p>
        ${doc.dados_itens.map(i => `<p>${i.qtde} × ${esc(i.item)} · Patrimônios: ${esc((i.patrimonios || []).map(p => p || 'Não informado').join('; ') || 'Não informado')}</p>`).join('')}
        <div class="req-acoes">${doc.pdf_pronto ? `<button onclick="RequisicaoMateriais.baixar('${doc.id}')">Baixar PDF salvo</button>${adapter.podeEditar(row) ? `<button onclick="RequisicaoMateriais.refazer('${doc.id}')">Refazer termo</button><button onclick="RequisicaoMateriais.email('${doc.id}')">${emailJaEscrito(doc, s.historico) ? 'Reescrever e-mail' : 'Escrever e-mail'}</button>` : ''}` : `${adapter.usuario()?.id === doc.solicitante_id && adapter.podeEditar(row) ? `<button onclick="RequisicaoMateriais.retomar('${doc.id}')">Retomar geração</button>` : ''}`}</div>
        ${!emails ? `<p>${doc.requisicoes_materiais_emails?.length ? 'E-mail desta versão registrado no histórico.' : 'E-mail desta versão ainda não escrito.'}</p>` : ''}
        ${emails ? [...doc.requisicoes_materiais_emails].sort((a, b) => b.clicado_em.localeCompare(a.clicado_em)).map(e => `<section class="req-email"><p>${esc(new Date(e.clicado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} · ${esc(e.clicado_por_nome)}</p><p class="req-titulo">${esc(e.titulo)}</p><button onclick="RequisicaoMateriais.copiar('${e.id}','titulo')">Copiar título para pesquisar</button><button onclick="RequisicaoMateriais.copiar('${e.id}','corpo')">Copiar corpo do e-mail</button><details><summary>Ver texto do e-mail</summary><pre>${esc(e.corpo)}</pre></details></section>`).join('') : ''}
      </article>`).join('') || `<p>${emails ? 'Nenhum e-mail enviado para este recebimento.' : 'Nenhum termo gerado para este recebimento.'}</p>`}`;
  }
  async function copiar(id, campo) {
    const email = registros.flatMap(r => r.requisicoes_materiais_emails || []).find(e => e.id === id);
    if (!email) return;
    try { await navigator.clipboard.writeText(email[campo]); toast('Copiado.', 'success'); } catch (e) { aviso(new Error('Não foi possível copiar. Selecione o texto exibido e copie.')); }
  }
  return { carregar, celula, atualizarSelecao, abrir, refazer, fechar, destino, bem, gerar, baixar, retomar, email, historico, copiar, menu, fecharMenu };
}
