# Pruebas visuales (fotos de cada pantalla)

Desde la v4.3.3, `tests/visual.py` abre la app en un navegador de verdad, le toma una foto a cada pantalla y la compara con la **foto aprobada** que está guardada en `tests/visual/baseline/`. Sirve para pillar lo que las otras pruebas no ven: un botón montado sobre otro, un texto cortado, un color que cambió sin querer.

## Cómo se corre

```
npm run test:visual            # compara (unos 6 a 7 minutos, 315 fotos)
npm run test:visual:update     # vuelve a tomar las fotos aprobadas
```

Es lo mismo que `python tests/visual.py` y `python tests/visual.py --update`. No hace falta servir la app antes: la prueba lo hace sola. (Necesita Python con Playwright, Chromium y Pillow, lo mismo que las otras pruebas de navegador. En este computador ese Python es `python`; si en el tuyo es `python3`, corre `python3 tests/visual.py`.)

Para ir más rápido mientras trabajas en algo:

```
python tests/visual.py --tamano cel-360          # solo el celular de 360 × 640 (claro y oscuro)
python tests/visual.py --tamano oscuro           # solo el tema oscuro
python tests/visual.py --pantalla ajustes        # solo las pantallas que se llaman "…ajustes…"
python tests/visual.py --tamano cel-384-claro-en --pantalla dialogo
```

## Qué revisa

| Pantallas | Nombres de las fotos |
|---|---|
| Puertas de entrada | `puerta-crear-cuenta`, `puerta-iniciar-sesion`, `puerta-hola-de-nuevo` |
| Enfocar | `enfocar-inicio`, `enfocar-corriendo`, `bandeja-comida` |
| Mascota muerta | `mascota-tumba`, `mascota-tumba-bandeja` |
| Ventanas del celular (menos de 900 px) | `ventana-duracion`, `ventana-tu-estudio`, `ventana-historial`, `ventana-companeros`, `ventana-temporadas`, `ventana-temas`, `ventana-logros` |
| Páginas enteras | `progreso`, `ranking-lista`, `ranking-estado`, `perfil`, `ajustes` |
| Diálogos | `dialogo-premium`, `dialogo-nombre-mascota`, `dialogo-nacionalidad`, `dialogo-cambiar-contrasena`, `dialogo-eliminar-cuenta`, `dialogo-ranking-llego`, `dialogo-opciones-ranking`, `dialogo-salir-ranking` |

En 12 combinaciones (una carpeta cada una): `cel-360`, `cel-384`, `cel-412`, `tableta` y `escritorio`, cada una en `claro` y `oscuro`, en español (`es`); y en inglés `cel-384-claro-en` y `escritorio-claro-en`. En el computador no hay ventanas de celular (esas secciones ya salen en las páginas enteras), por eso tiene 21 fotos y no 28.

## Las fotos aprobadas valen solo en el computador donde se tomaron

Windows y Linux (y hasta dos versiones de Chromium) dibujan las letras un poquito distinto: cambian los bordes suavizados y, a veces, el alto de una línea. Por eso, si corres la prueba en otro sistema, **todas** las pantallas salen "con cambios" aunque la app sea la misma. Las fotos de `tests/visual/baseline/` se tomaron en el computador del autor (Windows): compáralas allí.

Cuando hay un cambio visual aprobado, se vuelven a tomar **solo** las fotos que cambian, en ese mismo computador. Por ejemplo, en la v4.4.1 apareció el botón del pin en el computador:

```
python tests/visual.py --update --tamano escritorio
```

## Por qué siempre sale la misma foto

- La fecha y la hora están fijas: martes 10 de marzo de 2026, 10:00 a. m. en Colombia (de día).
- "Menos animaciones" está encendido y los datos son siempre los mismos (una persona con cuenta, 4 días de racha, un zorro llamado Zorrito, la misma semilla de `e2e_mascota.py`).
- El servidor es el simulado (`tests/_fake_supabase.py`): no se toca internet ni la base de datos real.
- Se espera a que carguen las letras y las imágenes, y el azar siempre da los mismos números.
- Se tapa lo que se mueve al azar o cambia solo: la nieve, los animales que caminan y sus globos, el confeti, los avisos que aparecen y se van, y el número de versión en Ajustes (para que subir la versión no haga fallar la prueba).

## Cuando la prueba falla

Dice cuáles pantallas cambiaron y deja en `tests/visual/out/` (esa carpeta no se sube a GitHub) tres imágenes de cada una:

- `…-esperada.png`: la foto aprobada.
- `…-actual.png`: cómo se ve ahora.
- `…-diferencia.png`: la actual, pálida, con lo que cambió pintado de **fucsia**.

Mira la diferencia y decide:

1. **Es un error** (no querías cambiar esa pantalla): arregla el código y corre la prueba otra vez.
2. **Es un cambio que querías**: muéstrale al autor el antes y el después. **Solo cuando el autor lo apruebe**, corre `npm run test:visual:update` y sube las fotos nuevas en el mismo commit que el cambio.

Nunca corras `--update` solo para que la prueba pase: las fotos aprobadas son la memoria de cómo debe verse la app. Si se actualizan sin mirar, la prueba deja de servir.

`--update` solo reescribe las fotos que no quedaron idénticas, así que en `git status` ves exactamente cuáles pantallas se tocaron.

## Qué tan estricta es

Un punto cuenta como cambiado si algún color se movió más de 24 (de 0 a 255). Una pantalla falla si cambiaron más de 40 puntos (menos que una letra; en un celular de 360 × 640 es el 0,02 % de la pantalla). Los dos números están arriba en `tests/visual.py` (`TOLERANCIA` y `PUNTOS_MAXIMOS`).

## Cosas que conviene saber

- **Otro computador u otra versión de Chromium** puede dibujar las letras un poquito distinto y hacer fallar muchas pantallas a la vez sin que nada haya cambiado. Si pasa justo después de actualizar Playwright, revisa un par de diferencias y, si son solo los bordes de las letras, toma las fotos de nuevo (`--update`) en un commit aparte.
- **Una pantalla nueva** (o un diálogo nuevo): agrégala en `tests/visual.py` (sección "Las pantallas") y corre `--update`; la prueba avisa cuando una pantalla no tiene foto aprobada.
- **Las fotos pesan** unos 49 MB en total. Cada vez que se actualizan muchas, el repositorio crece; por eso `--update` no toca las que no cambiaron.
- Las fotos de página entera en el celular salen sin la barra de abajo (iría atravesada en la mitad); la barra se revisa en las demás fotos.

## Ordenar el CSS sin cambiar cómo se ve

Si mueves reglas de lugar (de un archivo a otro, de una sección a otra), la prueba visual es tu red: tiene que dar **315 pantallas iguales** sin `--update`. Recuerda que el orden importa: los archivos se cargan como dice `index.html` (`tokens.css`, `base.css`, `layout.css`, `components.css`, `scenery.css`, `utilities.css`) y, si dos reglas pesan lo mismo, gana la que va más abajo. El mapa está al principio de `css/tokens.css`. Así se hizo la v4.4.0: en 5 pasos, con la prueba completa después de cada uno.
