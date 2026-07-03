---
name: window.print() breaks e2e automation
description: Clicking a UI element that triggers window.print() can hang or freeze Playwright-driven browser tests.
---

Buttons/flows that call `window.open()` + `window.print()` (e.g. a receipt/print button opening a popup window with `window.onload = () => window.print()`) can cause the automated test browser to hang indefinitely once clicked — subsequent clicks, reloads, and even `page.goto()` calls may time out afterward.

**Why:** In some automation environments the print action opens a real, blocking native dialog (or otherwise stalls the render loop) rather than being a safe no-op like in fully headless Chromium. Once triggered, the browser context can become unresponsive for the rest of the test run.

**How to apply:** When e2e-testing a page with a print button, do not click it. Instead, verify the button is present/enabled, and rely on code review to confirm the print HTML/logic is correct. For other `window.open()` actions (e.g. WhatsApp deep links) that don't call `window.print()`, it's safe to click and assert via Playwright's `popup` event listener registered before the click.
