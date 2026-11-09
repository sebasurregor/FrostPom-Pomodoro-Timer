/*
 * FrostPom — copia la app web a la carpeta www/, que Capacitor mete dentro de la app de Android.
 * Solo lo que la app usa: sin docs, pruebas, servidor ni el service worker (dentro de la app no
 * hace falta). La carpeta www/ se crea de nuevo cada vez y no se sube a GitHub (.gitignore).
 *
 * Uso: npm run android:www   (lo llaman android:crear y android:actualizar)
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'www');
const FILES = ['index.html', 'privacidad.html', 'normas.html', 'eliminar-cuenta.html', 'manifest.webmanifest'];
const FOLDERS = ['css', 'js', 'assets'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  if (!existsSync(join(ROOT, f))) throw new Error(`Falta ${f}: ¿estás en la carpeta de FrostPom?`);
  cpSync(join(ROOT, f), join(OUT, f));
}
for (const d of FOLDERS) cpSync(join(ROOT, d), join(OUT, d), { recursive: true });

let count = 0;
let bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else { count += 1; bytes += st.size; }
  }
};
walk(OUT);
console.log(`[OK] www/ lista: ${count} archivos, ${(bytes / 1048576).toFixed(1)} MB`);
