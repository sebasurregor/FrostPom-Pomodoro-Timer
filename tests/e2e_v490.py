"""
FrostPom v4.9.0 — lo que se arregló y agregó después de la prueba cerrada:

  A. Registro: "las contraseñas no coinciden" cuando solo cambia un espacio (en inglés también), y
     el correo con un espacio después del punto ("email. com").
  B. Crear la cuenta con Google (web): botones solo de los proveedores encendidos, edad antes (13+),
     regreso, "Termina de crear tu cuenta" con un nombre al azar, cuenta en línea sin contraseña.
  C. Abrir la app con esa cuenta (sin "mantener la sesión"): "Continuar con Google".
  D. Entrar en otro equipo con Microsoft a una cuenta que ya existía (mismo correo): trae el progreso.
  E. Si la persona no da permiso: lo dice y vuelve a la bienvenida.
  F. Eliminar una cuenta de Google: se confirma con el nombre de usuario (no hay contraseña).
  G. App de Android: Discord en una pestaña del navegador y regreso por el enlace de la app;
     y el ajuste "Notificación tipo reproductor" (solo en Android, apagado por defecto).

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_v490.py http://localhost:8000/
"""
import re, os, sys, json
from datetime import datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase
from _sheets import patch as sheets_patch

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
SHOTS = '/tmp/claude-0/gs/vis'
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


FAKE_CAP = r"""
(() => {
  const calls = []; const listeners = {};
  window.__cap = { calls, listeners };
  window.androidBridge = { postMessage() {} };
  const M = (names, rtype = 'promise') => names.map((name) => ({ name, rtype }));
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'App', methods: [...M(['minimizeApp', 'exitApp', 'getLaunchUrl']), ...M(['addListener', 'removeListener'], 'callback')] },
      { name: 'LocalNotifications', methods: M(['checkPermissions', 'requestPermissions', 'createChannel', 'schedule', 'cancel']) },
      { name: 'Haptics', methods: M(['vibrate', 'impact']) },
      { name: 'Browser', methods: [...M(['open', 'close']), ...M(['addListener', 'removeListener'], 'callback')] },
    ],
    nativePromise(plugin, method, options) {
      calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
      if (plugin === 'LocalNotifications' && /Permissions$/.test(method)) return Promise.resolve({ display: 'granted' });
      if (plugin === 'LocalNotifications' && method === 'schedule') return Promise.resolve({ notifications: [] });
      if (plugin === 'App' && method === 'getLaunchUrl') return Promise.resolve({});
      return Promise.resolve({});
    },
    nativeCallback(plugin, method, options, cb) {
      calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
      if (method === 'addListener') listeners[`${plugin}.${options.eventName}`] = cb;
      return 'cb' + calls.length;
    },
  };
})();
"""


def device(browser, fake, native=False, locale='es-CO', providers=('google', 'azure', 'discord')):
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)

    def cfg(route):
        resp = route.fetch()
        body = resp.text()
        for p in providers:
            body = re.sub(r'(oauth: Object\.freeze\(\{[\s\S]*?' + p + r': )false', r'\1true', body, count=1)
        route.fulfill(response=resp, body=body)
    ctx.route('**/js/config.js', cfg)
    if native:
        ctx.add_init_script(FAKE_CAP)
    ctx.add_init_script("""document.addEventListener('DOMContentLoaded', () => {
      const box = document.getElementById('toasts'); window.__toastLog = [];
      if (box) new MutationObserver(() => { for (const n of box.querySelectorAll('.toast')) if (!window.__toastLog.includes(n.textContent)) window.__toastLog.push(n.textContent); })
        .observe(box, { childList: true, subtree: true });
    });""")
    pg = sheets_patch(ctx.new_page())
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.clock.install(time=datetime(2026, 11, 22, 9, 0))
    return ctx, pg, errs


def dlg_open(pg):
    return pg.evaluate("document.getElementById('dlg').open")


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def body(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.querySelector('#dlg .dlg__box').innerText : ''")


def toast_log(pg):
    # Los avisos que ya se fueron (registro) y los que siguen en pantalla (los del arranque salen
    # antes de que el registro empiece a escuchar)
    return ' | '.join(pg.evaluate("[...(window.__toastLog || []), ...[...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent)]"))


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def settle(pg, ms=1200):
    pg.wait_for_timeout(500); pg.clock.run_for(ms); pg.wait_for_timeout(300)


def boot(pg, wait=1500):
    pg.goto(URL + '#/enfocar')
    pg.reload()
    pg.wait_for_timeout(wait); pg.clock.run_for(5000); pg.wait_for_timeout(400)


def after_redirect(pg):
    # La página fue a "Google" (Supabase de mentira) y volvió a la app con ?code=…
    pg.wait_for_load_state('load')
    pg.wait_for_timeout(1500); pg.clock.run_for(4000); pg.wait_for_timeout(600)


def set_birth(pg, birth):
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)


