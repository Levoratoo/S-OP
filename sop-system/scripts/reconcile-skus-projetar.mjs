import fs from "node:fs";
import path from "node:path";

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const delim = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g, "").trim());
  return {
    delim,
    headers,
    rows: lines.slice(1).map(line => {
      const cols = line.split(delim);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = String(cols[index] ?? "")
          .replace(/^"|"$/g, "")
          .trim();
      });
      return row;
    }),
  };
}

const dir = path.resolve("dados-sistema");
const cad = parseCsv(path.join(dir, "estatistica_cadastros.csv"));
const projPath = path.join(dir, "estatistica_skus_projetar.csv");
const proj = parseCsv(projPath);

const official = new Set();
for (const row of cad.rows) {
  for (const key of ["Cod Item", "cod_item", "SKU NOVO", "sku_novo"]) {
    const value = (row[key] || "").trim().toUpperCase();
    if (value) official.add(value);
  }
}

function skuOf(row) {
  return (row.sku_ajustado || row.sku_novo || row.cod_item || row["Cod Item"] || "").trim();
}

const kept = [];
const removed = [];
for (const row of proj.rows) {
  const sku = skuOf(row);
  if (!sku) continue;
  if (official.has(sku.toUpperCase())) kept.push(row);
  else removed.push(sku);
}

const out = [
  proj.headers.join(proj.delim),
  ...kept.map(row => proj.headers.map(header => row[header] ?? "").join(proj.delim)),
].join("\n");

fs.writeFileSync(projPath, `${out}\n`, "utf8");
fs.writeFileSync(
  path.join(dir, "skus_projetar_removidos_sem_cadastro.txt"),
  removed.sort().join("\n") + "\n",
  "utf8"
);

console.log(
  JSON.stringify(
    {
      kept: kept.length,
      removed: removed.length,
      removedSkus: removed.sort(),
    },
    null,
    2
  )
);
