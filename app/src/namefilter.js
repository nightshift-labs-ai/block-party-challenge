// Nickname safety filter. Player names are shown on a live stream watched by kids, so names that contain
// common English or Korean insults/slurs/sexual terms are replaced with a friendly generated name.
// Normalisation defeats the usual tricks: case, spaces/dots/underscores between letters, leetspeak (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
// Lists are intentionally short and high-precision (substring match); ambiguous short words are matched only as the whole name.
const SUBSTR = [
  // English
  "fuck", "fuk", "fck", "shit", "bitch", "cunt", "nigg", "nigga", "faggot", "fag", "retard", "porn", "penis", "vagina",
  "pussy", "dick", "cock", "whore", "slut", "nazi", "hitler", "boob", "dildo", "sexy", "sex", "killyourself",
  // Korean (Hangul + common initial-consonant forms)
  "씨발", "시발", "씨빨", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "개새", "ㄱㅅㄲ", "새끼", "좆", "존나", "ㅈㄴ", "지랄", "ㅈㄹ", "닥쳐", "느금", "니애미", "애미", "애비",
  "엠창", "섹스", "야동", "보지", "자지", "꼴리", "창녀", "걸레", "자살", "김치녀", "틀딱",
];
const WHOLE = ["ass", "arse", "rape", "rapist", "anal", "kys", "tit", "tits", "cum", "hoe", "ho", "jap", "kkk", "milf", "wtf", "stfu", "미친", "미친놈", "또라이", "븅신"];
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

export function normalise(name) {
  return String(name || "").toLowerCase().replace(/[013457@$!]/g, c => LEET[c]).replace(/[^\p{L}\p{N}]/gu, "");
}

export function isUnsafeName(name) {
  const n = normalise(name);
  if (!n) return false;
  if (WHOLE.includes(n)) return true;
  // also collapse repeated letters ("fuuuck" → "fuck")
  const c = n.replace(/(.)\1+/g, "$1");
  return SUBSTR.some(w => n.includes(w) || c.includes(w));
}

const ADJ = ["Happy", "Swift", "Brave", "Lucky", "Sunny", "Jolly", "Bold", "Cool"];
const NOUN = ["Fox", "Bee", "Slime", "Panda", "Golem", "Gem", "Cat", "Owl"];
// Deterministic friendly replacement so the same player keeps the same name on reconnect.
export function friendlyName(seed) {
  let h = 0; for (const ch of String(seed || Math.random())) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ADJ[h % ADJ.length] + NOUN[(h >>> 3) % NOUN.length] + (h % 90 + 10);
}

// Returns a name that is safe to show: the original if clean, otherwise a friendly generated one.
export function safeName(name, seed) {
  return isUnsafeName(name) ? friendlyName(seed ?? name).slice(0, 12) : name;
}
