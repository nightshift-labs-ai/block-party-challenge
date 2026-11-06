// Pure game logic for the party rounds (testable without Workers). Formats adapted from challenge-video staples:
// telepathy (match the crowd), greed (shared pot), diamond (find the hidden block).
export const TELEPATHY = [
  { q: "Pick the block everyone else will pick", opts: ["Diamond", "Gold", "Dirt", "TNT"] },
  { q: "Best snack after school?", opts: ["Tteokbokki", "Ramyeon", "Chicken", "Ice cream"] },
  { q: "Pick a number everyone else picks", opts: ["1", "3", "7", "10"] },
  { q: "Which mob would you keep as a pet?", opts: ["Wolf", "Cat", "Creeper", "Axolotl"] },
  { q: "Best way to spend 10,000 won?", opts: ["Snacks", "Game item", "Save it", "Gift"] },
];

// Telepathy: points = number of OTHER players who chose the same option (rewards reading the room).
export function scoreTelepathy(answers) {
  const count = {};
  for (const v of Object.values(answers)) count[v] = (count[v] || 0) + 1;
  const pts = {};
  for (const [id, v] of Object.entries(answers)) pts[id] = (count[v] - 1) * 100;
  return { pts, count };
}

// Greed: everyone secretly takes 0..maxTake coins from a pot. If the total fits in the pot, everyone keeps their take;
// if the crowd was too greedy, nobody gets anything.
export function scoreGreed(answers, pot) {
  let total = 0;
  for (const v of Object.values(answers)) total += v;
  const ok = total <= pot, pts = {};
  for (const [id, v] of Object.entries(answers)) pts[id] = ok ? v * 20 : 0;
  return { pts, total, pot, ok };
}

// Diamond: 5x5 grid, hidden diamond cell. Exact hit 500, otherwise 300 - 100 * Manhattan distance (min 0).
export function scoreDiamond(answers, diamond, size = 5) {
  const pts = {};
  const dr = Math.floor(diamond / size), dc = diamond % size;
  for (const [id, v] of Object.entries(answers)) {
    const d = Math.abs(Math.floor(v / size) - dr) + Math.abs((v % size) - dc);
    pts[id] = d === 0 ? 500 : Math.max(0, 300 - 100 * d);
  }
  return { pts, diamond };
}

export function validAnswer(round, v) {
  if (!Number.isInteger(v)) return false;
  if (round.kind === "telepathy") return v >= 0 && v < round.opts.length;
  if (round.kind === "greed") return v >= 0 && v <= round.maxTake;
  if (round.kind === "diamond") return v >= 0 && v < 25;
  return false;
}

// Build an episode of rounds; rnd is injectable for tests.
export function makeEpisode(nPlayers, rnd = Math.random) {
  const t = [...TELEPATHY].sort(() => rnd() - 0.5);
  const pot = Math.max(10, Math.round(nPlayers * 4));
  return [
    { kind: "telepathy", ...t[0], secs: 15 },
    { kind: "greed", pot, maxTake: 10, secs: 15 },
    { kind: "diamond", diamond: Math.floor(rnd() * 25), secs: 12 },
    { kind: "telepathy", ...t[1], secs: 15 },
    { kind: "greed", pot: Math.max(8, Math.round(nPlayers * 3)), maxTake: 10, secs: 15 },
  ];
}
