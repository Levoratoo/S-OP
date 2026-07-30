import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  importSystemCadastros,
  type ImportSystemCadastrosSummary,
} from "../server/services/system-cadastros-importer";

type CliArgs = {
  dirPath: string;
  dryRun: boolean;
  only: string[];
};

function defaultDirPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const scriptsDir = path.dirname(currentFile);
  const workspaceRoot = path.resolve(scriptsDir, "..", "..");
  return path.join(workspaceRoot, "dados sistema");
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    dirPath: defaultDirPath(),
    dryRun: false,
    only: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }

    if (arg === "--dir") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Parametro --dir precisa de um caminho.");
      }
      result.dirPath = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }

    if (arg === "--only") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Parametro --only precisa de valor.");
      }
      const parsed = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      result.only.push(...parsed);
      i += 1;
      continue;
    }

    throw new Error(`Parametro desconhecido: ${arg}`);
  }

  return result;
}

function printSummary(summary: ImportSystemCadastrosSummary): void {
  console.log("");
  console.log("Resumo da importacao:");
  console.log(`- Diretorio: ${summary.dirPath}`);
  console.log(`- Modo: ${summary.dryRun ? "DRY-RUN (sem gravacao)" : "EXECUCAO"}`);
  console.log(`- Arquivos processados: ${summary.files.length}`);
  console.log(`- Inseridos: ${summary.totals.inserted}`);
  console.log(`- Atualizados: ${summary.totals.updated}`);
  console.log(`- Ignorados: ${summary.totals.skipped}`);
  console.log(`- Erros de linha: ${summary.totals.errors}`);
  console.log(
    `- Duracao: ${Math.max(
      1,
      Math.round((summary.finishedAt.getTime() - summary.startedAt.getTime()) / 1000)
    )}s`
  );

  if (summary.fatalErrors.length > 0) {
    console.log("");
    console.log("Erros fatais:");
    summary.fatalErrors.forEach((error) => console.log(`- ${error}`));
  }

  const filesWithWarnings = summary.files.filter((file) => file.warnings.length > 0);
  if (filesWithWarnings.length > 0) {
    console.log("");
    console.log("Warnings (amostra):");
    filesWithWarnings.forEach((file) => {
      console.log(`- ${file.fileName}`);
      file.warnings.slice(0, 5).forEach((warning) => console.log(`  * ${warning}`));
      if (file.warnings.length > 5) {
        console.log(`  * ... +${file.warnings.length - 5} warning(s)`);
      }
    });
  }
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = await importSystemCadastros({
      dirPath: args.dirPath,
      dryRun: args.dryRun,
      only: args.only,
      logger: (message) => console.log(message),
    });

    printSummary(summary);

    process.exit(summary.fatalErrors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(
      `Falha na importacao: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

main();
