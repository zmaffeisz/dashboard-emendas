# Deploy e Ambiente — dashboard-emendas

> Relacionado: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md),
> [.env.example](../.env.example).

## 1. Natureza do projeto

- **Frontend estático puro**: HTML/CSS/JS. **Sem `package.json`, sem build, sem
  transpilação, sem bundler.** Os arquivos são servidos como estão.
- **Backend**: Supabase nuvem (`djtwoesmgeetnrztyvzw`) — gerenciado, não precisa de deploy
  de servidor.

## 2. Dependências

- Em runtime, via **CDN** (não há `node_modules`):
  - `@supabase/supabase-js@2` (jsDelivr)
  - `xlsx` 0.18.5, `html2pdf` 0.10.1, `papaparse` 5.4.1 (cdnjs) — sob demanda.
- Não há gerenciador de pacotes nem lockfile.

## 3. Configuração de ambiente

Atualmente as credenciais do Supabase estão **hardcoded** nas páginas (`index.html`,
`login.html`, `cadastro.html`):

```js
const SUPABASE_URL = "https://djtwoesmgeetnrztyvzw.supabase.co";
const SUPABASE_KEY = "sb_publishable_...";
```

> Por ser app client-side, a chave **publishable/anon** pode ficar no cliente (protegida
> por RLS). Ainda assim, ver [.env.example](../.env.example) para documentar as variáveis
> e recomendações. Não há, hoje, mecanismo de injeção de env no build (não há build).

## 4. Desenvolvimento local

Servir os arquivos por HTTP (necessário para o Supabase Auth funcionar):

```bash
# A partir da raiz do repositório
python -m http.server 8765
# Acesse http://localhost:8765/login.html
```

Configuração equivalente em `.claude/launch.json` (perfil "static", porta 8765).

> Abrir o HTML via `file://` pode quebrar Auth/CORS — use sempre um servidor HTTP.

### Supabase local (opcional, não usado pelo app)

`supabase/config.toml` define um stack local (DB 54322, API 54321, Studio 54323, etc.).
O app **não** aponta para ele. Se quiser usá-lo:

```bash
supabase start          # sobe o stack local
supabase db reset       # aplica migrations + seed (supabase/seed.sql, se houver)
```

## 5. Banco / migrations

- Migrations versionadas em `supabase/migrations/*.sql` e histórico aplicado na nuvem
  (ver [DATABASE.md](DATABASE.md#migrations-aplicadas-em-produção)).
- Dumps de referência: `schema.sql`, `schema_prod.sql`, `schema_local.sql`.
- Aplicação em produção é feita via Supabase (MCP/CLI/painel). **Não aplicar DDL sem
  backup/branch** (as próprias migrations alertam isso).

## 6. Deploy de produção

> **A confirmar:** a hospedagem atual do frontend. O repositório não contém configuração
> de hosting (sem `vercel.json`, `netlify.toml`, GitHub Pages workflow, etc.).

Opções compatíveis com estático:
- Qualquer host estático (Netlify, Vercel static, GitHub Pages, Nginx, S3+CloudFront).
- Publicar a raiz do repositório; ponto de entrada `login.html`.

Passos típicos:
1. Garantir que `SUPABASE_URL`/`SUPABASE_KEY` apontam para o projeto correto.
2. Publicar os arquivos `.html`, `.css` e o SVG do brasão.
3. Conferir que as migrations do banco estão aplicadas na nuvem.

## 7. Checklist de release

- [ ] Migrations aplicadas e `pg_notify('pgrst','reload schema')` executado quando
      necessário.
- [ ] `get_advisors` sem alertas críticos de segurança.
- [ ] Credenciais Supabase corretas no HTML.
- [ ] Teste manual das telas (ver [TESTING.md](TESTING.md)).
- [ ] Deploy do `index.html` atualizado (memória do projeto cita pendência de deploy do
      `index.html` em revisões anteriores — confirmar).
