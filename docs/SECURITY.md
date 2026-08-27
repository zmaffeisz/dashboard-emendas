# Segurança — dashboard-emendas

> Autenticação, autorização e modelo de permissões. Relacionado: [API.md](API.md),
> [DATABASE.md](DATABASE.md#rls), [BUSINESS_RULES.md](BUSINESS_RULES.md#9-permissões-resumo).

## 1. Autenticação

- **Supabase Auth** (e-mail/senha). Sem OAuth/SSO habilitado.
- Login em `login.html`; auto-cadastro em `cadastro.html`.
- Senha mínima: 6 caracteres (config). Sem confirmação de e-mail no setup local
  (`enable_confirmations = false`) — **A confirmar** na nuvem.
- Sessão gerenciada pelo `supabase-js` (token JWT, expira em 1h por padrão, com refresh).

## 2. Modelo de autorização

Modelo de **dois papéis** + permissões granulares por aba:

| Papel | Acesso |
|---|---|
| `admin` | Acesso total a todas as abas e ações. |
| usuário comum (`visualizador` ou outro) | Acesso **100% definido por caixinhas** em `user_tab_permissions` (`can_view`/`can_edit` por `tab_key`). |

Regras-chave:
- **Conta nova** nasce como `visualizador` e só enxerga a aba **Emendas** (dashboard).
- **Sem login**: vê apenas Emendas.
- `usuarios` e `cadastros` são **admin-only** (`ADMIN_ONLY_TABS`).
- `planilhas` fica **oculta por padrão** (`DEFAULT_HIDDEN_TABS`), liberada por admin.
- Um perfil aprovado com escopo organizacional **Divisão** recebe poderes de gestão no
  **Portal Unidades** (e somente nele), sem ser promovido a `admin` neste dashboard.
- Perfil precisa estar **aprovado** (`profiles.aprovado`) para acessar dados.
- O alcance organizacional é hierárquico: `divisoes` → `secoes` → registros operacionais.
  Usuário de seção fica restrito à sua seção; chefia pode alternar entre a visão consolidada
  da própria divisão e qualquer seção dela; administrador pode usar contexto global, de
  divisão ou de seção. As caixinhas por aba continuam sendo exigidas em todos os casos.

## 3. Dupla camada (banco + cliente)

| Camada | Onde | Autoritativa? |
|---|---|---|
| **RLS no banco** | `can_access_tab()`, `private.can_access_secao()`, policies por tabela | **Sim** — fonte real de controle |
| **Espelho no cliente** | `userCanView`/`userCanEdit`/`podeEditar`/`_isAdmin` ([index.html:2464+](../index.html)) | Não — apenas UX (oculta menus/botões) |

`can_access_tab(p_tab, p_action)` (no banco):
1. `auth.uid()` nulo → `false`;
2. perfil não aprovado → `false`;
3. `papel = 'admin'` → `true`;
4. senão consulta `user_tab_permissions`: `view` exige `can_view`; `edit` exige
   `can_view AND can_edit`; ausência de registro → `false`.

## 4. RLS

- Tabelas com RLS habilitada; hardening em `prod_hardening_revoke_anon_ciclo_itens` e
  `rls_auto_enable()`.
- As policies operacionais combinam `can_access_tab()` com
  `private.can_access_secao()`. O contexto selecionado no cabeçalho reduz a abrangência
  efetiva sem ampliar as permissões por aba.
- Policy típica: `SELECT` para `authenticated` com `is_approved_profile()`; escrita
  condicionada a `can_access_tab(<aba>, 'edit')`.
- `anon` revogado das tabelas do ciclo de itens — acesso anônimo só pela RPC
  `abrir_chamado_publico` (chamado público).
- As tabelas `licitacao_item_ocorrencias` e
  `licitacao_item_ocorrencia_emendas` usam RLS por seção e permissão de Licitações,
  Contratos ou Dashboard. A gravação passa pela RPC autenticada
  `registrar_licitacao_itens_ocorrencias`; triggers fixam os dados históricos e impedem
  alterações ou exclusões posteriores do item, evento e vínculos.
- Os buckets privados validam a seção do registro vinculado antes de liberar leitura ou
  exclusão. `licitacao-ocorrencias` aceita PDF/JPEG/PNG/WEBP de até 10 MB; uploads exigem
  permissão de edição e um documento já vinculado a uma ocorrência não pode ser
  substituído nem apagado por usuário fora do seu contexto organizacional.

## 5. Exposição de segredos

- A **chave publishable/anon** está hardcoded no HTML (`SUPABASE_KEY`). Isso é
  **esperado** para apps client-side — ela só permite o que a RLS autoriza.
- ⚠️ **Não** deve haver `service_role` key no front-end. (Conferido: o HTML usa apenas a
  publishable.) Ver [.env.example](../.env.example) para boas práticas.
- A `URL` do projeto também é pública (normal).

## 6. RPC pública

`abrir_chamado_publico` é a **única** superfície sem autenticação. Recebe dados do
formulário `chamado.html`. **Recomendado**: validar/rate-limitar entradas e revisar a
função quanto a `SECURITY DEFINER`/`search_path` (a migration de recebimento já fixa
`search_path` — boa prática a estender). Ver [TODO.md](TODO.md).

## 7. Recomendações de segurança

| Item | Ação |
|---|---|
| Advisors | Rodar `get_advisors` (security + performance) no Supabase periodicamente. |
| service_role | Garantir que nunca apareça no cliente. |
| Confirmação de e-mail | Confirmar política na nuvem (evitar cadastro irrestrito). |
| Aprovação de contas | Manter fluxo de aprovação manual por admin. |
| Storage | Revisar políticas dos buckets (termos/anexos) — público vs. autenticado. |
| `search_path` em funções | Padronizar `SET search_path` em todas as funções `SECURITY DEFINER`. |

> **A confirmar:** estado atual dos advisors e políticas de Storage na nuvem.
