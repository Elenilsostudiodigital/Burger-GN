const BASE = "https://burger-gn.vercel.app";

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function waitForBundle(maxMs = 180000) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < maxMs) {
    const { text } = await fetchText(`${BASE}/`);
    const m = text.match(/assets\/index-[^"']+\.js/);
    last = m ? m[0] : "(none)";
    // New build should include Security route chunk or Seguranca text in main/lazy chunks.
    // Prefer API endpoint availability as deploy signal for serverless + frontend.
    const apiProbe = await fetch(`${BASE}/api/admin/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const apiBody = await apiProbe.text();
    if (apiProbe.status === 400 && /e-mail/i.test(apiBody)) {
      return { ready: true, bundle: last, apiStatus: apiProbe.status, apiBody };
    }
    console.log(`waiting... bundle=${last} api=${apiProbe.status}`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  return { ready: false, bundle: last };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function jsonPost(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
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

async function main() {
  console.log("Waiting for deploy...");
  const wait = await waitForBundle();
  console.log(JSON.stringify(wait, null, 2));
  assert(wait.ready, "Deploy not ready with forgot-password endpoint");

  // Login still works
  const login = await jsonPost("/api/admin/login", {
    email: "admin@burgergn.com.br",
    password: "burger123",
  });
  assert(login.status === 200 && login.data.ok === true, `Login failed: ${JSON.stringify(login)}`);
  const cookie = (login.setCookie || [])
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  assert(cookie.includes("company_session"), "Missing session cookie");
  console.log("✓ login atual funciona");

  // Forgot password structure
  const forgotBad = await jsonPost("/api/admin/forgot-password", {});
  assert(forgotBad.status === 400, "forgot empty should 400");
  const forgotOk = await jsonPost("/api/admin/forgot-password", {
    email: "admin@burgergn.com.br",
  });
  assert(forgotOk.status === 200 && forgotOk.data.ok === true, "forgot should succeed");
  assert(forgotOk.data.emailDelivery === "pending", "emailDelivery pending");
  console.log("✓ recuperação estrutura");

  // Change password validations (authenticated)
  const noCurrent = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "", newPassword: "novaSenha12", confirmPassword: "novaSenha12" },
    cookie,
  );
  assert(noCurrent.status === 400 && /senha atual/i.test(noCurrent.data.error || ""), "require current");
  console.log("✓ senha atual obrigatória");

  const short = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "burger123", newPassword: "ab12", confirmPassword: "ab12" },
    cookie,
  );
  assert(short.status === 400 && /mínimo 8/i.test(short.data.error || ""), "min 8");
  console.log("✓ senha curta");

  const mismatch = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "burger123", newPassword: "novaSenha12", confirmPassword: "outraSenha12" },
    cookie,
  );
  assert(mismatch.status === 400 && /não coincidem/i.test(mismatch.data.error || ""), "confirm mismatch");
  console.log("✓ senha diferente");

  const weak = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "burger123", newPassword: "abcdefgh", confirmPassword: "abcdefgh" },
    cookie,
  );
  assert(weak.status === 400 && /letras e números/i.test(weak.data.error || ""), "weak password");
  console.log("✓ senha fraca");

  const wrongCurrent = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "wrongpass1", newPassword: "novaSenha12", confirmPassword: "novaSenha12" },
    cookie,
  );
  assert(wrongCurrent.status === 400 && /senha atual incorreta/i.test(wrongCurrent.data.error || ""), "wrong current");
  console.log("✓ senha atual incorreta");

  // Correct path: change then restore original so login stays the same for owner
  const temp = "TempSegura94";
  const changeOk = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: "burger123", newPassword: temp, confirmPassword: temp },
    cookie,
  );
  assert(changeOk.status === 200 && changeOk.data.ok === true, `change failed: ${JSON.stringify(changeOk)}`);
  console.log("✓ senha correta / confirmação correta (alteração temporária)");

  const restore = await jsonPost(
    "/api/admin/change-password",
    { currentPassword: temp, newPassword: "burger123", confirmPassword: "burger123" },
    cookie,
  );
  assert(restore.status === 200 && restore.data.ok === true, `restore failed: ${JSON.stringify(restore)}`);
  console.log("✓ senha restaurada para burger123");

  const loginAgain = await jsonPost("/api/admin/login", {
    email: "admin@burgergn.com.br",
    password: "burger123",
  });
  assert(loginAgain.status === 200 && loginAgain.data.ok === true, "login after restore failed");
  console.log("✓ login atual continua funcionando");

  console.log("\nALL API TESTS PASSED");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
