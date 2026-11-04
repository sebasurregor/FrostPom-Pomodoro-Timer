# Cambios de la v1 a la v2

## Errores de la v1 que se corrigieron

1. **No funcionaba sin conexión ni se podía instalar.** `index.html` nunca registraba el *service worker*. Además, `service-worker.js` intentaba guardar `icons/icon-192.png` e `icons/icon-512.png`, que no existen en el repositorio, y `cache.addAll()` falla completo si falta un solo archivo. Ahora el service worker se registra, todos sus archivos existen y hay íconos nuevos (incluido uno *maskable* para Android).
2. **Al pausar y reanudar se perdía la hora real de inicio.** Si saltabas o registrabas progreso después de una pausa, solo se contaba el tiempo desde el último "Reanudar". El motor nuevo (`js/timer.js`) acumula el tiempo de cada tramo.
3. **"Log progress now" contaba doble.** Registraba un parcial y, al terminar, volvía a registrar la sesión completa. Se reemplazó por "Terminar y guardar", que cierra la sesión.
4. **Las fechas de ejemplo se corrían un día en Colombia.** `toISOString()` usa hora UTC, así que después de las 7 p. m. "hoy" ya era "mañana". Ahora todas las fechas se calculan en hora local.
5. **El planificador:**
   - decía "0 = hoy", pero una tarea que vencía hoy daba 1;
   - podía agendar tareas *después* de su fecha de entrega;
   - desperdiciaba el tiempo sobrante del día.

   Ahora respeta la fecha, sugiere lo vencido solo para hoy, aprovecha bloques de 15 min o más y avisa qué no alcanza.
6. **Recargar la página perdía la sesión en curso.** Ahora el temporizador se guarda y, si cierras la app, al volver termina la sesión con la hora real de fin.
7. **Ctrl+R no recargaba la página:** el atajo "R" reiniciaba el temporizador aunque presionaras Ctrl. Ahora solo existe la barra espaciadora, y se ignora si usas Ctrl, Alt o Cmd, o si estás escribiendo.
8. **Datos dañados rompían la app.** Si `localStorage` tenía algo inesperado o el navegador bloqueaba el guardado (modo privado), la app fallaba. Ahora se valida todo y, si no se puede guardar, sigue funcionando en memoria.
9. **El CSV podía ejecutar fórmulas al abrirlo en Excel** (inyección CSV). Ahora se neutraliza.
10. **Dos pestañas abiertas podían registrar la misma sesión dos veces.** Ahora se sincronizan.
11. **Detalles menores:** el `README.txt` apuntaba a `study-planner-timer.html` (el archivo es `index.html`), había un `<script>` vacío y `<meta charset>` no era lo primero del `<head>`.

## v2.4: diseño más compacto y calendario

- **Sin huecos entre paneles en la web.** En pantallas grandes, Progreso, Perfil y Ajustes usan dos columnas independientes: si un panel crece (por ejemplo, al abrir la (i) de "Tu polo" o "Ver más" del historial), solo bajan los paneles de abajo en esa misma columna, y vuelven a su lugar al cerrarlo. En celular el orden de los paneles no cambió.
- **Tu estudio, con dos pestañas:**
  - "Últimos 7 días": la gráfica de barras de siempre;
  - "Calendario": el mes actual con los minutos de cada día y un color más intenso mientras más estudias (el tercer tono indica que cumpliste la meta del polo, 45 min). Al tocar un día se ve cuánto estudiaste y en cuántas sesiones, y con las flechas se ven los meses anteriores. La app recuerda la última pestaña que elegiste.
- **Historial más corto:** muestra las 5 últimas sesiones y un botón "Ver más" o "Ver menos".
- **El consejo "usa un nombre que no revele quién eres"** ahora solo aparece al elegir el nombre (registro, crear cuenta y cambiar nombre), ya no ocupa espacio fijo en el perfil.
- **Se eliminó el control parental.** El límite diario, salir del ranking, restaurar copias y borrar datos ya no piden PIN. Un PIN guardado en versiones anteriores se descarta solo.

## v2.3: Premium, sonidos de concentración y nacionalidad

- **Premium 👑 (modo prueba, sin cobro).**
  - Se abre desde la corona de la barra superior. Se ofrece al entrar una vez al día, pero nunca el primer día.
  - Incluye recordatorios de enfoque, duración libre del temporizador (la versión gratis permite de 10 a 60 min de estudio y de 5 a 15 de descanso), todos los temas, sonidos y tonos, más animaciones (próximamente) y "sin anuncios" (a futuro).
- **Sonidos de concentración generados en el dispositivo,** sin archivos:
  - gratis: Ruido blanco, Lluvia y Viento polar;
  - Premium: Ruido marrón, Ruido rosa, Olas del mar y Fogata.
  - Suenan solo mientras estudias, y el botón 🔇 en Enfocar activa el modo silencio.
