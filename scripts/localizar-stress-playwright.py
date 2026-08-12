#!/usr/bin/env python3
"""
Stress-test Localizar Endereço with mocked API responses so map/results
actually update (the path that previously caused insertBefore).

Usage:
  BASE_URL=http://127.0.0.1:5173 CLICKS=30 python3 scripts/localizar-stress-playwright.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5173").rstrip("/")
CLICKS = int(os.environ.get("CLICKS", "30"))

ADDRESSES = [
    {"street": "Rua São Mateus", "neighborhood": "Itinga", "city": "Lauro de Freitas", "cep": "42700000"},
    {"street": "Avenida Santos Dumont", "neighborhood": "Centro", "city": "Lauro de Freitas", "cep": "42700001"},
    {"street": "Rua das Flores", "neighborhood": "Vilas do Atlântico", "city": "Lauro de Freitas", "cep": "42700025"},
    {"street": "Rua Chile", "neighborhood": "Centro", "city": "Salvador", "cep": "40020000"},
    {"street": "Avenida Paralela", "neighborhood": "Patamares", "city": "Salvador", "cep": "41680010"},
]


def json_response(body, status=200):
    return {
        "status": status,
        "content_type": "application/json",
        "body": json.dumps(body),
    }


def has_error_boundary(page) -> bool:
    body = page.locator("body").inner_text(timeout=5000)
    needles = (
        "algo deu errado",
        "insertBefore",
        "toFixed is not a function",
        "Failed to execute",
        "The node before which",
    )
    low = body.lower()
    return any(n.lower() in low for n in needles)


def last_crash(page):
    return page.evaluate(
        "() => { try { return sessionStorage.getItem('lastUiCrash'); } catch { return null; } }"
    )


def install_mocks(page):
    geocode_n = {"n": 0}

    def handle(route):
        req = route.request
        url = req.url
        method = req.method.upper()

        if "/api/admin/login" in url and method == "POST":
            return route.fulfill(**json_response({"ok": True}))
        if "/api/admin/me" in url and method == "GET":
            return route.fulfill(
                **json_response(
                    {
                        "authenticated": True,
                        "user": {
                            "id": 1,
                            "name": "Admin",
                            "email": "admin@burgergn.com.br",
                            "role": "owner",
                        },
                        "company": {"id": 1, "name": "Burger GN", "slug": "burger-gn", "status": "active"},
                    }
                )
            )
        if "/api/admin/delivery-streets/geocode" in url and method == "POST":
            geocode_n["n"] += 1
            i = geocode_n["n"]
            # Alternate string/number coords to stress normalization + map src updates.
            lat1 = -12.90025 + (i % 7) * 0.001
            lng1 = -38.31467 + (i % 5) * 0.001
            lat2 = lat1 + 0.0004
            lng2 = lng1 - 0.0003
            as_string = i % 2 == 0
            cands = [
                {
                    "id": f"c-{i}-a",
                    "lat": f"{lat1:.6f}" if as_string else lat1,
                    "lng": f"{lng1:.6f}" if as_string else lng1,
                    "streetName": f"Rua Teste {i}",
                    "neighborhood": "Itinga",
                    "city": "Lauro de Freitas",
                    "state": "Bahia",
                    "country": "Brasil",
                    "displayName": f"Rua Teste {i}, Itinga, Lauro de Freitas",
                    "query": "mock",
                },
                {
                    "id": f"c-{i}-b",
                    "lat": lat2,
                    "lng": lng2,
                    "streetName": f"Rua Alternativa {i}",
                    "neighborhood": "Centro",
                    "city": "Lauro de Freitas",
                    "state": "Bahia",
                    "country": "Brasil",
                    "displayName": f"Rua Alternativa {i}, Centro",
                    "query": "mock",
                },
            ]
            return route.fulfill(
                **json_response({"candidates": cands, "autoSelect": False, "message": None})
            )
        if "/api/admin/delivery-streets" in url and method == "GET":
            return route.fulfill(**json_response([]))
        if "/api/delivery/km-config" in url and method == "GET":
            return route.fulfill(
                **json_response(
                    {
                        "id": 1,
                        "enabled": True,
                        "baseAddress": "Loja",
                        "baseLat": "-12.8945",
                        "baseLng": "-38.3271",
                        "minFee": "5",
                        "feePerKm": "2",
                        "maxDistanceKm": "15",
                        "updatedAt": "2026-01-01T00:00:00.000Z",
                        "tiers": [
                            {"fromKm": "0", "toKm": "3", "fee": "5"},
                            {"fromKm": "3", "toKm": "6", "fee": "8"},
                        ],
                    }
                )
            )
        if "/api/admin/km-delivery" in url and method == "GET":
            return route.fulfill(
                **json_response(
                    {
                        "config": {
                            "baseLat": "-12.8945",
                            "baseLng": "-38.3271",
                            "enabled": True,
                        },
                        "tiers": [
                            {"fromKm": "0", "toKm": "3", "fee": "5"},
                            {"fromKm": "3", "toKm": "6", "fee": "8"},
                        ],
                    }
                )
            )
        # Default: continue to real server (static assets etc.)
        return route.continue_()

    page.route("**/api/**", handle)


def main() -> int:
    chrome = os.environ.get("PLAYWRIGHT_CHROME", "/usr/local/bin/google-chrome")
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=chrome)
        context = browser.new_context()
        page = context.new_page()
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        install_mocks(page)

        print(f"Login → {BASE_URL}/admin/login", flush=True)
        page.goto(f"{BASE_URL}/admin/login", wait_until="domcontentloaded", timeout=60000)
        page.locator('input[type="email"]').first.fill("admin@burgergn.com.br")
        page.locator('input[type="password"]').first.fill("burger123")
        page.get_by_role("button", name="ENTRAR").click()
        page.wait_for_timeout(800)

        print("Open /admin/ruas-entrega", flush=True)
        page.goto(f"{BASE_URL}/admin/ruas-entrega", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(500)

        page.get_by_role("button", name="Cadastrar Nova Rua").click()
        page.wait_for_timeout(300)

        selected = 0
        locate_btn = page.locator("button").filter(has_text=re.compile(r"Localizar", re.I))
        for i in range(1, CLICKS + 1):
            addr = ADDRESSES[(i - 1) % len(ADDRESSES)]
            print(
                f"[{i}/{CLICKS}] {addr['street']} / {addr['neighborhood']} / {addr['city']}",
                flush=True,
            )

            page.get_by_placeholder("Ex: Rua São Mateus").fill(addr["street"])
            page.get_by_placeholder("Ex: Itinga").fill(addr["neighborhood"])
            page.locator("label:text-is('Cidade')").locator("xpath=..").locator("input").first.fill(
                addr["city"]
            )
            page.locator("label:text-is('CEP')").locator("xpath=..").locator("input").first.fill(
                addr["cep"]
            )

            locate_btn.first.click(timeout=10000)

            deadline = time.time() + 20
            while time.time() < deadline:
                label = locate_btn.first.inner_text()
                if "localizando" not in label.lower():
                    break
                page.wait_for_timeout(100)

            # Wait for result buttons
            page.wait_for_timeout(150)
            results = page.locator("button").filter(has_text="—")
            if results.count() == 0:
                # Fallback: any result card in results panel
                results = page.locator("div.max-h-56 button")

            if results.count() == 0:
                print("FAIL: no geocode candidates rendered", flush=True)
                page.screenshot(path=f"/tmp/localizar-stress-fail-{i}.png", full_page=True)
                return 1

            results.nth(0 if i % 2 else min(1, results.count() - 1)).click()
            selected += 1
            page.wait_for_timeout(120)

            if has_error_boundary(page):
                print("FAIL: Error Boundary after click", i, flush=True)
                page.screenshot(path=f"/tmp/localizar-stress-fail-{i}.png", full_page=True)
                print("lastUiCrash=", last_crash(page), flush=True)
                return 1
            crash = last_crash(page)
            if crash:
                print("FAIL: lastUiCrash=", crash, flush=True)
                return 1

        # Confirm map img present (no iframe)
        iframe_count = page.locator("iframe").count()
        img_count = page.locator('img[alt="Mapa do endereço selecionado"]').count()
        if iframe_count > 0:
            print(f"FAIL: unexpected iframe count={iframe_count}", flush=True)
            return 1
        if img_count < 1:
            print("FAIL: map img not found", flush=True)
            return 1

        insert_hits = [e for e in page_errors + console_errors if "insertBefore" in e]
        if insert_hits:
            print("FAIL: insertBefore errors:", insert_hits[:5], flush=True)
            return 1
        if page_errors:
            print("FAIL: pageerrors:", page_errors[:5], flush=True)
            return 1

        print(
            f"PASS: {CLICKS} Localizar clicks, {selected} selections, no Error Boundary, no iframe, no lastUiCrash",
            flush=True,
        )
        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
