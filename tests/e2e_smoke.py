"""
Prueba de humo en un navegador real (opcional).

Requisitos (una sola vez):
    pip install playwright
    python -m playwright install chromium

Uso (con la app servida en otra terminal: python -m http.server 8000):
    python tests/e2e_smoke.py http://localhost:8000/

Recorre: bienvenida con cuenta (nombre, contraseña y país en lista emergente), duración personalizada (60 + 15),
una sesión con reloj simulado (y el anillo que avanza junto a la bola), compañero desbloqueado y su onomatopeya,
subida de rango, misiones, calendario del mes, perfil, Premium y sonidos, ranking, ajustes en modo oscuro del
sistema, guardado automático del día, cambio de temporada, modo sin conexión, eliminar la cuenta y animaciones
del paisaje aunque el sistema pida "reducir movimiento".
Termina con código 1 si algo falla.
"""
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
    pg.fill("#accUser", "putito99"); pg.fill("#accPass1", "Pingu2026"); pg.fill("#accPass2", "Pingu2026")
    pg.click("text=¡Listo, a estudiar!"); pg.wait_for_timeout(400)
    check(pg.evaluate("document.getElementById('dlg').open"), "un nombre ofensivo no se acepta")
    pg.fill(".country-search", "colom")
    check(pg.evaluate("!document.querySelector('#dlg .country-list').hidden"), "al escribir se abre la lista de países")
    pg.click(".country-opt:has-text('Colombia')")
    check(pg.evaluate("document.querySelector('#dlg .country-list').hidden && document.querySelector('#dlg .country-search').value === 'Colombia'"), "al elegir, la lista se cierra y el campo muestra Colombia")
    pg.fill("#accUser", "pingu_estudia"); pg.click("text=¡Listo, a estudiar!"); pg.wait_for_timeout(1500); pg.clock.run_for(300)
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
    check(pg.evaluate("document.querySelector('#dlgTitle')?.textContent") == "Pingüino", "se desbloquea el primer compañero")
    pg.click("text=¡Que me acompañe!"); pg.clock.run_for(1500)
    check(state(pg)["profile"]["companion"] == "pinguino", "el compañero queda equipado")
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
    check(pg.evaluate("!document.getElementById('weekPane').hidden && document.getElementById('calPane').hidden"), "por defecto se ven los últimos 7 días")
    pg.click("#tabCal"); pg.clock.run_for(200)
    check(pg.evaluate("document.getElementById('weekPane').hidden && !document.getElementById('calPane').hidden"), "la pestaña Calendario muestra el mes")
    check(pg.inner_text("#calTitle") == "Noviembre 2026", "el calendario abre en el mes actual")
    check(pg.evaluate("document.querySelectorAll('#calGrid .cal__day').length") == 30, "noviembre tiene 30 días")
    day = pg.query_selector('#calGrid .cal__day[data-key="2026-11-02"]')
    check(day is not None and "50m" in day.inner_text() and "lv-3" in (day.get_attribute("class") or ""), "el día de hoy muestra 50 min y nivel de meta cumplida")
    pg.click('#calGrid .cal__day[data-key="2026-11-02"]'); pg.clock.run_for(100)
    check("Lunes 2 de noviembre: 50 min en 2 sesiones" in pg.inner_text("#calDetail"), "al tocar un día se ve cuánto estudiaste")
    check(pg.evaluate("document.getElementById('calNext').disabled && document.getElementById('calPrev').disabled"), "no se puede ir a meses sin datos ni al futuro")
    pg.reload(); pg.clock.run_for(800)
    check(pg.evaluate("!document.getElementById('calPane').hidden"), "la app recuerda la pestaña elegida")

    # Perfil
    pg.goto(URL + "#/perfil"); pg.clock.run_for(300)
    check(pg.evaluate("!document.querySelector('.profile-card__note') && !document.body.innerText.includes('no revele quién eres')"), "el perfil ya no repite el consejo del nombre")
    check(pg.evaluate("document.querySelectorAll('.companion-card').length") == 5, "perfil muestra los 5 compañeros")
    check(pg.evaluate("!document.querySelector('#view-progreso .badge')"), "Progreso ya no muestra logros")

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

    # Foto de perfil: se recorta, se guarda pequeña y SIN los datos ocultos (EXIF/GPS)
    foto = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_foto_prueba.jpg")
    try:
        from PIL import Image
        img = Image.new("RGB", (900, 600), (90, 160, 220))
        exif = Image.Exif(); exif[0x010F] = "TelefonoDePrueba"; exif[0x8825] = {2: (6.0, 15.0, 0.0), 1: "N"}
        img.save(foto, "JPEG", exif=exif.tobytes())
        pg.goto(URL + "#/perfil"); pg.clock.run_for(300)
        pg.click(".avatar-picker summary")
        with pg.expect_file_chooser() as fc:
            pg.click("#photoBtn")
        fc.value.set_files(foto); pg.wait_for_timeout(600); pg.clock.run_for(200)
        pg.click("#dlg button:has-text('Usar esta foto')"); pg.wait_for_timeout(400); pg.clock.run_for(200)
        ph = state(pg)["profile"]["photo"]
        import base64
        raw = base64.b64decode(ph.split(",", 1)[1]) if ph else b""
        check(ph.startswith("data:image/") and len(ph) < 300000, "la foto de perfil se guarda recortada y liviana")
        check(b"Exif" not in raw and b"TelefonoDePrueba" not in raw, "la foto guardada no lleva datos ocultos (EXIF ni GPS)")
        check(pg.evaluate("!!document.querySelector('#hudAvatar img.avatar__photo')"), "la foto aparece en la barra de arriba")
    finally:
        if os.path.exists(foto): os.remove(foto)

    # Ya no existe la vista Plan
    check(pg.evaluate("!document.querySelector('[data-route=\"plan\"], #view-plan')"), "la vista Plan fue eliminada")

    # Premium (modo prueba) y sonidos
    pg.goto(URL + "#/ajustes"); pg.clock.run_for(300)
    pg.click("#ambientGrid .sound-chip:has-text('Olas')"); pg.clock.run_for(300)
    check(pg.evaluate("document.getElementById('dlg').open && document.querySelector('.dlg--premium') !== null"), "un sonido Premium abre la oferta Premium")
    pg.click("#dlg button:has-text('Probar Premium gratis')"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    check(state(pg)["premium"]["active"], "Premium se activa en modo prueba")
    pg.click("#ambientGrid .sound-chip:has-text('Olas')"); pg.clock.run_for(300)
    check(state(pg)["settings"]["ambient"] == "olas", "con Premium se puede elegir un sonido Premium")
    bg = pg.evaluate("getComputedStyle(document.getElementById('remTime')).backgroundColor")
    check(bg == "rgb(255, 255, 255)", f"con el sistema en modo oscuro, el campo de la hora es blanco ({bg})")
    pg.goto(URL + "#/enfocar"); pg.clock.run_for(300)
    pg.click("#ambientBtn"); pg.clock.run_for(200)
    check(state(pg)["settings"]["ambient"] == "", "el botón de silencio apaga el sonido")

    # Ranking
    pg.goto(URL + "#/ranking"); pg.clock.run_for(300)
    check(pg.evaluate("!!document.querySelector('.row.is-you, .podium__spot.is-you')"), "apareces en el ranking demo")

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

    # Paisaje animado aunque el sistema pida "reducir movimiento" (y quieto con el ajuste de la app)
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    pg2 = ctx2.new_page()
    pg2.goto(URL); pg2.wait_for_timeout(1200)
    pos = lambda: pg2.evaluate("[...document.querySelectorAll('.walker')].map(w => Math.round(w.getBoundingClientRect().left))")
    a = pos(); pg2.wait_for_timeout(1200); b = pos()
    check(a != b, "con 'reducir movimiento' del sistema, los animales igual caminan")
    pg2.evaluate("document.documentElement.classList.add('reduce-motion')"); pg2.wait_for_timeout(300)
    a = pos(); pg2.wait_for_timeout(1000); b = pos()
    check(a == b, "con 'Menos animaciones' de la app, se quedan quietos")
    ctx2.close()
    browser.close()

print("\n" + ("Todo bien." if not failures else f"{len(failures)} fallo(s)."))
sys.exit(1 if failures else 0)
