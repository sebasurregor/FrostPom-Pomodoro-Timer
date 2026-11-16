"""
FrostPom — cuentas en línea (v4.0) con un Supabase SIMULADO (tests/_fake_supabase.py).

Recorre: registrarse con correo (13+), menores de 13 sin cuenta en línea, iniciar sesión en
otro equipo (con la flecha para volver), traer el progreso, que la foto nunca suba, que el
progreso más nuevo llegue al otro equipo, conectar una cuenta de antes (con código si el correo
ya existía), cambiar y recuperar la contraseña, cerrar sesión SIN borrar la cuenta (y volver a
entrar con la foto en el mismo equipo), "Usar otra cuenta", eliminar la cuenta y el inglés.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_cuentas.py http://localhost:8000/
"""
import os, sys, re, json, datetime, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
OUT = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='frostpom-cuentas-')
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
FOTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_foto_cuentas.png')
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


def cfg(ranking='remote', online=True):
    def handler(route):
        resp = route.fetch()
        body = resp.text().replace("mode: 'remote'", f"mode: '{ranking}'").replace("online: true", f"online: {'true' if online else 'false'}")
        route.fulfill(response=resp, body=body)
    return handler


def device(browser, fake, locale='es-CO', ranking='remote', online=True):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)  # (v4.5.1) los avisos de Realtime, simulados
    ctx.route('**/js/config.js', cfg(ranking, online))
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.clock.install(time=datetime.datetime(2026, 11, 11, 16, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-5))))
    return ctx, pg, errs


