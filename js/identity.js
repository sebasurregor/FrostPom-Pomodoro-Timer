/*
 * FrostPom — identidad: apodos, avatares, nombre de usuario y nacionalidad.
 * Se generan apodos para no pedir nombres reales a los niños, y los nombres elegidos
 * pasan por un filtro de groserías y suplantación. Funciones puras.
 */
import { fold } from './util.js';
import { lang, tr } from './i18n.js';

// =========================================================
// Apodos y avatares
// =========================================================
// Animales polares y marinos (deben coincidir con server/supabase/schema.sql).
export const ANIMALS = [
  ['Pingüino', '🐧'], ['Oso', '🐻‍❄️'], ['Foca', '🦭'], ['Ballena', '🐳'], ['Cachalote', '🐋'],
  ['Tiburón', '🦈'], ['Delfín', '🐬'], ['Pulpo', '🐙'], ['Calamar', '🦑'], ['Cangrejo', '🦀'],
  ['Pez', '🐟'], ['Nutria', '🦦'], ['Zorro', '🦊'], ['Búho', '🦉'], ['Lobo', '🐺'],
  ['Liebre', '🐇'], ['Reno', '🦌'], ['Langosta', '🦞'], ['Pato', '🦆'], ['Krill', '🦐'],
];
// Adjetivos que no cambian con el género, para que siempre suene bien.
const ADJECTIVES = [
  'Veloz', 'Brillante', 'Valiente', 'Tenaz', 'Ágil', 'Feliz', 'Audaz', 'Genial', 'Fugaz', 'Estelar',
  'Lunar', 'Solar', 'Imparable', 'Increíble', 'Alegre', 'Leal', 'Capaz', 'Gentil', 'Paciente', 'Constante',
];
export const AVATARS = ANIMALS.map((a) => a[1]);
const ANIMAL_NAME = new Map(ANIMALS.map(([name, emoji]) => [emoji, name]));
/** "🐧" → "Pingüino". */
export const animalName = (avatar) => ANIMAL_NAME.get(avatar) || '';
const NICK_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,24}\d{2}$/u;

export function makeNickname(rnd = Math.random) {
  const animal = ANIMALS[Math.floor(rnd() * ANIMALS.length)];
  const adj = ADJECTIVES[Math.floor(rnd() * ADJECTIVES.length)];
  const num = 10 + Math.floor(rnd() * 90);
  return { nick: `${animal[0]}${adj}${num}`, avatar: animal[1] };
}

// ---------------------------------------------------------
// Nombre de usuario elegido por la persona
// 3 a 20 caracteres: letras, números, punto o guion bajo. Se rechazan
// insultos, groserías y términos discriminatorios (también escritos con
// números o símbolos, p. ej. "1d10t4", o separados con puntos).
// ---------------------------------------------------------
const USER_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.]{3,20}$/u;
// Lista base en español e inglés. Se compara sin tildes, sin símbolos y con
// sustituciones típicas (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
// Antes de lanzar conviene ampliarla y revisarla con más idiomas y regionalismos.
// IMPORTANTE: el servidor del ranking (server/supabase/schema.sql) usa esta MISMA lista y las
// mismas reglas; si la cambias, actualiza también private.blocked_words() (una prueba lo revisa).
export const BLOCKED = [
  // groserías y ofensas generales
  'puta', 'puto', 'putit', 'mierda', 'pendej', 'marica', 'maric', 'malparid', 'gonorrea', 'hijueputa', 'hdp', 'carajo',
  'verga', 'chingad', 'culero', 'joder', 'gilipoll', 'idiota', 'imbecil', 'estupid',
  'retrasad', 'mogolic', 'subnormal', 'zorra', 'perra', 'cabron', 'pajero',
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'retard', 'stupid',
  // sexual
  'sexo', 'porno', 'porn', 'xxx', 'violad', 'nude', 'desnud',
  // odio y discriminación
  'nigg', 'negrata', 'sudaca', 'chink', 'kike', 'faggot', 'tranny',
  'nazi', 'hitler', 'kkk', 'genocid', 'terroris',
  // suplantación
  'admin', 'moderador', 'soporte', 'studytimer', 'frostpom', 'oficial',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
// Palabras comunes que contienen un pedazo de una grosería ("computadora" tiene "puta").
// Se quitan antes de comparar para no bloquear nombres inocentes.
export const ALLOWED_PARTS = ['computa', 'computo', 'disputa', 'reputa', 'imputa', 'diputa'];
const ALLOWED_RE = new RegExp(ALLOWED_PARTS.join('|'), 'g');
/**
 * El nombre se compara en su forma "plana": sin tildes, con 0→o, 4→a…, solo letras
 * ("Pu7a_1" → "putai") y sin las palabras inocentes de ALLOWED_PARTS.
 */
export function plainName(value) {
  return fold(value).replace(/[0134578@$]/g, (c) => LEET[c] || c).replace(/[^a-z]/g, '').replace(ALLOWED_RE, '');
}
/**
 * Cada palabra de la lista se busca dejando que sus letras se repitan: "puta" → /p+u+t+a+/
 * atrapa "puuuta", y "perra" → /p+e+r+r+a+/ exige las dos erres (no bloquea "esperanza").
 * (v3.9) Antes se quitaban las letras repetidas también de la lista: "kkk" quedaba como "k"
 * y bloqueaba cualquier nombre con k ("kevin"), y "perra" quedaba como "pera".
 */
export const BLOCKED_PATTERNS = BLOCKED.map((w) => plainName(w).replace(/(.)/g, '$1+'));
const BLOCKED_RES = BLOCKED_PATTERNS.map((p) => new RegExp(p));
export const isBlockedName = (value) => {
  const n = plainName(value);
  return BLOCKED_RES.some((re) => re.test(n));
};

export function checkUsername(value) {
  if (typeof value !== 'string') return { ok: false, reason: tr('Escribe un nombre de usuario.') };
  const v = value.trim();
  if (v.length < 3) return { ok: false, reason: tr('Usa al menos 3 caracteres.') };
  if (v.length > 20) return { ok: false, reason: tr('Usa máximo 20 caracteres.') };
  if (!USER_RE.test(v)) return { ok: false, reason: tr('Solo letras, números, punto (.) o guion bajo (_). Sin espacios.') };
  if (/^[0-9_.]+$/.test(v)) return { ok: false, reason: tr('Incluye al menos una letra.') };
  if (isBlockedName(v)) {
    return { ok: false, reason: tr('Ese nombre no está permitido. Elige uno respetuoso para todos.') };
  }
  return { ok: true, value: v };
}
export function isValidNick(value) {
  return typeof value === 'string' && (NICK_RE.test(value) || checkUsername(value).ok);
}

// =========================================================
// Países (ISO 3166-1 alfa-2) y su bandera en emoji
// =========================================================
const COUNTRY_CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GF GH GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MQ MR MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE ZA ZM ZW').split(' ');
const COUNTRY_SET = new Set(COUNTRY_CODES);
export function isCountry(code) {
  return typeof code === 'string' && COUNTRY_SET.has(code);
}
export function flagEmoji(code) {
  if (!isCountry(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
let countryNames = null;
export function countryName(code) {
  try {
    countryNames = countryNames || new Intl.DisplayNames([lang], { type: 'region' });
    return countryNames.of(code) || code;
  } catch {
    return code;
  }
}
export function countryList() {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code), flag: flagEmoji(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}
