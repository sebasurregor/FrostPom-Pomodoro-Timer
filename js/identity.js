/*
 * FrostPom — identidad: apodos, avatares, nombre de usuario y nacionalidad.
 * Se generan apodos para no pedir nombres reales a los niños, y los nombres elegidos
 * pasan por un filtro de groserías y suplantación. Funciones puras.
 */
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
// (v4.5.1) Lista ampliada en español e inglés (pasaron "PoossyDestroyer" y "Jeffery_Epstein").
// Se compara en la forma "plana" del nombre (sin tildes, sin símbolos, con 0→o, 1→i o l, 3→e, 4→a,
// 5→s, 7→t, 8→b, 9→g, @→a, $→s y letras parecidas de otros alfabetos) y, además, en su forma
// "sonora" (ph→f, ck→k, q→k, oo→u, y→i, v→u, z→s y sin letras repetidas), que atrapa "poossy",
// "phuck" o "puuuuta". Para no bloquear nombres inocentes hay una lista de PERMITIDOS (ALLOWED_PARTS)
// y pruebas de los dos lados (tests/logic.test.js).
// IMPORTANTE: el servidor del ranking (server/supabase/schema.sql) usa estas MISMAS listas y reglas
// (private.blocked_patterns, private.blocked_sounds, private.plain_name). Una prueba lo revisa: si
// cambias algo aquí, corre `node tools/nombres-sql.mjs` y pega lo que imprime en el schema.sql.
export const BLOCKED = [
  // groserías e insultos (español)
  'puta', 'puto', 'putit', 'mierda', 'pendej', 'marica', 'maricon', 'marikon', 'malparid', 'malnacid', 'gonorrea',
  'hijueputa', 'hijodeputa', 'hdp', 'carajo', 'verga', 'berga', 'chingad', 'chingar', 'culero', 'culiao', 'culiado',
  'joder', 'jodid', 'gilipoll', 'idiota', 'imbecil', 'estupid', 'retrasad', 'mogolic', 'subnormal', 'zorra',
  'perra', 'cabron', 'pajero', 'pajera', 'mamaguevo', 'mamahuevo', 'mamabicho', 'carechimba', 'pirob', 'follar',
  'culear', 'mamada', 'chupamela',
  // groserías e insultos (inglés)
  'fuck', 'fuk', 'fck', 'phuck', 'shit', 'bitch', 'biatch', 'bastard', 'asshole', 'arsehole', 'dick', 'cock',
  'pussy', 'possy', 'cunt', 'whore', 'slut', 'retard', 'stupid', 'twat', 'wanker', 'jizz', 'dildo', 'douchebag',
  // sexual
  'sexo', 'sexy', 'porno', 'porn', 'xxx', 'violad', 'violar', 'biolad', 'nude', 'desnud', 'pene', 'penis',
  'vagina', 'vulva', 'clitor', 'tetas', 'tetona', 'boobs', 'semen', 'esperma', 'orgasm', 'orgia', 'orgy',
  'masturb', 'cumshot', 'blowjob', 'handjob', 'milf', 'hentai', 'onlyfans', 'horny', 'cachond', 'prostitut',
  'stripper', 'sexting', 'rapist', 'incest', 'zoofil', 'bestialid', 'pedofil', 'pedophil', 'paedophil',
  'pedobear', 'lolicon', 'shotacon',
  // drogas
  'cocain', 'marihuan', 'mariguan', 'marijuan', 'fentanil', 'fentanyl', 'metanfet', 'crystalmeth', 'mdma',
  'ketamin', 'narco', 'drogad', 'weed',
  // odio y discriminación
  'nigg', 'negrata', 'sudaca', 'chink', 'faggot', 'tranny', 'dyke', 'wetback', 'beaner', 'gook', 'raghead',
  'towelhead', 'sidoso', 'travelo', 'bollera', 'tortiller', 'joto', 'nazi', 'hitler', 'himmler', 'goebbels',
  'mengele', 'mussolini', 'stalin', 'polpot', 'kkk', 'siegheil', 'heilhitler', 'whitepower', 'whitepride',
  'genocid', 'terroris', 'jihad', 'yihad', 'alqaeda', 'binladen',
  // violencia y autolesiones
  'suicid', 'autolesion', 'selfharm', 'cutmyself', 'killyourself', 'killurself', 'matarme', 'ahorcar', 'masacre',
  'massacre', 'asesin', 'sicario', 'decapit', 'degoll', 'murder', 'schoolshoot', 'tiroteo',
  // criminales y abusadores conocidos
  'epstein', 'epsteen', 'epstien', 'pabloescobar', 'elchapo', 'chapoguzman', 'garavito', 'dahmer', 'tedbundy',
  'charlesmanson', 'chikatilo', 'johngacy', 'waynegacy', 'unabomber', 'breivik',
  // suplantación
  'admin', 'moderador', 'moderator', 'soporte', 'support', 'studytimer', 'frostpom', 'oficial', 'official',
];
// Palabras de la lista que NO se comparan en la forma sonora: sus letras dobles importan
// ("perra" sin la doble r es "pera", que está en "esperanza") o la forma corta sale en nombres comunes.
export const NO_SOUND = ['perra', 'zorra', 'kkk', 'xxx', 'nigg', 'faggot', 'tranny', 'nazi', 'possy', 'boobs',
  'orgy', 'horny', 'dyke', 'yihad', 'bollera'];
