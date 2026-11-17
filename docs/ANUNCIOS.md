# Anuncios en FrostPom (v4.5.3)

> **Estado (v4.8.1, 17 nov 2026):** **encendidos** con tu cuenta de AdMob, en **modo de prueba** (`testing: true`: salen los anuncios "Test Ad" de Google, sin pagos y sin riesgo). Tus ID ya están en `js/config.js` y tu línea de `app-ads.txt` en `docs/app-ads/app-ads.txt`. Falta: subir `app-ads.txt` a la raíz de tu sitio (5.1, punto 6), probar (5.3) y, para publicar, `testing: false` (5.4). Las decisiones son las del 16 de noviembre de 2026 (sección 1).

## 1. Lo que decidiste

| Pregunta | Tu respuesta | Cómo quedó |
| --- | --- | --- |
| ¿Cuántos anuncios para revivir la mascota? | **3** | "Revivir con anuncios (0 de 3)". El avance se guarda, aunque cierres la app. |
| ¿Gemas por anuncio y por día? | **+10 gemas, 5 por día** | "Ver un anuncio: +10 gemas", en la tienda y (v4.8.0) en "¿Necesitas más gemas?" (al tocar la gema). |
| ¿Anuncio cada 4 pomodoros? | **Sí, y también a los 90 minutos** | Al empezar el descanso, cuando desde el último anuncio pasen **4 pomodoros o 90 minutos de estudio, lo que llegue primero** (ver la explicación abajo). |
| ¿Premium puede ver anuncios por gemas? | **Sí** | Premium nunca ve el de pantalla completa, pero puede ganar gemas si quiere. |
| ¿La mascota se muere más rápido? | **No** | Sigue en 72 horas con la barriguita en cero. |

**Sobre el punto 3.** Lo programé así: el anuncio sale al empezar un descanso cuando, desde el último anuncio, pasen **4 pomodoros o 90 minutos de estudio**, lo que llegue primero. Después, los dos contadores empiezan de cero.

- Con pomodoros de 25 minutos, sale **una vez cada 4 pomodoros**: los dos límites llegan casi juntos.
- Con pomodoros de 50 minutos, sale **cada 2 pomodoros** (100 minutos).
- Con pomodoros de 15 minutos, sale **cada 4** (60 minutos).

Los minutos cuentan el **tiempo estudiando**, no el reloj. Si contara el reloj, el primer pomodoro de cada día siempre tendría anuncio, porque desde ayer pasaron más de 90 minutos. Los contadores **empiezan de cero cada día**.

Si querías otra cosa (por ejemplo, "uno extra a los 90 minutos aunque ya haya salido el de los 4 pomodoros"), se cambia en `js/ad-rules.js`, en `interstitialDue`. Los números (4 y 90) están en `config.ads.everyPomodoros` y `everyStudyMin`.

La racha (de la v4.5.2) se revive con **1 anuncio por cada día que faltó** ("Ver anuncios y revivirla (0 de 2)"), o con 100 gemas por día.

## 2. Quién ve anuncios

- **Menores de 13: nunca.** La app ni siquiera inicia AdMob. Tampoco salen los botones.
- **Edad desconocida** (una cuenta de este equipo sin fecha de nacimiento): nunca.
- **13 años o más:** sí.
  - **Menores de 18**, o una cuenta en línea que entró en un equipo donde no está la fecha (la fecha nunca sale del teléfono), se tratan como menores de 16. Sus anuncios **no son personalizados** (`npa`) y su contenido es "con guía de los padres" (`ParentalGuidance`).
  - **18 o más:** anuncios aptos para adolescentes (`Teen`). Si son personalizados o no, lo decide Google con el consentimiento, donde la ley lo pide.
- **Solo en la app de Android.** En la web (GitHub Pages) y en Microsoft Store no hay anuncios.

**Una advertencia honesta.** Mientras Premium siga en "modo prueba" en Android, cualquiera puede activarlo gratis y dejar de ver el anuncio de pantalla completa. **(v4.7.0) Se cierra al encender el cobro con Google Play** (`docs/GOOGLE-PLAY-BILLING.md`): desde ahí, en Android Premium lo decide el servidor y la prueba gratis ya no quita el anuncio.

## 3. Cómo funciona por dentro

