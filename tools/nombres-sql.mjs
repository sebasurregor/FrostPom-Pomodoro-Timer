// FrostPom — (v4.5.1) Genera las funciones SQL del filtro de nombres a partir de js/identity.js, para
// que el servidor (server/supabase/schema.sql) use EXACTAMENTE las mismas listas que la app.
// Uso: node tools/nombres-sql.mjs   → copia lo que imprime en schema.sql (reemplaza esas funciones).
import * as I from '../js/identity.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (list, per = 8) => {
  const lines = [];
  for (let i = 0; i < list.length; i += per) lines.push('    ' + list.slice(i, i + per).map(q).join(','));
  return lines.join(',\n');
};
const ACCENTS = ['ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc'];
const LEET = ['0134578@$9', 'oieastbasg'];
export const TRANSLATE_FROM = ACCENTS[0] + I.LOOKALIKES[0] + LEET[0];
export const TRANSLATE_TO = ACCENTS[1] + I.LOOKALIKES[1] + LEET[1];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`-- Groserías, ofensas y suplantación (js/identity.js: BLOCKED_PATTERNS, generado de BLOCKED).
-- Cada letra lleva "+" para atrapar "puuuta" sin bloquear palabras parecidas ("esperanza").
-- (v4.5.1) Generado con: node tools/nombres-sql.mjs
create or replace function private.blocked_patterns() returns text[]
language sql immutable set search_path = '' as $$
  select array[
${arr(I.BLOCKED_PATTERNS)}
  ]
$$;

-- (v4.5.1) Las mismas palabras en su forma "sonora" (js/identity.js: BLOCKED_SOUNDS).
create or replace function private.blocked_sounds() returns text[]
language sql immutable set search_path = '' as $$
  select array[
${arr(I.BLOCKED_SOUNDS)}
  ]
$$;

-- Forma "plana" del nombre, igual que plainName() en js/identity.js: sin tildes, letras parecidas de
-- otros alfabetos → las nuestras, 0→o, 4→a…, solo letras, y sin las palabras inocentes que contienen
-- un pedazo de grosería.
create or replace function private.plain_name(v text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             lower(translate(coalesce(v, ''),
               ${q(TRANSLATE_FROM)},
               ${q(TRANSLATE_TO)})),
             '[^a-z]', '', 'g'),
           ${q(I.ALLOWED_PARTS.join('|'))}, '', 'g')
$$;`);
}
