/*
 * FrostPom — ajusta el proyecto de Android que crea Capacitor (carpeta android/).
 *
 *  1. Copia los íconos, el ícono de las notificaciones y la pantalla de inicio de
 *     android-recursos/res/ (los genera tools/recursos_android.py).
 *  2. Pone la versión de package.json en la app: versionName "4.1.0" y versionCode 40100
 *     (Google Play exige que versionCode suba en cada versión que subas).
 *  3. (v4.5.3) Pone el ID de la app de AdMob (config.ads.appId, de js/config.js) en el
 *     AndroidManifest.xml. El complemento de anuncios lo necesita SIEMPRE: sin él, la app se
 *     cierra al abrirse. Si está vacío, pone el ID de PRUEBA de Google y avisa (no publiques así).
 *  4. (v4.7.0) Revisa la clave de RevenueCat (config.premium.play): debe ser la PÚBLICA de Android
 *     (goog_…). Si alguien pegó la secreta (sk_…), se detiene: esa clave nunca puede ir en la app.
 *  5. (v4.7.4) Enciende R8 (achica, optimiza y ofusca el código) en la versión para la tienda y
 *     agrega las reglas de FrostPom a android/app/proguard-rules.pro. Google Play lo pide.
 *  0. (v4.7.3) Borra los archivos que una versión nueva ya no trae. Al descomprimir encima, los
 *     viejos se quedan, y uno (values-v26/styles.xml) dejaba la hora del widget gris y delgada.
 *
 * Se puede correr las veces que quieras. Uso: lo llaman npm run android:crear y android:actualizar.
 */
import { cpSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../js/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 0. Archivos que ya no existen en la versión nueva (se quedaban al descomprimir encima)
const TIMER_RES = join('native', 'frostpom-timer', 'android', 'src', 'main', 'res');
const OBSOLETE = [
  join('native', 'frostpom-timer', 'OFL-LilitaOne.txt'), // v4.7.2: los widgets ya no usan Lilita One
  join(TIMER_RES, 'values-v26', 'styles.xml'),
  join(TIMER_RES, 'font', 'fp_lilita_one.ttf'),
  ...['fp_card_dark', 'fp_card_light', 'fp_art_round', 'fp_btn', 'fp_btn_main', 'fp_widget_bg'].map((n) => join(TIMER_RES, 'drawable', `${n}.xml`)),
  join(TIMER_RES, 'drawable-nodpi', 'fp_widget_amigos.webp'),
];
for (const rel of OBSOLETE) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) continue;
  rmSync(path);
  console.log(`[i] Borrado (ya no se usa): ${rel}`);
}
for (const dir of [join(TIMER_RES, 'values-v26'), join(TIMER_RES, 'font')]) {
  const path = join(ROOT, dir);
  if (existsSync(path) && readdirSync(path).length === 0) rmSync(path, { recursive: true });
}
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