// Letras de otros alfabetos (cirílico, griego…) que se ven como las nuestras: "рuta" con р cirílica.
export const LOOKALIKES = [
  'аеорсухкмтнвіјѕԁёїАВЕКМНОРСТУХІЈЅαβεικνορτυχγηωΑΒΕΖΗΙΚΜΝΟΡΤΥΧıłøđħŧßæœ',
  'aeopcyxkmthbijsdeiabekmhopctyxijsabeikvoptuxynwabezhikmnoptyxilodhtsao',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'l' };
const LOOK = new Map([...LOOKALIKES[0]].map((c, i) => [c, LOOKALIKES[1][i]]));
// Palabras comunes que contienen un pedazo de una grosería ("computadora" tiene "puta",
// "esperanza" no, pero "Georgia" tiene "orgia"). Se quitan antes de comparar.
export const ALLOWED_PARTS = ['computa', 'computo', 'disputa', 'disputo', 'reputa', 'imputa', 'imputo', 'diputa',
  'amputa', 'amputo', 'scunthorp', 'penelop', 'georgia', 'georgy', 'maricarmen', 'maricruz', 'maricel',
  'maricielo', 'marichal', 'vergara', 'dickens', 'dickinson', 'dickson', 'peacock', 'hancock', 'hitchcock',
  'cockatoo', 'cockatiel', 'cockpit', 'cocktail', 'cockroach', 'woodcock', 'babcock', 'shuttlecock', 'cocker',
  'ashita', 'ushita', 'ishita', 'oshita', 'eshita', 'shiitake', 'shitake', 'badminton', 'therapist', 'terapist',
  'semental', 'tweed', 'weedle', 'nazir', 'nazim', 'fukuoka', 'fukushima', 'fukuda', 'fukui', 'fukuyama',
  'pusilan', 'tortilleri', 'tortileri', 'overga', 'tenazi'];
const ALLOWED_RE = new RegExp(ALLOWED_PARTS.join('|'), 'g');
/**
 * El nombre se compara en su forma "plana": sin tildes, letras parecidas → las nuestras,
 * 0→o, 4→a…, solo letras ("Pu7a_1" → "putai") y sin las palabras inocentes de ALLOWED_PARTS.
 * one = cómo se lee el 1: 'i' (casi siempre) o 'l' ("s1ut").
 */
