/**
 * Burger GN — print agent watchdog.
 * Keeps http://127.0.0.1:19191 alive: starts the agent, restarts it if it dies.
 *
 * A second instance exits immediately (lock port), so Scheduled Task /
 * Startup / protocol handler can all invoke this safely.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BGN_PRINT_PORT || 19191);
const LOCK_PORT = Number(process.env.BGN_PRINT_LOCK_PORT || 19192);
const HOST = "127.0.0.1";
const LOG = path.join(dir, "agent.log");
const SERVER = path.join(dir, "server.mjs");

let child = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG, line);
    const st = fs.statSync(LOG);
    if (st.size > 512 * 1024) {
      const txt = fs.readFileSync(LOG, "utf8");
      fs.writeFileSync(LOG, txt.slice(-24_000));
    }
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function health() {
  try {
    const res = await fetch(`http://${HOST}:${PORT}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.ok;
  } catch {
    return false;
  }
}

function startChild() {
  if (child && !child.killed) return;
  log("starting print agent");
  child = spawn(process.execPath, [SERVER], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: false,
    env: { ...process.env, BGN_PRINT_PORT: String(PORT) },
  });
  child.stdout?.on("data", (buf) => log(`agent: ${String(buf).trim()}`));
  child.stderr?.on("data", (buf) => log(`agent-err: ${String(buf).trim()}`));
  child.on("exit", (code, signal) => {
    log(`agent exited code=${code} signal=${signal || ""}`);
    child = null;
  });
}

async function loop() {
  log(`watchdog online (agent :${PORT}, lock :${LOCK_PORT})`);
  while (true) {
    if (!(await health())) {
      startChild();
      await sleep(1500);
      if (!(await health())) {
        log("agent health still failing — will retry");
      } else {
        log("agent healthy");
      }
    }
    await sleep(3000);
  }
}

function acquireLock() {
  return new Promise((resolve) => {
    const lock = net.createServer();
    lock.unref();
    lock.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        log("watchdog already running — exiting");
        resolve(false);
        return;
      }
      log(`lock error: ${err?.message || err}`);
      resolve(false);
    });
    lock.listen(LOCK_PORT, HOST, () => resolve(true));
  });
}

const gotLock = await acquireLock();
if (!gotLock) process.exit(0);
await loop();
