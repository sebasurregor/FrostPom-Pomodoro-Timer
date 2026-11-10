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
