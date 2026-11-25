import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("docker/env_merge.py");

function merge(remote: string, managed: Record<string, string>, fill: Record<string, string> = {}) {
  const raw = execFileSync("python3", [script], {
    input: JSON.stringify({ remote, managed, fill_if_absent: fill }),
    encoding: "utf8",
  });
  return JSON.parse(raw) as {
    merged: string;
    updated: number;
    preserved: number;
    added: number;
    changed: boolean;
  };
}

describe("deploy env merge", () => {
  it("preserva PIPEDRIVE e chaves desconhecidas e só atualiza as gerenciadas", () => {
    const token = "token-de-teste-nao-logar";
    const erp = "senha-erp-de-teste";
    const result = merge(
      [
        "# segredos do servidor",
        "APP_PORT=3042",
        `PIPEDRIVE_API_TOKEN=${token}`,
        `ERP_MSSQL_PASSWORD=${erp}`,
        "OUTRA_CHAVE=mantida",
        "PREVISAO_PYTHON_TIMEOUT_MIN=15",
      ].join("\n"),
      { APP_PORT: "3042", PREVISAO_PYTHON_TIMEOUT_MIN: "70" },
      { ERP_MSSQL_PASSWORD: "nao-deve-substituir", ERP_NOVO: "preenchido-do-local" }
    );

    expect(result.merged).toContain(`PIPEDRIVE_API_TOKEN=${token}`);
    expect(result.merged).toContain(`ERP_MSSQL_PASSWORD=${erp}`);
    expect(result.merged).toContain("OUTRA_CHAVE=mantida");
    expect(result.merged).toContain("# segredos do servidor");
    expect(result.merged).toContain("PREVISAO_PYTHON_TIMEOUT_MIN=70");
    expect(result.merged).toContain("ERP_NOVO=preenchido-do-local");
    expect(result.merged).not.toContain("nao-deve-substituir");
    expect(result.preserved).toBe(3);
    expect(result.changed).toBe(true);

    const deNovo = merge(result.merged, { APP_PORT: "3042", PREVISAO_PYTHON_TIMEOUT_MIN: "70" }, {});
    expect(deNovo.changed).toBe(false);
    expect(deNovo.merged).toContain(`PIPEDRIVE_API_TOKEN=${token}`);
  });
});
