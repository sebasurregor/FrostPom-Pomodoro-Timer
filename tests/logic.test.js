/* Pruebas de la lógica pura. Ejecuta: node --test tests/ (o npm test) */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as U from '../js/util.js';
import * as game from '../js/game.js';
import * as catalog from '../js/catalog.js';
import * as identity from '../js/identity.js';
import * as T from '../js/timer.js';
import * as E from '../js/engine.js';
import * as S from '../js/storage.js';
import * as L from '../js/leaderboard.js';
import { RECORDED } from '../js/ui/effects.js';
import { readFileSync, existsSync } from 'node:fs';
import { createSession } from '../js/session.js';
import * as SEA from '../js/season.js';
import * as W from '../js/weather.js';
import * as V from '../js/voices.js';
import * as PET from '../js/pet.js';
import * as SEC from '../js/security.js';

const G = { ...game, ...catalog, ...identity };

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
function studyRec(endMs, { sec = 1500, completed = true, focus = 'Matemáticas', notes = '', pauses = 0 } = {}) {
  return { mode: 'study', completed, plannedSec: 1500, actualSec: sec, sessionStartMs: endMs - sec * 1000, startedAt: new Date(endMs - sec * 1000).toISOString(), endMs, endedAt: new Date(endMs).toISOString(), pauses, focus, notes };
}

test('util: dateKey usa hora local y daysBetween es exacto', () => {
  assert.equal(U.dateKey(new Date(2026, 10, 2, 23, 30)), '2026-11-02'); // 11:30 p. m. sigue siendo el mismo día
  assert.equal(U.daysBetween('2026-11-02', '2026-11-05'), 3);
  assert.equal(U.daysBetween('2026-11-05', '2026-11-02'), -3);
  assert.equal(U.isDateKey('2026-02-31'), false);
  assert.equal(U.formatClock(3725), '1:02:05');
  assert.equal(U.formatMinutes(135), '2 h 15 min');
});

test('util: cleanText quita caracteres de control y de dirección', () => {
  assert.equal(U.cleanText('hola\u202Eadmin\u0000  mundo', 50), 'hola admin mundo');
  assert.equal(U.cleanText('x'.repeat(300), 10).length, 10);
});

test('util: los índices por id no tienen prototipo', () => {
  assert.equal(G.ACHIEVEMENT_BY_ID.constructor, undefined);
  assert.equal(G.SKIN_BY_ID.__proto__, undefined);
  assert.equal(G.SKIN_BY_ID.menta.name, 'Menta');
});

test('rangos: umbrales, progreso y Leyenda con estrellas', () => {
  assert.equal(G.rankForXp(0).name, 'Bronce III');
  assert.equal(G.rankForXp(59).name, 'Bronce III');
  assert.equal(G.rankForXp(60).name, 'Bronce II');
  assert.equal(G.rankForXp(300).name, 'Plata III');
  assert.equal(G.rankForXp(1000).tierName, 'Oro');
  assert.equal(G.rankForXp(16000).name, 'Leyenda');
  assert.equal(G.rankForXp(20000).name, 'Leyenda ★1');
  const r = G.rankForXp(105);
  assert.ok(Math.abs(r.progress - 0.5) < 1e-9);
  assert.equal(r.xpToNext, 45);
  assert.equal(G.STEPS.length, 19);
});

test('XP: minutos + bono de sesión completa + primera del día con racha', () => {
  const r = G.studyReward({ actualSec: 1500, completed: true, dayCreditedSec: 0, capSec: 14400, isFirstToday: true, streak: 3 });
  assert.equal(r.creditedSec, 1500);
  assert.deepEqual(r.items.map((i) => i.xp), [25, 3, 8]);
  assert.equal(r.xp, 36);
});

test('XP: menos de 1 minuto no cuenta y el límite diario recorta', () => {
  assert.equal(G.studyReward({ actualSec: 59, completed: false }).tooShort, true);
  const r = G.studyReward({ actualSec: 3600, completed: true, dayCreditedSec: 14000, capSec: 14400 });
  assert.equal(r.creditedSec, 400);
  assert.equal(r.capped, true);
  const full = G.studyReward({ actualSec: 3600, completed: true, dayCreditedSec: 14400, capSec: 14400 });
  assert.equal(full.xp, 0);
});

test('racha: cuenta días seguidos con 10+ minutos', () => {
  const daily = { '2026-10-30': { studySec: 900 }, '2026-10-31': { studySec: 600 }, '2026-11-01': { studySec: 1200 } };
  assert.deepEqual(G.computeStreak(daily, '2026-11-01'), { current: 3, activeToday: true });
  assert.deepEqual(G.computeStreak(daily, '2026-11-02'), { current: 3, activeToday: false }); // hoy aún puede salvarla
  assert.deepEqual(G.computeStreak(daily, '2026-11-03'), { current: 0, activeToday: false });
  daily['2026-10-31'].studySec = 300;
  assert.equal(G.computeStreak(daily, '2026-11-01').current, 1);
});

test('misiones: 3 por día, deterministas y con una misión principal', () => {
  const a = G.dailyMissions('2026-11-02');
  const b = G.dailyMissions('2026-11-02');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.ok(['sessions', 'minutes'].includes(a[0].type));
  assert.equal(new Set(a.map((m) => m.type)).size, 3);
  const day = G.emptyDay();
  day.sessions = 5; day.studySec = 4000; day.breaks = 3; day.noPauseSessions = 1;
  assert.ok(a.every((m) => !['subjects', 'goal'].includes(m.type))); // ya no hay misiones de materias ni metas
  for (const m of a) assert.equal(G.missionProgress(m, day).done, true);
});

test('temporizador: pausas y reanudaciones cuentan el tiempo real', () => {
  let now = 0;
  const t = T.createTimer({ now: () => now });
  t.start({ mode: 'study', durationSec: 600, focus: 'Física' });
  now = 100_000; t.pause();
  now = 400_000; t.resume(); // 5 minutos en pausa no cuentan
  now = 450_000;
  assert.equal(Math.round(t.elapsedMs() / 1000), 150);
  const rec = t.stopEarly();
  assert.equal(rec.actualSec, 150);
  assert.equal(rec.pauses, 1);
  assert.equal(rec.startedAt, new Date(0).toISOString()); // la hora de inicio real se conserva
});

test('temporizador: complete() usa la hora real de fin aunque se procese tarde', () => {
  let now = 1_000_000;
  const t = T.createTimer({ now: () => now });
  t.start({ mode: 'study', durationSec: 60 });
  now += 30_000; t.pause(); now += 30_000; t.resume();
  now += 500_000; // se cerró la app y volvió mucho después
  assert.equal(t.isDue(), true);
  const rec = t.complete();
  assert.equal(rec.actualSec, 60);
  assert.equal(rec.endMs, 1_000_000 + 30_000 + 30_000 + 30_000);
});

test('temporizador: restore rechaza datos manipulados', () => {
  const t = T.createTimer({ now: () => 1000 });
  assert.equal(t.restore({ status: 'hacked', mode: 'study' }), false);
  assert.equal(t.restore({ status: 'running', mode: 'study', durationSec: 99999999, sessionStartMs: 'x' }), false);
  assert.equal(t.restore({ status: 'running', mode: 'study', durationSec: 99999999, sessionStartMs: 500, runStartMs: 900000, accumulatedMs: -5 }), true);
  assert.equal(t.state.durationSec, T.MAX_SEC); // duración recortada a 3 h
  assert.equal(t.state.runStartMs, 1000); // inicio en el futuro → recortado a "ahora"
  assert.equal(t.state.accumulatedMs, 0);
});

