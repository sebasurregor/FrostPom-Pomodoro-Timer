/*
 * FrostPom — ajusta el proyecto de Android que crea Capacitor (carpeta android/).
 *
 *  1. Copia los íconos, el ícono de las notificaciones y la pantalla de inicio de
 *     android-recursos/res/ (los genera tools/recursos_android.py).
 *  2. Pone la versión de package.json en la app: versionName "4.1.0" y versionCode 40100
 *     (Google Play exige que versionCode suba en cada versión que subas).
 *
 * Se puede correr las veces que quieras. Uso: lo llaman npm run android:crear y android:actualizar.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'android', 'app');
if (!existsSync(APP)) {
  console.error('[X] No existe la carpeta android/. Primero: npm run android:crear');
  process.exit(1);
}

// 1. Íconos y pantalla de inicio
cpSync(join(ROOT, 'android-recursos', 'res'), join(APP, 'src', 'main', 'res'), { recursive: true });

// 2. Versión
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!m) {
  console.error(`[X] La versión de package.json ("${version}") debe ser como 4.1.0`);
  process.exit(1);
}
const code = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
const gradlePath = join(APP, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const before = gradle;
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"/.test(gradle)) {
  console.error('[X] No encontré versionCode / versionName en android/app/build.gradle');
  process.exit(1);
}
if (gradle !== before) writeFileSync(gradlePath, gradle);

console.log(`[OK] Íconos copiados. Versión de la app: ${version} (versionCode ${code}).`);
