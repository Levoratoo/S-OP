import type { ConfigPipedrive } from "@shared/pipedrive-config";
import type {
  CampoPipedrive,
  DealPipedrive,
  DealProdutoPipedrive,
  EtapaPipedrive,
  FunilPipedrive,
  OrgPipedrive,
  PacotePipedrive,
  ProdutoPipedrive,
  UsuarioPipedrive,
} from "@shared/pipedrive-crm";
import { fatiarLista, PipedriveClient } from "./client";

const CACHE_CAMPOS_MS = 10 * 60 * 1000;

type CacheCampos = {
  expira: number;
  dealFields: CampoPipedrive[];
  productFields: CampoPipedrive[];
};

let cacheCampos: CacheCampos | null = null;

export function limparCacheCamposPipedrive() {
  cacheCampos = null;
}

function idsUnicos(ids: Array<number | null | undefined>): number[] {
  const vistos = new Set<number>();
  const saida: number[] = [];
  for (const id of ids) {
    if (id == null || !Number.isFinite(id) || vistos.has(id)) continue;
    vistos.add(id);
    saida.push(id);
  }
  return saida;
}

async function listarPorIds<T extends { id: number }>(
  client: PipedriveClient,
  path: string,
  param: string,
  ids: number[]
): Promise<T[]> {
  const lotes = fatiarLista(ids, 100);
  const partes = await Promise.all(
    lotes.map(lote => client.listarV2<T>(path, { [param]: lote.join(",") }))
  );
  return partes.flat();
}

export async function extrairPipedrive(
  client: PipedriveClient,
  config: ConfigPipedrive,
  agora = Date.now()
): Promise<PacotePipedrive> {
  const deals = await client.listarV2<DealPipedrive>("/api/v2/deals", {
    pipeline_id: config.pipelineId,
    status: "open",
  });

  let dealFields: CampoPipedrive[];
  let productFields: CampoPipedrive[];
  if (cacheCampos && cacheCampos.expira > agora) {
    dealFields = cacheCampos.dealFields;
    productFields = cacheCampos.productFields;
  } else {
    [dealFields, productFields] = await Promise.all([
      client.listarV1<CampoPipedrive>("/v1/dealFields", {}),
      client.listarV1<CampoPipedrive>("/v1/productFields", {}),
    ]);
    cacheCampos = { expira: agora + CACHE_CAMPOS_MS, dealFields, productFields };
  }

  const [users, stages, pipelines] = await Promise.all([
    client.listarV1<UsuarioPipedrive>("/v1/users", {}),
    client.listarV1<EtapaPipedrive>("/v1/stages", {}),
    client.listarV1<FunilPipedrive>("/v1/pipelines", {}),
  ]);

  const dealIds = idsUnicos(deals.map(deal => Number(deal.id)));
  const dealProducts = dealIds.length
    ? await listarPorIds<DealProdutoPipedrive>(client, "/api/v2/deals/products", "deal_ids", dealIds)
    : [];
  const productIds = idsUnicos(dealProducts.map(item => (item.product_id == null ? null : Number(item.product_id))));
  const orgIds = idsUnicos(deals.map(deal => {
    const org = deal.org_id;
    if (typeof org === "number") return org;
    if (org && typeof org === "object" && org.id != null) return Number(org.id);
    return null;
  }));
  const [products, organizations] = await Promise.all([
    productIds.length
      ? listarPorIds<ProdutoPipedrive>(client, "/api/v2/products", "ids", productIds)
      : Promise.resolve([]),
    orgIds.length
      ? listarPorIds<OrgPipedrive>(client, "/api/v2/organizations", "ids", orgIds)
      : Promise.resolve([]),
  ]);

  return {
    deals,
    dealProducts,
    products,
    organizations,
    users,
    stages,
    pipelines,
    dealFields,
    productFields,
  };
}
