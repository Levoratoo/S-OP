import { resolveCodigoAtual } from "./de-para-map";

/** Soma quantidades de vários SKUs antigos no canônico (N:1 e cadeia transitiva). */
export function somarHistoricoNoSkuCanonico(
  linhas: Array<{ sku: string; qtd: number }>,
  dePara: Map<string, string>
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const linha of linhas) {
    const canon = resolveCodigoAtual(linha.sku, dePara).trim().toUpperCase();
    acc.set(canon, (acc.get(canon) ?? 0) + linha.qtd);
  }
  return acc;
}

export function diagnosticarDePara(rows: Array<{ skuAntigo: string; skuNovo: string }>) {
  const porNovo = new Map<string, string[]>();
  const porAntigo = new Map<string, string>();
  const conflitos1n: string[] = [];
  for (const row of rows) {
    const a = row.skuAntigo.trim().toUpperCase();
    const n = row.skuNovo.trim().toUpperCase();
    if (porAntigo.has(a) && porAntigo.get(a) !== n) conflitos1n.push(a);
    porAntigo.set(a, n);
    const list = porNovo.get(n) ?? [];
    list.push(a);
    porNovo.set(n, list);
  }
  const nPara1 = [...porNovo.entries()].filter(([, antigos]) => antigos.length > 1);
  const loops: string[] = [];
  for (const start of porAntigo.keys()) {
    const seen = new Set<string>();
    let cur = start;
    while (porAntigo.has(cur)) {
      if (seen.has(cur)) {
        loops.push([...seen, cur].join(" → "));
        break;
      }
      seen.add(cur);
      cur = porAntigo.get(cur)!;
    }
  }
  return {
    total: rows.length,
    gruposNpara1: nPara1.length,
    exemplosNpara1: nPara1.slice(0, 20).map(([novo, antigos]) => ({ novo, antigos })),
    conflitos1n,
    loops,
  };
}
