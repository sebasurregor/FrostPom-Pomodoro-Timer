/*
 * FrostPom — vista Perfil: tarjeta, estadísticas, compañeros, temas y logros.
 */
import * as U from '../util.js';
import * as G from '../game.js';
import * as C from '../catalog.js';
import * as E from '../engine.js';
import { countryName } from '../identity.js';
import { $, h, fmtInt } from './dom.js';
import { openDialog, confirmDialog } from './feedback.js';
import { emblem } from './emblems.js';
import { companion } from './companions.js';
import { avatarContent, countryPicker, flagEl } from './widgets.js';
import { pickProfilePhoto } from './photo.js';
import { premiumDialog, giftCompanionDialog } from './premium.js';
import { renameFlow } from './account.js';
import * as BOARD from '../board.js';
import { pic } from './pics.js';
import { state, mutate, today } from './context.js';
import { config } from '../config.js';
import { seasonFor, seasonById, daysLeft } from '../season.js';
import { t, tr, isEnglish } from '../i18n.js';

async function changeCountryFlow() {
  let pick = state.profile.country;
  const res = await openDialog({
    title: 'Tu nacionalidad',
    body: [countryPicker(pick, (v) => { pick = v; })],
    actions: [{ label: 'Cancelar', value: 'cancel' }, { label: 'Guardar', value: 'ok', variant: 'btn--gold', primary: true }],
  });
  if (res === 'ok') {
    mutate((st) => { st.profile.country = pick; });
    // Ranking global: la bandera también cambia allá (si no hay internet, al volver a unirte)
    BOARD.update({ username: state.profile.nick, country: pick, avatar: state.profile.avatar, show: state.settings.leaderboardOn }).catch(() => {});
  }
}

// La sección de la foto sigue abierta después de guardar o quitar la foto (la tarjeta se vuelve a dibujar).
let photoOpen = false;

function renderProfileCard() {
  const r = G.rankForXp(state.progress.xp);
  const comp = state.profile.companion ? C.COMPANION_BY_ID[state.profile.companion] : null;
  $('#profileCard').replaceChildren(
    h('div', { class: 'profile-card__top', vars: { '--rank-a': r.colors.a, '--rank-b': r.colors.b } },
      h('span', { class: `avatar avatar--profile${comp || state.profile.photo ? ' has-companion' : ''}` }, avatarContent(120)),
      h('div', { class: 'profile-card__who' },
        h('p', { class: 'profile-card__nick' }, flagEl(state.profile.country, 'flag--lg'), ' ', state.profile.nick || 'Estudiante'),
        h('p', { class: 'profile-card__country' },
          state.profile.country ? countryName(state.profile.country) : 'Sin nacionalidad',
          ' · ',
          h('button', { type: 'button', class: 'link-btn', onclick: changeCountryFlow }, state.profile.country ? 'Cambiar' : 'Elegir país')),
        h('p', { class: 'profile-card__rank' }, h('span', { class: 'profile-card__emblem' }, emblem(r, { size: 28, label: false })), r.name),
        comp ? h('p', { class: 'profile-card__comp', text: `Con ${comp.name}` }) : null,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn--paper btn--sm', onclick: renameFlow }, 'Cambiar nombre'),
          comp ? h('button', { type: 'button', class: 'btn btn--paper btn--sm', onclick: () => mutate((s) => E.equipCompanion(s, null)) }, 'Quitar compañero') : null))),
    // Solo foto: el animal se asigna al azar al crear la cuenta y no se elige de una lista.
    h('details', { class: 'avatar-picker', open: photoOpen, ontoggle: (e) => { photoOpen = e.currentTarget.open; } },
      h('summary', { text: 'Tu foto de perfil' }),
      h('div', { class: 'btn-row photo-row' },
        h('button', { type: 'button', class: 'btn btn--gold btn--sm', id: 'photoBtn', onclick: uploadPhoto }, pic('foto', 22), state.profile.photo ? 'Cambiar foto' : 'Subir una foto'),
        state.profile.photo ? h('button', { type: 'button', class: 'btn btn--paper btn--sm', id: 'photoRemoveBtn', onclick: () => mutate((st) => { st.profile.photo = ''; }) }, 'Quitar foto') : null),
      h('p', { class: 'photo-note', text: state.profile.photo
        ? 'Tu foto se queda solo en este dispositivo. En el ranking, los demás ven tu animal.'
        : t('Sin foto, te acompaña tu animal ({animal}). La foto se queda solo en este dispositivo.', { animal: state.profile.avatar }) })));
}

async function uploadPhoto() {
  const url = await pickProfilePhoto();
  if (url) mutate((st) => { st.profile.photo = url; });
}

