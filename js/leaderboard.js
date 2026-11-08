/*
 * FrostPom — ranking.
 *
 * Primer MVP: NO hay rivales simulados. FrostPom acaba de nacer, así que mostrar "gente"
 * que no existe no tendría sentido. Por ahora el ranking es LOCAL: solo ves tu propia marca
 * (tus minutos de la semana y de la temporada) y un aviso de que el ranking global llega pronto.
 *
 * Un top GLOBAL real necesita un servidor que reciba y valide las sesiones; si el ranking
 * se calculara en el teléfono, cualquiera podría editar sus minutos. Desde la v3.9 el servidor
 * está en server/supabase/schema.sql y se activa con config.leaderboard.mode = 'remote'
 * (paso a paso: docs/RANKING-GLOBAL.md).
 */
import { rankForXp } from './game.js';
import * as BOARD from './board.js';

/**
 * Ordena filas por minutos y les asigna posición (los empates comparten puesto).
 * Lo usará el ranking en línea; se deja probado desde ya.
 */
export function rankRows(rows) {
  const out = rows.map((r) => ({ ...r }));
  out.sort((a, b) => b.minutes - a.minutes || (a.isYou ? -1 : b.isYou ? 1 : String(a.nick).localeCompare(String(b.nick))));
  let pos = 0;
  let prev = null;
  out.forEach((r, i) => {
    if (r.minutes !== prev) pos = i + 1;
    prev = r.minutes;
    r.position = pos;
    r.rank = rankForXp(r.xp);
  });
  return out;
}

/**
 * Ranking local: solo tu fila. you = { nick, avatar, xp, week, season }.
 * period: 'week' o 'season'.
 */
export function localBoard({ period = 'week', you }) {
  if (!you) return [];
  return rankRows([{ id: 'you', nick: you.nick || 'Tú', avatar: you.avatar, minutes: period === 'week' ? you.week : you.season, xp: you.xp, isYou: true }]);
}

const LocalProvider = {
  mode: 'local',
  label: 'Solo en este dispositivo',
  async fetchBoard(opts) {
    return localBoard(opts);
  },
};

// Ranking global (v3.9): el servidor de server/supabase/schema.sql, a través de js/board.js
const RemoteProvider = {
  mode: 'remote',
  label: 'En línea',
  async fetchBoard({ period = 'week' } = {}) {
    return (await BOARD.fetchBoard(period)).map((r) => ({ ...r, rank: rankForXp(r.xp) }));
  },
};

export function getProvider(config) {
  return config && config.leaderboard && config.leaderboard.mode === 'remote' ? RemoteProvider : LocalProvider;
}
