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
    body: body ? JSON.stringify(body) : undefined,
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

async function waitReady(maxMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const probe = await json("GET", "/api/company-profile");
    if (probe.status === 200 && probe.data?.name) {
      return probe.data;
    }
    console.log("waiting deploy...", probe.status);
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error("Deploy not ready");
}

async function main() {
  console.log("Waiting for company-profile...");
  const publicProfile = await waitReady();
  console.log("✓ public profile", publicProfile.name);

  const login = await json("POST", "/api/admin/login", {
    email: "admin@burgergn.com.br",
    password: "burger123",
  });
  assert(login.status === 200 && login.data.ok, `login failed ${JSON.stringify(login)}`);
  const cookie = (login.setCookie || []).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  assert(cookie.includes("company_session"), "no session");
  console.log("✓ login atual");

  const emptyEmail = await json("PUT", "/api/admin/recovery-email", { recoveryEmail: "" }, cookie);
  assert(emptyEmail.status === 400, "empty email should 400");
  console.log("✓ validar e-mail vazio");

  const badEmail = await json("PUT", "/api/admin/recovery-email", { recoveryEmail: "x" }, cookie);
  assert(badEmail.status === 400, "bad email should 400");
  console.log("✓ validar e-mail inválido");

  const okEmail = await json(
    "PUT",
    "/api/admin/recovery-email",
    { recoveryEmail: "recuperacao@burgergn.com.br" },
    cookie,
  );
  assert(okEmail.status === 200 && okEmail.data.ok, JSON.stringify(okEmail));
  console.log("✓ salvar e-mail recuperação");

  const emptyPhone = await json("PUT", "/api/admin/recovery-phone", { recoveryPhone: "" }, cookie);
  assert(emptyPhone.status === 400, "empty phone should 400");
  const okPhone = await json(
    "PUT",
    "/api/admin/recovery-phone",
    { recoveryPhone: "71988887777" },
    cookie,
  );
  assert(okPhone.status === 200 && okPhone.data.ok, JSON.stringify(okPhone));
  console.log("✓ salvar telefone recuperação");

  const profileSave = await json(
    "PUT",
    "/api/admin/company-profile",
    {
      name: "The Burger GN",
      slogan: "Frase de teste Configurações",
      description: "Descrição teste perfil",
      address: "Lauro de Freitas - BA",
      phone: "71999998888",
      profileWhatsapp: "5571999998888",
      instagramUrl: "https://instagram.com/burgergn",
      facebookUrl: "",
      websiteUrl: "",
      logoUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=200&h=200&fit=crop",
      photoUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
      bannerUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&h=800&fit=crop",
      displayOpenDays: "Seg a Dom",
      displayHoursText: "18:00 às 23:30",
      menuWelcomeMessage: "Bem-vindo ao cardápio Burger GN",
    },
    cookie,
  );
  assert(profileSave.status === 200 && profileSave.data.ok, JSON.stringify(profileSave));
  assert(profileSave.data.profile.slogan.includes("Frase de teste"), "slogan not saved");
  console.log("✓ editar perfil / frase / logo / banner / telefone");

  const pub = await json("GET", "/api/company-profile");
  assert(pub.status === 200 && pub.data.slogan.includes("Frase de teste"), "public slogans");
  assert(pub.data.logoUrl.includes("unsplash"), "public logo");
  console.log("✓ perfil público no cardápio API");

  // password validation still works without changing permanent password
  const short = await json(
    "POST",
    "/api/admin/change-password",
    { currentPassword: "burger123", newPassword: "ab12", confirmPassword: "ab12" },
    cookie,
  );
  assert(short.status === 400, "short password");
  console.log("✓ validar senha curta");

  const login2 = await json("POST", "/api/admin/login", {
    email: "admin@burgergn.com.br",
    password: "burger123",
  });
  assert(login2.status === 200 && login2.data.ok, "login still works");
  console.log("✓ login continua funcionando");

  // hours endpoint untouched
  const hours = await json("GET", "/api/admin/business-hours", null, cookie);
  assert(hours.status === 200, "business hours ok");
  console.log("✓ horário existente intacto");

  console.log("\nALL CONFIG TESTS PASSED");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
