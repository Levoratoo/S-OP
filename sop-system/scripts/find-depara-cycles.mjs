import fs from "node:fs";
import path from "node:path";

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    return row;
  });
}

const dir = path.resolve("dados-sistema");
const pairs = new Map();

const cad = parseCsv(fs.readFileSync(path.join(dir, "estatistica_cadastros.csv"), "utf8"));
for (const r of cad) {
  const a = (r["Cod Item"] || "").trim();
  const n = (r["SKU NOVO"] || "").trim();
  if (a && n && a.toUpperCase() !== n.toUpperCase()) pairs.set(a.toUpperCase(), n);
}

const dp = parseCsv(fs.readFileSync(path.join(dir, "de-para-codigos.csv"), "utf8"));
for (const r of dp) {
  const a = (r["SKU Antigo"] || r.sku_antigo || "").trim();
  const n = (r["SKU Novo"] || r.sku_novo || "").trim();
  if (a && n && a.toUpperCase() !== n.toUpperCase()) pairs.set(a.toUpperCase(), n);
}

const cycles = new Map();
for (const start of pairs.keys()) {
  const pathArr = [];
  const seen = new Set();
  let cur = start;
  while (pairs.has(cur)) {
    if (seen.has(cur)) {
      const i = pathArr.indexOf(cur);
      const cyc = [...pathArr.slice(i), cur];
      cycles.set(cyc.join(" -> "), cyc);
      break;
    }
    seen.add(cur);
    pathArr.push(cur);
    cur = pairs.get(cur).trim().toUpperCase();
  }
}

console.log("pairs", pairs.size, "cycles", cycles.size);
for (const k of cycles.keys()) console.log(k);