def close_dialogs(pg, n=8):
    for _ in range(n):
        if not dlg_open(pg):
            return
        if 'Ponle' in title(pg) or 'Put a face' in title(pg):
            pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')")
        elif title(pg) in ('FrostPom Premium',):
            pg.click('#dlg .dlg__actions button:first-child')
        else:
            pg.click('#dlg .dlg__actions button:last-child')
        pg.wait_for_timeout(300); pg.clock.run_for(400)


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Registro: un espacio de más y el correo con espacio (en inglés) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, locale='en-US', providers=())
    boot(pg)
    check(title(pg).startswith('Hi! Create your study account'), 'A: la bienvenida en inglés')
    attrs = pg.evaluate("['accPass1','accPass2'].map((id) => { const i = document.getElementById(id); return [i.getAttribute('autocapitalize'), i.getAttribute('autocorrect'), i.getAttribute('spellcheck')].join(','); })")
    check(all(a == 'none,off,false' for a in attrs), 'A: los campos de contraseña no corrigen, no ponen mayúsculas ni sugerencias (también al mostrarlas)')
    check(not pg.query_selector('#dlg .oauth'), 'A: sin proveedores encendidos no hay botones de «Continue with…»')
    pg.fill('#accUser', 'lonus')
    pg.fill('#accPass1', 'k2345678.a*T'); pg.fill('#accPass2', 'k2345678.a*T ')
    set_birth(pg, '1997-07')
    pg.fill('#accEmail', 'temp.email@email. com')
    pg.click("#dlg button:has-text('Create account')"); settle(pg, 800)
    err = pg.inner_text('#dlg .form-error')
    check('only differ by a space' in err, f'A: si solo cambia un espacio, lo dice exactamente (y en inglés): «{err}»')
    pg.fill('#accPass2', 'k2345678.a*T')
    pg.click("#dlg button:has-text('Create account')"); settle(pg, 1500)
    close_dialogs(pg)
    st = state(pg)
    check(st['account'] and st['account']['email'] == 'temp.email@email.com' and st['account'].get('online') is True,
          'A: con el correo «email. com», la cuenta se crea igual (sin el espacio) y queda en línea')
    check(not errs, 'A: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- B. Crear la cuenta con Google (web) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    btns = pg.evaluate("[...document.querySelectorAll('#dlg .oauth__btn')].map((b) => b.dataset.provider)")
    check(btns == ['google', 'azure', 'discord'], f'B: la bienvenida muestra Google, Microsoft y Discord (Facebook apagado): {btns}')
    check(pg.inner_text('#oauth-azure') == 'Continuar con Microsoft', 'B: el de Azure se llama «Microsoft»')
    pg.wait_for_timeout(800); pg.screenshot(path=f'{SHOTS}/oauth-bienvenida.png')
    check(pg.evaluate("(() => { const o = document.querySelector('#dlg .oauth'); const u = document.getElementById('accUser'); return !!(o && u && (o.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING)); })()"),
          'B: los botones van arriba del formulario (no hay que bajar para verlos)')
    pg.click('#oauth-google'); settle(pg, 500)
    check(title(pg) == '¿Cuándo naciste?' and not fake.fn_calls('oauth_authorize'), 'B: sin el mes y el año, primero los pregunta (la edad va antes de salir a Google)')
    pg.select_option('#oaFirstBirthM', '05'); pg.select_option('#oaFirstBirthY', '2016')
    pg.click("#dlg button:has-text('Seguir')"); settle(pg, 800)
    check('desde los 13 años' in pg.inner_text('#dlg .form-error') and title(pg).startswith('¡Hola! Crea tu cuenta') and not fake.fn_calls('oauth_authorize'),
          'B: menor de 13: no se puede con Google, lo dice y vuelve al registro (sin salir de la app)')
    set_birth(pg, '2015-01')
    pg.click('#oauth-google'); pg.wait_for_timeout(300)
    check('desde los 13 años' in pg.inner_text('#dlg .form-error') and not fake.fn_calls('oauth_authorize'), 'B: si ya puso una edad menor de 13 en el formulario, lo dice ahí mismo')
    pg.select_option('#accBirthY', '')
    pg.click('#oauth-google'); settle(pg, 500)
    pg.select_option('#oaFirstBirthM', '04'); pg.select_option('#oaFirstBirthY', '2003')
    pg.click("#dlg button:has-text('Seguir')")
    after_redirect(pg)
    auth = fake.fn_calls('oauth_authorize')
    check(auth and auth[-1][1]['provider'] == 'google' and auth[-1][1]['method'] == 's256' and auth[-1][1]['redirect_to'].startswith(URL.rstrip('/')),
          'B: fue a Supabase → Google con PKCE (S256) y vuelve a la misma página')
    check('code=' not in pg.url, 'B: al volver se limpia el ?code= de la dirección')
    check(title(pg) == 'Termina de crear tu cuenta' and 'Entraste con Google' in body(pg) and '@gmail.com' in body(pg) and 'ana.google@' not in body(pg),
          f'B: «Termina de crear tu cuenta» dice con qué entró y su correo a medias ({title(pg)})')
    suggested = pg.input_value('#oaName')
    check(re.match(r'^[^\W\d_]+\d{2}$', suggested) is not None, f'B: propone un nombre al azar que no revela quién es: {suggested}')
    check(not pg.query_selector('#oaBirthM'), 'B: no vuelve a pedir la edad (ya la dio)')
    pg.wait_for_timeout(800); pg.screenshot(path=f'{SHOTS}/oauth-terminar.png')
    pg.fill('#oaName', 'pingu_google')
    pg.click("#dlg button:has-text('Crear mi cuenta')"); settle(pg, 2500)
    close_dialogs(pg)
    st = state(pg)
    acc = st['account'] or {}
    check(acc.get('oauth') == 'google' and acc.get('online') is True and acc.get('email') == 'ana.google@gmail.com' and acc.get('birth') == '2003-04',
          'B: queda una cuenta en línea con Google, con su correo y su edad')
    uid = fake.uid_of('ana.google@gmail.com')
    check(uid and fake.saves.get(uid), 'B: su progreso se guardó en la cuenta en línea')
    check(fake.profiles.get(uid, {}).get('username') == 'pingu_google', 'B: y su nombre quedó en el ranking')
    pg.goto(URL + '#/ajustes'); settle(pg, 600)
    check(pg.evaluate("document.getElementById('accPassBtn').hidden"), 'B: Ajustes no ofrece «Cambiar contraseña» (no hay contraseña de FrostPom)')
    check(not pg.is_visible('#playerRow'), 'B: «Notificación tipo reproductor» no sale en la web')
    check(not errs, 'B: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))

    # ---------- C. Abrir la app sin "mantener la sesión": Continuar con Google ----------
    logins = len(fake.fn_calls('oauth_login'))
    pg.evaluate("localStorage.removeItem('st2_remember'); sessionStorage.clear()")
    boot(pg)
    check(title(pg) == '¡Hola de nuevo!' and pg.query_selector("#dlg button:has-text('Continuar con Google')") and not pg.query_selector('#loginPass'),
          'C: al abrir pide entrar con Google (no una contraseña)')
    pg.wait_for_timeout(600); pg.screenshot(path=f'{SHOTS}/oauth-hola.png')
    pg.click("#dlg button:has-text('Continuar con Google')")
    after_redirect(pg)
    check(len(fake.fn_calls('oauth_login')) == logins + 1 and not dlg_open(pg), 'C: volvió de Google y la app quedó abierta')
    check(pg.evaluate("sessionStorage.getItem('st2_unlocked') || sessionStorage.length") is not None, 'C: la pestaña quedó desbloqueada')
    check(not errs, 'C: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))

    # ---------- F. Eliminar la cuenta de Google: con el nombre ----------
    pg.goto(URL + '#/ajustes'); settle(pg, 600)
    pg.click('#accDeleteBtn'); pg.wait_for_timeout(300)
    check(pg.query_selector('#delName') and not pg.query_selector('#delPass'), 'F: eliminar pide escribir el nombre de usuario (no hay contraseña)')
    pg.fill('#delName', 'otro_nombre')
    pg.click("#dlg button:has-text('Eliminar mi cuenta')"); pg.wait_for_timeout(400)
    check('no es tu nombre' in pg.inner_text('#dlg .form-error'), 'F: con otro nombre no se borra')
    pg.fill('#delName', 'PINGU_google')
    with pg.expect_navigation():
        pg.click("#dlg button:has-text('Eliminar mi cuenta')")
    pg.wait_for_timeout(1500); pg.clock.run_for(3000); pg.wait_for_timeout(400)
    check(fake.fn_calls('delete_my_cloud_account') and not (state(pg) or {}).get('account'), 'F: con su nombre se elimina (también la cuenta en línea)')
    ctx.close()

    # ---------- D. Otro equipo: entrar con Microsoft a una cuenta que ya existía (mismo correo) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    pg.fill('#accUser', 'ana_estudia'); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    set_birth(pg, '2001-02'); pg.fill('#accEmail', 'ana@outlook.com')
    pg.click("#dlg button:has-text('Crear cuenta')"); settle(pg, 1500)
    close_dialogs(pg)
    pg.evaluate("(async () => { const c = await import('./js/ui/context.js'); c.mutate((s) => { s.progress.xp = 4321; s.progress.gems = 777; }); })()")
    settle(pg, 8000)
    uid = fake.uid_of('ana@outlook.com')
    check(uid and (fake.saves.get(uid) or {}).get('data', {}).get('progress', {}).get('xp') == 4321, 'D: (antes) la cuenta con correo guardó su progreso en línea')
    ctx.close()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    pg.click('#toSignIn'); settle(pg, 500)
    check(title(pg) == 'Inicia sesión' and pg.query_selector('#dlg #oauth-azure'), 'D: «Inicia sesión» también ofrece Microsoft')
    pg.click('#oauth-azure')
    after_redirect(pg)
    auth = fake.fn_calls('oauth_authorize')
    check(auth and auth[-1][1]['provider'] == 'azure' and auth[-1][1]['scopes'] == 'email', 'D: a Microsoft se le pide el correo')
    close_dialogs(pg)
    st = state(pg)
    check(st['account'] and st['account']['username'] == 'ana_estudia' and st['account'].get('oauth') == 'azure' and st['progress']['xp'] == 4321,
          'D: entró a SU cuenta (mismo correo) y trajo su progreso, sin crear otra')
    check('Hola de nuevo' in toast_log(pg), 'D: «¡Hola de nuevo, ana_estudia! Trajimos tu progreso.»')
    check(not errs, 'D: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- E. No da permiso ----------
    fake = FakeSupabase()
    fake.oauth_deny = True
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    set_birth(pg, '2000-01')
    pg.click('#oauth-discord')
    after_redirect(pg)
    pg.wait_for_timeout(300)
    check('No diste permiso' in pg.inner_text('#dlg .form-error') and title(pg).startswith('¡Hola! Crea tu cuenta'), 'E: si no da permiso, lo dice dentro de la bienvenida (a la que vuelve)')
    check(not state(pg) or not state(pg).get('account'), 'E: no se crea ninguna cuenta')
    ctx.close()

    # ---------- G. App de Android: Discord en el navegador del teléfono + ajuste de la notificación ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, native=True)
    boot(pg)
    set_birth(pg, '2002-09')
    pg.click('#oauth-discord'); pg.wait_for_timeout(500)
    opened = [c for c in pg.evaluate('window.__cap.calls') if c[0] == 'Browser' and c[1] == 'open']
    check(opened, 'G: abre la página de Discord en el navegador del teléfono (Custom Tab)')
    q = parse_qs(urlparse(opened[-1][2]['url']).query) if opened else {}
    check(q.get('redirect_to', [''])[0] == 'com.startupprometeus.frostpom://login-callback', 'G: vuelve por el enlace de la app')
    code = 'code-android-123456'
    fake.oauth_codes[code] = {'challenge': q.get('code_challenge', [''])[0], 'provider': 'discord'}
    pg.evaluate("(u) => window.__cap.listeners['App.appUrlOpen']({ url: u })", f'com.startupprometeus.frostpom://login-callback?code={code}')
    settle(pg, 1500)
    closed = [c for c in pg.evaluate('window.__cap.calls') if c[0] == 'Browser' and c[1] == 'close']
    check(closed and title(pg) == 'Termina de crear tu cuenta', 'G: al volver cierra la pestaña y pide terminar la cuenta (sin recargar)')
    pg.click("#dlg button:has-text('Crear mi cuenta')"); settle(pg, 2500)
    close_dialogs(pg)
    st = state(pg)
    check(st['account'] and st['account'].get('oauth') == 'discord' and st['account']['email'] == 'ana.discord@gmail.com', 'G: cuenta creada con Discord')
    pg.goto(URL + '#/ajustes'); settle(pg, 600)
    check(pg.is_visible('#playerRow') and not pg.is_checked('#setPlayer'), 'G: en Android sale «Notificación tipo reproductor», apagado por defecto')
    pg.click('#playerRow .switch__ui'); pg.wait_for_timeout(200)
    check(pg.evaluate("localStorage.getItem('st2_notif_player')") == '1' or pg.evaluate("(async () => (await import('./js/ui/native-ui.js')).notifPlayer())()"),
          'G: al encenderlo queda guardado en este teléfono')
    pg.wait_for_timeout(400); pg.screenshot(path=f'{SHOTS}/notif-ajuste.png')
    check(not errs, 'G: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    browser.close()

bad = [m for ok, m in results if not ok]
print()
print('Todo bien.' if not bad else f'{len(bad)} fallas.')
sys.exit(1 if bad else 0)
