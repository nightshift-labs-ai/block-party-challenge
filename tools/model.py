# Funnel model for docs/BUSINESS.md. All inputs are assumptions (labelled in the doc). python3 tools/model.py
S = {  # scenario: shorts/month featuring the game, views/short, view->player join rate, monthly retention,
       # fan pass conv (of MAU), cosmetics buyers (of MAU), sponsored episodes/month, classroom licences at month 12
  "Conservative": dict(shorts=1, views=300_000, join=0.005, ret=0.25, fp=0.005, cos=0.01, spons=0, cls=10),
  "Base":         dict(shorts=2, views=800_000, join=0.01,  ret=0.30, fp=0.01,  cos=0.02, spons=1, cls=40),
  "Optimistic":   dict(shorts=2, views=1_700_000, join=0.02, ret=0.35, fp=0.015, cos=0.03, spons=2, cls=100),
}
FP, COS, SPONS, CLS, FEES, CREATOR = 4900, 3000, 2_000_000, 9900, 0.10, 0.20
KRW_USD = 1 / 1380
out = {}
for name, a in S.items():
    mau = 0; rows = []
    for m in range(1, 13):
        new = a["shorts"] * a["views"] * a["join"]
        mau = mau * a["ret"] + new
        cls = round(a["cls"] * m / 12)
        gross = mau * a["fp"] * FP + mau * a["cos"] * COS + (a["spons"] * SPONS if m >= 3 else 0) + cls * CLS
        rows.append((m, mau, gross))
    y = sum(r[2] for r in rows); net = y * (1 - FEES)
    out[name] = (rows[-1][1], rows[-1][2], y, net, net * CREATOR)
    print(f"{name:12s} MAU m12 {rows[-1][1]:>9,.0f}  gross m12 ₩{rows[-1][2]:>12,.0f}  year-1 gross ₩{y:>13,.0f} (${y*KRW_USD:,.0f})  net ₩{net:,.0f}  creator 20% ₩{net*CREATOR:,.0f} (${net*CREATOR*KRW_USD:,.0f})")
