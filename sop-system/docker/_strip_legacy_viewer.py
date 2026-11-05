from pathlib import Path

path = Path(r"client/src/pages/previsao/PrevisaoPythonViewer.tsx")
text = path.read_text(encoding="utf-8")

start = text.find("          {showLegacyDashboard && (")
end_marker = (
    "          )}\n\n          <Card>\n"
    '            <CardHeader>\n'
    '              <CardTitle>{selectedSheet || "Planilha"}</CardTitle>'
)
end = text.find(end_marker)
print("start", start, "end", end)
if start < 0 or end < 0:
    raise SystemExit("markers not found")

new = text[:start] + text[end + len("          )}\n\n") :]

old_btn = (
    "            <Button\n"
    '              variant="outline"\n'
    "              onClick={() => setShowLegacyDashboard(current => !current)}\n"
    "            >\n"
    '              <BarChart3 className="mr-2 h-4 w-4" />\n'
    '              {showLegacyDashboard ? "Ocultar painel antigo" : "Painel antigo"}\n'
    "            </Button>\n"
)
if old_btn not in new:
    raise SystemExit("button not found")
new = new.replace(old_btn, "")

old_state = "  const [showLegacyDashboard, setShowLegacyDashboard] = useState(false);\n"
if old_state not in new:
    raise SystemExit("state not found")
new = new.replace(old_state, "")

path.write_text(new, encoding="utf-8")
print("ok", len(text), "->", len(new))