function renderStats() {
  const tot = state.progress.totals;
  const streak = G.computeStreak(state.daily, today());
  const got = G.ACHIEVEMENTS.filter((a) => state.progress.achievements[a.id]).length;
  const tiles = [
    ['Tiempo estudiado', U.formatMinutes(tot.studySec / 60)],
    ['Sesiones completas', fmtInt(tot.sessions)],
    ['Racha actual', U.plural(streak.current, 'día', 'días')],
    ['Mejor racha', U.plural(Math.max(state.progress.bestStreak, streak.current), 'día', 'días')],
    ['Descansos tomados', fmtInt(tot.breaks)],
    ['Mejor combo', U.plural(state.progress.bestCombo, 'sesión', 'sesiones')],
    ['Logros', t('{a} de {b}', { a: got, b: G.ACHIEVEMENTS.length })],
    ['Misiones reclamadas', fmtInt(tot.missionsClaimed)],
  ];
  $('#statsGrid').replaceChildren(...tiles.map(([k, v]) => h('div', { class: 'stat' }, h('dt', { text: k }), h('dd', { text: v }))));
}

function renderCompanions() {
  const { achievements, gifted } = state.progress;
  const owned = C.COMPANIONS.filter((c) => C.companionUnlocked(c.id, achievements, gifted)).length;
  $('#compMeta').replaceChildren(state.premium.giftPending
    ? h('button', { type: 'button', class: 'btn btn--crown btn--sm', id: 'giftPetBtn', onclick: giftCompanionDialog }, pic('cofre', 22), 'Elige tu mascota')
    : t('{a} de {b}', { a: owned, b: C.COMPANIONS.length }));
  $('#companionGrid').replaceChildren(...C.COMPANIONS.map((c) => {
    const unlocked = C.companionUnlocked(c.id, achievements, gifted);
    const isGift = gifted.includes(c.id);
    // Sin compañero elegido, el que te acompaña en Enfocar es el Pingüino
    const using = state.profile.companion === c.id || (!state.profile.companion && c.starter);
    const ach = c.unlock ? G.ACHIEVEMENT_BY_ID[c.unlock] : null;
    const rarity = ach ? ach.rarity : 'comun';
    let action;
    if (using) action = h('span', { class: 'skin__using', text: 'Contigo' });
    else if (unlocked) action = h('button', { type: 'button', class: 'btn btn--gold btn--sm', onclick: () => mutate((s) => E.equipCompanion(s, c.id)) }, 'Elegir');
    else action = h('span', { class: 'companion-card__lock' }, pic('candado', 18), t('Logro: {name}', { name: ach.name }));
    return h('li', { class: `companion-card companion-card--${rarity}${unlocked ? ' is-unlocked' : ''}${using ? ' is-using' : ''}` },
      h('span', { class: 'companion-card__tag', text: c.starter ? 'Incluido' : isGift ? 'Regalo Premium' : unlocked ? G.RARITY[rarity].label : 'Limitado' }),
      h('span', { class: 'companion-card__art' }, companion(c.id, { size: 88, locked: !unlocked, title: unlocked ? c.name : `${c.name}, bloqueado` })),
      h('span', { class: 'companion-card__name', text: unlocked ? c.name : '???' }),
      h('span', { class: 'companion-card__how', text: unlocked || !ach ? c.tagline : ach.desc }),
      action);
  }));
}

const chooseSkin = (skin) => mutate((s) => E.chooseSkin(s, skin.id, today()));
async function buySkin(skin) {
  const ok = await confirmDialog(t('¿Comprar {name}?', { name: skin.name }), t('Cuesta {cost} gemas y te quedarían {left}. Las gemas solo se ganan estudiando.', { cost: skin.cost, left: state.progress.gems - skin.cost }), 'Comprar', 'btn--gold');
  if (ok) chooseSkin(skin);
}

/** Botón (o etiqueta) de cada tema según su estado en el catálogo. */
const SKIN_ACTIONS = {
  owned: (skin) => h('button', { type: 'button', class: 'btn btn--paper btn--sm', onclick: () => chooseSkin(skin) }, 'Usar'),
  included: (skin) => h('button', { type: 'button', class: 'btn btn--mint btn--sm', onclick: () => chooseSkin(skin) }, 'Usar'),
  unlockable: (skin) => h('button', { type: 'button', class: 'btn btn--mint btn--sm', onclick: () => chooseSkin(skin) }, 'Desbloquear'),
  buyable: (skin) => h('button', { type: 'button', class: 'btn btn--gold btn--sm', 'aria-label': t('Comprar {name} por {cost} gemas', { name: skin.name, cost: skin.cost }), onclick: () => buySkin(skin) }, t('{n} gemas', { n: skin.cost })),
  premium: () => h('button', { type: 'button', class: 'btn btn--crown btn--sm', onclick: premiumDialog }, pic('corona', 20), 'Premium'),
};

function renderSkins() {
  $('#shopMeta').textContent = t('Tienes {n} gemas', { n: fmtInt(state.progress.gems) });
  $('#skinGrid').replaceChildren(...C.SKINS.map((skin) => {
    const st = C.skinStatusFor(state, skin);
    const using = state.settings.skin === skin.id;
    const action = using
      ? h('span', { class: 'skin__using', text: 'Usando' })
      : SKIN_ACTIONS[st.state] ? SKIN_ACTIONS[st.state](skin) : h('span', { class: 'skin__locked', text: st.reason });
    return h('li', { class: `skin${using ? ' is-using' : ''}${skin.premium ? ' is-premium' : ''}` },
      skin.premium ? h('span', { class: 'skin__crown' }, pic('corona', 22, 'Tema Premium')) : null,
      h('span', { class: 'skin__preview', vars: { '--a': skin.a, '--b': skin.b }, 'aria-hidden': 'true' }),
      h('span', { class: 'skin__name', text: skin.name }),
      action);
  }));
}