test('motor: una sesión suma XP, racha, logros y gemas', () => {
  const st = S.defaultState();
  const { events } = E.applyStudy(st, studyRec(at(2026, 11, 2)), { todayKey: '2026-11-02' });
  assert.equal(st.progress.xp, 25 + 3 + 5);
  assert.ok(events.some((e) => e.type === 'achievement' && e.id === 'primer-paso'));
  assert.equal(st.progress.gems, G.RARITY.comun.gems);
  assert.equal(st.daily['2026-11-02'].sessions, 1);
  assert.equal(st.progress.cycle, 1);
  assert.equal(st.progress.breakEarned, true);
});

test('motor: subir de rango genera evento y gemas', () => {
  const st = S.defaultState();
  st.progress.xp = 50;
  const { events } = E.applyStudy(st, studyRec(at(2026, 11, 2), { sec: 1500 }), { todayKey: '2026-11-02' });
  const up = events.find((e) => e.type === 'rankup');
  assert.ok(up);
  assert.equal(up.to.name, 'Bronce II');
});

test('motor: el descanso solo da XP tras una sesión completa', () => {
  const st = S.defaultState();
  const brk = { mode: 'break', completed: true, endMs: at(2026, 11, 2, 13) };
  E.applyBreak(st, brk, { todayKey: '2026-11-02' });
  assert.equal(st.progress.xp, 0);
  E.applyStudy(st, studyRec(at(2026, 11, 2, 12)), { todayKey: '2026-11-02' });
  const xp = st.progress.xp;
  E.applyBreak(st, brk, { todayKey: '2026-11-02' });
  assert.equal(st.progress.xp, xp + G.RULES.breakXp);
  E.applyBreak(st, brk, { todayKey: '2026-11-02' });
  assert.equal(st.progress.xp, xp + G.RULES.breakXp); // no se puede repetir
});

test('motor: bono de racha usa la racha que venía hasta ayer', () => {
  const st = S.defaultState();
  E.applyStudy(st, studyRec(at(2026, 10, 31)), { todayKey: '2026-10-31' });
  E.applyStudy(st, studyRec(at(2026, 11, 1)), { todayKey: '2026-11-01' });
  const { reward } = E.applyStudy(st, studyRec(at(2026, 11, 2)), { todayKey: '2026-11-02' });
  assert.equal(reward.items.at(-1).xp, G.RULES.firstOfDayXp + 2);
  const st2 = S.defaultState();
  E.applyStudy(st2, studyRec(at(2026, 10, 30)), { todayKey: '2026-10-30' });
  const r2 = E.applyStudy(st2, studyRec(at(2026, 11, 2)), { todayKey: '2026-11-02' }).reward; // racha rota
  assert.equal(r2.items.at(-1).xp, G.RULES.firstOfDayXp);
});

test('motor: borrar una sesión descuenta su tiempo y XP', () => {
  const st = S.defaultState();
  E.applyStudy(st, studyRec(at(2026, 11, 2)), { todayKey: '2026-11-02' });
  const xpBefore = st.progress.xp;
  const s = st.sessions[0];
  assert.equal(st.daily['2026-11-02'].noPauseSessions, 1);
  assert.equal(E.removeSession(st, s.id).ok, true);
  assert.equal(st.progress.xp, xpBefore - s.xp);
  assert.equal(st.daily['2026-11-02'].studySec, 0);
  assert.equal(st.daily['2026-11-02'].noPauseSessions, 0); // la misión "sin pausar" tampoco queda cumplida
  assert.equal(st.progress.totals.sessions, 0);
  assert.equal(E.removeSession(st, 'no-existe').ok, false);
});

test('motor: reclamar misión exige completarla y solo una vez', () => {
  const st = S.defaultState();
  const [m] = G.dailyMissions('2026-11-02');
  assert.equal(E.claimMission(st, m.id, '2026-11-02').ok, false);
  const day = E.ensureDay(st, '2026-11-02');
  day.sessions = 5; day.studySec = 5000;
  assert.equal(E.claimMission(st, m.id, '2026-11-02').ok, true);
  assert.equal(E.claimMission(st, m.id, '2026-11-02').ok, false);
  assert.equal(E.claimMission(st, 'inventada:x:1', '2026-11-02').ok, false);
});

test('tienda: comprar con gemas y desbloquear por rango', () => {
  const st = S.defaultState();
  assert.equal(E.chooseSkin(st, 'menta', '2026-11-02').ok, false);
  st.progress.gems = 40;
  assert.equal(E.chooseSkin(st, 'menta', '2026-11-02').ok, true);
  assert.equal(st.progress.gems, 10);
  assert.equal(st.settings.skin, 'menta');
  assert.equal(E.chooseSkin(st, 'dorado', '2026-11-02').ok, false);
  st.progress.xp = 1000;
  assert.equal(E.chooseSkin(st, 'dorado', '2026-11-02').ok, true);
  assert.ok(st.progress.owned.includes('dorado'));
});

test('tienda: con Premium usar un tema NO cobra gemas (antes las cobraba)', () => {
  const st = S.defaultState();
  st.progress.gems = 100;
  E.setPremium(st, true);
  const g = st.progress.gems; // ya incluye el regalo de bienvenida
  assert.equal(E.chooseSkin(st, 'menta', '2026-11-02').ok, true);
  assert.equal(st.progress.gems, g);
  assert.equal(st.settings.skin, 'menta');
  assert.ok(!st.progress.owned.includes('menta')); // se usa con Premium, no se compra
  E.setPremium(st, false);
  assert.equal(G.effectivePrefs(st).skin.id, 'clasico'); // Premium venció: vuelve al Clásico
});

test('almacenamiento: una copia manipulada se limpia sin romper nada', () => {
  const evil = JSON.parse(`{
    "app":"studytimer","format":2,"data":{
      "profile":{"nick":"<img src=x onerror=alert(1)>","avatar":"💣","companion":"pinguino","onboarded":true},
      "settings":{"studyMin":99999,"dailyCapMin":-5,"skin":"inexistente","sound":"si"},
      "parental":{"hash":"00","salt":"zz"},
      "progress":{"xp":"1e99","gems":-10,"achievements":{"__proto__":{"x":1},"primer-paso":"2026-11-01T00:00:00Z","falso":"2026-11-01T00:00:00Z"}},
      "daily":{"__proto__":{"studySec":1},"2026-11-01":{"studySec":"600","subjects":{"__proto__":5,"Mate\u202Eticas":3,"Física":"60"}},"no-fecha":{}},
      "tasks":[{"course":"A","title":"B","due":"2026-13-40"},{"course":"Ciencias","title":"Lab","due":"2026-11-09","estHours":1000,"difficulty":9}],
      "sessions":[{"startedAt":"x","endedAt":"y"}]
    }}`);
  const st = S.importBackup(JSON.stringify(evil));
  assert.equal(st.profile.nick, '');
  assert.equal(st.profile.onboarded, false);
  assert.equal(st.profile.avatar, '🐧');
  assert.equal(st.profile.companion, 'pinguino'); // su logro (primer-paso) viene en la copia
  assert.equal('studyMin' in st.settings, false); // los minutos en efecto se derivan, no se guardan
  assert.equal(st.settings.dailyCapMin, 30);
  assert.equal(st.settings.skin, 'clasico');
  assert.equal(st.settings.sound, true);
  assert.equal('parental' in st, false); // el control parental ya no existe: un PIN viejo se descarta
  assert.equal(st.progress.xp, 1e9);
  assert.equal(st.progress.gems, 0);
  assert.deepEqual(Object.keys(st.progress.achievements), ['primer-paso']);
  assert.deepEqual(Object.keys(st.daily), ['2026-11-01']);
  assert.equal(st.daily['2026-11-01'].subjects, undefined); // ya no se guardan materias
  assert.equal(st.daily['2026-11-01'].studySec, 600);
  assert.equal('tasks' in st, false);
  assert.equal(st.sessions.length, 0);
  assert.equal({}.x, undefined); // Object.prototype no fue contaminado
});

