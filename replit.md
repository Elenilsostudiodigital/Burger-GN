# The Burger GN

Sistema completo de pedidos online para hamburgueria — cardápio com carrinho, checkout, envio via WhatsApp, rastreamento de pedidos, e painel administrativo com notificações em tempo real.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/burger-gn run dev` — run the customer/admin frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — cookie signing secret
- Optional env: `ADMIN_PASSWORD` — default is `burger123`, change in production

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + Framer Motion
- API: Express 5 + cookie-parser (signed cookies for admin auth)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB tables: categories, products, orders, order_items
- `artifacts/api-server/src/routes/` — API routes (admin, categories, products, orders)
- `artifacts/api-server/src/lib/sse.ts` — SSE broadcaster for real-time admin notifications
- `artifacts/api-server/src/lib/seed.ts` — Seed default categories + products on first boot
- `artifacts/burger-gn/src/pages/` — Customer pages (Menu, Cart, Checkout, Confirmation, OrderTracking)
- `artifacts/burger-gn/src/pages/admin/` — Admin pages (Login, Dashboard, MenuAdmin)
- `artifacts/burger-gn/src/context/` — CartContext, AdminContext
- `artifacts/burger-gn/src/lib/api.ts` — Typed API client + config constants (WhatsApp number, delivery fee)

## Architecture decisions

- Auth uses cookie-parser signed cookies (stateless, no DB sessions) — middleware checks `req.signedCookies.admin_session === 'true'`
- Admin SSE stream at `/api/orders/stream` — new orders and status changes broadcast in real time
- DB seeded on first server startup if tables are empty
- Order tracking uses UUID `trackingId` (public, shareable link)
- WhatsApp message is built client-side with all order data before redirecting

## Product

### Customer flow
1. Browse menu by category (products from DB)
2. Add to cart → Checkout (delivery/pickup/local + payment method + notes)
3. Order POSTed to API → Confirmation page
4. WhatsApp opens automatically with full order message
5. Track order status at `/pedido/:trackingId` (polls every 10s)

### Admin flow
1. Login at `/admin/login` (password: burger123, change via ADMIN_PASSWORD env)
2. Dashboard: real-time orders by status (Novos / Em Preparo / Saiu p/ Entrega / Finalizados / Cancelados)
3. SSE notifications with beep sound when new order arrives
4. Advance order status with one tap, print receipt, view full order details
5. Menu management at `/admin/cardapio`: add/edit/delete products, toggle availability, manage categories

## User preferences

- Design: preto #0a0a0a, amarelo mustard amber-500, branco — mobile-first PWA
- Language: português (BR) for all UI text
- WhatsApp number and delivery fee: editable in `artifacts/burger-gn/src/lib/api.ts`

## Gotchas

- After changes to `lib/db/src/schema/`, run `pnpm run typecheck:libs` to rebuild lib declarations before checking artifact packages
- The SSE route must come before `/orders/:id` route in orders.ts (specific routes first)
- Cookie for admin auth is signed with SESSION_SECRET — changing that secret invalidates all sessions
- `ADMIN_PASSWORD` defaults to "burger123" if env var not set — always set this in production

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
