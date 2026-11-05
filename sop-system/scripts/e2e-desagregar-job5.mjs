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

const jobs = await get("previsaoPython.list", { limit: 3 });
console.log("jobs", JSON.stringify(jobs, null, 2).slice(0, 1200));

const des = await post("cicloComercial.desagregarDoJob", {
  jobId: 5,
  nomeCiclo: "E2E Paridade Word " + new Date().toISOString().slice(0, 16),
});
console.log("desagregar", JSON.stringify(des, null, 2).slice(0, 5000));
