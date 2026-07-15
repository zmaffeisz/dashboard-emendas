# Design System — SUEQ (dashboard-emendas)

Guia de referência visual do app. **Qualquer criação/edição de HTML ou CSS neste
projeto deve seguir estas regras.** Objetivo: um painel premium, limpo, institucional
(azul de Sorocaba) e visualmente consistente — sem reinventar componente a cada tela
nova. Se o componente que você precisa já existe aqui, reutilize-o; só crie um novo se
nenhum dos existentes servir, e documente-o aqui quando criar.

Fonte da verdade do CSS: [`styles.css`](../styles.css) (tokens + componentes
compartilhados por `index.html`/`login.html`/`cadastro.html`/`chamado.html`) e
[`dashboard.css`](../dashboard.css) (layout/sidebar/tabelas/painéis exclusivos do
`index.html`). `chamado.css` é exclusivo do formulário público. `css/print-*.css` são
folhas auto-contidas para documentos impressos/PDF — **não** compartilham classes com o
app e ficam fora deste design system.

## ⚠️ Regra de segurança nº 1 para comentários CSS

**Nunca escreva `*/` dentro do texto de um comentário CSS**, nem como separador entre
duas palavras (ex.: `abrirModal*/fecharModal`). A sequência `*/` sempre fecha o
comentário onde quer que apareça — o resto vira CSS "solto" e inválido, e o navegador
descarta silenciosamente a próxima regra real para tentar se recuperar do erro (sem
erro no console, sem quebrar o `node --check`, só quebra visualmente). Isso já aconteceu
uma vez neste projeto e derrubou a regra `.modal-overlay{display:none}`, fazendo todos
os modais aparecerem abertos ao mesmo tempo na tela. Se precisar mencionar
`funcaoA()`/`funcaoB()` num comentário, use "e"/"ou" por extenso, nunca `*/` como
separador. Depois de editar qualquer CSS, é boa prática rodar:

```bash
node -e "const fs=require('fs');for(const f of ['styles.css','dashboard.css','chamado.css']){const s=fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');const o=(s.match(/\{/g)||[]).length,c=(s.match(/\}/g)||[]).length;console.log(f,o===c?'OK':'MISMATCH '+o+'/'+c)}"
```

## Princípios gerais

- **Nunca renomear um `id`/classe que o JS já usa** (`getElementById`, `querySelector`,
  `onclick`, `onchange`). Antes de renomear qualquer coisa, `grep` no JS. Prefira
  **adicionar** classes novas ao lado das existentes.
- **Reaproveitar os tokens e componentes abaixo em vez de escrever cor/espaçamento/raio
  soltos.** Nada de `#1a5fa8` hardcoded num componente novo — use `var(--blue)` ou
  `var(--primary)`. Nada de `padding:13px` arbitrário — use a escala de espaçamento.
- **Tema dark é o padrão** (`js/theme.js`, `localStorage['tema']`, atributo
  `data-theme` no `<html>`). Todo componente novo tem que funcionar nos dois temas só
  com `var(--token)` — nunca hardcode uma cor que só funciona no claro ou só no escuro.
- **Sem framework/build.** HTML/CSS/JS vanilla apenas. Ícones: SVG inline (sem CDN de
  ícone, sem emoji novo em ação/nav — ver seção Ícones). Fonte: Inter via Google Fonts,
  já carregada nas 4 páginas.
- Scripts de `js/legacy/` são clássicos (não-módulo) e compartilham escopo global de
  propósito — não converter para `type="module"`. Componentes novos e reutilizáveis vão
  em `js/components/` (ver `js/components/kebab-menu.js` como exemplo).

## Tokens (`styles.css` `:root` / `html[data-theme="dark"]`)

### Cor
| Token | Uso |
|---|---|
| `--bg`, `--surface`, `--surface2`, `--border` | fundo de página, cards, elementos elevados/hover, bordas |
| `--text`, `--text2`, `--text3` | texto principal, secundário, muted |
| `--green`/`-bg`/`-text`, `--blue`/`-bg`/`-text`, `--amber`/`-bg`/`-text`, `--red`/`-bg`/`-text`, `--purple`/`-bg`/`-text` | semânticas: sólida / soft (fundo translúcido) / texto-sobre-soft |
| `--neutral`/`-bg`/`-text` | tags neutras ("Indefinido", "Não classificado") |
| `--primary`, `--primary-text`, `--primary-soft` | alias de `--blue*` para código novo (azul institucional = `--blue` = `--sorocaba-azul`) |
| `--info`, `--info-text`, `--info-soft` | alias de `--blue*`, usar em blocos informativos |
| `--sorocaba-verde`, `--sorocaba-azul`, `--sorocaba-ouro` | identidade visual da Prefeitura |
| `--shadow`, `--shadow-sm`, `--shadow-lg` | sombras leve/card e pesada/modal |

