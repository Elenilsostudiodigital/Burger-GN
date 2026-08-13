const BASE = "https://burger-gn.vercel.app";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, data, setCookie };
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    const r = await json("GET", "/api/products");
    if (r.status === 200 && Array.isArray(r.data) && r.data[0] && "promoText" in r.data[0] && "discountLabel" in r.data[0]) {
      return r.data;
    }
    console.log("waiting promoText/discountLabel deploy...", r.status);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("promoText deploy not ready");
}

async function main() {
  console.log("Waiting deploy...");
  let products = await waitReady();
  assert(products.length > 0, "no products");
  console.log("✓ produtos existentes carregam", products.length);

  const login = await json("POST", "/api/admin/login", {
    email: "admin@burgergn.com.br",
    password: "burger123",
  });
  assert(login.status === 200 && login.data.ok, "login");
  const cookie = (login.setCookie || []).map((c) => c.split(";")[0]).filter(Boolean).join("; ");

  const target =
    products.find((p) => parseFloat(String(p.price)) >= 20) ||
    [...products].sort((a, b) => parseFloat(String(b.price)) - parseFloat(String(a.price)))[0];
  const original = parseFloat(String(target.price));
  const promoValue = Number((original * 0.8).toFixed(2));
  const promoPriceStr = promoValue.toFixed(2);
  const expectedPct = Math.round(((original - promoValue) / original) * 100);
  const ends = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const starts = new Date(Date.now() - 60 * 1000).toISOString();

  const promo = await json(
    "PATCH",
    `/api/admin/products/${target.id}/promotion`,
    {
      promoPrice: promoPriceStr,
      promoStartsAt: starts,
      promoEndsAt: ends,
      promoText: "Oferta da Semana",
    },
    cookie,
  );
  assert(promo.status === 200 && promo.data.isPromoActive === true, JSON.stringify(promo.data));
  assert(promo.data.promoText === "Oferta da Semana", "promoText");
  assert(typeof promo.data.discountPercent === "number" && promo.data.discountPercent > 0, "auto %");
  assert(String(promo.data.discountLabel || "").startsWith("-"), "discountLabel -X%");
  assert(promo.data.discountPercent === expectedPct, `expected -${expectedPct}% got ${promo.data.discountPercent}`);
  console.log("✓ promoção rápida / texto / % automático");

  const featured = await json(
    "PUT",
    `/api/admin/products/${target.id}`,
    {
      isFeatured: true,
      isClubeExclusive: true,
      isPromotion: true,
      promoText: "Descontão $$$",
      promoPrice: promoPriceStr,
      promoOriginalPrice: target.price,
      promoStartsAt: starts,
      promoEndsAt: ends,
    },
    cookie,
  );
  assert(featured.status === 200, JSON.stringify(featured));
  assert(featured.data.isFeatured && featured.data.isClubeExclusive, "flags");
  assert(featured.data.promoText === "Descontão $$$", "promo text save");
  assert(featured.data.discountLabel === `-${expectedPct}%`, "badge -X%");
  console.log("✓ destaque / clube / texto / etiqueta -%");

  const pub = await json("GET", "/api/products");
  const pubItem = pub.data.find((p) => p.id === target.id);
  assert(pubItem?.isPromoActive, "public promo active");
  assert(pubItem?.promoText === "Descontão $$$", "public promoText");
  assert(pubItem?.discountLabel === `-${expectedPct}%`, "public -X%");
  assert(
    String(pubItem?.displayPrice) === promoPriceStr || Number(pubItem?.displayPrice) === promoValue,
    "display price",
  );
  assert(pubItem?.compareAtPrice, "compareAt strikethrough");
  console.log("✓ Promoções do Dia (API public) + cardápio fields");

  // expire immediately
  const expiredEnd = new Date(Date.now() - 1000).toISOString();
  await json(
    "PATCH",
    `/api/admin/products/${target.id}/promotion`,
    { promoPrice: promoPriceStr, promoStartsAt: starts, promoEndsAt: expiredEnd },
    cookie,
  );
  const afterExpire = await json("GET", `/api/admin/products`, null, cookie);
  const expiredItem = afterExpire.data.find((p) => p.id === target.id);
  assert(expiredItem && expiredItem.isPromoActive === false, "auto expire");
  assert(expiredItem.isPromotion === false, "promotion cleared");
  console.log("✓ promoção encerrada na data final");

  // cleanup marketing flags so catalog returns near original
  await json(
    "PUT",
    `/api/admin/products/${target.id}`,
    {
      isFeatured: false,
      isNew: false,
      isFlashOffer: false,
      isBestseller: false,
      isClubeExclusive: false,
      isPromotion: false,
      marketingBadge: "",
      promoText: "",
      promoPrice: null,
      promoStartsAt: null,
      promoEndsAt: null,
    },
    cookie,
  );
  // also clear leftover bad promo on cheapest products from prior runs
  const leftover = products.find((p) => p.id === 1);
  if (leftover) {
    await json(
      "PUT",
      `/api/admin/products/1`,
      {
        isFeatured: false,
        isPromotion: false,
        isClubeExclusive: false,
        marketingBadge: "",
        promoText: "",
        promoPrice: null,
        promoStartsAt: null,
        promoEndsAt: null,
      },
      cookie,
    );
  }
  console.log("✓ cleanup flags");

  const again = await json("GET", "/api/products");
  assert(again.status === 200 && again.data.length >= products.length - 1, "catalog intact");
  console.log("✓ produtos antigos continuam funcionando");

  console.log("\nALL PRODUCT MARKETING TESTS PASSED");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
