/*
 * FrostPom — onomatopeyas de los animales del polo.
 * De vez en cuando, los animales del paisaje y tu compañero "dicen" algo en un globo.
 * Lo que dicen depende del momento: de noche tienen sueño, con nevada fuerte tienen frío,
 * con esmog tosen y mientras estudias hablan bajito para no distraerte.
 *
 * Módulo puro: recibe el contexto y una función de azar.
 */

export const VOICES = Object.freeze({
  penguin: ['¡Cuac!', '¡Pi-pi!', '¡Honk honk!', '¡Cuac cuac!', '¡Plaf!', '¡Yupi!', '¡Piu piu!'],
  bear: ['¡Grrr!', '¡Groar!', '¡Ñam ñam!', '¡Uff!', '¡Grr-grr!'],
  fox: ['¡Yip yip!', '¡Kekeke!', '¡Fiu fiu!', '¡Yap!'],
  seal: ['¡Arf arf!', '¡Ou ou!', '¡Plof!', '¡Arf!'],
  shark: ['¡Ñam!', '¡Glu glu!', '¡Chomp!', '¡Blub!'],
});
const SLEEPY = { penguin: 'Zzz… pi', bear: 'Zzz…', fox: 'Zzz…', seal: 'Zzz… arf', shark: 'Blub… zzz' };
const COLD = { penguin: '¡Brrr, cuac!', bear: '¡Brrr!', fox: '¡Brrr, yip!', seal: '¡Brrr, arf!', shark: '¡Brrr, glu!' };
const SMOG = ['¡Cof, cof!', '¡Puaj!', '¡Cof!'];
const HUNGRY = { penguin: '¡Pi-pi… tengo hambre!', bear: '¡Grr… mi pancita!', fox: '¡Yip… hambre!', seal: '¡Arf… comida!', shark: '¡Ñam? Hambre…' };
const YUM = { penguin: '¡Ñam ñam, cuac!', bear: '¡Ñam ñam ñam!', fox: '¡Ñam, yip yip!', seal: '¡Arf arf, ñam!', shark: '¡Chomp chomp!' };
const FAVORITE = { penguin: '¡Mi favorito! ¡Cuac!', bear: '¡Mi favorito! ¡Groar!', fox: '¡Mi favorito! ¡Yip!', seal: '¡Mi favorito! ¡Arf!', shark: '¡Mi favorito! ¡Chomp!' };
const QUIET = { penguin: 'pi… (bajito)', bear: 'grr… (bajito)', fox: 'yip… (bajito)', seal: 'arf… (bajito)', shark: 'glu… (bajito)' };

/** Qué animal es cada compañero (para la voz del que te acompaña en Enfocar). */
export const COMPANION_KIND = Object.freeze({
  pinguino: 'penguin', 'oso-polar': 'bear', 'oso-marino': 'seal', 'tiburon-martillo': 'shark', 'zorro-artico': 'fox',
});

/**
 * Elige qué dice un animal.
 * ctx = { night, weather ('clear'|'light'|'medium'|'heavy'), dirty (polo contaminado), studying,
 *         hungry (tu mascota tiene mucha hambre), ate ('yum' | 'favorite': acaba de comer) }
 */
export function pickVoice(kind, ctx = {}, rnd = Math.random) {
  const k = VOICES[kind] ? kind : 'penguin';
  if (ctx.ate === 'favorite') return FAVORITE[k];
  if (ctx.ate) return YUM[k];
  const roll = rnd();
  if (ctx.hungry && roll < 0.6) return HUNGRY[k];
  if (ctx.studying) return QUIET[k];
  if (ctx.dirty && roll < 0.45) return SMOG[Math.floor(rnd() * SMOG.length)];
  if (ctx.night && roll < 0.35) return SLEEPY[k];
  if (ctx.weather === 'heavy' && roll < 0.5) return COLD[k];
  const list = VOICES[k];
  return list[Math.floor(rnd() * list.length)];
}
