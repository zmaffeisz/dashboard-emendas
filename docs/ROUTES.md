# Rotas e Navegação — dashboard-emendas

> O sistema é servido como arquivos estáticos. "Rotas" são (a) páginas HTML e
> (b) abas internas do SPA `index.html`, ativadas por `showTab(name)` sem mudar a URL.

## 1. Páginas (URLs)

| URL | Arquivo | Acesso | Descrição |
|---|---|---|---|
| `/login.html` | `login.html` | Público | Login (Supabase Auth). Sessão ativa → redireciona a `index.html`. |
| `/cadastro.html` | `cadastro.html` | Público | Auto-cadastro. Cria `profiles` com `papel=visualizador`. |
| `/index.html` | `index.html` | Autenticado | Aplicação principal (abas via `showTab`). |
| `/chamado.html` | `chamado.html` | **Público** | Abertura de chamado via RPC `abrir_chamado_publico` (sem login). |

> **Nota de acesso:** `index.html` não força redirecionamento server-side (é estático).
> O controle real é via sessão Supabase + RLS. Sem sessão, o usuário vê apenas a aba
> Emendas (dashboard), conforme regra do cliente. Ver [SECURITY.md](SECURITY.md).

## 2. Abas internas do `index.html`

Cada aba é um `<div id="panel-<name>">` e um item de menu `sidebar-<name>`.
Navegação por `showTab('<name>')` ([index.html:2799](../index.html)).

| `name` (tab_key) | Rótulo na sidebar | Seção do menu | Painel | Carregamento |
|---|---|---|---|---|
| `dashboard` | **Emendas** | (topo) | `panel-dashboard` | inicial; sempre visível |
| `saldo-emendas` | Saldo das Emendas | (topo) | `panel-saldo-emendas` | `loadSaldoEmendas()` (1ª vez) |
| `consulta` | Consulta rápida | (topo) | `panel-consulta` | — |
| `chamados` | Chamados Antigos | Chamados | `panel-chamados` | `loadChamados()` |
| `chamados-novos` | Chamados novos | Chamados | `panel-chamados-novos` | `loadChamadosNovos()` |
| `fiscalizacao` | Fiscalização | Chamados | `panel-fiscalizacao` | `loadFiscalizacao()` |
| `inventario-ac` | Inventário | Equipamentos | `panel-inventario-ac` | `loadInventario()` |
| `itens` | **Controle de Entregas** | Itens | `panel-itens` | `loadItens()` + `itensShowSub('entregas')` |
| `atas` | **Atas Rp Vigentes** | Contratos | `panel-atas` | `loadAtas()` — **sempre recarrega** |
| `contratos` | **Contratos em execução** | Contratos | `panel-contratos` | `loadContratos()` |
| `licitacoes` | Licitações em andamento | Contratos | `panel-licitacoes` | `loadLicitacoes()` |
| `sancoes` | Sanções | Contratos | `panel-sancoes` | `loadSancoes()` |
| `cadastros` | Cadastros | Configurações | `panel-cadastros` | `carregarCadastros()` — **admin only** |
| `usuarios` | Usuários | Configurações | `panel-usuarios` | `carregarUsuarios()` — **admin only** |
| `planilhas` | Planilhas | Configurações | `panel-planilhas` | `carregarPlanilhaAC()` — oculta por padrão |

> A aba **Atas Rp** recarrega a cada visita porque é **derivada da matriz `contratos`**
> (reflete encerrar/prorrogar/editar feitos na aba Contratos). Ela **não é subaba de
> Contratos** — é um item próprio do menu, na seção "Contratos". Ver [MODULES.md](MODULES.md).

## 3. Subnavegação

Algumas abas têm subvisões internas (não são rotas):

- **Itens / Controle de Entregas**: `itensShowSub('entregas' | ...)` — alterna sub-views
  (entregas, itens de atas espelhados etc.).
- **Modais** (`<div class="modal-overlay" id="panel-...">`): nova emenda
  (`panel-nova-emenda`), novo item (`panel-novo-item`), atualizar status
  (`panel-atualizar-status`) e dezenas de modais abertos por funções `abrirModal...`.

## 4. Regras de visibilidade do menu

`aplicarVisibilidadeAbas()` ([index.html:2492](../index.html)) define a visibilidade:

- `dashboard` (Emendas): sempre visível.
- `saldo-emendas`: visível só se `userCanEdit('dashboard')`.
- `usuarios`, `cadastros`: `ADMIN_ONLY_TABS` — apenas admin.
- `planilhas`: `DEFAULT_HIDDEN_TABS` — oculta até liberação por admin.
- Demais: visíveis conforme `user_tab_permissions.can_view`.
- Seções inteiras da sidebar se ocultam quando nenhum item dentro é visível
  (`updateSidebarSections()`).

Ver [SECURITY.md](SECURITY.md) para o modelo completo de permissões.