// 3. (v4.5.3) El ID de la app de AdMob
const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713'; // el de prueba de Google
const ads = config.ads || {};
const appId = String(ads.appId || '').trim();
if (appId && !/^ca-app-pub-\d{16}~\d{10}$/.test(appId)) {
  console.error(`[X] config.ads.appId ("${appId}") no parece un ID de app de AdMob: es como ca-app-pub-1234567890123456~1234567890 (con "~", no "/").`);
  process.exit(1);
}
if (!ads.testing && !appId && ads.enabled) {
  console.error('[X] Los anuncios están encendidos y no de prueba (config.ads), pero falta config.ads.appId. Ver docs/ANUNCIOS.md');
  process.exit(1);
}
const manifestPath = join(APP, 'src', 'main', 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
const metaRe = /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/;
const meta = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${appId || TEST_APP_ID}" />`;
const beforeManifest = manifest;
if (metaRe.test(manifest)) manifest = manifest.replace(metaRe, meta);
else manifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n        <!-- FrostPom v4.5.3: AdMob (tools/app-android.mjs) -->\n        ${meta}`);
if (!manifest.includes(meta)) {
  console.error('[X] No pude poner el ID de AdMob en android/app/src/main/AndroidManifest.xml');
  process.exit(1);
}
if (manifest !== beforeManifest) writeFileSync(manifestPath, manifest);
if (!appId) console.warn('[!] AdMob: uso el ID de app de PRUEBA de Google. Antes de publicar, pon el tuyo en config.ads.appId (docs/ANUNCIOS.md).');

// 4. (v4.7.0) La clave de RevenueCat (cobro de Premium con Google Play)
const play = (config.premium && config.premium.play) || {};
const rcKey = String(play.revenueCatKey || '').trim();
if (/^(sk_|atk_)/.test(rcKey)) {
  console.error('[X] config.premium.play.revenueCatKey es una clave SECRETA de RevenueCat (sk_…). Bórrala YA de js/config.js (y de GitHub si la subiste: créala de nuevo en RevenueCat). En la app va la PÚBLICA de Android (goog_…). Ver docs/GOOGLE-PLAY-BILLING.md');
  process.exit(1);
}
if (rcKey && !rcKey.startsWith('goog_')) console.warn('[!] config.premium.play.revenueCatKey no empieza por goog_: ¿es la clave pública de Android de RevenueCat? (docs/GOOGLE-PLAY-BILLING.md)');
if (play.enabled && !rcKey) console.warn('[!] El cobro con Google Play está encendido pero falta config.premium.play.revenueCatKey: Premium seguirá en modo prueba.');
const billing = play.enabled && rcKey ? 'cobro con Google Play ENCENDIDO' : 'Premium en modo prueba (sin cobro)';

// 5. (v4.7.4) R8 en la versión para la tienda: achica, optimiza y ofusca el código Java/Kotlin.
//    Google Play lo pide ("La optimización de código DEX está por debajo de nuestro umbral":
//    ofuscación 2 %, mínimo 25 %, antes de febrero de 2027). Además, el .aab ya lleva el
//    mapping.txt, así que se va el aviso del "archivo de desofuscación".
//    Solo toca la versión "release" (la que se firma para Play); las de prueba quedan igual.
//    No se activa shrinkResources: las notificaciones buscan su ícono por nombre y podría borrarlo.
//    Plan B si algo falla en la versión de la tienda: FROSTPOM_R8=0 npm run android:actualizar
//    (en PowerShell: $env:FROSTPOM_R8="0"; npm run android:actualizar) y avísale a Claude.
const r8 = process.env.FROSTPOM_R8 !== '0';
const releaseRe = /(\brelease\s*\{)([^{}]*)(\})/;
let r8Note = '';
const rel = releaseRe.exec(gradle);
if (!rel) {
  r8Note = ' [!] R8: no encontré "release { … }" en android/app/build.gradle (ver docs/CAMBIOS-v3.md, v4.7.4).';
} else {
  let body = rel[2];
  if (/minifyEnabled\s+(true|false)/.test(body)) body = body.replace(/minifyEnabled\s+(true|false)/, `minifyEnabled ${r8}`);
  else body = body.replace(/^(\s*?\n)?([ \t]*)/, `$1$2minifyEnabled ${r8}\n$2`);
  body = body.replace(/getDefaultProguardFile\(\s*'proguard-android\.txt'\s*\)/, "getDefaultProguardFile('proguard-android-optimize.txt')");
  if (!/proguardFiles/.test(body)) body = body.replace(/\s*$/, `\n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'\n        `);
  const patched = gradle.replace(releaseRe, `$1${body}$3`);
  if (patched !== gradle) {
    gradle = patched;
    writeFileSync(gradlePath, gradle);
  }
  r8Note = r8 ? ' R8 (código optimizado) ENCENDIDO en la versión para la tienda.' : ' [!] R8 APAGADO (FROSTPOM_R8=0).';
}
// Las reglas de FrostPom para R8 (las de Capacitor, RevenueCat y AdMob vienen con cada librería)
const rulesPath = join(APP, 'proguard-rules.pro');
const RULES_START = '# --- FrostPom (tools/app-android.mjs, v4.7.4) ---';
const RULES_END = '# --- fin FrostPom ---';
const RULES = `${RULES_START}
# El puente entre la web y Android (Capacitor) se llama por su nombre desde JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# (v4.8.0) El complemento propio (notificación, widgets y alarmas): es pequeño y lo usa Android
# por su nombre (widgets, avisos, botones), así que va completo, sin cambiarle nombres.
-keep class com.startupprometeus.frostpom.timer.** { *; }
# Errores de Play legibles: guarda los números de línea (Play los traduce con el mapping.txt).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
${RULES_END}
`;
let rules = existsSync(rulesPath) ? readFileSync(rulesPath, 'utf8') : '';
const rulesRe = new RegExp(`${RULES_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${RULES_END}\\n?`);
const newRules = rulesRe.test(rules) ? rules.replace(rulesRe, RULES) : `${rules.replace(/\s*$/, '')}${rules.trim() ? '\n\n' : ''}${RULES}`;
if (newRules !== rules) writeFileSync(rulesPath, newRules);

console.log(`[OK] Íconos copiados. Versión de la app: ${version} (versionCode ${code}). AdMob: ${appId ? 'tu ID de app' : 'ID de prueba'}${ads.enabled ? '' : ' (anuncios apagados en config.ads)'}. ${billing}.${r8Note}`);