| Archivo | Qué hace |
| --- | --- |
| `js/ad-rules.js` | Las reglas: quién (edad), cuándo (4 pomodoros o 90 min), cuántas gemas. No sabe nada del teléfono; tiene pruebas en `tests/logic.test.js`. |
| `js/ads.js` | Habla con el complemento `@capacitor-community/admob` (8.x). Al abrir la app: consentimiento → `initialize`. Carga los anuncios antes de mostrarlos. |
| `js/ui/ads-ui.js` | Los botones de la tienda, revivir la mascota, la racha (con `js/ui/streak.js`), el anuncio del descanso (con `js/ui/focus.js`) y "Opciones de privacidad de los anuncios" en Ajustes. |
| `tools/app-android.mjs` | Pone el ID de tu app de AdMob en `AndroidManifest.xml` (sin él, la app se cierra al abrirse). |
| `tests/e2e_anuncios.py` | Prueba todo con un AdMob simulado (40 comprobaciones). |

**Detalles importantes:**

- **El anuncio del descanso nunca hace esperar.** Se empieza a cargar al empezar el pomodoro que lo va a tener. Si al terminar no está listo, no sale, y se intenta en el siguiente descanso. El reloj del descanso empieza **cuando cierras el anuncio**: no pierdes descanso.
- **Nunca aparece:**
  - durante el estudio;
  - al abrir la app;
  - si el pomodoro terminó con la app en segundo plano;
  - con Premium.
- **Anuncios con recompensa:** el premio se da **solo si el anuncio se ve completo**. Si lo cierras antes, no hay premio y la app lo dice.
- **Los contadores** (pomodoros desde el último anuncio y anuncios de gemas de hoy) se guardan **en el teléfono** (`st2_ads`), igual que el avance de revivir con anuncios (`st2_ads_revive`).

## 4. Las reglas de Google que se cumplen

- **Familias (público mixto):** anuncios solo a mayores de 13, según la pantalla de edad (mes y año, sin sugerir respuesta). AdMob está en la lista de SDK autocertificados para Familias.
- **Nada de tácticas emocionalmente manipuladoras.** Los anuncios con recompensa son opcionales, y la mascota no se muere más rápido.
- **El anuncio de pantalla completa** sale en una pausa natural (el descanso), se puede cerrar y nunca al abrir la app.
- **Consentimiento:** donde la ley lo pide (Europa, Reino Unido, Suiza), Google muestra su mensaje antes de iniciar AdMob. En Ajustes → Acerca de aparece **"Opciones de privacidad de los anuncios"** para cambiar la respuesta.

## 5. Paso a paso para encenderlos

> Los datos de pago e impuestos de AdMob van **solo en las páginas de Google**. Nunca los mandes por chat.
> **Nunca toques tus propios anuncios de verdad:** Google puede cerrar la cuenta. Para probar, usa `testing: true`.

### 5.1 Crear todo en AdMob

