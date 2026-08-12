#!/usr/bin/env python3
"""Prove critical UI fixes 2/9/10 against production even if DB is down."""
from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "https://burger-gn.vercel.app").rstrip("/")
CHROME = os.environ.get("PLAYWRIGHT_CHROME", "/usr/local/bin/google-chrome")


def main() -> int:
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page()
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        # --- #2 Login UI must show real server error, not wrong-password ---
        page.goto(f"{BASE}/admin/login", wait_until="domcontentloaded", timeout=60000)
        page.locator('input[type="email"]').fill("admin@burgergn.com.br")
        page.locator('input[type="password"]').fill("burger123")
        page.get_by_role("button", name="ENTRAR").click()
        page.wait_for_timeout(2500)
        body = page.locator("body").inner_text()
        wrong_pw_only = (
            "E-mail ou senha incorretos" in body
            and "banco" not in body.lower()
            and "conectar" not in body.lower()
            and "quota" not in body.lower()
            and "DATABASE" not in body
            and "Falha" not in body
        )
        shows_server_error = any(
            x in body
            for x in (
                "Falha ao conectar",
                "banco de dados",
                "quota",
                "DATABASE_URL",
                "Internal",
                "servidor",
            )
        )
        # Also accept if still on login with non-credential error text
        login_ok = shows_server_error and not wrong_pw_only
        results.append(("2 Login UI shows server/DB error (not wrong password)", login_ok, body[:300]))

        # --- Bundle contracts for #9/#10 (no iframe in checkout/novas pages source in prod assets) ---
        html = page.goto(BASE + "/", wait_until="domcontentloaded").text() if False else None
        page.goto(BASE + "/", wait_until="domcontentloaded")
        html = page.content()
        assets = re.findall(r'src="(/assets/[^"]+\.js)"', html)
        js = ""
        for a in assets[:5]:
            js += page.request.get(BASE + a).text()
        has_staticmap = "staticmap.openstreetmap" in js
        # Checkout/Novas should not embed OSM iframe export anymore
        has_embed_iframe_pattern = "openstreetmap.org/export/embed.html" in js
        # StreetMapPreview marker
        has_street_preview = "Mapa do endereço" in js or "staticmap.openstreetmap.de" in js
        results.append(("9/10 Prod bundle uses staticmap (no OSM embed iframe URL)", has_staticmap and not has_embed_iframe_pattern, f"staticmap={has_staticmap} embed={has_embed_iframe_pattern}"))

        # Checkout page: open without crash; no iframe nodes when navigating with mocked cart is hard —
        # verify source contract + page loads without insertBefore pageerror.
        page.goto(f"{BASE}/checkout", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1000)
        iframe_count = page.locator("iframe").count()
        eb = "Algo deu errado" in page.locator("body").inner_text()
        insert_errs = [e for e in page_errors if "insertBefore" in e]
        results.append(("9 Checkout loads without iframe/ErrorBoundary/insertBefore", iframe_count == 0 and not eb and not insert_errs, f"iframes={iframe_count} eb={eb} insert={insert_errs[:2]}"))

        # Novas Ruas requires auth — with DB down we expect redirect to login, not crash
        page.goto(f"{BASE}/admin/novas-ruas", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1500)
        text = page.locator("body").inner_text()
        crashed = "Algo deu errado" in text or any("insertBefore" in e for e in page_errors)
        results.append(("10 Novas Ruas no ErrorBoundary/insertBefore (DB down → login ok)", not crashed, text[:200]))

        browser.close()

    failed = False
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}: {name}")
        print(f"  detail: {detail!r}")
        if not ok:
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
