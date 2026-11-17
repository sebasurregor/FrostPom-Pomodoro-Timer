/*
 * FrostPom (v4.8.0) — revisa, DESPUÉS de `npx cap sync android`, que la parte nativa propia
 * (@frostpom/timer: la notificación tipo reproductor, los widgets y el aviso del final) quedó
 * dentro del proyecto de Android. Si no está, el .aab sale SIN widgets y SIN reproductor, y nada
 * avisa: eso pasó con la 4.7.4. Lo corre `npm run android:actualizar` al final.
 *
 * Mira tres archivos que escribe Capacitor:
 *   android/capacitor.settings.gradle            include ':frostpom-timer'
 *   android/app/capacitor.build.gradle           implementation project(':frostpom-timer')
 *   android/app/src/main/assets/capacitor.plugins.json   …FrostTimerPlugin
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => {
  const path = join(ROOT, ...p);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const checks = [
  ['android/capacitor.settings.gradle', /frostpom-timer/.test(read('android', 'capacitor.settings.gradle'))],
  ['android/app/capacitor.build.gradle', /project\(\s*':frostpom-timer'\s*\)/.test(read('android', 'app', 'capacitor.build.gradle'))],
  ['android/app/src/main/assets/capacitor.plugins.json', /FrostTimerPlugin/.test(read('android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json'))],
];
const missing = checks.filter(([, ok]) => !ok).map(([f]) => f);
const linked = existsSync(join(ROOT, 'node_modules', '@frostpom', 'timer', 'package.json'));

if (missing.length) {
  console.error('[X] La parte nativa de FrostPom (@frostpom/timer: reproductor, widgets y aviso del final) NO quedó en el proyecto de Android.');
  console.error(`    Falta en: ${missing.join(', ')}`);
  if (!linked) console.error('    Además, no existe node_modules/@frostpom/timer: corre "npm install" en la carpeta del proyecto.');
  console.error('    Arréglalo así: npm install  y otra vez  npm run android:actualizar');
  console.error('    No generes el .aab hasta que este mensaje desaparezca (saldría sin widgets ni reproductor).');
  process.exit(1);
}
console.log('[OK] La parte nativa de FrostPom (reproductor, widgets y aviso del final) está en el proyecto de Android.');