**Regra de equilíbrio de cor**: cor sólida saturada só em ação primária e status
crítico. Todo o resto usa a versão `-bg`/`-text` (soft). Nunca hardcode um hex de cor
num componente novo — sempre um destes tokens.

### Espaçamento e tipografia
```
--space-1:4px  --space-2:8px  --space-3:12px  --space-4:16px  --space-6:24px  --space-8:32px  --space-12:48px
--text-xs:11px  --text-sm:12.5px  --text-base:14px  --text-lg:16px  --text-xl:20px  --text-2xl:28px
```
CSS novo deve usar só esses valores (não `13px`, `15px`, `18px` soltos).

### Raio e sombra
```
--radius-sm:6px   /* inputs, botões, badges pequenos */
--radius:10px     /* cards, KPIs */
--radius-lg:14px  /* modais */
```

### Números
Toda coluna/valor numérico deve ter `font-variant-numeric: tabular-nums`. Já aplicado
via `.metric-value, .ficha-field-value, .scnt, .bar-val, td.num, th.num, .tabular-nums`
— adicione a classe `.tabular-nums` (ou `td.num`) a colunas numéricas novas.

## Componentes

### Botões
| Classe | Uso |
|---|---|
| `.btn-primary` | ação principal (Salvar, Confirmar, Novo processo). Uma por contexto. |
| `.btn-secondary` | ação neutra/cancelar |
| `.btn-ghost` | ação discreta sem borda (dentro de tabela/menu) |
| `.btn-danger` | destrutiva (Encerrar/Excluir) — outline vermelho por padrão; some `.btn-solid` só na confirmação final |
| `.btn-compact` | modificador — 28px de altura, para ações em linha de tabela (combine com `.btn-secondary`/`.btn-ghost`/`.btn-danger`) |
| `.btn-icon` | botão só-ícone (fechar modal etc.), 32×32px |

Todos têm 36px de altura por padrão (exceto `.btn-compact`), `--radius-sm`, e
transições de 150ms. **Nunca escrever um botão novo com `style="padding:...;border..."`
solto** — use uma destas classes.

### Badges / status pill
Uma classe só para todo status do sistema — pill com fundo soft + texto na cor +
borda 1px translúcida:
```html
<span class="badge badge-success">VIGENTE</span>
```
Modificadores: `.badge-success` (verde), `.badge-warning` (âmbar), `.badge-danger`
(vermelho), `.badge-info`/`.badge-primary` (azul), `.badge-purple`, `.badge-neutral`
(cinza). Mapeamento de status → cor:
- `VIGENTE`, `Entregue`, `Conforme`, `virou contrato`, `no prazo`, `Concluído` → success
- `Pendente`, `aguardando AF`, `Aguardando abertura`, `X pend.`, `em análise` → warning
- `Não fiscalizado`, `atrasado`, `Aplicada`, `venceu` → danger
- `ATA`, `Aquisição`, tags de tipo/origem → info/primary
- `Indefinido`, `Não classificado`, `Nao Informada` → neutral

Muitas tabelas ainda geram a cor do badge dinamicamente via função JS (`statusBadge`,
`tipoBadge`, `_itemStatusBadge` etc., que retornam `style="background:${cor}22;..."`
inline) — isso é aceitável e já herda a base `.badge` (pill/raio/peso de fonte); só
migre para as classes `.badge-*` fixas quando o status for um enum fechado, não uma cor
calculada dinamicamente.

### Cards / KPIs (`.metrics`)
```html
<div class="metrics">
  <div class="metric metric-success">
    <div class="metric-label">Vigentes</div>
    <div class="metric-value" style="color:var(--green)">42</div>
    <div class="metric-sub">em vigor</div>
  </div>
</div>
```
- `.metric` já tem barra de acento azul (`--sorocaba-azul`) por padrão. Modificadores
  `.metric-success/-warning/-danger/-neutral` trocam a cor da barra — aplique quando o
  KPI representa um estado (positivo/atenção/crítico), senão deixe o padrão azul.
