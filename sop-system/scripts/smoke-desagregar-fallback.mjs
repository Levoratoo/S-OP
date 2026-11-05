const base = "http://192.168.1.82:3042/api/trpc";

async function post(path, body) {
  const j = await (
    await fetch(base + "/" + path + "?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: body ?? {} } }),
    })
  ).json();
  return j?.[0]?.result?.data?.json || j?.[0]?.error?.json || j;
}

async function get(path, input) {
  const url =
    base +
    "/" +
    path +
    "?input=" +
    encodeURIComponent(JSON.stringify({ json: input }));
  const j = await (await fetch(url)).json();
  return j?.result?.data?.json || j?.error?.json || j;
}

const des = await post("cicloComercial.desagregarDoJob", {
  jobId: 6,
  nomeCiclo: "Ciclo job6 fallback rateio " + new Date().toISOString().slice(0, 16),
});
console.log("desagregar", JSON.stringify(des, null, 2));
const cicloId = des?.cicloId || des?.ciclo?.id;
if (!cicloId) process.exit(1);

const ciclo = await get("cicloComercial.getById", { id: cicloId });
console.log("obs", ciclo?.observacoes || des?.observacoes);
const rp = await get("cicloComercial.resumoProd", { cicloId });
console.log("resumo rows", rp?.rows?.length);
const brands = new Set(
  (rp?.rows || [])
    .filter((r) => ["Milon", "Toli", "Luz Da Lua"].includes(r.marca))
    .map((r) => `${r.tipoEstoque}-${r.marca}-${r.linha}`)
);
console.log("recovered groups", [...brands].sort());
