// Pure game logic for the party rounds (testable without Workers). Formats adapted from challenge-video staples:
// telepathy (match the crowd), greed (shared pot), diamond (find the hidden block).
export const TELEPATHY = [
  // q/opts in English, qk/ok in Korean. Kid-safe, brand-free, answerable in 15 s.
  { q: "Pick the block everyone else will pick", opts: ["Diamond", "Gold", "Dirt", "TNT"], qk: "모두가 고를 블록은?", ok: ["다이아", "금", "흙", "TNT"] },
  { q: "Best snack after school?", opts: ["Tteokbokki", "Ramyeon", "Chicken", "Ice cream"], qk: "하교 후 최고의 간식은?", ok: ["떡볶이", "라면", "치킨", "아이스크림"] },
  { q: "Pick the number everyone else picks", opts: ["1", "3", "7", "10"], qk: "다들 고를 숫자는?", ok: ["1", "3", "7", "10"] },
  { q: "Which animal would you keep as a pet?", opts: ["Wolf", "Cat", "Fox", "Axolotl"], qk: "키우고 싶은 동물은?", ok: ["늑대", "고양이", "여우", "우파루파"] },
  { q: "Best way to spend 10,000 won?", opts: ["Snacks", "Game item", "Save it", "Gift"], qk: "만 원이 생기면?", ok: ["간식", "게임 아이템", "저금", "선물"] },
  { q: "You find a treasure chest. What's inside?", opts: ["Gold", "Diamonds", "A map", "A trap"], qk: "보물상자 안에 든 것은?", ok: ["금", "다이아", "지도", "함정"] },
  { q: "Best superpower?", opts: ["Fly", "Invisible", "Teleport", "Time stop"], qk: "최고의 초능력은?", ok: ["하늘 날기", "투명인간", "순간이동", "시간 정지"] },
  { q: "Pick a colour everyone picks", opts: ["Red", "Blue", "Green", "Yellow"], qk: "다들 고를 색깔은?", ok: ["빨강", "파랑", "초록", "노랑"] },
  { q: "Where would you build your base?", opts: ["Mountain", "Sea", "Sky", "Underground"], qk: "기지를 짓는다면 어디?", ok: ["산", "바다", "하늘", "지하"] },
  { q: "Most useful tool?", opts: ["Pickaxe", "Sword", "Shovel", "Bucket"], qk: "가장 쓸모 있는 도구는?", ok: ["곡괭이", "칼", "삽", "양동이"] },
  { q: "Best season?", opts: ["Spring", "Summer", "Autumn", "Winter"], qk: "최고의 계절은?", ok: ["봄", "여름", "가을", "겨울"] },
  { q: "Pick the scariest thing", opts: ["Lava", "Ghosts", "Spiders", "Exams"], qk: "제일 무서운 것은?", ok: ["용암", "유령", "거미", "시험"] },
  { q: "Best school lunch?", opts: ["Pork cutlet", "Curry", "Bulgogi", "Spaghetti"], qk: "최고의 급식 메뉴는?", ok: ["돈가스", "카레", "불고기", "스파게티"] },
  { q: "Dream job?", opts: ["YouTuber", "Pro gamer", "Doctor", "Idol"], qk: "장래희망은?", ok: ["유튜버", "프로게이머", "의사", "아이돌"] },
  { q: "If you won 1,000,000 won?", opts: ["Spend it", "Save it", "Share it", "Invest in snacks"], qk: "100만 원에 당첨되면?", ok: ["다 쓴다", "저금한다", "나눈다", "간식에 투자"] },
  { q: "Pick a weather", opts: ["Sunny", "Rain", "Snow", "Storm"], qk: "날씨를 고른다면?", ok: ["맑음", "비", "눈", "폭풍"] },
  { q: "Best pizza topping?", opts: ["Pepperoni", "Potato", "Pineapple", "Cheese only"], qk: "최고의 피자 토핑은?", ok: ["페퍼로니", "포테이토", "파인애플", "치즈만"] },
  { q: "Most annoying sound?", opts: ["Alarm", "Mosquito", "Chalkboard", "Silence"], qk: "제일 짜증나는 소리는?", ok: ["알람", "모기", "칠판 긁기", "정적"] },
  { q: "Pick a direction", opts: ["Left", "Right", "Up", "Down"], qk: "방향을 고른다면?", ok: ["왼쪽", "오른쪽", "위", "아래"] },
  { q: "Best way to escape lava?", opts: ["Jump", "Water bucket", "Build up", "Pray"], qk: "용암 탈출 방법은?", ok: ["점프", "물 양동이", "기둥 쌓기", "기도"] },
  { q: "Which would you choose?", opts: ["Eat only ramyeon", "Never eat ramyeon", "Ramyeon once a year", "Ramyeon with friends"], qk: "당신의 선택은?", ok: ["평생 라면만", "평생 라면 금지", "1년에 한 번", "친구랑만 라면"] },
  { q: "Who wins?", opts: ["100 chickens", "1 giant chicken", "10 cats", "1 tiger"], qk: "누가 이길까?", ok: ["닭 100마리", "거대 닭 1마리", "고양이 10마리", "호랑이 1마리"] },
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

// Lava: 8 of 25 blocks turn to lava after everyone picks. Safe = 150, +50 if nobody else stood on your block.
export function scoreLava(answers, lava) {
  const set = new Set(lava), count = {}, pts = {};
  for (const v of Object.values(answers)) count[v] = (count[v] || 0) + 1;
  for (const [id, v] of Object.entries(answers)) pts[id] = set.has(v) ? 0 : 150 + (count[v] === 1 ? 50 : 0);
  return { pts, lava, count };
}

export function pickLava(rnd = Math.random, n = 8) {
  const cells = [...Array(25).keys()];
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return cells.slice(0, n).sort((a, b) => a - b);
}

export function validAnswer(round, v) {
  if (!Number.isInteger(v)) return false;
  if (round.kind === "telepathy") return v >= 0 && v < round.opts.length;
  if (round.kind === "greed") return v >= 0 && v <= round.maxTake;
  if (round.kind === "diamond" || round.kind === "blockmatch" || round.kind === "lava") return v >= 0 && v < 25;
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
    { kind: "blockmatch", secs: 12 },
    { kind: "telepathy", ...t[1], secs: 15 },
    { kind: "lava", lava: pickLava(rnd), secs: 12 },
    { kind: "greed", pot: Math.max(8, Math.round(nPlayers * 3)), maxTake: 10, secs: 15 },
  ];
}
