"""
Prueba de humo en un navegador real (opcional).

Requisitos (una sola vez):
    pip install playwright
    python -m playwright install chromium

Uso (con la app servida en otra terminal: python -m http.server 8000):
    python tests/e2e_smoke.py http://localhost:8000/

Recorre: bienvenida en dos pasos (1: nombre, contraseña y país en lista emergente; 2: foto de perfil opcional,
con animal al azar si no hay foto), duración personalizada (60 + 15),
una sesión con reloj simulado (y el anillo que avanza junto a la bola), pingüino incluido desde el inicio y su onomatopeya,
subida de rango, misiones, calendario del mes, perfil, Premium (con su regalo: 1000 gemas y una mascota limitada)
y sonidos, ranking sin rivales simulados, ajustes en modo oscuro del
sistema, guardado automático del día, cambio de temporada, modo sin conexión, eliminar la cuenta y animaciones
del paisaje aunque el sistema pida "reducir movimiento".
Termina con código 1 si algo falla.
"""
import atexit
import base64
import datetime
import os
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
failures = []


def check(cond, msg):
    print(("OK   " if cond else "FALLO ") + msg)
    if not cond:
        failures.append(msg)


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


# Foto de prueba con datos ocultos (EXIF con modelo de teléfono y GPS) para comprobar que se borran.
FOTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_foto_prueba.jpg")
from PIL import Image
_img = Image.linear_gradient("L").resize((900, 600)).convert("RGB")  # con degradado: el zoom cambia la foto
_exif = Image.Exif(); _exif[0x010F] = "TelefonoDePrueba"; _exif[0x8825] = {2: (6.0, 15.0, 0.0), 1: "N"}
_img.save(FOTO, "JPEG", exif=_exif.tobytes())
atexit.register(lambda: os.path.exists(FOTO) and os.remove(FOTO))


def photo_ok(ph):
    raw = base64.b64decode(ph.split(",", 1)[1]) if ph else b""
    return ph.startswith("data:image/") and len(ph) < 300000 and b"Exif" not in raw and b"TelefonoDePrueba" not in raw


