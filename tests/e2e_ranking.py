"""
FrostPom — ranking global (v3.9) con un Supabase SIMULADO.

Se cambia config.js para encender el ranking (leaderboard.mode = 'remote') y se responde a las
llamadas de Supabase (Auth y /rest/v1/rpc) desde aquí, con un servidor de mentira en memoria.
Las reglas reales del servidor (trampas, tope diario, etc.) se prueban aparte en PostgreSQL:
server/supabase/test/run_local.sh

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_ranking.py http://localhost:8000/
"""
import os, sys, re, json, datetime, tempfile
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
OUT = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='frostpom-ranking-')
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


from _fake_supabase import FakeSupabase  # el Supabase simulado (compartido con e2e_cuentas.py)


def config_route(mode):
    """mode = lista de un elemento, para poder cambiarla durante la prueba ('remote' / 'local')."""
    def handler(route):
        resp = route.fetch()
        body = resp.text().replace("mode: 'local'", "mode: 'remote'").replace("mode: 'remote'", f"mode: '{mode[0]}'")
        # Esta prueba es del ranking: las cuentas en línea (v4.0) se prueban en e2e_cuentas.py
        route.fulfill(response=resp, body=body.replace("online: true", "online: false"))
    return handler


def dismiss(pg, tick):
    """Cierra celebraciones (subir de rango, logros…) que tapan los botones."""
    for _ in range(6):
        if not pg.evaluate("document.getElementById('dlg').open"):
            return
        btn = pg.query_selector('#dlg .dlg__actions button:last-child') or pg.query_selector('#dlg button')
        if btn:
            btn.click()
        else:
            pg.keyboard.press('Escape')
        tick(700)


