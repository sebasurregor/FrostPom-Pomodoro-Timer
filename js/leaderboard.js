/*
 * StudyTimer — ranking.
 *
 * Hoy funciona en MODO DEMOSTRACIÓN: los rivales son simulados (siempre los mismos nombres,
 * con minutos que crecen a lo largo de la semana) y tu fila usa tus minutos reales.
 *
 * Un top GLOBAL real necesita un servidor que reciba y valide las sesiones; si el ranking
 * se calculara en el teléfono, cualquiera podría editar sus minutos. El diseño seguro del
 * servidor está en server/supabase/schema.sql y docs/SEGURIDAD.md. Cuando exista, se crea
 * un proveedor "remote" con la misma interfaz: fetchBoard({ period, you }).
 */
import * as U from './util.js';
import { rankForXp } from './game.js';
import { makeNickname } from './identity.js';

const BOT_COUNT = 42;
const BOT_DAILY_MAX_MIN = 240; // los rivales simulados respetan el límite saludable por defecto

// Países de los rivales simulados (más peso a Latinoamérica y España)
const BOT_COUNTRIES = ['CO', 'CO', 'CO', 'MX', 'MX', 'AR', 'PE', 'CL', 'EC', 'ES', 'ES', 'VE', 'UY', 'CR', 'PA', 'DO', 'GT', 'BO', 'PY', 'US', 'BR', 'JP', 'DE', 'FR', 'CA'];
let bots = null;
function getBots() {
  if (bots) return bots;
  const rnd = U.mulberry32(U.hashString('studytimer-demo-v2'));
  const used = new Set();
  bots = [];
  while (bots.length < BOT_COUNT) {
    const { nick, avatar } = makeNickname(rnd);
    if (used.has(nick)) continue;
    used.add(nick);
    bots.push({
      id: 'bot-' + bots.length,
      nick,
      avatar,
      rate: 15 + 165 * Math.pow(rnd(), 1.8), // la mayoría estudia poco, pocos estudian mucho
      restProb: 0.08 + 0.22 * rnd(),
      joinedDaysAgo: 7 + Math.floor(rnd() * 330),
      country: BOT_COUNTRIES[Math.floor(rnd() * BOT_COUNTRIES.length)],
    });
  }
  return bots;
}

function botDay(bot, key) {
  const r = U.mulberry32(U.hashString(bot.id + ':' + key))();
  if (r < bot.restProb) return 0;
  return Math.min(BOT_DAILY_MAX_MIN, Math.round(bot.rate * (0.55 + r)));
}

// Fracción "estudiada" del día de hoy: los bots estudian entre las 7:00 y las 22:00.
function dayFraction(now) {
  const h = now.getHours() + now.getMinutes() / 60;
  return U.clamp((h - 7) / 15, 0, 1);
}

function botWeek(bot, now) {
  const start = U.startOfWeek(now);
  const todayKey = U.dateKey(now);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const key = U.dateKey(U.addDays(start, i));
    if (key > todayKey) break;
    const m = botDay(bot, key);
    total += key === todayKey ? Math.round(m * dayFraction(now)) : m;
  }
  return total;
}

/** Minutos desde el primer día de la temporada (startKey) hasta ahora. */
function botSince(bot, startKey, now) {
  const todayKey = U.dateKey(now);
  let total = 0;
  for (let key = startKey, n = 0; key <= todayKey && n < 400; key = U.shiftKey(key, 1), n++) {
    const m = botDay(bot, key);
    total += key === todayKey ? Math.round(m * dayFraction(now)) : m;
  }
  return total;
}

/**
 * you = { nick, avatar, xp, week, season, optIn }. period: 'week' o 'season'.
 * Devuelve filas ordenadas con posición. Si optIn es false, no apareces.
 */
export function demoBoard({ period = 'week', you, now = new Date(), seasonStartKey = U.dateKey(U.addDays(now, -30)) }) {
  const rows = getBots().map((b) => {
    const seasonMin = botSince(b, seasonStartKey, now);
    const minutes = period === 'week' ? botWeek(b, now) : seasonMin;
    // El emblema muestra el rango de la temporada (≈ 1,15 XP por minuto).
    return { id: b.id, nick: b.nick, avatar: b.avatar, country: b.country, minutes, xp: Math.round(seasonMin * 1.15), isYou: false };
  });
  if (you && you.optIn) {
    rows.push({ id: 'you', nick: you.nick || 'Tú', avatar: you.avatar, minutes: period === 'week' ? you.week : you.season, xp: you.xp, isYou: true });
  }
  rows.sort((a, b) => b.minutes - a.minutes || (a.isYou ? -1 : b.isYou ? 1 : a.nick.localeCompare(b.nick)));
  let pos = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (r.minutes !== prev) pos = i + 1;
    prev = r.minutes;
    r.position = pos;
    r.rank = rankForXp(r.xp);
  });
  return rows;
}

const DemoProvider = {
  mode: 'demo',
  label: 'Modo demostración',
  async fetchBoard(opts) {
    return demoBoard(opts);
  },
};

const RemoteProvider = {
  mode: 'remote',
  label: 'En línea',
  async fetchBoard() {
    throw new Error('El ranking en línea todavía no está conectado a un servidor.');
  },
};

export function getProvider(config) {
  return config && config.leaderboard && config.leaderboard.mode === 'remote' ? RemoteProvider : DemoProvider;
}