- Painel com muitos KPIs (9+, ex. Contratos): separe em `.metrics` (4-5 principais) +
  `.metrics-secondary` (resto, mais compacto) — não empilhe tudo numa linha só.
- Grid é `auto-fit` — quebra sozinho em telas menores, não precisa de breakpoint
  manual salvo casos extremos.

### Filtros (`.filters`/`.fg`)
```html
<div class="filters">
  <div class="fg">
    <div class="fg-label">Buscar <button onclick="clearF('id')">✕</button></div>
    <input type="text" id="...">
  </div>
  <button class="clear-btn">✕ Limpar</button>
</div>
```
Mesma barra em todas as abas: card `--filters-bg`, campos em `.fg`, botão "✕" ao lado
do label para limpar um campo, `.clear-btn` no fim da barra para limpar tudo.

### Tabelas
- Wrapper: `.table-card` > `.table-hdr` (título + contagem) > `.table-wrap` > `<table>`.
- Cabeçalho ordenável/filtrável: **use `.th-sortable-wrap` (span externo) +
  `.th-sort-label` (span do texto clicável, `onclick="sortX(...)"`) +
  `.hdr-filter-btn`** (botão ▾ de filtro) — não repita
  `style="display:inline-flex;align-items:center;gap:6px"` /
  `style="cursor:pointer;user-select:none"` inline, o padrão já existe:
  ```html
  <th><span class="th-sortable-wrap">
    <span class="th-sort-label" onclick="sortX('campo')">Rótulo <span id="sort-..."></span></span>
    <span class="hdr-filter-btn" onclick="openXFilter(event,'campo')" title="Filtrar">▾</span>
  </span></th>
  ```
- Linhas: zebra + hover já vêm de `table/th/td` genéricos em `dashboard.css` — não
  redefina em CSS por aba salvo necessidade real (ex.: `table-layout:fixed` em tabelas
  dentro de modal).
- Números/valores alinhados à direita (`text-align:right`), datas/texto à esquerda,
  coluna de ações por último.
- **Estado vazio de tabela principal**: usar `.table-empty` (ícone + texto), não deixar
  `<tbody>` genuinamente vazio nem uma mensagem sem ícone:
  ```html
  <tr><td colspan="N"><div class="table-empty">
    <svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>
    Nenhum item encontrado
  </div></td></tr>
  ```
  (Não aplicar esse tratamento em listas pequenas dentro de modal/dropdown — ali um
  texto simples `color:var(--text3)` continua correto, o ícone grande fica
  desproporcional.)
- **Ações em linha com 3+ botões**: 1 ação primária visível (`.btn-secondary
  .btn-compact`) + o resto num menu kebab (ver abaixo). Com 1-2 ações, não force o
  kebab — botões diretos (`.btn-secondary`/`.btn-ghost`/`.btn-danger` + `.btn-compact`)
  já bastam.

### Menu "⋮" (kebab) — `js/components/kebab-menu.js`
```js
kebabMenuHtml([
  {label:'🔄 Prorrogar', onclick:"renovarAta('123')", title:'...'},
  {label:'⛔ Encerrar', onclick:"encerrarContrato('123')", danger:true, divider:true}
])
```
Retorna o HTML de um botão "⋮" + dropdown. `danger:true` pinta o item de vermelho,
`divider:true` desenha uma borda acima (use no último item destrutivo). O `onclick` de
cada item deve ser **a mesma chamada de função que o botão antigo já fazia** — o kebab
só reorganiza apresentação, nunca deve introduzir lógica nova. Fecha sozinho ao clicar
fora ou por ESC (listener global já registrado no próprio arquivo, não precisa repetir).

### Modais
Estrutura (não mudar, só reaproveitar):
```html
<div class="modal-overlay" id="modal-x">
  <div class="modal-box" style="width:640px"> <!-- ou 440/860/1100px conforme conteúdo -->
    <div class="modal-title">Título<button class="modal-title-close" onclick="fecharModalX()">✕</button></div>
    <div class="form-grid">...</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="fecharModalX()">Cancelar</button>
      <button class="btn-primary" onclick="salvarX()">Salvar</button>
    </div>
  </div>
</div>
```
- `.modal-overlay` é `display:none` por padrão, `.active` mostra (`display:flex`,
  centralizado, backdrop com blur). **Nunca** colocar `style="display:..."` inline
  nesse elemento — a classe `.active` é a única forma de abrir/fechar.