export function plainName(value, one = 'i') {
  return String(value).normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '')
    .replace(/./gu, (c) => LOOK.get(c) || c)
    .replace(/[0134578@$9!|]/g, (c) => (c === '1' ? one : LEET[c] || c))
    .replace(/[^a-z]/g, '').replace(ALLOWED_RE, '');
}
/** (v4.5.1) Las formas planas que se revisan: con el 1 como i y, si hay un 1, también como l. */
export function nameForms(value) {
  const v = String(value);
  return v.includes('1') ? [plainName(v), plainName(v, 'l')] : [plainName(v)];
}
/** (v4.5.1) La forma "sonora": ph→f, ck→k, q→k, oo→u, y→i, v→u, z→s y sin letras repetidas. */
export function soundName(plain) {
  return String(plain).replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/oo/g, 'u')
    .replace(/[yvz]/g, (c) => ({ y: 'i', v: 'u', z: 's' })[c]).replace(/(.)\1+/g, '$1');
}
/**
 * Cada palabra de la lista se busca dejando que sus letras se repitan: "puta" → /p+u+t+a+/
 * atrapa "puuuta", y "perra" → /p+e+r+r+a+/ exige las dos erres (no bloquea "esperanza").
 * (v3.9) Antes se quitaban las letras repetidas también de la lista: "kkk" quedaba como "k"
 * y bloqueaba cualquier nombre con k ("kevin"), y "perra" quedaba como "pera".
 */
export const BLOCKED_PATTERNS = BLOCKED.map((w) => plainName(w).replace(/(.)/g, '$1+'));
/** (v4.5.1) Las mismas palabras en forma sonora (de 4 letras o más, y sin las de NO_SOUND). */
export const BLOCKED_SOUNDS = [...new Set(BLOCKED.filter((w) => !NO_SOUND.includes(w)).map((w) => soundName(plainName(w))).filter((w) => w.length >= 4))];
const BLOCKED_RES = BLOCKED_PATTERNS.map((p) => new RegExp(p));
export const isBlockedName = (value) => nameForms(value).some((n) => {
  if (BLOCKED_RES.some((re) => re.test(n))) return true;
  const sn = soundName(n);
  return BLOCKED_SOUNDS.some((w) => sn.includes(w));
});

/**
 * (v4.5.1) Solo la FORMA del nombre (largo y caracteres), sin el filtro de palabras. Sirve para
 * leer lo que ya estaba guardado: si el filtro se amplía, una cuenta vieja NO se pierde; la app le
 * pide elegir otro nombre (js/ui/account.js: renameRequired).
 */
export function checkUsernameFormat(value) {
  if (typeof value !== 'string') return { ok: false, reason: tr('Escribe un nombre de usuario.') };
  const v = value.trim();
  if (v.length < 3) return { ok: false, reason: tr('Usa al menos 3 caracteres.') };
  if (v.length > 20) return { ok: false, reason: tr('Usa máximo 20 caracteres.') };
  if (!USER_RE.test(v)) return { ok: false, reason: tr('Solo letras, números, punto (.) o guion bajo (_). Sin espacios.') };
  if (/^[0-9_.]+$/.test(v)) return { ok: false, reason: tr('Incluye al menos una letra.') };
  return { ok: true, value: v };
}

/** Un nombre NUEVO: la forma y el filtro de palabras. */
export function checkUsername(value) {
  const r = checkUsernameFormat(value);
  if (!r.ok) return r;
  if (isBlockedName(r.value)) {
    return { ok: false, reason: tr('Ese nombre no está permitido. Elige uno respetuoso para todos.') };
  }
  return r;
}
/** ¿Sirve como apodo guardado? (v4.5.1) Solo la forma: ver checkUsernameFormat. */
export function isValidNick(value) {
  return typeof value === 'string' && (NICK_RE.test(value) || checkUsernameFormat(value).ok);
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
