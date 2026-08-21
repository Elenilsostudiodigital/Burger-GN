/**
 * Burger GN — local silent print agent (Windows).
 * Listens on http://127.0.0.1:19191 — no browser print dialog.
 *
 * Start: node tools/burger-gn-print-agent/server.mjs
 * Or:    tools/burger-gn-print-agent/start.bat
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.BGN_PRINT_PORT || 19191);
const HOST = "127.0.0.1";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function listPrinters() {
  const ps = `
$ErrorActionPreference = 'Stop'
Get-Printer | Select-Object Name, PrinterStatus, DriverName, PortName |
  ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout || "[]");
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return rows.map((r) => {
    const statusCode = Number(r.PrinterStatus);
    let status = "connected";
    if (statusCode === 1) status = "offline"; // Other / paused variants vary
    if (statusCode === 3 || statusCode === 4 || statusCode === 5) status = "error";
    // PrinterStatus enum: 0 Normal, often maps as string "Normal" when serialized oddly
    const name = String(r.Name || "");
    const rawStatus = String(r.PrinterStatus ?? "");
    if (/offline/i.test(rawStatus)) status = "offline";
    else if (/error|jam|door/i.test(rawStatus)) status = "error";
    else if (/normal|idle|printing|0/i.test(rawStatus) || statusCode === 0) status = "connected";
    return {
      id: `os:${name}`,
      name,
      connection: "system",
      status,
      driverName: r.DriverName || "",
      portName: r.PortName || "",
    };
  });
}

/**
 * Silent raw print via Win32 WritePrinter (no print dialog).
 */
async function rawPrint(printerName, text, copies = 1) {
  const safeName = String(printerName || "").replace(/'/g, "''");
  const n = Math.max(1, Math.min(4, Number(copies) || 1));
  const tmp = path.join(
    os.tmpdir(),
    `bgn-print-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  );
  // ESC/POS init + text + feed + cut (partial cut where supported)
  const payload =
    "\x1B\x40" + // init
    String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n") +
    "\n\n\n" +
    "\x1D\x56\x00"; // full cut
  fs.writeFileSync(tmp, payload, "binary");

  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class BgnRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool SendBytes(string printer, byte[] bytes) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    var di = new DOCINFOA();
    di.pDocName = "Burger GN";
    di.pDataType = "RAW";
    if (!StartDocPrinter(h, 1, di)) { ClosePrinter(h); return false; }
    if (!StartPagePrinter(h)) { EndDocPrinter(h); ClosePrinter(h); return false; }
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(h, p, bytes.Length, out written);
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return ok;
  }
  public static bool SendFile(string printer, string path) {
    return SendBytes(printer, File.ReadAllBytes(path));
  }
}
"@
$path = '${tmp.replace(/'/g, "''")}'
$printer = '${safeName}'
$copies = ${n}
for ($i = 0; $i -lt $copies; $i++) {
  $ok = [BgnRawPrinter]::SendFile($printer, $path)
  if (-not $ok) { throw "WritePrinter failed for $printer (Win32=$( [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()).Message ))" }
}
Write-Output "ok"
`;

  try {
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    );
    if (!String(stdout).includes("ok")) {
      throw new Error(stderr || stdout || "print failed");
    }
    return { ok: true, printerName, copies: n };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "burger-gn-print-agent",
        version: "1.0.0",
        host: HOST,
        port: PORT,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      const printers = await listPrinters();
      sendJson(res, 200, { printers });
      return;
    }

    if (req.method === "POST" && url.pathname === "/print") {
      const body = await readBody(req);
      const printerName = String(body.printerName || "").trim();
      const text = String(body.text || "");
      const copies = Math.max(1, Math.min(4, Number(body.copies) || 1));
      if (!printerName) {
        sendJson(res, 400, { ok: false, error: "Informe printerName." });
        return;
      }
      if (!text.trim()) {
        sendJson(res, 400, { ok: false, error: "Informe o texto para impressão." });
        return;
      }
      const result = await rawPrint(printerName, text, copies);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[burger-gn-print-agent] http://${HOST}:${PORT}`);
});