let selectedBadge = null;
function renderBadges() {
  const unlocked = state.progress.achievements;
  const count = G.ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  $('#achMeta').textContent = t('{a} de {b}', { a: count, b: G.ACHIEVEMENTS.length });
  const select = (id) => { selectedBadge = id; showBadgeCaption(); };
  $('#badgeGrid').replaceChildren(...G.ACHIEVEMENTS.map((a) => {
    const got = !!unlocked[a.id];
    return h('li', {},
      h('button', {
        type: 'button', class: `badge badge--${a.rarity}${got ? ' is-got' : ''}`, 'aria-describedby': 'badgeCaption',
        'aria-label': `${a.name}, ${tr(got ? 'desbloqueado' : 'bloqueado')}`,
        onclick: () => select(a.id),
        onfocus: () => select(a.id),
      },
      h('span', { class: 'badge__icon', 'aria-hidden': 'true', text: got ? a.icon : '?' }),
      h('span', { class: 'badge__name', text: a.name })));
  }));
  showBadgeCaption();
}
function showBadgeCaption() {
  const cap = $('#badgeCaption');
  if (!cap) return;
  const a = G.ACHIEVEMENT_BY_ID[selectedBadge];
  if (!a) {
    cap.textContent = tr('Toca un logro para ver cómo conseguirlo.');
    return;
  }
  const got = state.progress.achievements[a.id];
  cap.textContent = t('{name}: {desc} {rarity}, +{n} gemas.', { name: a.name, desc: a.desc, rarity: G.RARITY[a.rarity].label, n: G.RARITY[a.rarity].gems }) + (got ? t(' Conseguido el {date}.', { date: U.formatDateTime(got) }) : '');
}

/** Barra de la temporada actual (se llena con los días) y medallas de las pasadas. */
function renderSeasons() {
  const months = config.season.months;
  const cur = seasonFor(new Date(), months);
  const left = daysLeft(cur, today());
  const total = U.daysBetween(cur.startKey, cur.endKey) + 1;
  const day = total - left + 1; // hoy cuenta como día jugado
  const pct = Math.round((day / total) * 100);
  const last = new Date(cur.end.getTime() - 86400000);
  const short = (d) => (isEnglish ? `${U.MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${U.MONTHS_SHORT[d.getMonth()]}`);
  $('#seasonMeta').textContent = U.plural(state.seasons.length, 'terminada', 'terminadas');
  $('#seasonName').textContent = cur.name;
  $('#seasonLeft').textContent = left === 1 ? tr('¡Último día!') : t('Quedan {n} días', { n: left });
  $('#seasonFill').style.setProperty('--p', `${pct}%`);
  $('#seasonMeter').setAttribute('aria-valuenow', String(pct));
  $('#seasonMeter').setAttribute('aria-valuetext', t('Día {day} de {total}, quedan {left} días', { day, total, left }));
  $('#seasonStart').textContent = short(cur.start);
  $('#seasonEnd').textContent = short(last);
  $('#seasonNow').textContent = t('Cada temporada dura {months}. Esta termina el {date}. Al terminar recibes de 10 a 100 gemas según tu rango, queda una medalla aquí abajo y empiezas otra vez desde Bronce III.', { months: U.plural(months, 'mes', 'meses'), date: U.formatDayMonth(last) });
  if (!state.seasons.length) {
    $('#seasonList').replaceChildren(h('li', { class: 'empty', text: 'Aquí aparecerán tus medallas cuando termine tu primera temporada.' }));
    return;
  }
  $('#seasonList').replaceChildren(...state.seasons.map((x) => {
    const sea = seasonById(x.id, x.months);
    const r = G.rankForXp(x.xp);
    return h('li', { class: 'season-row' },
      h('span', { class: 'season-row__emblem' }, emblem(r, { size: 40, label: false })),
      h('span', { class: 'season-row__main' },
        h('b', { text: sea ? sea.label : x.id }),
        h('small', { text: `${r.name} · ${t('{time} en {days}', { time: U.formatMinutes(x.studyMin), days: U.plural(x.activeDays, 'día', 'días') })}` })),
      x.gems ? h('span', { class: 'season-row__gems', text: t('+{n} gemas', { n: x.gems }) }) : null);
  }));
}

function toggleSeasonInfo() {
  const btn = $('#seasonInfoBtn');
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  $('#seasonInfo').hidden = !open;
}

export function bindProfile() {
  $('#seasonInfoBtn').addEventListener('click', toggleSeasonInfo);
}

export function renderProfile() {
  renderProfileCard();
  renderStats();
  renderCompanions();
  renderSkins();
  renderSeasons();
  renderBadges();
}