- `.modal-title` já funciona como header (borda inferior); `.modal-actions` já
  funciona como footer (borda superior, botões à direita, ordem
  `[Cancelar] [Ação primária]` ou `[Cancelar] [Encerrar danger]`).
- Fecha sozinho com ESC/clique-no-backdrop (listener genérico global em
  `js/legacy/00-core.js`, só remove a classe `active` — se o modal tem
  `fecharModalX()` próprio com lógica de reset de campo, continue chamando-o
  explicitamente nos botões, o genérico é só rede de segurança).
- Em mobile (`<768px`) todo modal vira bottom-sheet full-width automaticamente — não
  precisa de CSS por modal.

### Sidebar / Header
- Ícone de nav: `<span class="sidebar-icon"><svg viewBox="0 0 24 24">...</svg></span>`,
  monocromático (`stroke` herda de `.sidebar-icon svg`, sem `fill`, `stroke-width:1.8`).
  **Não usar emoji novo em item de sidebar** — desenhar/usar um SVG outline simples no
  mesmo estilo dos existentes (ver os 16 ícones já em `index.html`).
  Item ativo ganha barra lateral + fundo `--primary-soft` automaticamente via
  `.sidebar-item.active` — não estilizar manualmente.
- Header: botões de ação usam `.refresh-btn` (ghost translúcido sobre o azul do
  header). Toggle de tema é `#tema-btn` com dois `<svg class="icon-sun">`/`<svg
  class="icon-moon">` internos — a visibilidade certa é decidida por CSS
  (`html[data-theme=...] #tema-btn .icon-*`), **não** por JS reescrevendo o conteúdo do
  botão (isso já causou um bug: se você adicionar HTML dentro de um botão cujo JS ainda
  faz `btn.textContent = ...`, o JS apaga o SVG a cada toggle — remova esse tipo de
  linha de JS se for adicionar ícone assim).

### Sub-abas internas (não usar pílula)
Para navegação secundária dentro de uma aba (ex. "Controle de Entregas/Prazos" vs
"Confirmação"), use `.itens-subtab-btn` (estilo underline: transparente, texto muted,
ativo com `color:var(--primary)` + borda inferior 2px) — **não** um botão pílula
colorido tipo `.sheet-toggle-btn`/`.search-type-btn` (esses dois continuam existindo
para os casos que já usavam, mas são toggle/filtro de modo, não navegação por aba).

### Accordion
Chevron `▶` com `class="chevron"` (ou `chevron open` quando expandido) — gira 90°
via CSS, não inline `style="transform:rotate(...)"`. Mesmo padrão em `.ata-exec-chevron`
(Atas) e `.chevron` (genérico, usado em Licitações).

## Ícones

SVG inline, `viewBox="0 0 24 24"`, sem `fill`/`stroke` fixo no `<path>` (herdam do
`<svg>` pai via CSS, para funcionar nos dois temas). Sem Lucide/CDN — copie o padrão
dos SVGs já usados na sidebar (`index.html`, seção `<aside class="sidebar">`) para
manter o mesmo estilo de traço. Emoji continua aceitável dentro de **texto de label**
(ex. `"📅 Prazo"`, itens de kebab-menu) onde já era usado antes do redesign — o que não
se deve fazer é introduzir emoji novo como ícone de **navegação estrutural**
(sidebar, tabs).

## Responsivo

Breakpoints em uso: `1280px`→`1024px`→`768px`→`480px`.
- `min-width:769px`: sidebar colapsada (58px) por padrão, expande no hover (220px).
- `max-width:1024px` (tablet paisagem): KPIs/`.metrics-secondary` com colunas menores.
- `max-width:768px`: sidebar vira drawer (`body.sidebar-open`), hamburger aparece,
  filtros empilham, KPIs em 2 colunas, modais viram bottom-sheet full-width.
- `max-width:480px`: KPIs em 1 coluna, modal com padding reduzido.

## Antes de commitar uma mudança visual

1. `node --check arquivo.js` em todo `.js` tocado.
2. Rodar o snippet de balanceamento de chaves CSS (seção "Regra de segurança" acima).
3. Subir `python -m http.server 8765` e abrir no navegador — clicar em pelo menos um
   modal e uma aba tocados, checar console sem erro. `node --check`/grep não pegam bug
   de CSS que quebra em runtime.
