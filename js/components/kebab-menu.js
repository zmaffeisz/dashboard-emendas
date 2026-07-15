// ═══ MENU "⋮" (KEBAB) REUTILIZÁVEL — ações de linha de tabela ═══
// Uso: kebabMenuHtml([{label:'Prorrogar', onclick:"renovarAta('123')", title:'...'}, {label:'Encerrar', onclick:"...", danger:true, divider:true}])
// Cada item chama exatamente o mesmo onclick que os botões antigos já chamavam —
// isto só reorganiza a apresentação (1 ação primária visível + resto no menu).
function kebabMenuHtml(items){
  items=(items||[]).filter(Boolean);
  if(!items.length)return '';
  const opts=items.map(function(it){
    const cls='kebab-item'+(it.danger?' kebab-item-danger':'')+(it.divider?' kebab-item-divider':'');
    const title=it.title?' title="'+String(it.title).replace(/"/g,'&quot;')+'"':'';
    return '<button type="button" class="'+cls+'" onclick="closeAllKebabMenus();'+it.onclick+'"'+title+'>'+it.label+'</button>';
  }).join('');
  return '<span class="kebab-wrap">'
    +'<button type="button" class="kebab-trigger" onclick="toggleKebabMenu(event,this)" aria-label="Mais ações" aria-haspopup="true">⋮</button>'
    +'<div class="kebab-menu">'+opts+'</div>'
    +'</span>';
}
function toggleKebabMenu(ev,btn){
  ev.stopPropagation();
  const wrap=btn.closest('.kebab-wrap');
  const menu=wrap&&wrap.querySelector('.kebab-menu');
  if(!menu)return;
  const wasOpen=menu.classList.contains('open');
  closeAllKebabMenus();
  if(!wasOpen){
    menu.classList.add('open');
    // Menus dentro de table-wrap não podem ficar presos ao overflow da tabela.
    const rect=btn.getBoundingClientRect();
    const width=menu.offsetWidth;
    const left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8));
    const below=rect.bottom+4;
    const top=below+menu.offsetHeight<=window.innerHeight-8
      ? below
      : Math.max(8,rect.top-menu.offsetHeight-4);
    menu.style.position='fixed';
    menu.style.left=left+'px';
    menu.style.top=top+'px';
    menu.style.right='auto';
  }
}
function closeAllKebabMenus(){
  document.querySelectorAll('.kebab-menu.open').forEach(function(m){
    m.classList.remove('open');
    m.style.position='';
    m.style.left='';
    m.style.top='';
    m.style.right='';
  });
}
document.addEventListener('click',closeAllKebabMenus);
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAllKebabMenus();});
