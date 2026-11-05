const base = "http://192.168.1.82:3042/api/trpc";

async function get(path, input) {
  const url =
    base +
    "/" +
    path +
    (input != null
      ? "?input=" + encodeURIComponent(JSON.stringify({ json: input }))
      : "");
  const j = await (await fetch(url)).json();
  return j?.result?.data?.json || j?.error?.json || j;
}

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

console.log("mesFechado", await get("faturamento.mesFechadoCheck"));

console.log("desagregar job5...");
const des = await post("cicloComercial.desagregarDoJob", {
  jobId: 5,
  nomeCiclo: "E2E Paridade Word " + new Date().toISOString().slice(0, 16),
});
console.log("desagregar", JSON.stringify(des, null, 2).slice(0, 4000));

const cicloId = des?.ciclo?.id || des?.id || des?.cicloId;
if (cicloId) {
  const rp = await get("cicloComercial.resumoProd", { cicloId });
  console.log("resumoProd", JSON.stringify(rp, null, 2).slice(0, 2500));
}

console.log("createFromSistema...");
const created = await post("previsaoPython.createFromSistema", {});
console.log("create", JSON.stringify(created, null, 2).slice(0, 4000));
const jobId = created?.job?.id;
if (jobId) {
  console.log("polling job", jobId);
  for (;;) {
    await new Promise((r) => setTimeout(r, 20000));
    const job = await get("previsaoPython.getById", { id: jobId });
    console.log(new Date().toISOString(), job?.status, job?.message, "hash", job?.scriptHash);
    if (["SUCCESS", "FAILED", "ERROR"].includes(job?.status) || job?.code) {
      console.log(JSON.stringify(job, null, 2).slice(0, 2500));
      break;
    }
  }
}
