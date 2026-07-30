import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const runner = fileURLToPath(new URL("./import-cadastros-sistema-runner.ts", import.meta.url));

const result = spawnSync(process.execPath, [tsxCli, runner, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (result.error) {
  console.error(`Falha ao executar importador: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
