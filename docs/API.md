# API e Integrações — dashboard-emendas

> O sistema **não tem backend próprio** (sem server actions, sem endpoints internos).
> Toda a "API" é o **Supabase** acessado diretamente do navegador via
> `@supabase/supabase-js`: PostgREST (CRUD), RPC (funções), Auth e Storage.

## 1. Cliente Supabase

Instância única global em cada página:

```js
const SUPABASE_URL = "https://djtwoesmgeetnrztyvzw.supabase.co";
const SUPABASE_KEY = "sb_publishable_...";   // chave publishable (anon)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

- Carregado via CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`.
- A chave é a **publishable/anon** (segura para o cliente). A proteção real é via **RLS**.
  Ver [SECURITY.md](SECURITY.md).

## 2. Acesso a dados (PostgREST)

Padrão `sb.from('<tabela>')`. Exemplos reais ([index.html](../index.html)):

| Operação | Exemplo |
|---|---|
| Select | `sb.from("profiles").select("*").eq("id", uid).single()` |
| Select com order | `sb.from("atas_itens").select("*").order("created_at")` |
| Filtro | `sb.from("contratos").select("*").eq("tipo_instrumento","ATA")` |
| Upsert | `sb.from("chamados_controle").upsert(registros,{onConflict:"protocolo"})` |
| Insert + return | `sb.from("sancoes_solicitadas").insert(registro).select().single()` |

Tabelas/views expostas pela API: todas do schema `public` (config `schemas =
["public","graphql_public"]`), respeitando RLS por usuário.

## 3. Funções RPC

Chamadas via `sb.rpc('<nome>', { ...args })`:

| RPC | Uso |
|---|---|
| `abrir_chamado_publico(...)` | Abertura pública de chamado (em `chamado.html`, sem login). 20 parâmetros (carimbo, unidade, equipamento, série, patrimônio, problema, protocolo, etc.). |
| `can_access_tab(p_tab, p_action)` | Autorização por aba (usada internamente nas policies RLS; pode ser consultada pelo cliente). |
| `is_approved_profile()` | Verifica se o perfil atual está aprovado. |
| `admin_delete_user(p_user_id)` | Exclusão de usuário (admin). |
| `fill_chamado_id_by_protocolo()` | Manutenção: preenche `chamado_id` por protocolo. |

> Ver assinaturas completas em [DATABASE.md](DATABASE.md#funções-rpc-e-internas).

## 4. Autenticação (Supabase Auth)

| Ação | Chamada |
|---|---|
| Login | `sb.auth.signInWithPassword({ email, password })` (`login.html`) |
| Cadastro | `sb.auth.signUp({ email, password })` + insert em `profiles` (`cadastro.html`) |
| Sessão | `sb.auth.getSession()` |
| Logout / troca de senha | funções no `index.html` (`abrirAlterarSenha`, etc.) |

Config relevante (`supabase/config.toml`): `enable_signup = true`,
`minimum_password_length = 6`, `enable_confirmations = false` (não exige confirmar e-mail
no local). **A confirmar** a config equivalente na nuvem.

## 5. Storage

Buckets do Supabase Storage para arquivos:

- **Termos de entrega** — bucket criado na migration `prod_fase7_bucket_termos_entrega`
  (usado por `abrirTermoEntrega`, campos `termo_arquivo`/`arquivo_url`).
- **Anexos de chamados** — `chamados_anexos` (arquivos vinculados a chamados).

> **A confirmar:** nomes exatos dos buckets e políticas de acesso (públicos vs.
> autenticados). Verificar no painel Supabase / migrations de storage.

## 6. Bibliotecas externas (CDN, client-side)

Carregadas sob demanda por `ensureLib(name)`:

| Lib | URL | Uso |
|---|---|---|
| `xlsx` | cdnjs xlsx 0.18.5 | Exportar/importar Excel |
| `html2pdf` | cdnjs html2pdf 0.10.1 | Gerar PDF (AF, documentos) |
| `papaparse` | cdnjs PapaParse 5.4.1 | Parse de CSV |

Também: `@supabase/supabase-js@2` (jsDelivr) em todas as páginas.

## 7. Integrações externas

- **Google Sheets** — "Chamados Antigos" é consulta de planilha externa (somente
  leitura). **A confirmar** o mecanismo exato (URL/CSV publicado).

## 8. O que NÃO existe

- Sem endpoints HTTP próprios, sem server actions, sem Next.js/Express, sem Edge Functions
  ativas (nenhuma listada). Toda lógica server-side mora em **funções SQL + RLS**.
