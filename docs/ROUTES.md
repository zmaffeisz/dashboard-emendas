# Rotas e Navegação — dashboard-emendas

> O sistema é servido como arquivos estáticos. "Rotas" são (a) páginas HTML e
> (b) abas internas do SPA `index.html`, ativadas por `showTab(name)` sem mudar a URL.

## 1. Páginas (URLs)

| URL | Arquivo | Acesso | Descrição |
|---|---|---|---|
| `/login.html` | `login.html` | Público | Login (Supabase Auth). Sessão ativa → redireciona a `index.html`. |
| `/cadastro.html` | `cadastro.html` | Público | Auto-cadastro, acessível diretamente pelo botão `Criar conta` no banner público. Cria `profiles` com `papel=visualizador`. |
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

- **Contratos em execução**: `ctShowSub('contratos' | 'financeiro')` alterna a
  lista/gestão dos contratos e **Notas fiscais e medições** em página inteira.
  A nova área consulta todos os contratos permitidos pela RLS, inclusive encerrados
  e concluídos, excluindo ATAs. O atalho da ficha abre o contrato já selecionado.
  Ao entrar pela subaba, os registros e totais aparecem somente depois de selecionar
  um contrato ou digitar na busca. Apenas os demais filtros não iniciam a consulta;
  limpar seleção e busca oculta os resultados. O seletor mostra processo antes do contrato.
  Há duas guias internas (**Notas fiscais** e **Medições**), filtros por contrato,
  texto, competência inicial/final, status e vínculo, ordenação, totais do filtro,
  detalhes expansíveis e exportação CSV de todos os registros filtrados.
  As tabelas usam a rolagem da página, com 25 registros por página; em telas estreitas
  há rolagem horizontal apenas na tabela. Cadastros continuam em formulários modais.
  Salvar NF/medição ou alterar status recarrega a consulta, preservando filtros da
  mesma guia. Alterar a guia limpa os filtros específicos de status e vínculo.
  O intervalo de competência inclui ciclos trimestrais que cruzam os meses
  selecionados, usando as datas do ciclo da medição; não usa a emissão como competência.
  A gestão do contrato concentra saldos, ajustes, prorrogações, documentos e histórico.

- **Itens / Controle de Entregas**: `itensShowSub('entregas' | 'confirmacao' | 'empenhos')`
  alterna sub-views. `entregas` mostra itens aguardando AF/prazo; `confirmacao` mostra
  itens com AF/execução para confirmar entrega na unidade; `empenhos` gerencia vínculos.
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
- O último item da seção **Configurações** é um atalho externo sempre visível para o
  **Portal Unidades**, aberto em uma nova aba; ele não corresponde a um painel da SPA.

Ver [SECURITY.md](SECURITY.md) para o modelo completo de permissões.
