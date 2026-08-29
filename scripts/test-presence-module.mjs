import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error(`Missing: ${rel}`);
  return readFileSync(p, "utf8");
}

function assert(name, ok) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${name}`);
  }
}

const route = read("artifacts/api-server/src/routes/presence.ts");
const ensure = read("artifacts/api-server/src/lib/ensureMenuPresenceSchema.ts");
const index = read("artifacts/api-server/src/routes/index.ts");
const tracker = read("artifacts/burger-gn/src/components/MenuPresenceTracker.tsx");
const bar = read("artifacts/burger-gn/src/components/PedidosPresenceBar.tsx");
const dash = read("artifacts/burger-gn/src/pages/admin/Dashboard.tsx");
const app = read("artifacts/burger-gn/src/App.tsx");
const nav = read("artifacts/burger-gn/src/components/AdminBottomNav.tsx");
const notif = read("artifacts/burger-gn/src/lib/adminNotifications.ts");
const tab = read("artifacts/burger-gn/src/pages/admin/NotificationsTab.tsx");
const checkout = read("artifacts/burger-gn/src/pages/Checkout.tsx");

assert("ephemeral presence table", /menu_presence_sessions/.test(ensure));
assert("presence API routes", /\/presence\/heartbeat/.test(route) && /\/admin\/presence/.test(route));
assert("presence broadcasts to admin SSE", /presence_update/.test(route) && /broadcastSSE/.test(route));
assert("presence bar uses SSE + slow fallback", /presence_update/.test(bar) && /60_000|60000/.test(bar));
assert("heartbeat pauses when store closed", /storeOpen/.test(tracker));
assert("presence router mounted", /presenceRouter/.test(index));
assert("storefront tracker", /MenuPresenceTracker/.test(tracker));
assert("PedidosPresenceBar on Pedidos board", /PedidosPresenceBar/.test(dash) && /PedidosPresenceBar/.test(bar));
assert("no separate clientes-online page/route", !/clientes-online/.test(app) && !/clientes-online/.test(nav));
assert("presence alert messages", /Novo cliente entrou no cardápio/.test(bar) && /iniciou um pedido/.test(bar) && /finalizando um pedido/.test(bar));
assert("presence sounds in Notificações", /presenceOnline/.test(notif) && /presenceCart/.test(notif) && /presenceCheckout/.test(notif));
assert("NotificationsTab lists presence events", /presenceOnline/.test(tab));
assert("checkout identity sync", /setPresenceIdentity/.test(checkout));
assert("orders routes untouched", !/presence/.test(read("artifacts/api-server/src/routes/orders.ts")));
assert("ClientesOnline page removed", !existsSync(join(root, "artifacts/burger-gn/src/pages/admin/ClientesOnline.tsx")));

if (process.exitCode) {
  console.error("\nPRESENCE CHECKS FAILED");
  process.exit(1);
}
console.log("\nALL PRESENCE CHECKS PASSED");