- **Tonos de aviso:** Clásico, Campanitas y Suave son gratis; Burbujas y Arcade son Premium.
- **Temas del temporizador:** Clásico, Menta, Hielo y Dorado son gratis; Aurora, Atardecer y Galaxia son Premium. Con Premium se desbloquean todos.
- **Nacionalidad opcional en el registro,** con buscador y banderas. Las banderas usan una fuente incluida para que también se vean en Windows. Aparecen en el perfil y en el ranking.
- **"Tu polo" más limpio:** la explicación quedó dentro del botón (i).
- **Se quitó "Descargar CSV".**
- **El descanso largo ya no se configura:** llega solo después de 4 pomodoros.
- **Iglú junto a la fogata:** siempre visible, y de noche su entrada brilla.

## v2.2: cuentas, logo nuevo y paisaje más vivo

- **Se eliminó la vista Plan** (junto con el planificador y las misiones y logros de tareas).
- **Cuentas:** cada persona elige su nombre de usuario y su contraseña.
  - El filtro de nombres rechaza insultos, groserías y términos discriminatorios, también si están escritos con números o símbolos.
  - La contraseña se guarda solo como hash PBKDF2, y se bloquea el ingreso tras varios intentos fallidos.
  - La app pide iniciar sesión al abrirla, y en Ajustes puedes cambiar la contraseña y cerrar sesión.
  - Por ahora la cuenta vive en el dispositivo; cuando exista el servidor, la misma validación se repite allá.
- **Logo nuevo:** tu pingüino delante de un gran pomodoro, rodeado de tomates y con fondo ártico.
- **Solo 5 compañeros básicos,** con tu arte. Se eliminaron los generados.
- **El pingüino camina** por el paisaje con tu ciclo de 4 cuadros.
- **Tu explorador** reemplaza al anterior junto a la fogata.
- **Animaciones nuevas:** humo de la fogata, petróleo que se extiende y gotea, y ráfagas de viento (grises si hay esmog).
- **País o región en Ajustes:** el día, la noche y la fogata siguen la hora de esa región.

## v2.1: arte del autor y animaciones

- Los compañeros Pingüino, Oso Polar, Oso Marino, Tiburón Martillo y el nuevo **Zorro Ártico** usan el arte del autor, ya recortado y optimizado en WebP.
- Pingüino Ninja, Hielo Gruñón, Tiburón Ballena y Tiburón de Groenlandia se redibujaron con el mismo estilo (contorno café oscuro y ojos grandes).
- Ahora hay **9 compañeros**, cada uno ligado a un logro distinto.
- **Animaciones del pingüino** hechas con sus sprite sheets:
  - saluda en la bienvenida, al completar una sesión y durante los descansos;
  - se enamora cuando subes de rango, desbloqueas un compañero o reclamas una misión;
  - camina por el paisaje.
- Con "reducir movimiento" activo, las animaciones se quedan quietas.
- El modo sin conexión guarda las imágenes nuevas (versión 2.1.0).

## Lo nuevo

- **Rangos tipo videojuego:** de Bronce III a Leyenda (con estrellas), emblemas en SVG y ceremonia animada al subir, con confeti, sonido y vibración.
- **XP, racha, gemas, 18 logros y 3 misiones diarias.** También se premia descansar completo.
- **Temática polar:** paisaje con montañas, nieve y pingüinos y osos polares caminando. El cielo cambia según la hora real y de noche hay fogata, aurora y luna.
- **Salud del polo:** si dejas de estudiar, el paisaje se contamina con esmog, una fábrica, basura y petróleo, y los animales se van. Al estudiar se limpia otra vez.
- **Compañeros kawaii de edición limitada:** 7 personajes en estilo plano (pingüino ninja, oso polar, hielo gruñón, oso marino y tres tiburones). Se ganan con logros y te acompañan en el temporizador, el HUD y el ranking. También aceptan imágenes propias.
- **Avatares y apodos polares** (Pingüino, Oso, Foca, Ballena, Tiburón…).
- **Estilos del anillo,** que se compran con gemas o se desbloquean por rango.
- **Mi ritmo:** eliges los minutos de estudio y descanso (por ejemplo, 60 + 15). Se guardan aparte, así que no se pierden al probar otros modos.
- **Descanso largo** configurable, con guía de respiración durante los descansos.
- **Límite saludable diario:** pasado ese tiempo, estudiar más no suma XP ni ranking.
- **Ranking semanal e histórico,** en modo demostración y con el servidor seguro ya diseñado y probado.
- **Vista Perfil** (personaje, resumen, compañeros, estilos y logros) y **Ajustes** (control parental, copias de seguridad, borrado de datos).
- **Privacidad:** apodo generado, sin nombre real y sin registro de qué se estudia.
- **Diseño nuevo,** pensado para celular primero y adaptado a escritorio. Interfaz en español y animaciones que respetan "reducir movimiento" (los animales se quedan quietos y deja de nevar).
- **Pruebas automáticas:** 32 de lógica, 20 comprobaciones en navegador y 12 del servidor.