with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
    browser = p.chromium.launch(**launch)
    # color_scheme="dark": así lo ve quien tiene Windows o el teléfono en modo oscuro.
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Bogota", locale="es-CO", color_scheme="dark")
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.clock.install(time=datetime.datetime(2026, 11, 2, 16, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-5))))

    pg.goto(URL)
    pg.clock.run_for(500)
    check(pg.evaluate("document.getElementById('dlg').open"), "aparece la bienvenida")
    check(pg.evaluate("!!document.querySelector('#dlg #accPrivacy')"), "el registro recuerda no usar un nombre que revele quién eres")
    check(pg.evaluate("!document.querySelector('#dlg .presets, #dlg .presets--onb')"), "el registro ya no pregunta cuánto estudiar por bloque")
    check(pg.evaluate("document.querySelector('#dlg .country-list').hidden"), "la lista de países empieza cerrada")
    check(pg.evaluate("!document.querySelector('#dlg button') || ![...document.querySelectorAll('#dlg button')].some(b => b.textContent.includes('Sugerir'))"), "ya no está el botón 'Sugerir uno'")
    check(pg.evaluate("!document.querySelector('#dlg .avatar-opt, #dlg .avatars')"), "el registro no tiene lista de emojis para elegir")
    check(pg.evaluate("document.querySelectorAll('#gateScene .gate-flake').length >= 30 && getComputedStyle(document.querySelector('.gate-snow')).display !== 'none'"), "en la entrada cae una nevada suave")
    check(pg.evaluate("document.querySelector('#gateScene').lastElementChild.classList.contains('gate-snow') && getComputedStyle(document.querySelector('.gate-scene__art'), '::after').content !== 'none'"), "la nieve va encima de la capa oscura de la entrada")
    pg.fill("#accUser", "putito99"); pg.fill("#accPass1", "Pingu2026"); pg.fill("#accPass2", "Pingu2026")
    pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(400)
    check(pg.evaluate("document.getElementById('dlg').open"), "un nombre ofensivo no se acepta")
    pg.fill(".country-search", "colom")
    check(pg.evaluate("!document.querySelector('#dlg .country-list').hidden"), "al escribir se abre la lista de países")
    pg.click(".country-opt:has-text('Colombia')")
    check(pg.evaluate("document.querySelector('#dlg .country-list').hidden && document.querySelector('#dlg .country-search').value === 'Colombia'"), "al elegir, la lista se cierra y el campo muestra Colombia")
    pg.fill("#accUser", "pingu_estudia"); pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(1500); pg.clock.run_for(300)
    # Paso 2: la foto es una vista aparte, después de crear la cuenta
    check(pg.evaluate("document.getElementById('dlg').open && !!document.querySelector('#dlg #onbPhotoBtn') && !document.querySelector('#dlg #accUser')"), "después de la cuenta aparece una vista aparte para la foto")
    check(state(pg)["account"]["username"] == "pingu_estudia", "la cuenta ya quedó guardada antes del paso de la foto")
    animal = state(pg)["profile"]["avatar"]
    check(bool(animal) and pg.inner_text("#dlg .avatar--hero") == animal, f"sin foto, se asigna un animal al azar ({animal})")
    pg.click("#dlg button:has-text('Guardar foto')"); pg.wait_for_timeout(200)
    check(pg.evaluate("document.getElementById('dlg').open") and "Primero elige una foto" in pg.inner_text("#dlg"), "'Guardar foto' sin foto pide elegir una (o 'Ahora no')")
    with pg.expect_file_chooser() as fc:
        pg.click("#onbPhotoBtn")
    fc.value.set_files(FOTO); pg.wait_for_timeout(700); pg.clock.run_for(200)
    check(pg.evaluate("!!document.querySelector('#dlg .photo-crop__canvas')"), "en el registro, el botón de la foto SÍ abre el recorte (antes no hacía nada)")
    pg.click("#dlg button:has-text('Guardar foto')"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    ph0 = state(pg)["profile"]["photo"]
    check(photo_ok(ph0), "la foto del registro se guarda recortada, liviana y sin EXIF/GPS")
    check(pg.evaluate("!document.getElementById('dlg').open && !!document.querySelector('#hudAvatar img.avatar__photo')"), "termina el registro y la foto aparece en la barra de arriba")
    st0 = state(pg)
    check(st0["profile"]["onboarded"] and st0["account"]["username"] == "pingu_estudia", "la cuenta queda creada con el nombre elegido")
    check("Pingu2026" not in str(st0), "la contraseña se guarda solo como hash")
    check(st0["profile"]["country"] == "CO", "la nacionalidad elegida se guarda (Colombia)")
    check(pg.evaluate("!document.querySelector('#setLongBreak, #longEveryStepper, #csvBtn')"), "ya no hay ajustes de descanso largo ni CSV")
    check(st0["progress"]["season"] == "2026-10", "la cuenta nueva entra en la temporada oct – dic 2026")
    check("Clima en tu polo" in pg.inner_text("#weatherLine"), "Enfocar muestra el clima del polo")

    # Duración personalizada: se guarda aparte de los modos predefinidos.
    pg.click("#customizeBtn"); pg.clock.run_for(200)
    pg.fill('.stepper[data-key="customStudyMin"] .stepper__input', "60"); pg.press('.stepper[data-key="customStudyMin"] .stepper__input', "Tab")
    pg.fill('.stepper[data-key="customBreakMin"] .stepper__input', "15"); pg.press('.stepper[data-key="customBreakMin"] .stepper__input', "Tab")
    pg.clock.run_for(200)
    check(pg.inner_text("#clock") == "1:00:00", "Mi ritmo 60 + 15 se aplica al reloj")
    pg.click('.preset[data-preset="clasico"]'); pg.clock.run_for(200)
    check(state(pg)["settings"]["customStudyMin"] == 60, "el modo personalizado se conserva al cambiar de modo")

    # Dos sesiones de 25 min con su descanso: debe subir a Bronce II.
    pg.click("#mainBtn")
    check(pg.evaluate("!!document.querySelector('#buddy .say')"), "al empezar, tu compañero dice una onomatopeya")
    pg.clock.fast_forward("05:00"); pg.clock.run_for(500)
    ring = pg.evaluate("""() => {
      const off = parseFloat(document.getElementById('ringArc').getAttribute('stroke-dashoffset'));
      const C = 2 * Math.PI * 120, k = document.getElementById('ringKnob');
      return { off, C, cx: parseFloat(k.getAttribute('cx')), cy: parseFloat(k.getAttribute('cy')) };
    }""")
    # A los 5 de 25 min, la bola va en 72° (a la derecha) y el arco vacío es justo lo recorrido.
    check(ring["cx"] > 150 and abs(ring["off"] + ring["C"] * 0.2) < 3, "el arco se vacía detrás de la bola, en el mismo sentido")
    pg.clock.fast_forward("20:00")
    pg.clock.run_for(2500)
    check(pg.evaluate("document.querySelector('#dlgTitle')?.textContent") != "Pingüino", "el primer pomodoro ya no desbloquea al pingüino (viene con la cuenta)")
    check("primer-paso" in state(pg)["progress"]["achievements"], "el logro Primer paso se sigue ganando")
    check(state(pg)["progress"]["xp"] == 33, "1.ª sesión: 33 XP")
    check(not any(("focus" in x or "notes" in x) for x in state(pg)["sessions"]), "solo se guarda el tiempo, no en qué se estudió")
    check(pg.get_attribute("#ring", "data-mode") == "break", "arranca solo el descanso")
    pg.clock.fast_forward("05:00"); pg.clock.run_for(4000)
    pg.clock.fast_forward("25:00"); pg.clock.run_for(3000)
    check(pg.evaluate("document.querySelector('.rankup__name')?.textContent") == "Bronce II", "ceremonia de subida a Bronce II")
    pg.click("text=¡Vamos!")
    if pg.get_attribute("#ring", "data-status") == "running":
        pg.click("#mainBtn")

    # Misiones
    pg.goto(URL + "#/progreso"); pg.clock.run_for(300)
    xp = state(pg)["progress"]["xp"]
    btn = pg.query_selector(".mission__claim")
    if btn:
        btn.click(); pg.clock.run_for(800)
        check(state(pg)["progress"]["xp"] > xp, "reclamar misión da XP")

    # Tu estudio: pestaña de calendario
    check(pg.evaluate("document.getElementById('weekPane').hidden && !document.getElementById('calPane').hidden"), "por defecto se ve el calendario")
    check(pg.evaluate("getComputedStyle(document.getElementById('scenery')).visibility !== 'hidden'"), "Progreso deja ver el paisaje (sin pantalla blanca)")
    check(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.hud')).borderTopLeftRadius) >= 16"), "la barra de arriba es una tarjeta redondeada")
    check(pg.evaluate("!document.getElementById('poleFill2') && !document.getElementById('h-polo')"), "Progreso ya no repite 'Tu polo'")
    check(pg.evaluate("!!document.querySelector('.hero .emblem') && !!document.querySelector('.streak-card .pic--fuego')"), "Progreso muestra la banda del rango con el escudo y la racha con fuego")
    pg.click("#tabWeek"); pg.clock.run_for(200)
    check(pg.evaluate("!document.getElementById('weekPane').hidden && document.getElementById('calPane').hidden"), "la pestaña 7 días muestra las barras")
    pg.click("#tabCal"); pg.clock.run_for(200)
    check(pg.evaluate("document.getElementById('weekPane').hidden && !document.getElementById('calPane').hidden"), "la pestaña Calendario muestra el mes")
    check(pg.inner_text("#calTitle") == "Noviembre 2026", "el calendario abre en el mes actual")
    check(pg.evaluate("document.querySelectorAll('#calGrid .cal__day').length") == 30, "noviembre tiene 30 días")
    day = pg.query_selector('#calGrid .cal__day[data-key="2026-11-02"]')
    check(day is not None and "50 min" in (day.get_attribute("aria-label") or "") and "lv-3" in (day.get_attribute("class") or "") and day.query_selector(".pic--copo") is not None, "el día muestra 50 min, meta cumplida y su copo de nieve")
    pg.click('#calGrid .cal__day[data-key="2026-11-02"]'); pg.clock.run_for(100)
    check("Lunes 2 de noviembre: 50 min en 2 sesiones" in pg.inner_text("#calDetail"), "al tocar un día se ve cuánto estudiaste")
    check(pg.evaluate("document.getElementById('calNext').disabled && document.getElementById('calPrev').disabled"), "no se puede ir a meses sin datos ni al futuro")
    pg.click("#tabWeek"); pg.clock.run_for(200)
    pg.reload(); pg.clock.run_for(800)
    check(pg.evaluate("!document.getElementById('weekPane').hidden"), "la app recuerda la pestaña elegida")
    pg.click("#tabCal"); pg.clock.run_for(200)

    # Perfil
    pg.goto(URL + "#/perfil"); pg.clock.run_for(300)
    check(pg.evaluate("!document.querySelector('.profile-card__note') && !document.body.innerText.includes('no revele quién eres')"), "el perfil ya no repite el consejo del nombre")
    check(pg.evaluate("document.querySelectorAll('.companion-card').length") == 5, "perfil muestra los 5 compañeros")
    check(pg.evaluate("document.querySelector('.companion-card.is-unlocked .companion-card__name')?.textContent") == "Pingüino", "el Pingüino ya está desbloqueado en Perfil")
    check(pg.evaluate("!document.querySelector('#view-progreso .badge')"), "Progreso ya no muestra logros")
    check(pg.evaluate("!document.querySelector('#view-perfil .avatar-opt') && !document.body.innerText.includes('O elige un animal')"), "el perfil ya no deja elegir emoji (solo foto)")

    check(pg.evaluate("parseFloat(getComputedStyle(document.getElementById('seasonFill')).width) > 0 && document.getElementById('seasonInfo').hidden"), "Temporadas muestra una barra que se llena y la explicación va en la (i)")
    pg.click("#seasonInfoBtn")
    check(pg.evaluate("!document.getElementById('seasonInfo').hidden"), "la (i) de Temporadas abre la explicación")

    # Tienda en Enfocar: la comida se arrastra hasta el compañero del reloj
    pg.goto(URL + "#/enfocar"); pg.clock.run_for(300)
    check(pg.evaluate("!document.querySelector('[data-route=\"tienda\"], #view-tienda')"), "ya no hay pestaña Tienda: la tienda vive en Enfocar")
    pg.click("#shopBtn"); pg.clock.run_for(300); pg.wait_for_timeout(400)
    check(pg.evaluate("!document.getElementById('foodTray').hidden && document.querySelectorAll('#trayFoods .tray-food').length === 12"), "el ícono de la tienda abre la bandeja con las 12 comidas")
    pet_box = pg.locator("#buddy").bounding_box(); tray_box = pg.locator("#foodTray").bounding_box()
    check(pet_box["y"] + pet_box["height"] <= tray_box["y"] + 4, "en el celular la mascota queda visible encima de la bandeja")
    gems0 = state(pg)["progress"]["gems"]
    pg.click('#trayFoods .tray-food[data-food="pescado"]'); pg.clock.run_for(200)
    check(state(pg)["progress"]["gems"] == gems0 and pg.evaluate("!!document.querySelector('#buddy .say')"), "tocar la comida no la compra: la mascota pide que se la arrastres")

    def drag_food(food, to):
        a = pg.locator(f'#trayFoods .tray-food[data-food="{food}"]').bounding_box()
        pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2); pg.mouse.down()
        for k in range(1, 11):
            pg.mouse.move(a["x"] + a["width"] / 2 + (to[0] - a["x"] - a["width"] / 2) * k / 10, a["y"] + a["height"] / 2 + (to[1] - a["y"] - a["height"] / 2) * k / 10)
        pg.mouse.up(); pg.clock.run_for(400); pg.wait_for_timeout(100)

    b = pg.locator("#buddy").bounding_box()
    drag_food("pescado", (b["x"] + b["width"] / 2, b["y"] + b["height"] / 2))
    s1 = state(pg)
    check(s1["progress"]["gems"] == gems0 - 2 and s1["pets"]["pinguino"]["fullness"] > 60, "arrastrar el pescado hasta el pingüino se lo da (cuesta 2 gemas)")
    check(pg.evaluate("!!document.querySelector('#buddy .say')"), "el pingüino dice algo al comer")
    drag_food("camaron", (20, 20))
    check(state(pg)["progress"]["gems"] == gems0 - 2, "si sueltas la comida lejos, no se cobra nada")
    pg.focus('#trayFoods .tray-food[data-food="calamar"]'); pg.keyboard.press("Enter"); pg.clock.run_for(300)
    check(state(pg)["progress"]["gems"] == gems0 - 5, "con el teclado (Enter) también se le puede dar comida")
    pg.keyboard.press("Escape"); pg.clock.run_for(100)
    check(pg.evaluate("document.getElementById('foodTray').hidden"), "Escape cierra la bandeja")
    pg.goto(URL + "#/tienda"); pg.clock.run_for(400)
    check(pg.evaluate("location.hash === '#/enfocar' && !document.getElementById('foodTray').hidden"), "las gemas de la barra llevan a la tienda de Enfocar")
    check(pg.evaluate("!!document.querySelector('.sc-roast__strip') && !document.querySelector('[href*=explorador]')"), "de noche, el oso asa malvaviscos (ya no está el explorador)")
    check(pg.evaluate("!!document.querySelector('.walker--bear .sprite--oso-camina')"), "el oso que pasea usa su ciclo de caminar")

    # Foto de perfil desde el Perfil: cambiarla y quitarla
    pg.goto(URL + "#/perfil"); pg.clock.run_for(300)
    pg.click(".avatar-picker summary")
    with pg.expect_file_chooser() as fc:
        pg.click("#photoBtn")
    fc.value.set_files(FOTO); pg.wait_for_timeout(600); pg.clock.run_for(200)
    pg.evaluate("document.getElementById('photoZoom').value = '2'; document.getElementById('photoZoom').dispatchEvent(new Event('input'))")
    pg.click("#dlg button:has-text('Usar esta foto')"); pg.wait_for_timeout(400); pg.clock.run_for(200)
    ph = state(pg)["profile"]["photo"]
    check(photo_ok(ph) and ph != ph0, "desde el Perfil se cambia la foto (con zoom), sin EXIF/GPS")
    pg.click("#photoRemoveBtn"); pg.clock.run_for(200)
    check(state(pg)["profile"]["photo"] == "" and state(pg)["profile"]["avatar"] == animal, "al quitar la foto vuelve el animal asignado")

    # Ya no existe la vista Plan
    check(pg.evaluate("!document.querySelector('[data-route=\"plan\"], #view-plan')"), "la vista Plan fue eliminada")

    # Premium (modo prueba) y sonidos
    pg.goto(URL + "#/ajustes"); pg.clock.run_for(300)
    pg.click("#ambientGrid .sound-chip:has-text('Olas')"); pg.clock.run_for(300)
    check(pg.evaluate("document.getElementById('dlg').open && document.querySelector('.dlg--premium') !== null"), "un sonido Premium abre la oferta Premium")
    gems_before = state(pg)["progress"]["gems"]
    check("1.000 gemas" in pg.inner_text("#dlg") or "1000 gemas" in pg.inner_text("#dlg"), "la oferta Premium anuncia las 1000 gemas de regalo")
    pg.click("#dlg button:has-text('Probar Premium gratis')"); pg.wait_for_timeout(800); pg.clock.run_for(600)
    check(state(pg)["premium"]["active"], "Premium se activa en modo prueba")
    check(state(pg)["progress"]["gems"] == gems_before + 1000, "al activar Premium llegan 1000 gemas")
    check(pg.evaluate("document.getElementById('dlg').open") and "Tu regalo" in pg.inner_text("#dlg"), "aparece la ceremonia del regalo Premium")
    pg.click("#dlg button:has-text('Elegir mi mascota')"); pg.wait_for_timeout(400); pg.clock.run_for(300)
    opts = pg.evaluate("[...document.querySelectorAll('#dlg .gift-pet')].map(b => b.dataset.id)")
    check(len(opts) >= 1 and "pinguino" not in opts, f"se elige entre las mascotas limitadas que aún no tienes ({', '.join(opts)})")
    pick = opts[-1]
    pg.click(f'#dlg .gift-pet[data-id="{pick}"]'); pg.click("#dlg button:has-text('Quedármela')"); pg.wait_for_timeout(800); pg.clock.run_for(1500)
    check("Tu regalo por ser Premium" in pg.inner_text("#dlg"), "la mascota regalada tiene su ceremonia")
    pg.click("text=¡Que me acompañe!"); pg.wait_for_timeout(300); pg.clock.run_for(800)
    sp = state(pg)
    check(sp["progress"]["gifted"] == [pick] and sp["profile"]["companion"] == pick and not sp["premium"]["giftPending"], "la mascota regalada queda tuya y te acompaña")
    pg.click("#ambientGrid .sound-chip:has-text('Olas')"); pg.clock.run_for(300)
    check(state(pg)["settings"]["ambient"] == "olas", "con Premium se puede elegir un sonido Premium")
    # El sistema está en modo oscuro y la apariencia en "Automática": la app se ve oscura y el
    # campo de la hora queda oscuro con letra clara (antes salía letra clara sobre blanco).
    check(pg.evaluate("document.documentElement.dataset.theme") == "dark", "con el sistema en modo oscuro, la app usa el modo oscuro")
    bg, fg = pg.evaluate("(() => { const c = getComputedStyle(document.getElementById('remTime')); return [c.backgroundColor, c.color]; })()")
    check(bg == "rgb(28, 42, 71)" and fg == "rgb(231, 238, 249)", f"en modo oscuro el campo de la hora se lee bien ({bg} / {fg})")
    pg.goto(URL + "#/enfocar"); pg.clock.run_for(300)
    pg.click("#ambientBtn"); pg.clock.run_for(200)
    check(state(pg)["settings"]["ambient"] == "", "el botón de silencio apaga el sonido")

    # Ranking: primer MVP sin rivales simulados
    pg.goto(URL + "#/ranking"); pg.clock.run_for(300)
    check(pg.evaluate("document.querySelectorAll('#board .row').length === 1 && !!document.querySelector('#board .row.is-you') && !document.querySelector('.podium__spot')"), "el ranking solo muestra tu marca (sin bots)")
    check("llega pronto" in pg.inner_text("#view-ranking"), "el ranking avisa que el global llega pronto")
    pg.click("#seasonTab"); pg.clock.run_for(300)
    check("temporada" in pg.inner_text("#board").lower(), "en 'Esta temporada' se ve tu marca de la temporada")

    # Ajustes sin control parental
    pg.goto(URL + "#/ajustes"); pg.clock.run_for(300)
    check(pg.evaluate("!document.querySelector('#h-parental, #pinActions') && !document.body.innerText.includes('PIN')"), "ya no existe el control parental")
    pg.click('[data-cap="30"]'); pg.clock.run_for(200)
    check(state(pg)["settings"]["dailyCapMin"] == 270 and not pg.evaluate("document.getElementById('dlg').open"), "el límite diario se cambia directo")
    pg.click("label.switch:has(#setBoard)"); pg.clock.run_for(200)
    check(state(pg)["settings"]["leaderboardOn"] is False, "salir del ranking se cambia directo")
    pg.click("label.switch:has(#setBoard)"); pg.clock.run_for(200)
    check(pg.evaluate("!document.querySelector('#exportBtn, #importBtn, #wipeBtn') && !!document.querySelector('#accDeleteBtn')"), "ya no hay copias ni borrar todo; sí 'Eliminar mi cuenta'")
    check("Guardado automático activo" in pg.inner_text("#saveStatus"), "Ajustes muestra el guardado automático")

    # Nueva temporada (y guardado automático del día anterior)
    before = state(pg)
    pg.clock.set_system_time(datetime.datetime(2027, 1, 1, 9, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-5))))
    pg.reload(); pg.clock.run_for(1500); pg.wait_for_timeout(600)
    check("Guardado automático" in pg.inner_text("#toasts"), "al cambiar de día se avisa que el total de ayer quedó guardado")
    check(pg.evaluate("!!document.querySelector('#dlg[open] .rankup__kicker')") and "Nueva temporada" in pg.inner_text("#dlg"), "aparece la ceremonia de nueva temporada")
    after = state(pg)
    check(after["progress"]["season"] == "2027-01" and after["progress"]["xp"] == 0, "el rango vuelve a Bronce III en la temporada nueva")
    check(after["seasons"] and after["seasons"][0]["id"] == "2026-10" and after["progress"]["gems"] > before["progress"]["gems"], "la temporada pasada queda guardada y da gemas")
    check(after["sessions"] == [] and after["daily"].get("2026-11-02", {}).get("studySec", 0) >= 3000, "se borra el historial detallado, pero el calendario se conserva")
    pg.click("#dlg button:has-text('Empezar la temporada')"); pg.clock.run_for(300)

    # Sin conexión
    pg.reload(); pg.wait_for_timeout(800)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(800)
    check(pg.evaluate("!!document.querySelector('#ring')"), "la app abre sin conexión")
    ctx.set_offline(False)

    # Eliminar la cuenta (lo exigen Apple y Google): con contraseña equivocada no pasa nada.
    pg.goto(URL + "#/ajustes"); pg.clock.run_for(500)
    pg.click("#accDeleteBtn"); pg.clock.run_for(200)
    check("[object" not in pg.inner_text("#dlg"), "los diálogos no muestran texto '[object …]'")
    pg.fill("#delPass", "Otra2026x"); pg.click("#dlg button:has-text('Eliminar mi cuenta')"); pg.wait_for_timeout(1500)
    check(state(pg) is not None and pg.evaluate("document.getElementById('dlg').open"), "con una contraseña equivocada no se elimina nada")
    pg.fill("#delPass", "Pingu2026"); pg.click("#dlg button:has-text('Eliminar mi cuenta')"); pg.wait_for_timeout(1500); pg.clock.run_for(800)
    check(pg.evaluate("!localStorage.getItem('st2_state') || !JSON.parse(localStorage.getItem('st2_state')).account"), "con la contraseña correcta, la cuenta se elimina")

    check(not errors, "sin errores en consola" + (": " + " | ".join(errors) if errors else ""))

    # Registro saltando la foto: queda el animal al azar
    ctx3 = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light", locale="es-CO")
    pg3 = ctx3.new_page(); errs3 = []
    pg3.on("pageerror", lambda e: errs3.append(str(e)))
    pg3.goto(URL); pg3.wait_for_timeout(800)
    pg3.fill("#accUser", "zorrito.lector"); pg3.fill("#accPass1", "Zorro2026"); pg3.fill("#accPass2", "Zorro2026")
    pg3.click("#dlg button:has-text('Crear cuenta')"); pg3.wait_for_timeout(1500)
    pg3.click("#dlg button:has-text('Ahora no')"); pg3.wait_for_timeout(400)
    s3 = pg3.evaluate("JSON.parse(localStorage.getItem('st2_state'))")
    check(s3["profile"]["onboarded"] and s3["profile"]["photo"] == "" and bool(s3["profile"]["avatar"]) and not pg3.evaluate("document.getElementById('dlg').open"), "con 'Ahora no' se entra con el animal al azar y sin foto")
    check(not errs3, "sin errores al saltar la foto" + (": " + " | ".join(errs3) if errs3 else ""))

    # v3.5: "Mantener mi sesión iniciada" (marcada por defecto al registrarse)
    check(pg3.evaluate("!!localStorage.getItem('st2_remember') && !!JSON.parse(localStorage.getItem('st2_state')).account.remember"), "al registrarse queda activado 'mantener mi sesión iniciada'")
    check("contrase" not in pg3.evaluate("localStorage.getItem('st2_remember')").lower(), "el recuerdo de sesión no guarda la contraseña")
    pg4 = ctx3.new_page(); pg4.on("pageerror", lambda e: errs3.append(str(e)))
    pg4.clock.install()
    pg4.goto(URL); pg4.wait_for_timeout(1500); pg4.clock.run_for(500)
    check(not pg4.evaluate("document.getElementById('dlg').open") and pg4.inner_text("#hudNick") == "zorrito.lector", "al volver a abrir la app no pide la contraseña")
    # v3.5: "El reloj me espera": al terminar el estudio, el descanso NO empieza solo
    pg4.goto(URL + "#/ajustes"); pg4.clock.run_for(400)
    check(pg4.evaluate("document.getElementById('afterStudyAuto').checked"), "por defecto el descanso empieza solo")
    pg4.click("label:has(#afterStudyWait)"); pg4.clock.run_for(300)
    check(pg4.evaluate("JSON.parse(localStorage.getItem('st2_state')).settings.autoBreak") is False, "se puede elegir que el reloj espere")
    pg4.goto(URL + "#/enfocar"); pg4.clock.run_for(400)
    pg4.click('.preset[data-preset="mini"]'); pg4.clock.run_for(200)
    pg4.click("#mainBtn"); pg4.clock.run_for(300)
    pg4.clock.fast_forward("15:00"); pg4.clock.run_for(4000)
    check(pg4.get_attribute("#ring", "data-mode") == "break" and pg4.get_attribute("#ring", "data-status") == "idle", "al terminar de estudiar, el descanso espera a que lo empieces")
    check(pg4.inner_text("#mainBtn") == "Empezar descanso", "el botón invita a empezar el descanso")
    # Apagar "mantener sesión" vuelve a pedir la contraseña
    if pg4.evaluate("document.getElementById('dlg').open"):
        pg4.keyboard.press("Escape"); pg4.clock.run_for(300)
    pg4.goto(URL + "#/ajustes"); pg4.clock.run_for(400)
    check(pg4.evaluate("document.getElementById('setRemember').checked"), "Ajustes muestra 'mantener mi sesión iniciada' activado")
    pg4.click("label:has(#setRemember)"); pg4.clock.run_for(400); pg4.wait_for_timeout(300)
    check(pg4.evaluate("!localStorage.getItem('st2_remember') && !JSON.parse(localStorage.getItem('st2_state')).account.remember"), "al apagarlo se borra el recuerdo de sesión")
    pg5 = ctx3.new_page(); pg5.goto(URL); pg5.wait_for_timeout(1200)
    check(pg5.evaluate("document.getElementById('dlg').open && !!document.getElementById('loginPass')"), "sin 'mantener sesión', al abrir pide la contraseña")
    pg5.fill("#loginPass", "Zorro2026"); pg5.click("#dlg button:has-text('Entrar')"); pg5.wait_for_timeout(1500)
    check(not pg5.evaluate("document.getElementById('dlg').open") and pg5.evaluate("!!localStorage.getItem('st2_remember')"), "al entrar con la casilla marcada, se vuelve a recordar la sesión")
    check(not errs3, "sin errores en mantener sesión y descanso en espera" + (": " + " | ".join(errs3) if errs3 else ""))
    ctx3.close()

    # Paisaje animado aunque el sistema pida "reducir movimiento" (y quieto con el ajuste de la app)
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce", locale="es-CO")
    pg2 = ctx2.new_page()
    pg2.goto(URL); pg2.wait_for_timeout(1200)
    pos = lambda: pg2.evaluate("[...document.querySelectorAll('.walker')].map(w => Math.round(w.getBoundingClientRect().left))")
    a = pos(); pg2.wait_for_timeout(1200); b = pos()
    check(a != b, "con 'reducir movimiento' del sistema, los animales igual caminan")
    pg2.evaluate("document.documentElement.classList.add('reduce-motion')"); pg2.wait_for_timeout(300)
    a = pos(); pg2.wait_for_timeout(1000); b = pos()
    check(a == b, "con 'Menos animaciones' de la app, se quedan quietos")
    check(pg2.evaluate("getComputedStyle(document.querySelector('.gate-snow')).display === 'none'"), "con 'Menos animaciones', la nevada de la entrada no aparece")
    ctx2.close()
    browser.close()

print("\n" + ("Todo bien." if not failures else f"{len(failures)} fallo(s)."))
sys.exit(1 if failures else 0)