def board(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_board') || 'null')")


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def toasts(pg):
    return pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ')")


def new_context(browser, fake, mode, locale='es-CO'):
    # Sin service worker: así el cambio de config.js (local → remote) se ve al recargar
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route('**/js/config.js', config_route(mode))
    return ctx


def register(pg, user, birth=None, press='Crear cuenta'):
    pg.fill('#accUser', user); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    if birth:
        y, m = birth.split('-')
        pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    pg.click(f"#dlg button:has-text('{press}')")


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ================= A. Persona nueva, 13+ años =================
    fake = FakeSupabase()
    ctx = new_context(browser, fake, ['remote'])
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026, 11, 11, 16, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-5))))
    pg.goto(URL); pg.clock.run_for(800)
    check(pg.is_visible('#accBirthM') and pg.is_visible('#accBirthY'), 'con el ranking encendido, el registro pregunta mes y año de nacimiento')
    check(pg.evaluate("document.querySelector('#accBirthM').value === '' && document.querySelector('#accBirthY').value === ''"), 'la fecha de nacimiento no viene sugerida')
    register(pg, 'pingu_estudia'); pg.wait_for_timeout(400); pg.clock.run_for(300)
    check('mes y el año' in pg.inner_text('#dlg .form-error'), 'sin fecha de nacimiento no deja crear la cuenta')
    register(pg, 'ana_23', '2000-05'); pg.wait_for_timeout(1200); pg.clock.run_for(300)
    check('ya lo usa otra persona' in pg.inner_text('#dlg .form-error'), 'un nombre ocupado en el ranking se avisa al crear la cuenta')
    register(pg, 'pingu_estudia', '2000-05'); pg.wait_for_timeout(1500); pg.clock.run_for(300)
    check(state(pg)['account'].get('birth') == '2000-05', 'el mes y año quedan en la cuenta del dispositivo')
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(1200); pg.clock.run_for(500)
    prof = fake.fn_calls('set_profile')
    check(len(fake.fn_calls('anon_signup')) == 1 and prof and prof[-1][1]['p_username'] == 'pingu_estudia' and prof[-1][1]['p_show'] is True,
          'al crear la cuenta se une solo al ranking (cuenta anónima + nombre de usuario, aparece por defecto)')
    check('birth' not in json.dumps(prof[-1][1]) and '2000' not in json.dumps(prof[-1][1]), 'la fecha de nacimiento NO se envía al servidor')
    check(board(pg)['joined'] and board(pg)['name'] == 'pingu_estudia', 'el dispositivo recuerda que ya se unió')
    check('ranking global como pingu_estudia' in toasts(pg), 'avisa: "Apareces en el ranking global como…"')

    # Pomodoro con internet: avisa al empezar y al terminar
    pg.click('#mainBtn'); pg.clock.run_for(800)
    starts = fake.fn_calls('start_session')
    check(len(starts) == 1 and starts[0][1]['p_planned_sec'] == 1500, 'al empezar un pomodoro se avisa al servidor (25 min planeados)')
    pg.clock.fast_forward('25:00'); pg.clock.run_for(2500)
    fins = fake.fn_calls('finish_session')
    check(len(fins) == 1 and fins[0][1]['p_actual_sec'] == 1500 and fins[0][1]['p_xp'] == state(pg)['progress']['xp'], 'al terminar se avisa con el tiempo real y la XP')
    check(fake.minutes[board(pg)['uid']] == 25, 'el servidor acreditó 25 min')

    # Pomodoro SIN internet al empezar: no cuenta en el ranking (sí en el progreso)
    fake.abort.add('start_session')
    pg.clock.fast_forward('05:00'); pg.clock.run_for(4000)  # termina el descanso y empieza solo el siguiente
    check(pg.get_attribute('#ring', 'data-mode') == 'study' and pg.get_attribute('#ring', 'data-status') == 'running', 'el siguiente pomodoro empezó solo')
    check('no sumará en el ranking global' in toasts(pg), 'sin internet al empezar: avisa que ese pomodoro no suma en el ranking')
    xp_before = state(pg)['progress']['xp']
    pg.clock.fast_forward('25:00'); pg.clock.run_for(3000)
    check(len(fake.fn_calls('finish_session')) == 1, 'ese pomodoro no se envía al terminar')
    check(state(pg)['progress']['xp'] > xp_before, 'pero sí cuenta en tu progreso')
    fake.abort.discard('start_session')
    dismiss(pg, pg.clock.run_for)  # ceremonia de Bronce II

    # Se va el internet AL TERMINAR: el aviso queda pendiente y se envía al volver
    pg.clock.fast_forward('05:00'); pg.clock.run_for(4000)  # termina el descanso; empieza solo el siguiente (con internet)
    dismiss(pg, pg.clock.run_for)
    check(len(fake.fn_calls('start_session')) == 2, 'otro pomodoro con internet se avisa al empezar')
    fake.abort.add('finish_session')
    pg.clock.fast_forward('25:00'); pg.clock.run_for(2500)
    dismiss(pg, pg.clock.run_for)
    check(len(board(pg)['pending']) == 1, 'sin internet al terminar, el aviso queda pendiente en el dispositivo')
    fake.abort.discard('finish_session')
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.clock.run_for(1500)
    check(len(board(pg)['pending']) == 0 and fake.minutes[board(pg)['uid']] == 50, 'al volver el internet se envía solo (ya van 50 min)')

    # El ranking
    if pg.get_attribute('#ring', 'data-status') == 'running':
        pg.click('#mainBtn')  # pausa el descanso
    pg.goto(URL + '#/ranking'); pg.clock.run_for(1500)
    for _ in range(20):  # el ranking llega por la red: si el equipo está ocupado, puede tardar un poco más
        if pg.evaluate("document.querySelectorAll('.podium__nick').length") >= 3:
            break
        pg.wait_for_timeout(100); pg.clock.run_for(200)
    pod = pg.evaluate("[...document.querySelectorAll('.podium__nick')].map(n => n.textContent.trim())")
    check(any('Zorro.lector' in x for x in pod) and len(pod) == 3, 'el podio muestra a los 3 primeros')
    you = pg.evaluate("document.querySelector('#board .row.is-you')?.textContent || ''")
    check('pingu_estudia' in you and '50 min' in you, 'tu fila aparece resaltada con tus minutos del servidor')
    check(pg.evaluate("document.querySelector('#board').getAttribute('start')") == '4', 'la tabla sigue desde el 4.º puesto')
    check('se reinicia el' in pg.inner_text('#boardNotice') and '4 h' in pg.inner_text('#boardNotice'), 'avisa cuándo se reinicia la semana y el máximo de 4 h al día')
    check(not pg.is_visible('.soon'), 'ya no aparece "El ranking global llega pronto"')
    pg.screenshot(path=OUT + '/ranking.png', full_page=True)

    # Cambiar el nombre: también en el ranking (y no se puede tomar uno ocupado)
    pg.goto(URL + '#/perfil'); pg.clock.run_for(800)
    pg.click("button:has-text('Cambiar nombre')"); pg.clock.run_for(300)
    pg.fill('#accUser', 'Luna_K'); pg.click("#dlg button:has-text('Guardar')"); pg.wait_for_timeout(800); pg.clock.run_for(300)
    check('ya lo usa otra persona' in pg.inner_text('#dlg .form-error') and state(pg)['profile']['nick'] == 'pingu_estudia', 'no deja cambiar a un nombre ocupado en el ranking')
    pg.fill('#accUser', 'pingu.nuevo'); pg.click("#dlg button:has-text('Guardar')"); pg.wait_for_timeout(800); pg.clock.run_for(300)
    check(state(pg)['account']['username'] == 'pingu.nuevo' and fake.profiles[board(pg)['uid']]['username'] == 'pingu.nuevo', 'el nombre nuevo queda en la cuenta y en el ranking')

    # Agregar el correo: el lugar pasa a la cuenta con correo
    pg.goto(URL + '#/ajustes'); pg.clock.run_for(800)
    anon_uid = board(pg)['uid']
    pg.click('#accMailBtn'); pg.clock.run_for(300)
    pg.fill('#mailNew', 'pingu@example.com'); pg.fill('#mailPass', 'Pingu2026')
    pg.click("#dlg button:has-text('Guardar correo')"); pg.wait_for_timeout(2500); pg.clock.run_for(1500)
    b = board(pg)
    check(b['anon'] is False and b['uid'] != anon_uid and fake.profiles.get(b['uid'], {}).get('username') == 'pingu.nuevo' and fake.minutes.get(b['uid']) == 50,
          'al agregar el correo, tu lugar (nombre y 50 min) pasa a la cuenta con correo')
    check(anon_uid not in fake.users, 'la cuenta anónima anterior se borra')

    # Salir del ranking (sin borrar) y volver
    check(not pg.query_selector('#boardDownload') and not pg.query_selector('#boardDelete'), 'Ajustes ya no muestra "Descargar" ni "Borrar" (JSON)')
    pg.click("label:has(#setBoard)"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    check('Dejar de aparecer' in (pg.text_content('#dlgTitle') or ''), 'al apagar "Aparecer en el ranking" pregunta en palabras simples')
    pg.click("#dlg button:has-text('Cancelar')"); pg.wait_for_timeout(400); pg.clock.run_for(300)
    check(state(pg)['settings']['leaderboardOn'] and pg.is_checked('#setBoard') and not fake.fn_calls('set_board_visibility'), 'si cancelas, sigues apareciendo')
    pg.click("label:has(#setBoard)"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    pg.click("#dlg button:has-text('Dejar de aparecer')"); pg.wait_for_timeout(800); pg.clock.run_for(500)
    vis = fake.fn_calls('set_board_visibility')
    check(vis and vis[-1][1]['p_show'] is False and not fake.profiles[b['uid']]['show'], 'al apagar "Aparecer en el ranking" dejas de aparecer')
    pg.goto(URL + '#/ranking'); pg.clock.run_for(1200)
    check('No apareces en el ranking' in pg.inner_text('#boardSoon'), 'el ranking explica que elegiste no aparecer')
    n_starts = len(fake.fn_calls('start_session'))
    pg.goto(URL + '#/enfocar'); pg.clock.run_for(300)
    if pg.get_attribute('#ring', 'data-mode') != 'study':
        pg.click('#skipBtn'); pg.clock.run_for(300)
    pg.click('#mainBtn'); pg.clock.run_for(800)
    check(len(fake.fn_calls('start_session')) == n_starts, 'sin aparecer, tus pomodoros no se envían')
    pg.click('#mainBtn'); pg.clock.run_for(200)
    pg.goto(URL + '#/ranking'); pg.clock.run_for(1000)
    pg.click('#boardBackBtn'); pg.wait_for_timeout(800); pg.clock.run_for(800)
    check(fake.profiles[b['uid']]['show'] and state(pg)['settings']['leaderboardOn'], '"Volver a aparecer" funciona')

    # Salir y borrar tus minutos (la casilla de la misma ventana)
    pg.goto(URL + '#/ajustes'); pg.clock.run_for(800)
    pg.click("label:has(#setBoard)"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    pg.check('#boardWipe')
    pg.click("#dlg button:has-text('Dejar de aparecer')"); pg.wait_for_timeout(800); pg.clock.run_for(500)
    check(b['uid'] not in fake.profiles and board(pg) is None and state(pg)['settings']['leaderboardOn'] is False, 'salir marcando "borrar mis minutos": se borran del servidor y del dispositivo')
    check(not errs, 'sin errores en la persona nueva' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ================= B. Menor de 13 años =================
    fake = FakeSupabase()
    ctx = new_context(browser, fake, ['remote'])
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(1000)
    register(pg, 'pingu_peque', '2015-03'); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(1500)
    check(not fake.fn_calls('anon_signup') and not fake.fn_calls('set_profile') and not fake.fn_calls('username_available'),
          'menor de 13: no se crea cuenta en el servidor ni se envía su nombre')
    pg.click('#mainBtn'); pg.wait_for_timeout(600)
    check(not fake.fn_calls('start_session'), 'menor de 13: sus pomodoros no se envían')
    pg.click('#mainBtn')
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    check('mayores de 13' in pg.inner_text('#boardSoon'), 'menor de 13: el ranking explica que es para mayores de 13')
    check(pg.evaluate("document.querySelectorAll('.podium__nick').length") == 3 and not pg.evaluate("document.querySelector('#board .row.is-you')"),
          'menor de 13: puede ver el ranking, pero no aparece en él')
    gl = fake.fn_calls('get_leaderboard')
    check(gl and all(c[2] is None for c in gl), 'menor de 13: el ranking se pide sin sesión')
    check(not errs, 'sin errores con menor de 13' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ================= C. Cuenta de antes (sin fecha) con un nombre ocupado =================
    fake = FakeSupabase()
    mode = ['local']
    ctx = new_context(browser, fake, mode)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(1000)
    check(not pg.query_selector('#accBirthM'), 'con el ranking apagado, el registro no pregunta la fecha de nacimiento')
    register(pg, 'Zorro.lector'); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(800)
    check(not fake.calls, 'con el ranking apagado no se llama al servidor')
    mode[0] = 'remote'
    pg.reload(); pg.wait_for_timeout(2000)
    check('Llegó el ranking global' in (pg.text_content('#dlgTitle') or ''), 'a quien ya tenía cuenta se le presenta el ranking una vez')
    pg.select_option('#joinBirthM', '07'); pg.select_option('#joinBirthY', '1999')
    pg.click("#dlg button:has-text('Unirme')"); pg.wait_for_timeout(1500)
    check('ya está en el ranking' in (pg.text_content('#dlgTitle') or ''), 'si su nombre ya lo tiene otra persona, se le pide elegir otro')
    pg.fill('#boardName', 'zorro_nuevo'); pg.click("#dlg button:has-text('Usar este nombre')"); pg.wait_for_timeout(1500)
    check(state(pg)['account']['username'] == 'zorro_nuevo' and board(pg)['name'] == 'zorro_nuevo' and state(pg)['account']['birth'] == '1999-07',
          'con el nombre nuevo se une, y el nombre cambia también en su cuenta')
    pg.reload(); pg.wait_for_timeout(1800)
    check(not pg.evaluate("document.getElementById('dlg').open && /ranking global/.test(document.getElementById('dlgTitle').textContent)"), 'la presentación del ranking no se repite')
    check(not errs, 'sin errores en la cuenta de antes' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ================= D. "¿Es tuyo?": recuperar el nombre con el correo =================
    fake = FakeSupabase()
    mode = ['local']
    ctx = new_context(browser, fake, mode)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(1000)
    register(pg, 'Luna_K'); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(800)
    mode[0] = 'remote'
    pg.reload(); pg.wait_for_timeout(2000)
    pg.select_option('#joinBirthM', '02'); pg.select_option('#joinBirthY', '2001')
    pg.click("#dlg button:has-text('Unirme')"); pg.wait_for_timeout(1500)
    pg.click('#boardClaim'); pg.wait_for_timeout(500)
    pg.fill('#claimMail', 'luna@example.com'); pg.click("#dlg button:has-text('Enviarme el código')"); pg.wait_for_timeout(800)
    pg.fill('#claimCode', '000000'); pg.click("#dlg button:has-text('Recuperar')"); pg.wait_for_timeout(800)
    check('no es correcto' in pg.inner_text('#dlg .form-error'), 'un código equivocado no sirve')
    pg.fill('#claimCode', '123456'); pg.click("#dlg button:has-text('Recuperar')"); pg.wait_for_timeout(2000)
    b = board(pg)
    check(b['uid'] == 'seed1' and b['anon'] is False and b['joined'] and b['name'] == 'Luna_K', 'con el código del correo recupera su nombre y su lugar (95 min)')
    check(state(pg)['account'].get('email') == 'luna@example.com', 'ese correo queda como correo de recuperación')
    check(not errs, 'sin errores al recuperar el nombre' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ================= E. Todo en inglés =================
    SPANISH = re.compile(r"[áéíóúñ¿¡]|\b(de|la|el|los|las|tu|tus|para|con|sin|que|una|hoy|minutos|ranking|semana|temporada|correo|aparecer|unirme|mes|año|naciste|borrar|descargar)\b", re.I)
    fake = FakeSupabase()
    ctx = new_context(browser, fake, ['remote'], locale='en-US')
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    found = {}
    def grab(where):
        for t in pg.evaluate("""() => { const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; if (!el || el.closest('script,style,noscript,[hidden],.scenery')) continue; const v = n.nodeValue.trim(); if (v) out.add(v); }
            for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) for (const a of ['aria-label','title','placeholder']) { const v = el.getAttribute(a); if (v) out.add(v); }
            return [...out]; }"""):
            if SPANISH.search(t) and t not in ('Español',) and t not in found:
                found[t] = where
    pg.goto(URL); pg.wait_for_timeout(1000); grab('register')
    register(pg, 'pingu_en', '2000-05', press='Create account'); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Not now')"); pg.wait_for_timeout(1500); grab('joined-toast')
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500); grab('ranking')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(800); grab('settings')
    pg.click("label:has(#setBoard)"); pg.wait_for_timeout(600); grab('opt-out-dialog')
    pg.click("#dlg button:has-text('Stop appearing')"); pg.wait_for_timeout(800); grab('opt-out')
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1200); grab('ranking-out')
    pg.screenshot(path=OUT + '/ranking-en.png', full_page=True)
    for k, v in found.items():
        print(f'  EN ESPAÑOL ({v}): {k}')
    check(not found, 'todo el ranking global en inglés')
    check(not errs, 'sin errores en inglés' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()
    browser.close()

print(f'\nCapturas: {OUT}')
bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