test('almacenamiento: importar rechaza archivos ajenos o enormes', () => {
  assert.throws(() => S.importBackup('no es json'), /no es una copia válida/);
  assert.throws(() => S.importBackup('{"app":"otra"}'), /no es una copia de FrostPom/);
  assert.throws(() => S.importBackup('x'.repeat(3 * 1024 * 1024)), /demasiado grande/);
});

test('almacenamiento: migra la v1 y reconstruye el progreso', () => {
  const b = S.memoryBackend();
  b.setItem('st_settings_v1', JSON.stringify({ studyMin: 60, breakMin: 15, autoContinue: false, soundOn: true }));
  b.setItem('st_availability_v1', JSON.stringify({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }));
  b.setItem('st_tasks_v1', JSON.stringify([{ id: 'abcdefgh-1', course: 'Calculus II', title: 'Problem Set 4', dueDateISO: '2026-11-05', estHours: 3, difficulty: 4 }]));
  b.setItem('st_log_v1', JSON.stringify([
    { id: 'a', type: 'study', focus: 'Calculus II', plannedMin: 60, actualSec: 3600, partial: false, startedAtISO: '2026-11-01T14:00:00.000Z', endedAtISO: '2026-11-01T15:00:00.000Z', notes: '' },
    { id: 'b', type: 'study', focus: 'Psychology', plannedMin: 60, actualSec: 1200, partial: true, startedAtISO: '2026-10-31T14:00:00.000Z', endedAtISO: '2026-10-31T14:20:00.000Z', notes: 'ch 6' },
  ]));
  const store = S.createStore(b);
  const { state, migrated } = store.load();
  assert.equal(migrated, true);
  assert.equal(state.settings.preset, 'largo');
  assert.equal(state.settings.autoContinue, false);
  assert.equal('tasks' in state || 'availability' in state, false); // el planificador ya no existe
  assert.equal(state.sessions.length, 2);
  assert.ok(state.sessions.every((x) => x.focus === undefined && x.notes === undefined)); // solo se migra el tiempo
  assert.equal(state.progress.totals.studySec, 4800);
  assert.ok(state.progress.xp >= 80);
  assert.ok(b.getItem('st_log_v1')); // la v1 no se borra
  assert.equal(store.load().migrated, false); // la segunda vez ya lee la v2
});

test('almacenamiento: wipe borra solo las claves de la app', () => {
  const b = S.memoryBackend();
  b.setItem('st2_state', '{}'); b.setItem('st_log_v1', '[]'); b.setItem('otra_app', 'x');
  assert.equal(S.createStore(b).wipe(), 2);
  assert.equal(b.getItem('otra_app'), 'x');
});

test('ranking (primer MVP): sin rivales simulados, solo tu marca', () => {
  const you = { nick: 'ZorroVeloz42', avatar: '🦊', xp: 500, week: 75, season: 900, optIn: true };
  const week = L.localBoard({ period: 'week', you });
  assert.equal(week.length, 1);
  assert.equal(week[0].isYou, true);
  assert.equal(week[0].minutes, 75);
  assert.equal(L.localBoard({ period: 'season', you })[0].minutes, 900);
  assert.equal(L.getProvider({ leaderboard: { mode: 'local' } }).mode, 'local');
  assert.equal(L.getProvider({}).mode, 'local'); // por defecto nunca aparecen bots
});

test('ranking: el orden y los empates para el futuro ranking en línea', () => {
  const rows = L.rankRows([
    { nick: 'b', minutes: 30, xp: 0 }, { nick: 'tú', minutes: 50, xp: 0, isYou: true },
    { nick: 'a', minutes: 50, xp: 0 }, { nick: 'c', minutes: 10, xp: 0 },
  ]);
  assert.deepEqual(rows.map((r) => [r.nick, r.position]), [['tú', 1], ['a', 1], ['b', 3], ['c', 4]]);
});

test('apodos: el generador siempre produce apodos válidos', () => {
  const rnd = U.mulberry32(7);
  for (let i = 0; i < 500; i++) assert.ok(G.isValidNick(G.makeNickname(rnd).nick));
  assert.equal(G.isValidNick('Juan Pérez'), false);
  assert.equal(G.isValidNick('<script>'), false);
});

test('privacidad: las sesiones solo guardan tiempo, no materia ni notas', () => {
  const st = S.defaultState();
  E.applyStudy(st, studyRec(at(2026, 11, 2), { focus: 'Diario íntimo', notes: 'secreto' }), { todayKey: '2026-11-02' });
  const json = JSON.stringify(st);
  assert.ok(!json.includes('Diario') && !json.includes('secreto'));
  assert.equal(st.daily['2026-11-02'].subjects, undefined);
});

test('logro: semana constante (5 días activos en la misma semana)', () => {
  const st = S.defaultState();
  for (const d of [2, 3, 4, 5]) E.applyStudy(st, studyRec(at(2026, 11, d)), { todayKey: `2026-11-0${d}` });
  assert.ok(!st.progress.achievements['semana-constante']);
  const { events } = E.applyStudy(st, studyRec(at(2026, 11, 8)), { todayKey: '2026-11-08' }); // domingo, misma semana
  assert.ok(st.progress.achievements['semana-constante']);
});

test('compañeros: el Pingüino viene con la cuenta; los demás, con su logro', () => {
  const st = S.defaultState();
  assert.equal(E.equipCompanion(st, 'pinguino').ok, true); // incluido desde el inicio
  assert.equal(G.lockedCompanions(st.progress).some((c) => c.id === 'pinguino'), false); // nunca es regalo de Premium
  assert.equal(G.lockedCompanions(st.progress).length, G.COMPANIONS.length - 1);
  const { events } = E.applyStudy(st, studyRec(at(2026, 11, 2)), { todayKey: '2026-11-02' });
  assert.ok(events.some((e) => e.type === 'achievement' && e.id === 'primer-paso'));
  assert.ok(!events.some((e) => e.type === 'companion')); // el primer pomodoro ya no "desbloquea" al pingüino
  assert.equal(st.profile.companion, 'pinguino');
  assert.equal(E.equipCompanion(st, 'oso-polar').ok, false);
  assert.equal(E.equipCompanion(st, null).ok, true);
  const earned = G.COMPANIONS.filter((c) => !c.starter);
  assert.equal(earned.every((c) => G.ACHIEVEMENT_BY_ID[c.unlock]), true);
  assert.equal(new Set(earned.map((c) => c.unlock)).size, earned.length); // un logro por compañero
});

test('duración personalizada: se valida y sobrevive a la migración', () => {
  const st = S.validateState({ settings: { preset: 'personalizado', customStudyMin: 60, customBreakMin: 15, customLongMin: 999 } });
  assert.equal(st.settings.customStudyMin, 60);
  assert.equal(st.settings.customBreakMin, 15);
  assert.deepEqual(G.sessionDurations(st.settings, false), { study: 60, brk: 15, long: 30 }); // largo: el doble del descanso
  const b = S.memoryBackend();
  b.setItem('st_settings_v1', JSON.stringify({ studyMin: 70, breakMin: 12 }));
  const m = S.createStore(b).load().state;
  assert.equal(m.settings.preset, 'personalizado');
  assert.equal(m.settings.customStudyMin, 70);
  assert.equal(m.settings.customBreakMin, 12);
});

