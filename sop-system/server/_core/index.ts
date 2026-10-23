import "dotenv/config";
import express from "express";
import { createReadStream } from "fs";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import * as previsaoPythonService from "../previsaoPython";

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(
  startPort: number,
  host: string,
  maxAttempts: number = 200
): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Download binário do Excel oficial do job (mesmo arquivo da pasta do job)
  app.get("/api/previsao-python/jobs/:id/file", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
      const jobId = Number(req.params.id);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        res.status(400).json({ error: "Job invalido." });
        return;
      }
      const file = await previsaoPythonService.getPrevisaoJobOutputFile(jobId);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.fileName.replace(/"/g, "")}"`
      );
      res.setHeader("Cache-Control", "no-store");
      createReadStream(file.filePath).pipe(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no download.";
      const status = message.toLowerCase().includes("nao encontrado") || message.toLowerCase().includes("não encontrado")
        ? 404
        : 401;
      res.status(status).json({ error: message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Development is the default mode; production must be explicit.
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const host = process.env.HOST || "0.0.0.0";
  const preferredPort = parseInt(process.env.PORT || "3012");
  const startPort = Math.max(3012, preferredPort);
  const port = await findAvailablePort(startPort, host);

  if (port !== startPort) {
    console.log(`Port ${startPort} is busy, using port ${port} instead`);
  }

  server.listen(port, host, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (host === "0.0.0.0") {
      console.log(`LAN access enabled on port ${port} (HOST=0.0.0.0).`);
    } else {
      console.log(`Listening on ${host}:${port}`);
    }
  });
}

startServer().catch(console.error);
