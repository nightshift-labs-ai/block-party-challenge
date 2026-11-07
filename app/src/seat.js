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
// Returns {date, rank} for a valid seat code issued in the last 7 Korean days, else null.
export async function checkSeat(env, code, now = Date.now()) {
  const p = String(code || "").split(".");
  if (p.length !== 4 || !/^\d{4}-\d\d-\d\d$/.test(p[0]) || !/^[1-9]$/.test(p[1])) return null;
  if ((await seatSig(env, `${p[0]}.${p[1]}.${p[2]}`)) !== p[3]) return null;
  const age = (now + 9 * 3600e3 - Date.parse(p[0] + "T00:00:00Z")) / 864e5;
  return age >= 0 && age < 8 ? { date: p[0], rank: +p[1] } : null;
}
