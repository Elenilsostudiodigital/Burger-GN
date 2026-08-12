/**
 * Self-check for CSV parse + column mapping (plain JS, no deps).
 * Run: node artifacts/burger-gn/src/lib/csv/csvImport.selftest.mjs
 */

function normalizeHeader(h) {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectDelimiter(sample) {
  const firstLine = sample.split(/\r?\n/).find((l) => l.trim()) || "";
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  let best = ";";
  let bestCount = -1;
  for (const [d, c] of Object.entries(counts)) {
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return bestCount > 0 ? best : ";";
}

function parseLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(raw) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delim = detectDelimiter(text);
  const lines = text.split("\n").filter((l, idx, arr) => !(idx === arr.length - 1 && !l.trim()));
  const headers = parseLine(lines[0], delim);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseLine(lines[i], delim);
    while (cells.length < headers.length) cells.push("");
    rows.push(cells.slice(0, headers.length));
  }
  return { headers, rows, delimiter: delim };
}

const MATCHERS = [
  { target: "name", patterns: [/^nome( do cliente)?$/, /^name$/] },
  { target: "phone", patterns: [/^telefone$/, /^whatsapp$/] },
  { target: "celular", patterns: [/^celular$/] },
  { target: "email", patterns: [/^e?-?mail$/] },
  { target: "cashback", patterns: [/^cashback$/, /^saldo$/] },
  { target: "stamps", patterns: [/^selos?$/] },
  { target: "clubPoints", patterns: [/^pontos?$/] },
  { target: "birthDate", patterns: [/^nascimento$/, /^data de nascimento$/] },
];

function guess(header) {
  const norm = normalizeHeader(header);
  for (const m of MATCHERS) {
    if (m.patterns.some((re) => re.test(norm))) return m.target;
  }
  return "ignore";
}

const sample = `Nome;Telefone;Celular;Cashback;Selos;Pontos;Nascimento;Email
João Silva;71999990000;71988887777;12,50;3;100;15/03/1990;joao@email.com
`;

const parsed = parseCsv(sample);
if (parsed.delimiter !== ";") throw new Error("delimiter");
const targets = parsed.headers.map(guess);
for (const t of ["name", "phone", "celular", "cashback", "stamps", "clubPoints", "birthDate", "email"]) {
  if (!targets.includes(t)) throw new Error("missing map " + t);
}
console.log("csvImport.selftest OK", { headers: parsed.headers.length, rows: parsed.rows.length });
