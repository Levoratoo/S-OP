from pathlib import Path

p = Path("dados-sistema/de-para-codigos.csv")
lines = p.read_text(encoding="utf-8").splitlines(True)
out = []
for line in lines:
    stripped = line.strip()
    if stripped == '"80.06.001350";"80.06.001583"':
        continue
    line = line.replace(';"80.06.001583"', ';"80.06.001350"')
    out.append(line)
p.write_text("".join(out), encoding="utf-8")
print("rewrote", p)
for line in out:
    if "80.06.001350" in line or "80.06.001583" in line:
        print(line.strip())
