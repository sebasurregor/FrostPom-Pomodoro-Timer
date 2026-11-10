/*
 * FrostPom — onomatopeyas de los animales del polo.
 * De vez en cuando, los animales del paisaje y tu compañero "dicen" algo en un globo.
 * Lo que dicen depende del momento: de noche tienen sueño, con nevada fuerte tienen frío,
 * con esmog tosen y mientras estudias hablan bajito para no distraerte.
 *
 * Módulo puro: recibe el contexto y una función de azar.
 */

import { tr } from './i18n.js';

export const VOICES = Object.freeze({
  penguin: [tr('¡Cuac!'), tr('¡Pi-pi!'), tr('¡Honk honk!'), tr('¡Cuac cuac!'), tr('¡Plaf!'), tr('¡Yupi!'), tr('¡Piu piu!')],
  bear: [tr('¡Grrr!'), tr('¡Groar!'), tr('¡Ñam ñam!'), tr('¡Uff!'), tr('¡Grr-grr!')],
  fox: [tr('¡Yip yip!'), tr('¡Kekeke!'), tr('¡Fiu fiu!'), tr('¡Yap!')],
  seal: [tr('¡Arf arf!'), tr('¡Ou ou!'), tr('¡Plof!'), tr('¡Arf!')],
  shark: [tr('¡Ñam!'), tr('¡Glu glu!'), tr('¡Chomp!'), tr('¡Blub!')],
});
const SLEEPY = { penguin: tr('Zzz… pi'), bear: tr('Zzz…'), fox: tr('Zzz…'), seal: tr('Zzz… arf'), shark: tr('Blub… zzz') };
const COLD = { penguin: tr('¡Brrr, cuac!'), bear: tr('¡Brrr!'), fox: tr('¡Brrr, yip!'), seal: tr('¡Brrr, arf!'), shark: tr('¡Brrr, glu!') };
const SMOG = [tr('¡Cof, cof!'), tr('¡Puaj!'), tr('¡Cof!')];
const HUNGRY = { penguin: tr('¡Pi-pi… tengo hambre!'), bear: tr('¡Grr… mi pancita!'), fox: tr('¡Yip… hambre!'), seal: tr('¡Arf… comida!'), shark: tr('¡Ñam? Hambre…') };
// (v4.2) Con la barriguita en 0 lloran, y cuando los revives vuelven felices
const STARVING = { penguin: tr('¡Buaaa! ¡Pi-pi, hambre!'), bear: tr('¡Buaaa! ¡Grr… hambre!'), fox: tr('¡Buaaa! ¡Yip… hambre!'), seal: tr('¡Buaaa! ¡Arf… hambre!'), shark: tr('¡Buaaa! ¡Glu… hambre!') };
const REVIVED = { penguin: tr('¡Volví! ¡Cuac cuac!'), bear: tr('¡Volví! ¡Groar!'), fox: tr('¡Volví! ¡Yip yip!'), seal: tr('¡Volví! ¡Arf arf!'), shark: tr('¡Volví! ¡Chomp!') };
const YUM = { penguin: tr('¡Ñam ñam, cuac!'), bear: tr('¡Ñam ñam ñam!'), fox: tr('¡Ñam, yip yip!'), seal: tr('¡Arf arf, ñam!'), shark: tr('¡Chomp chomp!') };
const FAVORITE = { penguin: tr('¡Mi favorito! ¡Cuac!'), bear: tr('¡Mi favorito! ¡Groar!'), fox: tr('¡Mi favorito! ¡Yip!'), seal: tr('¡Mi favorito! ¡Arf!'), shark: tr('¡Mi favorito! ¡Chomp!') };
const QUIET = { penguin: tr('pi… (bajito)'), bear: tr('grr… (bajito)'), fox: tr('yip… (bajito)'), seal: tr('arf… (bajito)'), shark: tr('glu… (bajito)') };

/** Qué animal es cada compañero (para la voz del que te acompaña en Enfocar). */
export const COMPANION_KIND = Object.freeze({
  pinguino: 'penguin', 'oso-polar': 'bear', 'oso-marino': 'seal', 'tiburon-martillo': 'shark', 'zorro-artico': 'fox',
});

/**
 * Elige qué dice un animal.
 * ctx = { night, weather ('clear'|'light'|'medium'|'heavy'), dirty (polo contaminado), studying,
 *         hungry (tu mascota tiene mucha hambre), starving (su barriguita está en 0),
 *         ate ('yum' | 'favorite': acaba de comer), revived (la acabas de revivir) }
 */
export function pickVoice(kind, ctx = {}, rnd = Math.random) {
  const k = VOICES[kind] ? kind : 'penguin';
  if (ctx.ate === 'favorite') return FAVORITE[k];
  if (ctx.ate) return YUM[k];
  if (ctx.revived) return REVIVED[k];
  const roll = rnd();
  if (ctx.starving && roll < 0.8) return STARVING[k];
  if (ctx.hungry && roll < 0.6) return HUNGRY[k];
  if (ctx.studying) return QUIET[k];
  if (ctx.dirty && roll < 0.45) return SMOG[Math.floor(rnd() * SMOG.length)];
  if (ctx.night && roll < 0.35) return SLEEPY[k];
  if (ctx.weather === 'heavy' && roll < 0.5) return COLD[k];
  const list = VOICES[k];
  return list[Math.floor(rnd() * list.length)];
}
