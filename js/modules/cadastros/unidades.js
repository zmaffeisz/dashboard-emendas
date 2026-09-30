// Cadastro corrente. Documentos e entregas usam suas próprias cópias históricas.
export function createUnidadesCadastro({ sb, esc, toast, podeEditar, invalidar }) {
  let unidades = [], pessoas = [], filtro = '', inativas = false;
  const el = id => document.getElementById(id);
  const pessoa = id => pessoas.find(p => String(p.id) === String(id));
  const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  async function abrir() {
    el('cad-hub').style.display = 'none';
    const wrap = el('cad-lista'); wrap.style.display = 'block';
    wrap.innerHTML = '<p>Carregando unidades e coordenadores...</p>';
    const [u, p] = await Promise.all([
      sb.from('unidades').select('*').order('nome'),
      sb.from('pessoas').select('id,nome,email,cargo,ativo').order('nome')
    ]);
    if (u.error || p.error) { wrap.innerHTML = `<p>${esc((u.error || p.error).message)}</p>`; return; }
    unidades = u.data || []; pessoas = p.data || [];
    wrap.innerHTML = `<div class="cad-unidades-toolbar"><button class="btn-secondary" onclick="carregarCadastros()">← Voltar</button><strong>Unidades e coordenadores</strong><button class="btn-primary" onclick="UnidadesCadastro.editar()">+ Nova unidade</button></div>
      <p class="cad-unidades-ajuda">Edite a unidade para trocar o coordenador ou atualizar endereço e contatos. Documentos e registros anteriores preservam os dados guardados na época.</p>
      <div class="cad-unidades-toolbar"><input id="cad-unidades-busca" aria-label="Buscar unidade ou coordenador" placeholder="Buscar unidade, coordenador ou endereço..." oninput="UnidadesCadastro.filtrar(this.value)"><label><input type="checkbox" id="cad-unidades-inativas" onchange="UnidadesCadastro.mostrarInativas(this.checked)"> Mostrar inativas</label></div>
      <div id="cad-unidades-editor"></div><div id="cad-unidades-resultados"></div>`;
    el('cad-unidades-busca').value = filtro; el('cad-unidades-inativas').checked = inativas;
    render();
  }
  function render() {
    const lista = unidades.filter(u => (inativas || u.ativo !== false) && normalizar([u.nome, u.endereco, u.email, pessoa(u.coordenador_id)?.nome].join(' ')).includes(normalizar(filtro)));
    el('cad-unidades-resultados').innerHTML = `<p>${lista.length} unidade(s)</p><div class="cad-unidades-grid">${lista.map(u => {
      const p = pessoa(u.coordenador_id);
      return `<article class="cad-unidade-card"><h3>${esc(u.nome)}${u.ativo === false ? ' (inativa)' : ''}</h3><dl><dt>Coordenador</dt><dd>${esc(p?.nome || 'Não informado')}</dd><dt>E-mail do coordenador</dt><dd>${esc(p?.email || '—')}</dd><dt>Endereço</dt><dd>${esc(u.endereco || '—')}</dd><dt>Telefone da unidade</dt><dd>${esc(u.telefone || '—')}</dd><dt>E-mail da unidade</dt><dd>${esc(u.email || '—')}</dd></dl><div class="cad-unidades-toolbar"><button class="btn-primary" onclick="UnidadesCadastro.editar(${u.id})">Editar unidade</button><button class="btn-secondary" onclick="UnidadesCadastro.historico(${u.id})">Histórico</button></div></article>`;
    }).join('')}</div>`;
  }
  function editar(id) {
    if (!podeEditar()) return;
    const u = unidades.find(u => String(u.id) === String(id)) || {};
    const opcoes = pessoas.filter(p => p.ativo !== false || String(p.id) === String(u.coordenador_id));
    el('cad-unidades-editor').innerHTML = `<form id="cad-unidade-form" class="cad-unidade-card" onsubmit="UnidadesCadastro.salvar(event)"><h3>${id ? 'Editar unidade' : 'Nova unidade'}</h3><input type="hidden" name="id" value="${u.id || ''}"><div class="cad-unidades-grid">
      ${[['nome','Nome','text',true],['endereco','Endereço','text'],['telefone','Telefone da unidade','tel'],['email','E-mail da unidade','email']].map(([c,l,t,req]) => `<label>${l}${req ? ' *' : ''}<input name="${c}" type="${t}" value="${esc(u[c] || '')}" ${req ? 'required' : ''}></label>`).join('')}
      <label>Coordenador<select name="coordenador_id"><option value="">Sem coordenador</option>${opcoes.map(p => `<option value="${p.id}" ${String(p.id) === String(u.coordenador_id) ? 'selected' : ''}>${esc(p.nome)}${p.email ? ' — ' + esc(p.email) : ''}${p.ativo === false ? ' (inativo)' : ''}</option>`).join('')}</select></label>
      <label><input name="ativo" type="checkbox" ${u.ativo !== false ? 'checked' : ''}> Unidade ativa</label></div><p class="cad-unidades-ajuda">Para uma pessoa nova, cadastre-a primeiro em Cadastros → Pessoas. Alterar o coordenador aqui não altera o responsável dos termos anteriores.</p><div class="cad-unidades-toolbar"><button class="btn-primary" type="submit">Salvar alterações</button><button class="btn-secondary" type="button" onclick="UnidadesCadastro.cancelar()">Cancelar</button><span id="cad-unidade-msg" role="status"></span></div></form>`;
    el('cad-unidades-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el('cad-unidade-form').elements.nome.focus();
  }
  async function salvar(event) {
    event.preventDefault(); if (!podeEditar()) return;
    const form = event.target, dados = new FormData(form), id = dados.get('id');
    const patch = { revisado: true, ativo: dados.has('ativo') };
    for (const c of ['nome','endereco','telefone','email']) patch[c] = String(dados.get(c) || '').trim() || null;
    if (!patch.nome) { el('cad-unidade-msg').textContent = 'Informe o nome da unidade.'; return; }
    patch.coordenador_id = dados.get('coordenador_id') ? Number(dados.get('coordenador_id')) : null;
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      const query = id ? sb.from('unidades').update(patch).eq('id', id) : sb.from('unidades').insert(patch);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Não foi possível salvar. Confira sua permissão.');
      invalidar(); toast('Unidade salva. Os registros anteriores foram preservados.', 'success');
      await abrir();
    } catch (e) { if (el('cad-unidade-msg')) el('cad-unidade-msg').textContent = e.message; }
    finally { btn.disabled = false; }
  }
  async function historico(id) {
    const alvo = el('cad-unidades-editor'); alvo.innerHTML = '<p>Carregando histórico...</p>';
    const { data, error } = await sb.from('unidades_historico').select('id,registrado_em,dados').eq('unidade_id', id).order('registrado_em', { ascending: false }).order('id', { ascending: false });
    if (error) { alvo.innerHTML = `<p>${esc(error.message)}</p>`; return; }
    alvo.innerHTML = `<section class="cad-unidade-card"><div class="cad-unidades-toolbar"><h3>Histórico da unidade</h3><button class="btn-secondary" onclick="UnidadesCadastro.cancelar()">Fechar</button></div><p class="cad-unidades-ajuda">Dados disponíveis desde a implantação deste histórico. A ficha anterior à importação também foi preservada.</p>${(data || []).map(h => `<article class="cad-unidade-versao"><strong>${esc(new Date(h.registrado_em).toLocaleString('pt-BR'))} — ${esc(h.dados.nome)}</strong><p>Coordenador: ${esc(h.dados.coordenador?.nome || 'Não informado')} · ${esc(h.dados.coordenador?.email || '—')}</p><p>Endereço: ${esc(h.dados.endereco || '—')}</p><p>Telefone: ${esc(h.dados.telefone || '—')} · E-mail da unidade: ${esc(h.dados.email || '—')}</p></article>`).join('') || '<p>Sem alterações registradas.</p>'}</section>`;
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return { abrir, editar, salvar, historico, cancelar() { el('cad-unidades-editor').innerHTML = ''; }, filtrar(v) { filtro = v; render(); }, mostrarInativas(v) { inativas = v; render(); } };
}
