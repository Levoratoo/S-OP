import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://192.168.1.82:3042"


def main() -> None:
    jar = urllib.request.HTTPCookieProcessor()
    op = urllib.request.build_opener(jar)
    op.open(f"{BASE}/api/auth/local-login", timeout=30)
    cookie = "; ".join(f"{c.name}={c.value}" for c in jar.cookiejar)

    def post(path: str, data):
        body = json.dumps({"json": data}).encode()
        req = urllib.request.Request(
            f"{BASE}/api/trpc/{path}",
            data=body,
            headers={"Cookie": cookie, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with op.open(req, timeout=300) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode())

    def get(path: str, data=None):
        payload = {} if data is None else data
        q = urllib.parse.quote(json.dumps({"json": payload}, separators=(",", ":")))
        req = urllib.request.Request(
            f"{BASE}/api/trpc/{path}?input={q}",
            headers={"Cookie": cookie},
        )
        with op.open(req, timeout=60) as resp:
            return json.loads(resp.read().decode())["result"]["data"]["json"]

    # Clear leftover 1-row faturamento from audit so ETL 4xx is testable
    status, cleared = post("faturamento.clear", None)
    print("clear faturamento", status, cleared)

    status, etl = post("previsaoPython.createFromSistema", {})
    err = etl.get("error", {}).get("json", {})
    print("ETL empty status", status, "code", err.get("data", {}).get("code"), "msg", err.get("message", "")[:120])

    status, seed = post("cadastrosSistema.seedOperacional", {"dryRun": False})
    print("seed status", status)
    if status >= 400:
        print(json.dumps(seed, ensure_ascii=False)[:800])
        return
    data = seed["result"]["data"]["json"]
    print(
        "seed totals",
        data["importacao"]["totals"],
        "marcas+",
        data["marcasCriadas"],
        "gestores+",
        data["gestoresCriados"],
        "vinculos+",
        data["vinculosCriados"],
        "saz",
        data["sazonalidade"],
        "fatals",
        data["importacao"]["fatalErrors"][:3],
    )
    print("marcas", len(get("marcas.list")))
    print("gestores", len(get("gestores.list")))
    print("gestorMarca", len(get("gestorMarca.list")))
    print("dePara", len(get("deParaCodigos.list")))
    print("linhas", len(get("linhas.list")))
    print("turnos", len(get("turnos.list")))


if __name__ == "__main__":
    main()
