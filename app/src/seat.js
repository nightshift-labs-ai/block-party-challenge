// Seat links are HMAC-signed (secret SEAT_SECRET; a fixed dev value locally) so a seat can't be typed by hand.
export async function seatSig(env, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SEAT_SECRET || "dev-only-seat-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...mac.slice(0, 8)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function seatCode(env, date, rank, tok) {
  const id = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tok)))].slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
  const msg = `${date}.${rank}.${id}`; return `${msg}.${await seatSig(env, msg)}`;
}
// Returns {date, rank, id} for a valid seat code (signature ok, not past its weekly final), else null.
export async function checkSeat(env, code, now = Date.now()) {
  const p = String(code || "").split(".");
  if (p.length !== 4 || !/^\d{4}-\d\d-\d\d$/.test(p[0]) || !/^[1-9]$/.test(p[1])) return null;
  if ((await seatSig(env, `${p[0]}.${p[1]}.${p[2]}`)) !== p[3]) return null;
  // valid from its qualifying day until the end of its final day (the Saturday on/after the NEXT day, Korean time; s63)
  const day = Date.parse(p[0] + "T00:00:00Z"), next = day + 864e5, fin = next + ((6 - new Date(next).getUTCDay() + 7) % 7) * 864e5, today = Date.parse(new Date(now + 9 * 3600e3).toISOString().slice(0, 10) + "T00:00:00Z");
  return today >= day && today <= fin ? { date: p[0], rank: +p[1], id: `${p[0]}.${p[1]}.${p[2]}` } : null;
}