def tick(pg, ms=600):
    pg.clock.run_for(ms)


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def board(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_board') || 'null')")


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def toasts(pg):
    return pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ')")


def register(pg, user, birth, email='', password='Pingu2026'):
    pg.fill('#accUser', user); pg.fill('#accPass1', password); pg.fill('#accPass2', password)
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    pg.fill('#accEmail', email)
    pg.click("#dlg button:has-text('Crear cuenta'), #dlg button:has-text('Create account')")
    pg.wait_for_timeout(1200); tick(pg)


def skip_photo(pg):
    if 'Ponle' in title(pg) or 'Put a face' in title(pg):
        pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')"); pg.wait_for_timeout(800); tick(pg, 1200)


def dismiss(pg):
    for _ in range(6):
        if not pg.evaluate("document.getElementById('dlg').open"):
            return
        btn = pg.query_selector('#dlg .dlg__actions button:last-child') or pg.query_selector('#dlg button')
        btn.click(); pg.wait_for_timeout(300); tick(pg, 700)


def pomodoro(pg):
    pg.goto(URL + '#/enfocar'); tick(pg, 500)
    if pg.get_attribute('#ring', 'data-mode') != 'study':
        pg.click('#skipBtn'); tick(pg, 300)
    if pg.get_attribute('#ring', 'data-status') != 'running':
        pg.click('#mainBtn'); tick(pg, 800)
    pg.clock.fast_forward('25:00'); tick(pg, 2500)
    dismiss(pg)
    if pg.get_attribute('#ring', 'data-status') == 'running':
        pg.click('#mainBtn')  # pausa el descanso
    tick(pg, 9000)  # el progreso se sube unos segundos después


# Foto de prueba (PNG pequeño) para comprobar que nunca sube
from PIL import Image
Image.new('RGB', (300, 300), (40, 120, 200)).save(FOTO)

with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
    fake = FakeSupabase()

    # ================= A. Registro con correo (13+) en el equipo 1 =================
    ctx1, pg1, errs1 = device(browser, fake)
    pg1.goto(URL); pg1.wait_for_timeout(900); tick(pg1)
    check(pg1.is_visible('#toSignIn'), 'la pantalla de crear cuenta tiene "¿Ya tienes cuenta? Inicia sesión"')
    register(pg1, 'pingu_nube', '2000-05', '')
    check('Escribe tu correo' in pg1.inner_text('#dlg .form-error'), 'mayor de 13: sin correo no deja crear la cuenta (el correo es para entrar desde otro equipo)')
    register(pg1, 'pingu_nube', '2000-05', 'Luna@Example.com')
    check('ya tiene una cuenta' in pg1.inner_text('#dlg .form-error'), 'un correo que ya tiene cuenta se avisa ("Toca Inicia sesión")')
    register(pg1, 'pingu_nube', '2000-05', 'pingu@example.com')
    uid = fake.uid_of('pingu@example.com')
    check(uid and fake.users[uid]['password'] == 'Pingu2026', 'se crea la cuenta en línea con el correo y la contraseña de FrostPom')
    # Foto de perfil: se queda en el equipo
    if pg1.is_visible('#onbPhotoBtn'):
        with pg1.expect_file_chooser() as fc:
            pg1.click('#onbPhotoBtn')
        fc.value.set_files(FOTO); pg1.wait_for_timeout(800); tick(pg1, 300)
        pg1.click("#dlg button:has-text('Guardar foto')"); pg1.wait_for_timeout(800); tick(pg1, 300)
    skip_photo(pg1)
    tick(pg1, 9500)
    st = state(pg1)
    check(st['account'].get('online') is True and st['account']['email'] == 'pingu@example.com', 'la cuenta queda marcada como cuenta en línea')
    check(st['profile']['photo'].startswith('data:image'), 'la foto quedó en este equipo')
    sv = fake.saves.get(uid)
    check(sv and sv['data']['profile']['nick'] == 'pingu_nube', 'el progreso se guardó en la cuenta')
    sent = [c for c in fake.calls if c[0] == 'save_progress']
    check(sent and all('account' not in c[1]['p_data'] and not (c[1]['p_data'].get('profile') or {}).get('photo') for c in sent), 'lo que se sube NUNCA lleva la foto ni la huella de la contraseña')
    check(board(pg1) and board(pg1)['uid'] == uid and not board(pg1)['anon'], 'el ranking usa la misma cuenta (sin cuenta anónima)')
    check(not fake.fn_calls('anon_signup'), 'con cuenta en línea no se crea una cuenta anónima')
    pomodoro(pg1)
    xp1 = state(pg1)['progress']['xp']
    check(xp1 > 0 and fake.saves[uid]['data']['progress']['xp'] == xp1, 'después de un pomodoro, el progreso se sube solo')
    pg1.goto(URL + '#/ajustes'); tick(pg1, 800)
    check('Cuenta en línea' in pg1.inner_text('#accCloudText') and not pg1.is_visible('#accCloudBtn') and pg1.is_visible('#accLogoutBtn'),
          'Ajustes muestra la cuenta en línea; para salir está "Cerrar sesión" (sin botón aparte)')
    check(not pg1.is_visible('#accMailRow'), 'en una cuenta en línea no se cambia el correo de recuperación (es el de entrar)')

    # ================= B. Iniciar sesión en el equipo 2 =================
    ctx2, pg2, errs2 = device(browser, fake)
    pg2.goto(URL); pg2.wait_for_timeout(900); tick(pg2)
    pg2.click('#toSignIn'); pg2.wait_for_timeout(400); tick(pg2)
    check(title(pg2) == 'Inicia sesión' and pg2.is_visible('#dlgBack'), 'la pantalla "Inicia sesión" tiene la flecha para volver')
    pg2.click('#dlgBack'); pg2.wait_for_timeout(400); tick(pg2)
    check(pg2.is_visible('#accUser') and 'Crea tu cuenta' in title(pg2), 'la flecha vuelve a "Crea tu cuenta"')
    pg2.click('#toSignIn'); pg2.wait_for_timeout(400); tick(pg2)
    pg2.fill('#signMail', 'pingu@example.com'); pg2.fill('#signPass', 'Equivocada1')
    pg2.click("#dlg button:has-text('Entrar')"); pg2.wait_for_timeout(800); tick(pg2)
    check('no coinciden' in pg2.inner_text('#dlg .form-error'), 'con la contraseña equivocada no entra')
    pg2.fill('#signPass', 'Pingu2026'); pg2.click("#dlg button:has-text('Entrar')"); pg2.wait_for_timeout(1500); tick(pg2, 1500)
    st2 = state(pg2)
    check(st2 and st2['profile']['nick'] == 'pingu_nube' and st2['progress']['xp'] == xp1, 'en el otro equipo llega el mismo progreso (nombre y XP)')
    check(st2['account'].get('online') is True and len(st2['account']['hash']) == 64, 'la cuenta queda lista en este equipo (también funciona sin internet)')
    check(st2['profile']['photo'] == '', 'la foto NO viaja al otro equipo')
    check('Trajimos tu progreso' in toasts(pg2), 'avisa "¡Hola de nuevo! Trajimos tu progreso"')
    check(not title(pg2) or 'ranking' not in title(pg2).lower(), 'no vuelve a preguntar la fecha de nacimiento para el ranking')
    pomodoro(pg2)
    xp2 = state(pg2)['progress']['xp']
    check(xp2 > xp1 and fake.saves[uid]['data']['progress']['xp'] == xp2, 'el equipo 2 sube su progreso nuevo')
    # El equipo 1 trae lo nuevo al abrir
    pg1.reload(); pg1.wait_for_timeout(1500); tick(pg1, 2500)
    check(state(pg1)['progress']['xp'] == xp2, 'al abrir el equipo 1, llega el progreso más nuevo del equipo 2')
    check(state(pg1)['profile']['photo'].startswith('data:image'), 'el equipo 1 conserva su foto')

    # Cerrar sesión en el equipo 1: NO borra la cuenta; vuelve a "Inicia sesión" con el correo escrito
    pg1.goto(URL + '#/ajustes'); tick(pg1, 600)
    pg1.click('#accLogoutBtn'); pg1.wait_for_timeout(300); tick(pg1)
    check(title(pg1) == '¿Cerrar sesión?' and 'queda guardado en tu cuenta' in pg1.inner_text('#dlg'), 'al cerrar sesión explica que el progreso queda en la cuenta (no pide eliminarla)')
    pg1.click("#dlg .dlg__actions button:has-text('Cerrar sesión')"); pg1.wait_for_timeout(2000); tick(pg1, 800)
    check(title(pg1) == 'Inicia sesión' and pg1.input_value('#signMail') == 'pingu@example.com' and 'Cerraste sesión' in pg1.inner_text('#dlg'),
          'después de cerrar sesión aparece "Inicia sesión" con el correo ya escrito')
    check(uid in fake.users and fake.saves[uid]['data']['progress']['xp'] == xp2, 'cerrar sesión no borra la cuenta ni su progreso')
    # (v4.3) Cerrar sesión en un equipo NO cierra la de los otros (antes Supabase las cerraba todas
    # y en el otro equipo la app dejaba de guardar y de sumar en el ranking sin decir nada)
    check(('logout', {'scope': 'local'}, uid) in [(c[0], c[1], c[2]) for c in fake.fn_calls('logout')], 'cerrar sesión pide cerrar solo la de este equipo (scope=local)')
    check(board(pg2)['refresh'] in fake.refresh, 'el equipo 2 sigue con su sesión después de que el equipo 1 cerró la suya')
    check(pg1.evaluate("!JSON.parse(localStorage.getItem('st2_state') || '{}').account") and pg1.evaluate("!!localStorage.getItem('st2_photos')"),
          'en el equipo solo queda la foto guardada aparte (nunca se sube)')
    pg1.fill('#signPass', 'Pingu2026'); pg1.click("#dlg button:has-text('Entrar')"); pg1.wait_for_timeout(1500); tick(pg1, 1500)
    st1 = state(pg1)
    check(st1['progress']['xp'] == xp2 and st1['profile']['photo'].startswith('data:image') and not pg1.evaluate("localStorage.getItem('st2_photos')"),
          'al volver a entrar en el mismo equipo regresan el progreso y la foto')
    check(not fake.saves[uid]['data']['profile'].get('photo'), 'la foto sigue sin subirse')

    # Cambiar la contraseña en el equipo 2 (también en línea)
    pg2.goto(URL + '#/ajustes'); tick(pg2, 600)
    pg2.click('#accPassBtn'); pg2.wait_for_timeout(300); tick(pg2)
    inputs = pg2.query_selector_all('#dlg input[type=password]')
    inputs[0].fill('Pingu2026'); inputs[1].fill('NuevaClave77'); inputs[2].fill('NuevaClave77')
    pg2.click("#dlg button:has-text('Guardar')"); pg2.wait_for_timeout(1500); tick(pg2)
    check(fake.users[uid]['password'] == 'NuevaClave77', 'cambiar la contraseña también la cambia en la cuenta en línea')

    # (v4.3) La sesión del equipo 2 se cerró en el servidor: al abrir pide la contraseña (antes solo
    # lo decía Ajustes) y NO inventa una sesión anónima (con ella el ranking decía "nombre ocupado")
    anon_before = len(fake.fn_calls('anon_signup'))
    for t in [t for t, u in fake.refresh.items() if u == uid]:
        fake.refresh.pop(t)
    for t in [t for t, u in fake.tokens.items() if u == uid]:
        fake.tokens.pop(t)
    pg2.reload(); pg2.wait_for_timeout(1500); tick(pg2, 1500)
    if title(pg2) == '¡Hola de nuevo!':
        pg2.fill('#loginPass', 'NuevaClave77'); pg2.click("#dlg button:has-text('Entrar')"); pg2.wait_for_timeout(1500); tick(pg2, 1500)
    check(title(pg2) == 'Vuelve a entrar a tu cuenta', 'si la sesión en línea se cerró, al abrir pide volver a entrar')
    check(len(fake.fn_calls('anon_signup')) == anon_before, 'sin sesión no se crea una cuenta anónima para el ranking')
    pg2.fill('#recPass', 'NuevaClave77'); pg2.click("#dlg button:has-text('Entrar')"); pg2.wait_for_timeout(1500); tick(pg2, 1500)
    check('se vuelve a guardar' in toasts(pg2) and board(pg2)['refresh'] in fake.refresh, 'con la contraseña, la sesión vuelve y el progreso se guarda otra vez')
    check(board(pg2)['joined'] and fake.profiles.get(uid, {}).get('username') == 'pingu_nube', 'y sigue en el ranking con su nombre (sin "nombre ocupado")')
    pg2.goto(URL + '#/ajustes'); tick(pg2, 600)

    # Cerrar sesión en el equipo 2 y, con la flecha, ir a crear otra cuenta
    pg2.click('#accLogoutBtn'); pg2.wait_for_timeout(300); tick(pg2)
    pg2.click("#dlg .dlg__actions button:has-text('Cerrar sesión')"); pg2.wait_for_timeout(2000); tick(pg2, 800)
    pg2.click('#dlgBack'); pg2.wait_for_timeout(400); tick(pg2)
    check(pg2.is_visible('#accUser') and pg2.is_visible('#toSignIn'), 'desde "Inicia sesión", la flecha lleva a crear otra cuenta')
    check(fake.saves.get(uid) and uid in fake.users, 'el progreso sigue guardado en la cuenta')
    check(not errs1 and not errs2, 'sin errores en los dos equipos' + (': ' + ' | '.join(errs1 + errs2) if errs1 or errs2 else ''))
    ctx2.close()

    # ================= C. ¿Olvidaste la contraseña? en la pantalla de iniciar sesión (equipo 3) =================
    ctx3, pg3, errs3 = device(browser, fake)
    pg3.goto(URL); pg3.wait_for_timeout(900); tick(pg3)
    pg3.click('#toSignIn'); pg3.wait_for_timeout(300); tick(pg3)
    pg3.fill('#signMail', 'pingu@example.com'); pg3.click('#signForgot'); pg3.wait_for_timeout(300); tick(pg3)
    pg3.click("#dlg button:has-text('Enviarme el código')"); pg3.wait_for_timeout(800); tick(pg3)
    pg3.fill('#fgCode', '123456'); pg3.fill('#fgPass1', 'Recuperada9'); pg3.fill('#fgPass2', 'Recuperada9')
    pg3.click("#dlg button:has-text('Guardar y entrar')"); pg3.wait_for_timeout(1800); tick(pg3, 1500)
    check(fake.users[uid]['password'] == 'Recuperada9' and state(pg3)['profile']['nick'] == 'pingu_nube', 'con el código del correo pone una contraseña nueva, entra y trae su progreso')
    check(not errs3, 'sin errores al recuperar la contraseña' + (': ' + ' | '.join(errs3) if errs3 else ''))

    # Eliminar la cuenta (en línea): se borra todo en el servidor
    pg3.goto(URL + '#/ajustes'); tick(pg3, 600)
    pg3.click('#accDeleteBtn'); pg3.wait_for_timeout(300); tick(pg3)
    pg3.fill('#delPass', 'Recuperada9'); pg3.click("#dlg button:has-text('Eliminar mi cuenta')"); pg3.wait_for_timeout(2000)
    check(uid not in fake.users and uid not in fake.saves, 'eliminar la cuenta borra la cuenta en línea y su progreso')
    ctx3.close(); ctx1.close()

    # ================= D. Menor de 13: solo en su dispositivo =================
    ctx4, pg4, errs4 = device(browser, fake)
    users_before, calls_before = len(fake.users), len(fake.calls)
    pg4.goto(URL); pg4.wait_for_timeout(900); tick(pg4)
    register(pg4, 'pingu_peque', '2016-02', '')
    skip_photo(pg4)
    st4 = state(pg4)
    check(st4['account'] and st4['account']['username'] == 'pingu_peque' and not st4['account'].get('email'), 'menor de 13: crea su cuenta sin correo')
    tick(pg4, 9500)
    check(not st4['account'].get('online') and len(fake.users) == users_before and not fake.calls[calls_before:],
          'menor de 13: no se crea ninguna cuenta en línea ni se envía nada al servidor')
    pg4.goto(URL + '#/ajustes'); tick(pg4, 600)
    check('menores de 13' in pg4.inner_text('#accCloudText') and not pg4.is_visible('#accCloudBtn'), 'Ajustes explica que las cuentas de menores de 13 viven solo en su dispositivo')
    # Cerrar sesión (cuenta solo de este dispositivo): pide la contraseña; "Usar otra cuenta" avisa antes de borrar
    pg4.click('#accLogoutBtn'); pg4.wait_for_timeout(1500); tick(pg4)
    check(title(pg4) == '¡Hola de nuevo!' and pg4.is_visible("#dlg button:has-text('Usar otra cuenta')") and not pg4.query_selector("#dlg button:has-text('Empezar de nuevo')"),
          'al cerrar sesión, la pantalla de entrar ofrece "Usar otra cuenta" (ya no "Empezar de nuevo")')
    pg4.click("#dlg button:has-text('Usar otra cuenta')"); pg4.wait_for_timeout(300); tick(pg4)
    check('solo en este dispositivo' in title(pg4) and 'menores de 13' in pg4.inner_text('#dlg'), '"Usar otra cuenta" explica que esta cuenta solo vive en este dispositivo')
    pg4.click("#dlg button:has-text('Volver')"); pg4.wait_for_timeout(300); tick(pg4)
    check(title(pg4) == '¡Hola de nuevo!' and state(pg4)['account']['username'] == 'pingu_peque', 'con "Volver" no se borra nada')
    pg4.fill('#loginPass', 'Pingu2026'); pg4.click("#dlg button:has-text('Entrar')"); pg4.wait_for_timeout(800); tick(pg4)
    check(not title(pg4), 'vuelve a entrar con su contraseña')
    check(not errs4, 'sin errores con menor de 13' + (': ' + ' | '.join(errs4) if errs4 else ''))
    ctx4.close()

    # ================= E. Cuenta de antes: conectarla (el correo ya tenía cuenta con progreso) =================
    old_uid = fake.add_account('legacy@example.com', 'OtraClave55', save={
        'v': 3, 'createdAt': '2026-01-01T00:00:00.000Z',
        'profile': {'nick': 'zorro_viejo', 'avatar': '🦊', 'onboarded': True, 'country': 'CO', 'photo': ''},
        'progress': {'xp': 777, 'gems': 40, 'totals': {'studySec': 36000}},
        'settings': {}, 'premium': {}, 'daily': {}, 'sessions': [], 'seasons': [], 'pets': {},
    })
    ctx5, pg5, errs5 = device(browser, fake, ranking='local', online=False)
    pg5.goto(URL); pg5.wait_for_timeout(900); tick(pg5)
    pg5.fill('#accUser', 'zorro_local'); pg5.fill('#accPass1', 'Zorro2026'); pg5.fill('#accPass2', 'Zorro2026')
    pg5.click("#dlg button:has-text('Crear cuenta')"); pg5.wait_for_timeout(1200); tick(pg5)
    skip_photo(pg5)
    ctx5.unroute('**/js/config.js'); ctx5.route('**/js/config.js', cfg('local', True))
    pg5.reload(); pg5.wait_for_timeout(1500); tick(pg5, 1500)
    pg5.goto(URL + '#/ajustes'); tick(pg5, 600)
    check(pg5.inner_text('#accCloudBtn') == 'Conectar', 'quien ya tenía cuenta ve "Conecta tu cuenta" en Ajustes')
    pg5.click('#accCloudBtn'); pg5.wait_for_timeout(300); tick(pg5)
    pg5.select_option('#conBirthM', '03'); pg5.select_option('#conBirthY', '1998')
    pg5.fill('#conMail', 'legacy@example.com'); pg5.fill('#conPass', 'Zorro2026')
    pg5.click("#dlg button:has-text('Conectar')"); pg5.wait_for_timeout(1500); tick(pg5)
    check('Confirma que el correo es tuyo' in title(pg5), 'si el correo ya tenía cuenta con otra contraseña, pide el código del correo')
    pg5.fill('#conCode', '123456'); pg5.click("#dlg button:has-text('Confirmar')"); pg5.wait_for_timeout(1500); tick(pg5)
    check('ya tiene progreso' in title(pg5), 'si la cuenta ya tenía progreso, pregunta con cuál seguir')
    pg5.click("#dlg button:has-text('El de mi cuenta')"); pg5.wait_for_timeout(1500); tick(pg5, 1500)
    st5 = state(pg5)
    check(st5['account'].get('online') is True and st5['progress']['xp'] == 777 and st5['profile']['nick'] == 'zorro_viejo',
          'eligió el progreso de su cuenta: llega con su nombre y su XP')
    check(fake.users[old_uid]['password'] == 'Zorro2026', 'desde ahora entra con su contraseña de FrostPom')
    # Al abrir otra vez (sin "mantener sesión"): "Usar otra cuenta" cierra la sesión sin borrar la cuenta
    tick(pg5, 9000)
    pg5.evaluate("localStorage.removeItem('st2_remember'); sessionStorage.clear()")
    pg5.reload(); pg5.wait_for_timeout(1500); tick(pg5, 800)
    check(title(pg5) == '¡Hola de nuevo!', 'sin "mantener sesión" pide la contraseña al abrir')
    pg5.click("#dlg button:has-text('Usar otra cuenta')"); pg5.wait_for_timeout(300); tick(pg5)
    check(title(pg5) == '¿Usar otra cuenta?' and 'queda guardado en tu cuenta' in pg5.inner_text('#dlg'), 'con cuenta en línea, "Usar otra cuenta" solo cierra la sesión')
    pg5.click("#dlg .dlg__actions button:has-text('Usar otra cuenta')"); pg5.wait_for_timeout(2000); tick(pg5, 800)
    check(title(pg5) == 'Inicia sesión' and old_uid in fake.users and fake.saves[old_uid]['data']['progress']['xp'] == 777,
          'vuelve a "Inicia sesión" y la cuenta sigue con su progreso')
    check(not errs5, 'sin errores al conectar una cuenta de antes' + (': ' + ' | '.join(errs5) if errs5 else ''))
    ctx5.close()

    # ================= F. Sin internet al registrarse: queda pendiente y se termina después =================
    ctx6, pg6, errs6 = device(browser, fake, ranking='local')
    fake.abort.add('signup')
    pg6.goto(URL); pg6.wait_for_timeout(900); tick(pg6)
    register(pg6, 'pingu_sinred', '2001-08', 'sinred@example.com')
    skip_photo(pg6)
    check(state(pg6)['account'].get('cloudPending') is True and not fake.uid_of('sinred@example.com'), 'sin internet: la cuenta se crea en el equipo y la cuenta en línea queda pendiente')
    fake.abort.discard('signup')
    pg6.goto(URL + '#/ajustes'); tick(pg6, 600)
    check('pendiente' in pg6.inner_text('#accCloudText'), 'Ajustes avisa que la cuenta en línea quedó pendiente')
    pg6.click('#accCloudBtn'); pg6.wait_for_timeout(300); tick(pg6)
    pg6.fill('#conPass', 'Pingu2026'); pg6.click("#dlg button:has-text('Conectar')"); pg6.wait_for_timeout(1800); tick(pg6, 1500)
    u6 = fake.uid_of('sinred@example.com')
    check(u6 and state(pg6)['account'].get('online') is True and fake.saves.get(u6), 'con internet se termina: cuenta en línea creada y progreso guardado')
    check(not errs6, 'sin errores con la cuenta pendiente' + (': ' + ' | '.join(errs6) if errs6 else ''))
    ctx6.close()

    # ================= H. (v4.5.1) Lo que pasó con usuarios reales en la prueba cerrada =================
    # H1. Una cuenta del computador que nunca se conectó (con correo de recuperación de una versión
    #     vieja: en Supabase la cuenta existe con una contraseña al azar y sin progreso).
    ctx8, pg8, errs8 = device(browser, fake, online=False)
    pg8.goto(URL); pg8.wait_for_timeout(900); tick(pg8)
    register(pg8, 'compu_vieja', '2004-02', 'vieja@example.com', password='Polar2026')
    skip_photo(pg8); tick(pg8, 2500)
    u8 = fake.uid_of('vieja@example.com')
    check(u8 and fake.users[u8]['password'] not in (None, 'Polar2026') and u8 not in fake.saves,
          'preparación: el correo de recuperación existe en Supabase con una contraseña al azar y sin progreso')
    if not fake.profiles.get(u8):
        dismiss(pg8)
    pomodoro(pg8)
    mins8 = fake.minutes.get(u8, 0)
    check(fake.profiles.get(u8, {}).get('username') == 'compu_vieja' and mins8 > 0, 'preparación: en el ranking suma con su nombre (en la cuenta del correo)')
    anon_before = len(fake.fn_calls('anon_signup'))

    # En el celular: "El correo o la contraseña no coinciden" ahora explica qué hacer
    ctx9, pg9, errs9 = device(browser, fake)
    pg9.goto(URL); pg9.wait_for_timeout(900); tick(pg9)
    pg9.click('#toSignIn'); pg9.wait_for_timeout(400); tick(pg9)
    pg9.fill('#signMail', 'vieja@example.com'); pg9.fill('#signPass', 'Polar2026')
    pg9.click("#dlg button:has-text('Entrar')"); pg9.wait_for_timeout(900); tick(pg9)
    check('no coinciden' in pg9.inner_text('#dlg .form-error') and pg9.is_visible('#signHint') and 'Conectar' in pg9.inner_text('#signHint'),
          'si no coinciden, explica que la cuenta puede vivir solo en el computador y que allá toque «Conectar»')
    # Tocar "Entrar" muchas veces seguidas: un solo intento (antes se lanzaban varios a la vez)
    logins = len(fake.fn_calls('password_login')) + sum(1 for c in fake.captcha_tokens if c[0] == '/auth/v1/token')
    pg9.fill('#signPass', 'Polar2026')
    pg9.evaluate("() => { const b = document.querySelector('#dlg [data-primary]'); for (let i = 0; i < 6; i++) b.click(); }")
    pg9.wait_for_timeout(900); tick(pg9)
    tries = sum(1 for c in fake.captcha_tokens if c[0] == '/auth/v1/token') + len(fake.fn_calls('password_login')) - logins
    check(tries == 1, f'tocar «Entrar» 6 veces seguidas hace UN solo intento ({tries})')
    # "¿Olvidaste la contraseña?": como no hay progreso en línea, NO cambia la contraseña sin preguntar
    pw_before = fake.users[u8]['password']
    pg9.click('#signForgot'); pg9.wait_for_timeout(300); tick(pg9)
    pg9.click("#dlg button:has-text('Enviarme el código')"); pg9.wait_for_timeout(800); tick(pg9)
    check('Si no llega' in pg9.inner_text('#dlg'), 'al pedir el código avisa que, si no llega, puede que el correo no tenga cuenta en línea')
    pg9.fill('#fgCode', '123456'); pg9.fill('#fgPass1', 'Celular2026'); pg9.fill('#fgPass2', 'Celular2026')
    pg9.click("#dlg button:has-text('Guardar y entrar')"); pg9.wait_for_timeout(1500); tick(pg9, 1000)
    check(title(pg9) == 'Tu progreso todavía no está en línea' and 'compu_vieja' in pg9.inner_text('#dlg'),
          'en vez de "Elige tu nombre de usuario", dice que su progreso sigue en el otro equipo (y su nombre del ranking)')
    pg9.click("#dlg button:has-text('Lo conecto en mi otro equipo')"); pg9.wait_for_timeout(1200); tick(pg9)
    check(fake.users[u8]['password'] == pw_before and title(pg9) == 'Inicia sesión' and 'Primero conecta' in pg9.inner_text('#dlg'),
          '«Lo conecto en mi otro equipo»: NO cambia la contraseña (el computador sigue igual) y vuelve a «Inicia sesión»')
    check(not pg9.evaluate("JSON.parse(localStorage.getItem('st2_state') || '{}').account"), 'y el celular no crea una cuenta vacía')

    # En el computador (ya con la versión nueva): Conectar → código → queda en línea con su progreso
    ctx8.unroute('**/js/config.js'); ctx8.route('**/js/config.js', cfg('remote', True))
    pg8.reload(); pg8.wait_for_timeout(1500); tick(pg8, 1500)
    if title(pg8) == '¡Hola de nuevo!':
        pg8.fill('#loginPass', 'Polar2026'); pg8.click("#dlg button:has-text('Entrar')"); pg8.wait_for_timeout(1200); tick(pg8, 1200)
    dismiss(pg8)
    pg8.goto(URL + '#/ajustes'); tick(pg8, 600)
    pg8.click('#accCloudBtn'); pg8.wait_for_timeout(300); tick(pg8)
    pg8.fill('#conPass', 'Polar2026'); pg8.click("#dlg button:has-text('Conectar')"); pg8.wait_for_timeout(1500); tick(pg8, 1000)
    check('Confirma que el correo es tuyo' in title(pg8), 'Conectar: el correo ya existía con otra contraseña → pide el código')
    pg8.fill('#conCode', '123456'); pg8.click("#dlg button:has-text('Confirmar')"); pg8.wait_for_timeout(2000); tick(pg8, 9500)
    st8 = state(pg8)
    check(st8['account'].get('online') is True and fake.users[u8]['password'] == 'Polar2026' and fake.saves.get(u8),
          'queda en línea: la contraseña en línea es la de FrostPom y su progreso se guarda')
    check(fake.profiles[u8]['username'] == 'compu_vieja' and fake.minutes.get(u8, 0) == mins8 and len(fake.fn_calls('anon_signup')) == anon_before,
          'y en el ranking sigue siendo él, con sus minutos (sin perfil nuevo)')
    # Ahora sí, en el celular entra y llega TODO su progreso
    pg9.fill('#signPass', 'Polar2026'); pg9.click("#dlg button:has-text('Entrar')"); pg9.wait_for_timeout(1800); tick(pg9, 1500)
    st9 = state(pg9)
    check(st9 and st9['profile']['nick'] == 'compu_vieja' and st9['progress']['xp'] == st8['progress']['xp'] and st9['progress']['xp'] > 0,
          'en el celular entra con su contraseña y llega su progreso (nombre y XP)')
    check(not errs8 and not errs9, 'sin errores (H1)' + (': ' + ' | '.join(errs8 + errs9) if errs8 or errs9 else ''))
    ctx9.close()

    # H2. Cambiaste o recuperaste la contraseña en otro equipo y este equipo tenía una cuenta SOLO
    #     local con tu lugar del ranking en la cuenta del correo: antes se creaba una cuenta anónima,
    #     aparecías como otra persona, tu nombre "ya existía" y tus horas no sumaban.
    ctx10, pg10, errs10 = device(browser, fake, online=False)
    pg10.goto(URL); pg10.wait_for_timeout(900); tick(pg10)
    register(pg10, 'compu_dos', '2003-06', 'dos@example.com', password='Polar2026')
    skip_photo(pg10); tick(pg10, 2500); dismiss(pg10)
    u10 = fake.uid_of('dos@example.com')
    check(fake.profiles.get(u10, {}).get('username') == 'compu_dos', 'preparación: está en el ranking con la cuenta del correo')
    # En otro equipo recupera la contraseña (Supabase cierra las demás sesiones)
    for t in [t for t, u in fake.refresh.items() if u == u10]:
        fake.refresh.pop(t)
    anon_before = len(fake.fn_calls('anon_signup'))
    pg10.reload(); pg10.wait_for_timeout(1500); tick(pg10, 1500)
    if title(pg10) == '¡Hola de nuevo!':
        pg10.fill('#loginPass', 'Polar2026'); pg10.click("#dlg button:has-text('Entrar')"); pg10.wait_for_timeout(1200); tick(pg10, 1200)
    check(title(pg10) == 'Vuelve a conectar tu lugar en el ranking' and 'compu_dos' in pg10.inner_text('#dlg'),
          'al abrir explica que su lugar del ranking necesita volver a conectarse (no «ese nombre ya existe»)')
    pg10.click("#dlg button:has-text('Ahora no')"); pg10.wait_for_timeout(400); tick(pg10)
    pomodoro(pg10)
    check(len(fake.fn_calls('anon_signup')) == anon_before and fake.profiles[u10]['username'] == 'compu_dos' and board(pg10).get('relink') is True,
          'NO crea una cuenta anónima nueva ni cambia su nombre: queda pendiente volver a conectar')
    pg10.goto(URL + '#/ranking'); tick(pg10, 1500)
    check(pg10.is_visible('#boardRelink'), 'la vista Ranking dice la causa real y tiene «Volver a conectar»')
    # Con un código del correo (cuenta local de 13+ sin cuentas en línea en esta versión): vuelve a sumar
    pg10.click('#boardRelink'); pg10.wait_for_timeout(400); tick(pg10)
    pg10.click("#dlg button:has-text('Recibir un código')"); pg10.wait_for_timeout(400); tick(pg10)
    pg10.click("#dlg button:has-text('Enviarme el código')"); pg10.wait_for_timeout(800); tick(pg10)
    pg10.fill('#claimCode', '123456'); pg10.click("#dlg button:has-text('Recuperar')"); pg10.wait_for_timeout(1500); tick(pg10, 1500)
    b10 = board(pg10)
    check(not b10.get('relink') and b10.get('uid') == u10 and b10.get('joined') and fake.profiles[u10]['username'] == 'compu_dos',
          'con el código vuelve a la cuenta del correo: mismo lugar, mismo nombre')
    m_before = fake.minutes.get(u10, 0)
    pomodoro(pg10)
    check(fake.minutes.get(u10, 0) > m_before, 'y sus pomodoros vuelven a sumar en SU lugar del ranking')
    check(not errs10, 'sin errores (H2)' + (': ' + ' | '.join(errs10) if errs10 else ''))
    ctx10.close()

    # H3. Cuenta EN LÍNEA cuyo equipo guardaba en OTRA cuenta (conectó con un correo distinto al de
    #     recuperación): el progreso iba a la otra cuenta y en el celular aparecía vacío.
    ctx11, pg11, errs11 = device(browser, fake)
    pg11.goto(URL); pg11.wait_for_timeout(900); tick(pg11)
    register(pg11, 'mezcla_b', '2002-01', 'b@example.com', password='Polar2026')
    skip_photo(pg11); tick(pg11, 9500); dismiss(pg11)
    ub = fake.uid_of('b@example.com')
    ua = fake.add_account('a@example.com', 'OtraCosa99')
    fake.profiles[ua] = {'username': 'mezcla_a', 'country': 'CO', 'avatar': '🐧', 'show': True, 'xp': 50}
    fake.minutes[ua] = 40
    sa = fake.session(ua)
    pg11.evaluate("(s) => { const b = JSON.parse(localStorage.getItem('st2_board')); Object.assign(b, { uid: s.user.id, refresh: s.refresh_token, anon: false, joined: true, name: 'mezcla_a' }); delete b.email; localStorage.setItem('st2_board', JSON.stringify(b)); }", sa)
    pushes_a = len([c for c in fake.fn_calls('save_progress') if c[2] == ua])
    pg11.reload(); pg11.wait_for_timeout(1500); tick(pg11, 1500)
    if title(pg11) == '¡Hola de nuevo!':
        pg11.fill('#loginPass', 'Polar2026'); pg11.click("#dlg button:has-text('Entrar')"); pg11.wait_for_timeout(1200); tick(pg11, 1200)
    check(title(pg11) == 'Vuelve a entrar a tu cuenta' and 'otra cuenta' in pg11.inner_text('#dlg'),
          'al abrir detecta (por el token de la sesión) que guardaba en OTRA cuenta y pide entrar con la suya')
    check(len([c for c in fake.fn_calls('save_progress') if c[2] == ua]) == pushes_a, 'mientras tanto no sube nada a la otra cuenta')
    pg11.fill('#recPass', 'Polar2026'); pg11.click("#dlg button:has-text('Entrar')"); pg11.wait_for_timeout(1500); tick(pg11, 1000)
    if 'ya tiene progreso' in title(pg11):
        pg11.click("#dlg button:has-text('El de este equipo')"); pg11.wait_for_timeout(1200); tick(pg11, 1500)
    tick(pg11, 9000)
    b11 = board(pg11)
    check(b11.get('uid') == ub and b11.get('email') == 'b@example.com' and fake.saves.get(ub),
          'arreglado: la sesión y el progreso vuelven a ser de su cuenta')
    check(fake.profiles.get(ub, {}).get('username') == 'mezcla_b' and ua not in fake.profiles or fake.profiles.get(ub, {}).get('username') == 'mezcla_b',
          'y en el ranking aparece con su nombre')
    check(not errs11, 'sin errores (H3)' + (': ' + ' | '.join(errs11) if errs11 else ''))
    ctx11.close()

    # H4. Nombres que las normas nuevas no permiten
    ctx12, pg12, errs12 = device(browser, fake)
    pg12.goto(URL); pg12.wait_for_timeout(900); tick(pg12)
    pg12.fill('#accUser', 'Jeffery_Epstein'); tick(pg12, 200)
    check('no está permitido' in pg12.inner_text('#dlg'), 'al crear la cuenta, «Jeffery_Epstein» no se permite')
    pg12.fill('#accUser', 'PoossyDestroyer'); tick(pg12, 200)
    check('no está permitido' in pg12.inner_text('#dlg'), 'ni «PoossyDestroyer»')
    register(pg12, 'nombre_bueno', '2001-03', 'bueno@example.com', password='Polar2026')
    skip_photo(pg12); tick(pg12, 9500); dismiss(pg12)
    # Una cuenta de antes con un nombre que ahora no se permite: NO se pierde; se pide otro nombre
    pg12.evaluate("() => { const s = JSON.parse(localStorage.getItem('st2_state')); s.account.username = 'Jeffery_Epstein'; s.profile.nick = 'Jeffery_Epstein'; localStorage.setItem('st2_state', JSON.stringify(s)); }")
    pg12.reload(); pg12.wait_for_timeout(1500); tick(pg12, 1500)
    if title(pg12) == '¡Hola de nuevo!':
        pg12.fill('#loginPass', 'Polar2026'); pg12.click("#dlg button:has-text('Entrar')"); pg12.wait_for_timeout(1200); tick(pg12, 1200)
    check(title(pg12) == 'Elige un nombre nuevo' and state(pg12)['account'] and state(pg12)['progress']['xp'] >= 0,
          'una cuenta con un nombre que ya no se permite sigue ahí y pide elegir otro')
    pg12.fill('#accUser', 'Pingu_Nuevo'); pg12.click("#dlg button:has-text('Guardar')"); pg12.wait_for_timeout(1200); tick(pg12, 1500)
    ub12 = fake.uid_of('bueno@example.com')
    check(state(pg12)['account']['username'] == 'Pingu_Nuevo' and fake.profiles.get(ub12, {}).get('username') == 'Pingu_Nuevo',
          'con el nombre nuevo sigue igual (también en el ranking)')
    check(not errs12, 'sin errores (H4)' + (': ' + ' | '.join(errs12) if errs12 else ''))
    ctx12.close()

    # ================= G. En inglés =================
    SPANISH = re.compile(r"[áéíóúñ¿¡]|\b(de|la|el|los|las|tu|tus|para|con|sin|que|una|correo|contraseña|cuenta|equipo|inicia|sesión|entrar|salir|conectar|progreso)\b", re.I)
    ctx7, pg7, errs7 = device(browser, fake, locale='en-US')
    found = {}
    def grab(where):
        for t in pg7.evaluate("""() => { const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; if (!el || el.closest('script,style,noscript,[hidden],.scenery')) continue; const v = n.nodeValue.trim(); if (v) out.add(v); }
            for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) for (const a of ['aria-label','title','placeholder']) { const v = el.getAttribute(a); if (v) out.add(v); }
            return [...out]; }"""):
            if SPANISH.search(t) and t not in ('Español',) and t not in found:
                found[t] = where
    pg7.goto(URL); pg7.wait_for_timeout(900); tick(pg7); grab('create')
    pg7.click('#toSignIn'); pg7.wait_for_timeout(300); tick(pg7); grab('signin')
    pg7.fill('#signMail', 'nadie@example.com'); pg7.fill('#signPass', 'Mala12345'); pg7.click("#dlg button:has-text('Log in')"); pg7.wait_for_timeout(800); tick(pg7); grab('signin-error')
    pg7.click('#signForgot'); pg7.wait_for_timeout(300); tick(pg7); grab('forgot')
    pg7.click('#dlgBack'); pg7.wait_for_timeout(300); tick(pg7)
    pg7.click('#dlgBack'); pg7.wait_for_timeout(300); tick(pg7)
    register(pg7, 'pingu_en', '1999-09', 'pingu_en@example.com')
    skip_photo(pg7); tick(pg7, 1500)
    pg7.goto(URL + '#/ajustes'); tick(pg7, 600); grab('settings')
    pg7.click("label:has(#setBoard)"); pg7.wait_for_timeout(400); tick(pg7); grab('opt-out-dialog')
    pg7.click("#dlg .dlg__actions button:first-child"); pg7.wait_for_timeout(400); tick(pg7)
    pg7.click('#accLogoutBtn'); pg7.wait_for_timeout(300); tick(pg7); grab('signout-dialog')
    pg7.click("#dlg .dlg__actions button:last-child"); pg7.wait_for_timeout(2000); tick(pg7, 800); grab('signed-out')
    pg7.screenshot(path=OUT + '/cuentas-en.png')
    for k, v in found.items():
        print(f'  EN ESPAÑOL ({v}): {k}')
    check(not found, 'las cuentas en línea, todo en inglés')
    check(not errs7, 'sin errores en inglés' + (': ' + ' | '.join(errs7) if errs7 else ''))
    ctx7.close()
    browser.close()

try:
    os.remove(FOTO)
except OSError:
    pass
print(f'\nCapturas: {OUT}')
bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
