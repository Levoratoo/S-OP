import { TRPCError } from "@trpc/server";

/** APIs legadas desativadas na Parte 2 (ERP / CRM only). */
export function legacyApiDisabled(feature: string): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `${feature} foi desativado. Use sincronização ERP ou importação CRM na Colaboração Comercial.`,
  });
}
