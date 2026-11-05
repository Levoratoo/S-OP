"""Extend estatistica_previsto.csv through ago-26 using abr-26 as filler."""
from pathlib import Path

p = Path("dados-sistema/estatistica_previsto.csv")
lines = p.read_text(encoding="utf-8-sig").splitlines()
if not lines:
    raise SystemExit("empty")
header = lines[0].split(",")
extra = ["mai-26", "jun-26", "jul-26", "ago-26"]
for m in extra:
    if m not in header:
        header.append(m)
abr_idx = header.index("abr-26")
out = [",".join(header)]
for line in lines[1:]:
    if not line.strip():
        continue
    cols = line.split(",")
    # pad to abr-26 length of original
    while len(cols) < abr_idx + 1:
        cols.append("")
    abr_val = cols[abr_idx] if abr_idx < len(cols) else ""
    while len(cols) < len(header):
        cols.append(abr_val)
    # ensure filler months use abr when empty
    for i, name in enumerate(header):
        if name in extra and (i >= len(cols) or not cols[i].strip()):
            if i < len(cols):
                cols[i] = abr_val
            else:
                cols.append(abr_val)
    out.append(",".join(cols[: len(header)]))
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("header", ",".join(header))
print("rows", len(out) - 1)
