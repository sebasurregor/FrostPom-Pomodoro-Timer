/*
 * FrostPom (v4.7.0) — arma las Edge Functions en UN solo archivo cada una, para pegarlas en
 * Supabase → Edge Functions → "Deploy a new function" → "Via Editor" (sin instalar nada).
 *
 * El código de verdad está en server/supabase/functions/_shared/premium.js (con pruebas). Este
 * script solo lo junta con la parte de arriba de cada función. Las pruebas revisan que los archivos
 * para pegar estén al día (tests/billing-server.test.js).
 *
 * Uso: node tools/edge-pegar.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'server/supabase/functions');
const OUT = join(FN, 'pegar-en-supabase');

const FUNCTIONS = {
  'rc-webhook': { handler: 'handleWebhook', what: 'el aviso de RevenueCat cuando cambia una suscripción' },
  'premium-sync': { handler: 'handleSync', what: 'la app pide "revisa mi Premium" después de comprar o restaurar' },
};

/** El contenido del archivo para pegar de una función. */
export function pasteFile(name) {
  const f = FUNCTIONS[name];
  const shared = readFileSync(join(FN, '_shared/premium.js'), 'utf8').replace(/\r\n/g, '\n');
  return [
    '// @ts-nocheck',
    `// FrostPom (v4.7.0) — Edge Function "${name}": ${f.what}.`,
    '// ARCHIVO GENERADO por tools/edge-pegar.mjs desde server/supabase/functions/_shared/premium.js.',
    '// No lo edites aquí: cambia premium.js y vuelve a correr  node tools/edge-pegar.mjs',
    '// Cómo usarlo: Supabase → Edge Functions → Deploy a new function → Via Editor → nombre',
    `// "${name}" → borra lo que trae y pega TODO este archivo → Deploy. Después, en Details,`,
    '// apaga "Verify JWT with legacy secret" (o "Enforce JWT verification"). docs/GOOGLE-PLAY-BILLING.md',
    '',
    shared.trimEnd(),
    '',
    '// ---------------------------------------------------------------------',
    `Deno.serve((req) => ${f.handler}(req, { env: (n) => Deno.env.get(n) ?? '', fetch }));`,
    '',
  ].join('\n');
}

export function writeAll() {
  mkdirSync(OUT, { recursive: true });
  for (const name of Object.keys(FUNCTIONS)) writeFileSync(join(OUT, `${name}.ts`), pasteFile(name));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeAll();
  console.log(`Listo: ${Object.keys(FUNCTIONS).map((n) => `pegar-en-supabase/${n}.ts`).join(', ')}`);
}