1. Entra a [admob.google.com](https://admob.google.com) con tu cuenta de Google y crea la cuenta. País Colombia y zona horaria de Bogotá; lo de pagos e impuestos, en las páginas de Google.
2. **Aplicaciones → Agregar app → Android.** Si ya está en Google Play (aunque sea en prueba cerrada), búscala por `com.startupprometeus.frostpom`.
3. Copia el **ID de la app**. Es como `ca-app-pub-1234567890123456~1234567890`, con **"~"**.
4. **Unidades de anuncios → Agregar:**
   - Una de tipo **Recompensa** (nombre: "Recompensa"). Recompensa: 1, artículo "gemas". La app da las 10 gemas por su cuenta.
   - Una de tipo **Intersticial** (nombre: "Descanso").

   Copia sus dos ID. Son como `ca-app-pub-1234567890123456/1234567890`, con **"/"**.
5. **Privacidad y mensajes → Configuración del RGPD → Crear mensaje** para tu app (idiomas: español e inglés) y publícalo. Es el mensaje de consentimiento para Europa.
6. **app-ads.txt:** AdMob te da una línea como `google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0`.
   - Tiene que quedar en `https://sebasurregor.github.io/app-ads.txt`, en la **raíz** del sitio, no dentro de `FrostPom-Pomodoro-Timer/`.
   - Para eso, crea en GitHub un repositorio llamado **`sebasurregor.github.io`**, súbele un archivo `app-ads.txt` con esa línea y activa GitHub Pages en él.
   - (v4.8.1) Tu archivo ya está listo en `docs/app-ads/app-ads.txt`: súbelo tal cual a ese repositorio. Revisa que `https://sebasurregor.github.io/app-ads.txt` muestre la línea en el navegador; AdMob puede tardar hasta 24 h en verificarlo.
   - En la ficha de Google Play, el "sitio web" debe ser `https://sebasurregor.github.io`.

### 5.2 Ponerlo en FrostPom

En `js/config.js`, en `ads`:

```js
enabled: true,
testing: true,              // primero, de prueba
appId: 'ca-app-pub-…~…',    // el ID de la app (con ~)
rewardedId: 'ca-app-pub-…/…',
interstitialId: 'ca-app-pub-…/…',
```

Estos ID **no son secretos**: pueden ir en GitHub.

### 5.3 Compilar y probar en tu celular

1. `npm install`: instala el complemento `@capacitor-community/admob`, que ya está en `package.json`.
2. `npm run android:actualizar`. Debe decir `AdMob: tu ID de app`.
3. Abre Android Studio y corre la app en tu celular. Con `testing: true`, los anuncios dicen **"Test Ad"**. Prueba esto:
   - Una cuenta de 13+ ve "Ver un anuncio: +10 gemas" en la tienda.
   - (v4.8.0) Al tocar la gema (arriba o en la tienda), "¿Necesitas más gemas?" muestra también "Ver un anuncio: +10 gemas · Quedan 5 hoy". Al verlo completo, suben las gemas y baja el contador (es el mismo límite de 5 al día que el de la tienda).
   - Una cuenta de menor de 13 no ve nada.
   - Después de 4 pomodoros sale el anuncio, y el descanso empieza al cerrarlo. Para no esperar 2 horas, puedes cambiar un momento `everyPomodoros: 1`.

### 5.4 Publicar

1. Cambia `testing: false`, haz `npm run android:actualizar` y genera el `.aab` firmado.
2. En **Play Console:**
   - **Contenido de la app → Anuncios:** "Sí, contiene anuncios".
   - **ID de publicidad:** "Sí", para "Publicidad o marketing".
   - **Seguridad de los datos:** agrega lo de AdMob. La tabla está en `docs/google-play/FICHA.md`.
3. La política de privacidad (`privacidad.html`) ya explica los anuncios. Súbela con `git push` **antes** de publicar.
4. Sube el `.aab`. Las primeras semanas AdMob puede mostrar pocos anuncios mientras revisa la app.

**Cuándo pagan:** AdMob paga cuando el saldo llega a **100 USD**. En Latinoamérica cada anuncio paga menos que en Estados Unidos o Europa. Los estimados aparecen en el panel de AdMob.

## 6. Si algo sale mal

| Qué pasa | Qué hacer |
| --- | --- |
| La app se cierra al abrirla | Falta el ID de la app en el manifest: corre `npm run android:actualizar` (lo pone `tools/app-android.mjs`). |
| No salen anuncios (de verdad) | Normal los primeros días. Revisa en AdMob que la app esté "lista" y que `app-ads.txt` esté verificado. En la consola (`chrome://inspect`) busca `[FrostPom] AdMob`. |
| Quiero apagarlos ya | `enabled: false` en `js/config.js` y publica. La app deja de iniciar AdMob. |
| Un menor ve anuncios | No debería pasar: revisa su fecha de nacimiento en Ajustes. Si encuentras un caso, avísame con los pasos. |

## Fuentes

- [Políticas de Familias de Google Play: anuncios y monetización](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- [Política de anuncios de Google Play](https://support.google.com/googleplay/android-developer/answer/9857753)
- [SDK de anuncios autocertificados para Familias](https://support.google.com/googleplay/android-developer/answer/9900633/)
- [Datos que recoge el SDK de Google Mobile Ads (para el formulario de Play)](https://developers.google.com/admob/android/play-data-disclosure?hl=en)
- [Consentimiento en el EEE, Reino Unido y Suiza (AdMob)](https://support.google.com/admob/answer/13554116?hl=en)
- [app-ads.txt en AdMob](https://support.google.com/admob/answer/9363762?hl=en)
- [Umbral de pago de AdMob](https://support.google.com/admob/answer/2772208)
- [Complemento @capacitor-community/admob](https://github.com/capacitor-community/admob)
