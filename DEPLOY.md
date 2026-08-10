# Deploy — Burger GN

## Hospedagem

| Camada | Serviço | Observação |
| --- | --- | --- |
| Frontend (SPA) | **Vercel** | Build estático em `artifacts/burger-gn/dist/public` |
| Backend / API | **Vercel** (Serverless Function) | Entrada em `api/index.mjs`, rewrites `/api/*` |
| Banco de dados | **Postgres** (via `DATABASE_URL` no ambiente Vercel) | Não versionado no Git |

URL oficial: `https://burger-gn.vercel.app`  
Painel administrativo: `https://burger-gn.vercel.app/admin/login`

Há também um `render.yaml` / `Dockerfile` no repositório (API + frontend no mesmo container), mas a produção ativa deste projeto é a **Vercel**.

## Branch de produção

- Branch de produção: **`main`**
- Branches de desenvolvimento / feature geram **Preview Deployments** na Vercel (URL temporária).
- Somente o que for integrado em `main` atualiza a URL oficial.

## Deploy automático

Fluxo esperado:

1. Desenvolvimento e testes em uma branch de feature
2. Commit + push da feature
3. Integração (merge) na `main`
4. A integração Git da Vercel detecta o push em `main`
5. Build + deploy de **Production**
6. A mesma URL oficial (`burger-gn.vercel.app`) é atualizada

Preview de branches experimentais **não** deve ser promovido automaticamente como domínio oficial.

Configuração relevante no repositório (`vercel.json`):

- `installCommand`: `CI=true pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true`
- `buildCommand`: `pnpm --filter @workspace/api-server run build && PORT=5173 BASE_PATH=/ pnpm --filter @workspace/burger-gn run build`
- `outputDirectory`: `artifacts/burger-gn/dist/public`
- Function: `api/index.mjs` (inclui o bundle do API server)

## Como verificar se um deploy concluiu

1. GitHub → repositório → aba **Deployments** (ambiente `Production`)
2. Ou dashboard Vercel → projeto → **Deployments** (Production, status Ready)
3. Smoke rápido:
   - `GET https://burger-gn.vercel.app/api/healthz` → `{"status":"ok"}`
   - Abrir `/cardapio`, `/admin/login`, `/admin`, `/admin/clientes`, `/admin/clube`

## Rollback para o último deploy estável

1. No dashboard Vercel → **Deployments**
2. Abrir o último deploy de Production que estava estável
3. Usar **Promote to Production** / redeploy desse deployment
4. Confirmar `healthz` e o painel admin

Alternativa Git (quando o commit anterior da `main` era estável):

```bash
git checkout main
git revert HEAD   # ou reset+force apenas se a equipe autorizar explicitamente
git push origin main
```

Preferir Promote/Rollback na Vercel para não reescrever histórico sem necessidade.

## Migrações de banco

Comandos locais (usam `.env`, que **não** deve ser commitado):

```bash
pnpm run db:migrate          # multi-tenant (quando aplicável)
pnpm run db:migrate-clube    # Clube / fidelidade / cashback / CRM (clube_members)
```

`db:migrate-clube` é **aditiva e idempotente**:

- `CREATE TABLE IF NOT EXISTS` / `CREATE TYPE` com tratamento de duplicata
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para fidelidade/cashback
- Não remove tabelas, colunas nem dados

Antes de rodar em produção:

1. Garantir backup/recuperação do Postgres (snapshot do provedor)
2. Apontar `DATABASE_URL` para o banco de **produção** (variável do ambiente Vercel)
3. Executar `pnpm run db:migrate-clube`
4. Validar `/admin/clube` e `/admin/clientes`

## Segredos

Nunca commitar:

- `.env` / `.env.*`
- senhas, tokens, chaves de API, `SESSION_SECRET`, `DATABASE_URL`

Configure esses valores apenas no painel da Vercel (Environment Variables → Production / Preview).