test('salud del polo: estudiar limpia, dejar de estudiar contamina', () => {
  const daily = {};
  // Perfil nuevo: empieza casi limpio y se limpia del todo al cumplir la meta de hoy.
  assert.ok(Math.abs(G.poleHealth(daily, '2026-11-02', '2026-11-02') - 0.7) < 1e-9);
  daily['2026-11-02'] = { studySec: G.POLE_GOAL_MIN * 60 };
  assert.equal(G.poleHealth(daily, '2026-11-02', '2026-11-02'), 1);
  // Tres días sin estudiar: muy contaminado.
  assert.equal(G.poleHealth(daily, '2026-11-06', '2026-11-02'), 0);
  assert.equal(G.poleLevel(0).id, 'critico');
  // Volver a estudiar hoy lo recupera bastante.
  daily['2026-11-06'] = { studySec: G.POLE_GOAL_MIN * 60 };
  assert.equal(G.poleLevel(G.poleHealth(daily, '2026-11-06', '2026-11-02')).id, 'contaminado');
  assert.equal(G.poleLevel(0.9).id, 'limpio');
});

test('cuentas: el nombre de usuario se valida y se filtran ofensas', () => {
  for (const ok of ['Sebas_23', 'pingu.estudia', 'MariaCálculo', 'Calculo2026', 'Ana']) assert.equal(G.checkUsername(ok).ok, true, ok);
  for (const bad of ['ab', 'nombre con espacios', '<script>', '12345', 'putito99', 'Pu7a_123', 'm.i.e.r.d.a', 'n1gg4', 'Hitler88', 'admin', 'x'.repeat(21)]) {
    assert.equal(G.checkUsername(bad).ok, false, bad);
  }
});

test('premium: límites de duración, temas y sonidos', () => {
  assert.deepEqual(G.durationLimits(false), { study: [10, 60], brk: [5, 15] });
  assert.deepEqual(G.durationLimits(true), { study: [1, 180], brk: [1, 60] });
  const aurora = G.SKIN_BY_ID.aurora;
  assert.equal(G.skinStatus(aurora, { gems: 999 }).state, 'premium');
  assert.equal(G.skinStatus(aurora, { premium: true }).state, 'included');
  assert.equal(G.skinStatus(G.SKIN_BY_ID.leyenda, { premium: true }).state, 'included'); // Premium deja usar todos
  assert.equal(G.skinStatus(G.SKIN_BY_ID.dorado, { premium: true, tierIndex: 2 }).state, 'unlockable'); // por rango queda tuyo
  assert.equal(G.canUse(G.AMBIENTS.find((a) => a.id === 'lluvia'), false), true);
  assert.equal(G.canUse(G.AMBIENTS.find((a) => a.id === 'olas'), false), false);
  assert.equal(G.canUse(G.AMBIENTS.find((a) => a.id === 'olas'), true), true);
  assert.equal(G.longBreakFor(15), 30);
  assert.equal(G.longBreakFor(5), 15);
});

test('países: banderas y validación', () => {
  assert.equal(G.flagEmoji('CO'), '\u{1F1E8}\u{1F1F4}');
  assert.equal(G.isCountry('CO'), true);
  assert.equal(G.isCountry('XX'), false);
  assert.ok(G.countryList().length > 200);
  const st = S.validateState({ profile: { country: '<b>', nick: 'pingu' }, settings: { longBreakOn: false, longEvery: 7, ambient: 'hack', reminders: { time: '25:99', days: [9, 1] } }, premium: { active: 'si' } });
  assert.equal(st.profile.country, '');
  assert.equal('longBreakOn' in st.settings || 'longEvery' in st.settings, false); // el descanso largo ya no se configura
  assert.equal(st.settings.ambient, '');
  assert.equal(st.settings.reminders.time, '18:00');
  assert.deepEqual(st.settings.reminders.days, [1]);
  assert.equal(st.premium.active, false);
});

test('calendario: el mes empieza el lunes y solo tiene los días de ese mes', () => {
  const nov = U.monthCells(2026, 10); // noviembre de 2026 empieza en domingo
  assert.equal(nov.length % 7, 0);
  assert.deepEqual(nov.slice(0, 7), [null, null, null, null, null, null, '2026-11-01']);
  assert.equal(nov.filter(Boolean).length, 30);
  assert.equal(nov.filter(Boolean).at(-1), '2026-11-30');
  const feb = U.monthCells(2027, 1); // febrero de 2027 empieza en lunes y no es bisiesto
  assert.equal(feb[0], '2027-02-01');
  assert.equal(feb.filter(Boolean).length, 28);
  assert.equal(U.formatDayLong('2026-11-03'), 'Martes 3 de noviembre');
});

