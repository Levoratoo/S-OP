import { createHash } from "node:crypto";

export function hashPreviaPipedrive(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