test('calendario: intensidad por día y resumen del mes', () => {
  assert.deepEqual([0, 5, 14, 15, 44, 45, 89, 90, 200].map((m) => G.studyLevel(m)), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  const daily = {
    '2026-10-31': { studySec: 9000 }, // otro mes: no cuenta
    '2026-11-01': { studySec: 2820 },
    '2026-11-02': { studySec: 1200 },
    '2026-11-03': { studySec: 0 },
  };
  const sum = G.monthSummary(daily, 2026, 10);
  assert.equal(sum.totalMin, 67);
  assert.equal(sum.activeDays, 2);
  assert.equal(sum.goalDays, 1);
  assert.deepEqual(sum.best, { key: '2026-11-01', min: 47 });
  assert.deepEqual(G.monthSummary({}, 2026, 10), { totalMin: 0, activeDays: 0, goalDays: 0, best: null });
});

test('duración: se deriva del modo elegido y Premium vencido vuelve a los límites gratis', () => {
  const settings = { preset: 'enfoque', customStudyMin: 120, customBreakMin: 30 };
  assert.deepEqual(G.sessionDurations(settings, false), { study: 45, brk: 10, long: 20 });
  settings.preset = 'personalizado';
  assert.deepEqual(G.sessionDurations(settings, true), { study: 120, brk: 30, long: 45 });
  assert.deepEqual(G.sessionDurations(settings, false), { study: 60, brk: 15, long: 30 });
  const st = S.defaultState();
  const r = E.setCustomMinutes(st, 'customStudyMin', 120, '2026-11-02');
  assert.equal(r.clamped, true);
  assert.equal(st.settings.customStudyMin, 60);
  assert.equal(st.settings.preset, 'personalizado');
  assert.ok(r.events.some((e) => e.type === 'achievement' && e.id === 'a-tu-medida'));
  assert.equal(E.choosePreset(st, 'mini', '2026-11-02').ok, true);
  assert.equal(st.settings.customStudyMin, 60); // Mi ritmo se conserva al cambiar de modo
  assert.equal(E.choosePreset(st, 'inventado', '2026-11-02').ok, false);
});

test('duración: el descanso largo llega cada 4 pomodoros completos', () => {
  assert.equal(G.nextModeAfter({ mode: 'study', completed: true }, 3), 'break');
  assert.equal(G.nextModeAfter({ mode: 'study', completed: true }, 4), 'long');
  assert.equal(G.nextModeAfter({ mode: 'study', completed: false }, 4), 'break');
  assert.equal(G.nextModeAfter({ mode: 'long', completed: true }, 4), 'study');
});

test('preferencias en efecto: tono y sonido Premium no suenan sin Premium', () => {
  const st = S.defaultState();
  st.settings.tonePack = 'arcade';
  st.settings.ambient = 'olas';
  assert.equal(G.effectivePrefs(st).tonePack, 'clasico');
  assert.equal(G.effectivePrefs(st).ambient, null);
  E.setPremium(st, true);
  assert.equal(G.effectivePrefs(st).tonePack, 'arcade');
  assert.equal(G.effectivePrefs(st).ambient.id, 'olas');
});

test('almacenamiento: si guardar falla, los cambios en memoria no se pierden', () => {
  const b = S.memoryBackend();
  const store = S.createStore(b);
  const { state } = store.load();
  store.save(state);
  state.progress.xp = 77; // cambio en memoria
  const realSet = b.setItem;
  b.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(store.save(state), false);
  assert.equal(store.refresh(state).progress.xp, 77); // antes se releía lo viejo y se perdía
  b.setItem = realSet;
  // Otra pestaña sí guardó algo distinto: refresh lo trae.
  const other = S.defaultState();
  other.progress.xp = 500;
  b.setItem(S.KEY, JSON.stringify(other));
  assert.equal(store.refresh(state).progress.xp, 500);
});

test('almacenamiento: preferencias pequeñas con prefijo propio', () => {
  const b = S.memoryBackend();
  const store = S.createStore(b, S.memoryBackend());
  store.pref.set('activity_tab', 'cal');
  assert.equal(store.pref.get('activity_tab'), 'cal');
  assert.equal(b.getItem('st2_activity_tab'), 'cal');
  store.tab.set('unlocked', '1');
  assert.equal(store.tab.get('unlocked'), '1');
  assert.equal(b.getItem('st2_unlocked'), null); // va a sessionStorage, no a localStorage
});

function sessionRig() {
  let now = at(2026, 11, 2, 9);
  const store = S.createStore(S.memoryBackend());
  const mins = { study: 25, break: 5, long: 15 };
  const durationFor = (m) => mins[m] * 60;
  const session = createSession({ store, now: () => now, durationFor });
  return { store, session, durationFor, now: () => now, tick: (ms) => { now += ms; } };
}

test('bloque en curso: empezar, pausar, continuar y terminar a tiempo', async () => {
  const { session, tick, store } = sessionRig();
  assert.equal(session.state.durationSec, 25 * 60);
  assert.equal(session.toggle(), 'start');
  tick(10 * 60e3);
  assert.equal(session.toggle(), 'pause');
  assert.equal(store.loadTimer().status, 'paused'); // cada acción queda guardada
  tick(60 * 60e3);
  assert.equal(session.toggle(), 'resume');
  tick(15 * 60e3);
  assert.equal(session.isDue(), true);
  const rec = await session.completeDue();
  assert.equal(rec.actualSec, 25 * 60);
  assert.equal(rec.completed, true);
  assert.equal(rec.pauses, 1);
  session.advance('break');
  assert.equal(session.state.mode, 'break');
  assert.equal(session.state.durationSec, 5 * 60);
});

test('bloque en curso: dos pestañas no registran la misma sesión dos veces', async () => {
  const { session, tick, store, durationFor, now } = sessionRig();
  session.toggle();
  tick(26 * 60e3);
  const other = createSession({ store, now, durationFor });
  assert.ok(await other.completeDue()); // la otra pestaña llega primero
  assert.equal(await session.completeDue(), null);
  assert.equal(session.state.status, 'idle');
});

test('bloque en curso: terminar antes exige 1 minuto y saltar avisa si se pierde tiempo', () => {
  const { session, tick } = sessionRig();
  assert.equal(session.finishEarly(), null); // no hay nada corriendo
  session.toggle();
  tick(30e3);
  assert.deepEqual(session.finishEarly(), { tooShort: true });
  tick(5 * 60e3);
  assert.deepEqual(session.skip(), { skippedStudy: true, lost: true });
  assert.equal(session.state.mode, 'break');
  assert.deepEqual(session.skip(), { skippedStudy: false, lost: false });
  assert.equal(session.state.mode, 'study');
  session.toggle();
  tick(10 * 60e3);
  const { rec } = session.finishEarly();
  assert.equal(rec.actualSec, 600);
  assert.equal(rec.completed, false);
});

test('bloque en curso: una recarga retoma el bloque donde iba', () => {
  const { session, tick, store, durationFor, now } = sessionRig();
  session.toggle();
  tick(5 * 60e3);
  const reopened = createSession({ store, now, durationFor });
  assert.equal(reopened.state.status, 'running');
  assert.equal(Math.round(reopened.elapsedMs() / 1000), 300);
});

test('temporadas: trimestres del calendario con nombre y días restantes', () => {
  const nov = SEA.seasonFor(new Date(2026, 10, 3));
  assert.equal(nov.id, '2026-10');
  assert.equal(nov.name, 'Temporada oct – dic 2026');
  assert.equal(nov.startKey, '2026-10-01');
  assert.equal(nov.endKey, '2026-12-31');
  assert.equal(SEA.daysLeft(nov, '2026-11-03'), 59);
  assert.equal(SEA.daysLeft(nov, '2026-12-31'), 1);
  assert.equal(SEA.seasonFor(new Date(2027, 0, 1)).id, '2027-01');
  assert.equal(SEA.seasonFor(new Date(2026, 10, 3), 1).name, 'Temporada Noviembre 2026');
  assert.equal(SEA.seasonById('2026-11').id, '2026-10'); // un mes dentro del trimestre
  assert.equal(SEA.seasonById('2026-13'), null);
  assert.equal(SEA.seasonReward(0), 10);
  assert.equal(SEA.seasonReward(6), 100);
});

test('temporadas: al cambiar, se archiva el resumen, se dan gemas y vuelve Bronce III', () => {
  const st = S.defaultState();
  st.progress.xp = 1450; // Oro II
  st.progress.gems = 5;
  st.progress.achievements['primer-paso'] = '2026-11-01T00:00:00Z';
  st.progress.owned.push('menta');
  st.daily['2026-11-01'] = { ...game.emptyDay(), studySec: 3000, creditedSec: 3000 };
  st.daily['2026-11-02'] = { ...game.emptyDay(), studySec: 1200, creditedSec: 1200 };
  st.sessions = [
    { id: 'aaaaaaaa1', startedAt: '2026-11-02T15:00:00.000Z', endedAt: '2026-11-02T15:20:00.000Z', actualSec: 1200, xp: 20 },
  ];
  // Datos de antes de las temporadas: solo adopta la actual, sin borrar nada.
  let r = E.rolloverSeason(st, new Date(2026, 10, 3));
  assert.equal(st.progress.season, '2026-10');
  assert.equal(r.events.length, 0);
  assert.equal(st.progress.xp, 1450);
  // Misma temporada: nada cambia.
  assert.equal(E.rolloverSeason(st, new Date(2026, 11, 31)).ok, false);
  // Nueva temporada.
  r = E.rolloverSeason(st, new Date(2027, 0, 1, 9));
  assert.equal(r.events[0].type, 'season');
  assert.equal(st.progress.season, '2027-01');
  assert.equal(st.progress.xp, 0);
  assert.equal(game.rankForXp(st.progress.xp).name, 'Bronce III');
  assert.equal(st.progress.gems, 5 + SEA.seasonReward(2));
  assert.deepEqual(st.seasons[0], { id: '2026-10', months: 3, xp: 1450, rank: 'Oro II', tierIndex: 2, studyMin: 70, activeDays: 2, goalDays: 1, gems: 40 });
  assert.equal(st.sessions.length, 0); // detalle viejo borrado
  assert.equal(st.daily['2026-11-01'].studySec, 3000); // el calendario se conserva
  assert.ok(st.progress.achievements['primer-paso'] && st.progress.owned.includes('menta'));
  // Reloj atrasado: no se borra nada.
  st.progress.xp = 99;
  assert.equal(E.rolloverSeason(st, new Date(2026, 5, 1)).ok, false);
  assert.equal(st.progress.xp, 99);
});

test('temporadas: el archivo se valida y el ranking usa minutos de la temporada', () => {
  const st = S.validateState({
    progress: { xp: 10, season: '2026-10' },
    seasons: [{ id: '2026-07', xp: 1450, rank: '<b>Hack</b>', studyMin: 99, gems: 9999 }, { id: 'malo' }, { id: '__proto__' }],
    daily: { '2026-11-01': { studySec: 600, creditedSec: 600 }, '2026-09-30': { studySec: 600, creditedSec: 600 } },
  });
  assert.equal(st.progress.season, '2026-10');
  assert.equal(st.seasons.length, 1);
  assert.equal(st.seasons[0].rank, 'Oro II'); // el nombre se recalcula, no se confía en la copia
  assert.equal(st.seasons[0].gems, 1000);
  assert.equal(E.boardMinutes(st, new Date(2026, 10, 3, 12)).season, 10);
  const rows = L.localBoard({ period: 'season', you: { nick: 'pingu_estudia', avatar: '🐧', xp: 10, week: 0, season: 10, optIn: true } });
  assert.equal(rows.find((x) => x.isYou).minutes, 10);
});

test('clima: nieva casi siempre, cambia cada 3 horas y es igual para todos', () => {
  const count = { clear: 0, light: 0, medium: 0, heavy: 0 };
  for (let d = 1; d <= 30; d++) for (let h = 0; h < 24; h += 3) count[W.weatherAt(`2026-11-${U.pad2(d)}`, h)]++;
  const total = 240;
  assert.ok(count.clear / total < 0.4, 'más días con nieve que despejados');
  assert.ok(count.light > 0 && count.medium > 0 && count.heavy > 0, 'hay nieve poca, media y mucha');
  assert.equal(W.weatherAt('2026-11-03', 15), W.weatherAt('2026-11-03', 17.9)); // mismo bloque
  assert.ok(W.WEATHER_IDS.includes(W.weatherFor(new Date(2026, 10, 3, 16), 'America/Bogota')));
  assert.deepEqual(W.weatherLabel('clear', { night: true }), { icon: '🌙', text: 'Noche despejada' });
  assert.equal(W.weatherLabel('heavy', { dirty: true }).text, 'Nevada fuerte (gris por el esmog)');
});

test('onomatopeyas: cada animal tiene su voz y cambia con el momento', () => {
  const first = () => 0;
  assert.equal(V.pickVoice('penguin', {}, () => 0.9), V.VOICES.penguin[Math.floor(0.9 * V.VOICES.penguin.length)]);
  assert.equal(V.pickVoice('bear', { night: true }, first), 'Zzz…');
  assert.equal(V.pickVoice('fox', { weather: 'heavy' }, first), '¡Brrr, yip!');
  assert.ok(['¡Cof, cof!', '¡Puaj!', '¡Cof!'].includes(V.pickVoice('seal', { dirty: true }, first)));
  assert.match(V.pickVoice('penguin', { studying: true }), /bajito/);
  assert.ok(V.VOICES.penguin.includes(V.pickVoice('desconocido', {}, () => 0.1)));
  for (const kind of Object.values(V.COMPANION_KIND)) assert.ok(V.VOICES[kind], kind);
});

test('util: localParts da el día y la hora de otra zona horaria', () => {
  const at = new Date(Date.UTC(2026, 10, 4, 2, 30)); // 4 nov 02:30 UTC = 3 nov 21:30 en Bogotá
  assert.deepEqual(U.localParts(at, 'America/Bogota'), { key: '2026-11-03', hour: 21.5 });
  assert.equal(U.localParts(at, 'Asia/Tokyo').key, '2026-11-04');
});

test('tienda: la barriguita baja con el tiempo y cada animal tiene sus favoritas', () => {
  const st = S.defaultState();
  st.createdAt = '2026-11-03T12:00:00.000Z';
  const t0 = new Date('2026-11-03T12:00:00.000Z');
  assert.equal(PET.currentPetId(st), 'pinguino'); // sin compañero, el pingüino
  assert.equal(PET.fullness(st, 'pinguino', t0), PET.START_FULLNESS);
  assert.equal(PET.fullness(st, 'pinguino', new Date('2026-11-03T22:00:00.000Z')), 30); // 10 h × 3
  assert.equal(PET.fullness(st, 'pinguino', new Date('2026-11-05T12:00:00.000Z')), 0); // nunca baja de 0
  assert.equal(PET.mood(90).id, 'lleno');
  assert.equal(PET.mood(10).id, 'mucha-hambre');
  assert.equal(PET.fillFor('pinguino', 'pescado'), 18); // favorito: 12 × 1,5
  assert.equal(PET.fillFor('oso-polar', 'pescado'), 12);
  assert.equal(PET.FOODS.length, 12);
  assert.ok(PET.FOODS.every((f) => f.cost >= 2 && f.cost <= 8 && /^assets\/food\/[a-z-]+\.webp$/.test(f.img)));
  for (const [id, pet] of Object.entries(PET.PETS)) {
    assert.ok(catalog.COMPANION_BY_ID[id], `${id} es un compañero`);
    assert.ok(pet.favorites.every((f) => PET.FOOD_BY_ID[f]), `${id}: favoritas válidas`);
  }
});

test('tienda: darle de comer cobra gemas, llena la barriguita y respeta los límites', () => {
  const st = S.defaultState();
  st.createdAt = '2026-11-03T12:00:00.000Z';
  const now = new Date('2026-11-03T22:00:00.000Z'); // barriguita en 30
  st.progress.gems = 3;
  let r = E.feedPet(st, 'pescado', now);
  assert.equal(r.ok, true);
  assert.equal(st.progress.gems, 1);
  assert.equal(st.pets.pinguino.fullness, 48); // 30 + 18 (favorito)
  assert.equal(r.events[0].type, 'fed');
  assert.equal(r.events[0].favorite, true);
  assert.equal(st.progress.totals.fed, 1);
  r = E.feedPet(st, 'pollo', now);
  assert.deepEqual([r.ok, r.reason], [false, 'gems']);
  assert.equal(st.progress.gems, 1); // no se cobró nada
  st.progress.gems = 100;
  for (let i = 0; i < 3; i++) E.feedPet(st, 'almeja', now);
  assert.equal(st.pets.pinguino.fullness, 100);
  r = E.feedPet(st, 'pescado', now);
  assert.deepEqual([r.ok, r.reason], [false, 'full']);
  assert.equal(E.feedPet(st, 'piedra', now).reason, 'unknown');
  // Con otro compañero equipado, come él (cada mascota tiene su propia barriguita).
  st.profile.companion = 'oso-polar';
  E.feedPet(st, 'jamon', now);
  assert.ok(st.pets['oso-polar'].fullness > 30 && st.pets.pinguino.fullness === 100);
});

test('tienda: los datos de las mascotas se validan al cargar', () => {
  const st = S.validateState({
    pets: { pinguino: { fullness: 250, at: '2026-11-03T12:00:00.000Z' }, dragon: { fullness: 50, at: '2026-11-03T12:00:00.000Z' }, __proto__: { fullness: 1 }, 'oso-polar': { fullness: 40, at: 'ayer' } },
    progress: { totals: { fed: 7 } },
  });
  assert.deepEqual(Object.keys(st.pets), ['pinguino']);
  assert.equal(st.pets.pinguino.fullness, 100);
  assert.equal(st.progress.totals.fed, 7);
  assert.equal(V.pickVoice('bear', { ate: 'favorite' }), '¡Mi favorito! ¡Groar!');
  assert.equal(V.pickVoice('penguin', { hungry: true }, () => 0.1), '¡Pi-pi… tengo hambre!');
});

test('foto de perfil: solo imágenes WebP, JPEG o PNG en base64 y de tamaño razonable', () => {
  const ok = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const v = (photo) => S.validateState({ profile: { nick: 'pingu', photo } }).profile.photo;
  assert.equal(v(ok), ok);
  assert.equal(v('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pi8vPC9zY3JpcHQ+PC9zdmc+'), ''); // SVG no
  assert.equal(v('https://ejemplo.com/foto.jpg'), ''); // enlaces no
  assert.equal(v('data:image/png;base64,abc"><img src=x onerror=alert(1)>'), '');
  assert.equal(v('data:image/jpeg;base64,' + 'A'.repeat(400000)), ''); // demasiado grande
  assert.equal(S.defaultState().profile.photo, '');
});

test('premium: el regalo de bienvenida da 1000 gemas y una mascota limitada, una sola vez', () => {
  const st = S.defaultState();
  st.progress.gems = 20;
  const r = E.setPremium(st, true);
  assert.equal(st.progress.gems, 1020);
  assert.ok(r.events.some((e) => e.type === 'premiumGift' && e.gems === 1000 && e.choosePet));
  assert.equal(st.premium.bonusClaimed, true);
  assert.equal(st.premium.giftPending, true);
  // Activar y desactivar no repite el regalo
  E.setPremium(st, false);
  E.setPremium(st, true);
  assert.equal(st.progress.gems, 1020);
  // Elegir la mascota: solo una que no tengas
  assert.equal(E.giftCompanion(st, 'no-existe').ok, false);
  assert.equal(E.giftCompanion(st, 'oso-polar').ok, true);
  assert.deepEqual(st.progress.gifted, ['oso-polar']);
  assert.equal(st.premium.giftPending, false);
  assert.equal(E.giftCompanion(st, 'zorro-artico').ok, false); // el regalo ya se usó
  assert.equal(E.equipCompanion(st, 'oso-polar').ok, true);
  assert.equal(st.profile.companion, 'oso-polar');
});

test('premium: la mascota regalada sobrevive a guardar/cargar y no repite la ceremonia', () => {
  const st = S.defaultState();
  E.setPremium(st, true);
  E.giftCompanion(st, 'oso-polar');
  E.equipCompanion(st, 'oso-polar');
  const back = S.validateState(JSON.parse(JSON.stringify(st)));
  assert.deepEqual(back.progress.gifted, ['oso-polar']);
  assert.equal(back.profile.companion, 'oso-polar');
  assert.equal(back.premium.bonusClaimed, true);
  assert.equal(back.premium.giftPending, false);
  // Una copia manipulada no puede inventarse mascotas ni un regalo pendiente
  const evil = S.validateState({ ...JSON.parse(JSON.stringify(S.defaultState())), premium: { active: true, giftPending: true }, progress: { gifted: ['dragon', 'oso-polar', 'oso-polar'] } });
  assert.deepEqual(evil.progress.gifted, ['oso-polar']);
  assert.equal(evil.premium.giftPending, false);
});

// ---------------------------------------------------------------------------
// v3.5: "el reloj me espera" y "mantener sesión iniciada"
// ---------------------------------------------------------------------------
test('ajustes: el descanso automático se elige aparte y hereda el ajuste antiguo', () => {
  assert.equal(S.defaultState().settings.autoBreak, true);
  // Datos de antes (solo "Seguir solo" apagado): el descanso tampoco empieza solo.
  assert.equal(S.validateState({ settings: { autoContinue: false } }).settings.autoBreak, false);
  // Ya elegido por separado: se respeta cada uno.
  const st = S.validateState({ settings: { autoContinue: true, autoBreak: false } });
  assert.equal(st.settings.autoBreak, false);
  assert.equal(st.settings.autoContinue, true);
  assert.equal(S.validateState({ settings: { autoBreak: 'sí' } }).settings.autoBreak, true); // tipo inválido → por defecto
});

test('sesión recordada: el token abre solo su cuenta, vigente y con la huella correcta', async () => {
  const t = SEC.newRememberToken();
  assert.match(t, /^[0-9a-f]{64}$/);
  const tag = await SEC.rememberTag(t);
  const acc = { username: 'Pingu.Estudia', remember: tag };
  const now = Date.now();
  const rec = { u: 'pingu.estudia', t, exp: now + 1000 };
  assert.equal(await SEC.rememberValid(rec, acc, now), true);
  assert.equal(await SEC.rememberValid({ ...rec, exp: now - 1 }, acc, now), false); // vencido
  assert.equal(await SEC.rememberValid({ ...rec, exp: now + SEC.REMEMBER_MS * 2 }, acc, now), false); // fecha inventada
  assert.equal(await SEC.rememberValid({ ...rec, u: 'otro_usuario' }, acc, now), false); // otra cuenta
  assert.equal(await SEC.rememberValid({ ...rec, t: SEC.newRememberToken() }, acc, now), false); // otro token
  assert.equal(await SEC.rememberValid(rec, { username: 'Pingu.Estudia' }, now), false); // la cuenta lo desactivó
});

test('sesión recordada: la cuenta solo guarda la huella y el token se valida al leerlo', () => {
  const base = { username: 'pingu_estudia', hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 210000 };
  assert.equal(S.validateState({ account: { ...base, remember: 'c'.repeat(64) } }).account.remember, 'c'.repeat(64));
  assert.equal('remember' in S.validateState({ account: { ...base, remember: '<script>' } }).account, false);
  const b = S.memoryBackend();
  const store = S.createStore(b, S.memoryBackend());
  assert.equal(store.loadRemember(), null);
  store.saveRemember({ u: 'pingu_estudia', t: 'd'.repeat(64), exp: 123 });
  assert.deepEqual(store.loadRemember(), { u: 'pingu_estudia', t: 'd'.repeat(64), exp: 123 });
  assert.ok(b.getItem('st2_remember')); // vive en localStorage: sobrevive al cerrar la app
  b.setItem('st2_remember', JSON.stringify({ u: 'pingu_estudia', t: 'corto', exp: 1 }));
  assert.equal(store.loadRemember(), null); // manipulado → se ignora
  store.clearRemember();
  assert.equal(b.getItem('st2_remember'), null);
});

// ---------------------------------------------------------------------
// v3.9 — Ranking global
// ---------------------------------------------------------------------
import * as BOARD from '../js/board.js';
// (readFileSync y existsSync se importan arriba)

test('ranking global: la edad se calcula con mes y año (13 años o más)', () => {
  const now = new Date(2026, 10, 15); // 15 de noviembre de 2026
  assert.equal(BOARD.ageYears('2013-10', now), 13); // cumplió en octubre
  assert.equal(BOARD.ageYears('2013-11', now), 12); // en el mes del cumpleaños se cuenta como "aún no"
  assert.equal(BOARD.ageYears('2013-12', now), 12);
  assert.equal(BOARD.oldEnough('2013-10', now), true);
  assert.equal(BOARD.oldEnough('2014-01', now), false);
  assert.equal(BOARD.oldEnough('2000-05', now), true);
  for (const bad of ['', '2013', '2013-13', '13-2013', '1800-01', null]) assert.equal(BOARD.isBirth(bad), false, String(bad));
  assert.equal(BOARD.ageYears('nope', now), -1);
});

test('ranking global: la semana se reinicia el lunes 00:00 UTC', () => {
  const at = (iso) => BOARD.nextWeekReset(new Date(iso)).toISOString();
  assert.equal(at('2026-11-08T23:59:00Z'), '2026-11-09T00:00:00.000Z'); // domingo → lunes siguiente
  assert.equal(at('2026-11-09T00:00:00Z'), '2026-11-16T00:00:00.000Z'); // lunes → el otro lunes
  assert.equal(at('2026-11-11T12:00:00Z'), '2026-11-16T00:00:00.000Z'); // miércoles
});

test('ranking global: el servidor usa las mismas reglas de nombres y avatares que la app', () => {
  const sql = readFileSync(new URL('../server/supabase/schema.sql', import.meta.url), 'utf8');
  const arr = (fn) => {
    const body = sql.slice(sql.indexOf(`function private.${fn}()`));
    const inside = body.slice(body.indexOf('array[') + 6, body.indexOf(']', body.indexOf('array[')));
    return [...inside.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  };
  assert.deepEqual(arr('blocked_patterns'), identity.BLOCKED_PATTERNS, 'private.blocked_patterns() debe coincidir con identity.BLOCKED_PATTERNS');
  assert.deepEqual(arr('avatars'), identity.AVATARS, 'private.avatars() debe coincidir con identity.AVATARS');
  assert.ok(sql.includes(`'${identity.ALLOWED_PARTS.join('|')}'`), 'las palabras permitidas deben coincidir');
  assert.ok(sql.includes('select 4 * 60 * 60'), 'el tope diario del servidor es 4 h');
});

test('nombres de usuario: ya no se bloquean nombres inocentes (v3.9)', () => {
  for (const ok of ['kevin', 'nightowl', 'conocer', 'xavier', 'luna.k', 'Kaka', 'computadora', 'esperanza', 'operador', 'diputado']) {
    assert.equal(identity.checkUsername(ok).ok, true, ok);
  }
  for (const bad of ['puuuta', 'kkk_fan', 'xxx99', 'perrra', 'p_e_r_r_a', 'fuuuck', 'hdp_fan']) {
    assert.equal(identity.checkUsername(bad).ok, false, bad);
  }
});

test('ranking global: sin unirse, los pomodoros no se envían', async () => {
  const r = await BOARD.startSession(Date.now(), 1500);
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'notjoined');
  assert.deepEqual(await BOARD.flush(), { ok: true, credited: 0 });
});

test('cuentas en línea: lo que se sube no lleva la cuenta local ni la foto', async () => {
  const SYNC = await import('../js/sync.js');
  const st = S.defaultState();
  st.profile.nick = 'Ana_23'; st.profile.onboarded = true;
  st.profile.photo = 'data:image/png;base64,AAAA';
  st.account = { username: 'Ana_23', hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 210000, email: 'ana@example.com', online: true };
  st.progress.xp = 321; st.progress.totals.studySec = 7200;
  const snap = SYNC.snapshot(st);
  assert.equal(snap.account, undefined, 'la huella de la contraseña nunca se sube');
  assert.equal(snap.profile.photo, '', 'la foto nunca se sube');
  assert.equal(snap.progress.xp, 321);
  assert.equal(st.profile.photo.startsWith('data:'), true, 'el estado local no se toca');
  assert.equal(SYNC.studied(snap), 7200);
  // Traer: se conserva la cuenta y la foto de ESTE equipo
  const local = S.defaultState();
  local.account = { username: 'Ana_23', hash: 'c'.repeat(64), salt: 'd'.repeat(32), iter: 210000, email: 'ana@example.com', online: true };
  local.profile.photo = 'data:image/png;base64,BBBB';
  const back = SYNC.restore(snap, local);
  assert.equal(back.progress.xp, 321);
  assert.equal(back.account.hash, 'c'.repeat(64));
  assert.equal(back.account.online, true);
  assert.equal(back.profile.photo, 'data:image/png;base64,BBBB');
  assert.equal(back.profile.onboarded, true);
  // Si el nombre se cambió en otro equipo, también cambia aquí (y la cuenta de este equipo lo sigue)
  const renamed = SYNC.restore({ ...snap, profile: { ...snap.profile, nick: 'Ana_nueva' } }, local);
  assert.equal(renamed.profile.nick, 'Ana_nueva');
  assert.equal(renamed.account.username, 'Ana_nueva');
  assert.equal(renamed.account.hash, 'c'.repeat(64));
  // Algo raro en la nube se limpia (validateState)
  const weird = SYNC.restore({ ...snap, progress: { ...snap.progress, xp: 'muchísimo' }, profile: { ...snap.profile, photo: 'javascript:alert(1)' } }, null);
  assert.equal(weird.progress.xp, 0);
  assert.equal(weird.profile.photo, '');
  assert.equal(weird.account, null);
});

test('cuentas en línea: una cuenta en línea cuenta como 13+ en el ranking', () => {
  assert.equal(BOARD.eligible({ username: 'Ana_23', online: true }), true);
  assert.equal(BOARD.eligible({ username: 'Peque', birth: '2020-01' }), false);
  assert.equal(BOARD.eligible({ username: 'Sin_fecha' }), false);
});

test('cuenta: la fecha de nacimiento se guarda solo si es válida', () => {
  const base = { username: 'Ana_23', hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 210000 };
  const ok = S.validateState({ ...S.defaultState(), account: { ...base, birth: '2010-04', email: 'ana@example.com', online: true } });
  assert.equal(ok.account.birth, '2010-04');
  assert.equal(ok.account.online, true);
  const noMail = S.validateState({ ...S.defaultState(), account: { ...base, online: true } });
  assert.equal(noMail.account.online, undefined, 'sin correo no puede ser cuenta en línea');
  const bad = S.validateState({ ...S.defaultState(), account: { ...base, birth: '2010-4' } });
  assert.equal(bad.account.birth, undefined);
});

test('cerrar sesión (v4.0.1): la foto se guarda aparte por cuenta, se conservan idioma y fotos, y ya no se guarda nada', () => {
  const b = S.memoryBackend();
  const store = S.createStore(b);
  const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const foto = 'data:image/webp;base64,AAAA';
  assert.equal(store.keepPhoto('no-es-un-id', foto), false, 'solo con el id de una cuenta');
  assert.equal(store.keepPhoto(id(1), 'javascript:alert(1)'), false, 'solo fotos de verdad');
  for (const n of [1, 2, 3, 4]) store.keepPhoto(id(n), foto);
  assert.equal(store.photoFor(id(1)), '', 'se guardan solo las 3 más recientes');
  assert.equal(store.photoFor(id(4)), foto);
  store.dropPhoto(id(3)); // al volver a entrar, la foto pasa a la cuenta y se quita de aquí
  assert.equal(store.photoFor(id(3)), '');
  b.setItem('st2_lang', 'en');
  b.setItem('st2_state', '{}');
  b.setItem('st2_board', '{}');
  store.wipe({ keep: ['lang', 'photos'], final: true });
  assert.equal(b.getItem('st2_lang'), 'en', 'el idioma es del equipo');
  assert.equal(store.photoFor(id(4)), foto, 'la foto espera a que la cuenta vuelva');
  assert.equal(b.getItem('st2_state'), null);
  assert.equal(b.getItem('st2_board'), null);
  // Lo que siga corriendo antes de recargar ya no puede volver a escribir la cuenta
  assert.equal(store.save({ account: { username: 'x' } }), false);
  store.pref.set('paywall_day', '2026-11-08');
  assert.equal(b.getItem('st2_state'), null);
  assert.equal(b.getItem('st2_paywall_day'), null);
});

test('sonidos grabados (v4.0.2): cada uno existe, está en el catálogo y el bucle tiene sentido', () => {
  const ids = catalog.AMBIENTS.map((a) => a.id);
  assert.ok(ids.includes('pajaros'), 'está "Lluvia y pájaros"');
  assert.equal(catalog.AMBIENT_BY_ID.pajaros.premium, true);
  assert.equal(catalog.AMBIENT_BY_ID.lluvia.premium, undefined, 'Lluvia sigue gratis');
  const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  for (const [id, rec] of Object.entries(RECORDED)) {
    assert.ok(ids.includes(id), `${id} está en el catálogo`);
    assert.ok(existsSync(new URL(`../assets/sounds/${rec.file}`, import.meta.url)), `existe assets/sounds/${rec.file}`);
    assert.ok(rec.loopStart >= 0.5 && rec.loopEnd - rec.loopStart >= 20, `${id}: el bucle deja margen y dura al menos 20 s`);
    if (!catalog.AMBIENT_BY_ID[id].premium) assert.ok(sw.includes(`./assets/sounds/${rec.file}`), `${id} (gratis) queda guardado para usarlo sin internet`);
  }
  assert.ok(catalog.AMBIENTS.find((a) => a.id === catalog.DEFAULT_AMBIENT), 'el sonido de siempre existe');
  // El sonido nuevo se valida como cualquier otro
  const st = S.validateState({ settings: { ambient: 'pajaros' } });
  assert.equal(st.settings.ambient, 'pajaros');
});
