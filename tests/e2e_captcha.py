"""
FrostPom — CAPTCHA de Cloudflare Turnstile (v4.0.3), con Supabase y Turnstile SIMULADOS.

Comprueba que:
  - con la clave del sitio vacía no se carga nada de Cloudflare (como antes);
  - con la clave puesta, crear la cuenta, entrar, pedir el código y la cuenta anónima del ranking
    llevan un token nuevo cada vez, aunque Supabase exija el CAPTCHA;
  - comprobar el código del correo no pide CAPTCHA;
  - las cuentas de menores de 13 no cargan Cloudflare ni hablan con Supabase;
  - si Cloudflare duda, la casilla aparece DENTRO de la ventana abierta y se puede tocar;
  - si Cloudflare falla, la app lo explica (en español y en inglés) en vez de quedarse pegada;
  - la política de seguridad (CSP + Trusted Types) deja cargar el script de Turnstile.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_captcha.py http://localhost:8000/
"""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


# Turnstile de mentira: entrega un token distinto cada vez (o falla, o pide tocar la casilla)
FAKE_TS = r"""
(() => {
  // Como el de verdad: si falla y no se pidió retry 'never', reintenta solo a los pocos segundos;
  // si para entonces la casilla ya se quitó, lanza "Nothing to reset found for provided container".
  window.__ts = { renders: 0, removed: 0, last: null, gone: [] };
  window.turnstile = {
    render(el, o) {
      const id = 'w' + (++window.__ts.renders);
      window.__ts.last = { inDialog: !!el.closest('#dlg'), appearance: o.appearance, language: o.language, sitekey: o.sitekey, retry: o.retry };
      if (localStorage.getItem('__tsFail')) {
        setTimeout(() => {
          if (o['error-callback']) o['error-callback']('110200');
          if (o.retry !== 'never') setTimeout(() => {
            if (window.__ts.gone.includes(id)) throw new Error('[Cloudflare Turnstile] Nothing to reset found for provided container.');
          }, 200);
        }, 30);
        return id;
      }
      if (localStorage.getItem('__tsInteractive')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'fake-ts'; b.textContent = 'Soy humano';
        b.addEventListener('click', () => o.callback('tok-' + id + '-' + Date.now()));
        el.appendChild(b); return id;
      }
      setTimeout(() => o.callback('tok-' + id + '-' + Math.random().toString(36).slice(2)), 30);
      return id;
    },
    remove(id) { window.__ts.removed++; window.__ts.gone.push(id); }, reset() {}, execute() {},
  };
})();
"""


def device(browser, fake, site_key='0x4AAAAAAAprueba', locale='es-CO'):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    loads = []

    def ts(route):
        loads.append(route.request.url)
        route.fulfill(status=200, content_type='application/javascript', body=FAKE_TS)
    ctx.route('https://challenges.cloudflare.com/**', ts)

    def cfg(route):
        resp = route.fetch()
        route.fulfill(response=resp, body=resp.text().replace("siteKey: ''", f"siteKey: '{site_key}'"))
    ctx.route('**/js/config.js', cfg)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and ('Content Security Policy' in m.text or 'TrustedScriptURL' in m.text or 'Trusted Type' in m.text) else None)
    return ctx, pg, errs, loads


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def register(pg, user, birth, email='', create='Crear cuenta'):
    pg.fill('#accUser', user); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    pg.fill('#accEmail', email)
    pg.click(f"#dlg button:has-text('{create}')")
    pg.wait_for_timeout(1500)


def skip_photo(pg):
    if 'Ponle' in title(pg) or 'Put a face' in title(pg):
        pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')"); pg.wait_for_timeout(800)


def close_dialogs(pg):
    for _ in range(5):
        if not pg.evaluate("document.getElementById('dlg').open"):
            return
        pg.click('#dlg .dlg__actions button:last-child'); pg.wait_for_timeout(400)


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Clave vacía: como antes, nada de Cloudflare ----------
    fake = FakeSupabase()
    ctx, pg, errs, loads = device(browser, fake, site_key='')
    pg.goto(URL); pg.wait_for_timeout(900)
    register(pg, 'sin_captcha', '2000-05', 'sin@example.com')
    skip_photo(pg)
    check(fake.uid_of('sin@example.com'), 'con la clave vacía la cuenta se crea igual que antes')
    check(not loads and all(t is None for _, t in fake.captcha_tokens), 'con la clave vacía no se carga nada de Cloudflare ni se envía token')
    ctx.close()

    # ---------- B. Clave puesta y Supabase exigiendo el CAPTCHA ----------
    fake = FakeSupabase()
    fake.require_captcha = True
    ctx, pg, errs, loads = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    check(not loads, 'al abrir la app todavía no se carga Cloudflare (solo cuando hace falta)')
    register(pg, 'con_captcha', '2000-05', 'captcha@example.com')
    skip_photo(pg)
    uid = fake.uid_of('captcha@example.com')
    check(uid, 'crear la cuenta en línea funciona con el CAPTCHA encendido en Supabase')
    check(len(loads) == 1 and 'turnstile/v0/api.js' in loads[0], 'el script de Turnstile se cargó una sola vez')
    last = pg.evaluate('window.__ts.last')
    check(last and last['appearance'] == 'interaction-only' and last['sitekey'] == '0x4AAAAAAAprueba' and last['language'] == 'es', 'Turnstile casi invisible, con la clave del sitio y en español')
    check(pg.evaluate('window.__ts.renders === window.__ts.removed') and not pg.query_selector('.captcha-box'), 'después de usarse, la casilla se quita')
    close_dialogs(pg)

    # Cerrar sesión y volver a entrar (contraseña): otro token
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    pg.click('#accLogoutBtn'); pg.wait_for_timeout(300)
    pg.click("#dlg .dlg__actions button:has-text('Cerrar sesión')"); pg.wait_for_timeout(2000)
    check(title(pg) == 'Inicia sesión', 'cerrar sesión lleva a "Inicia sesión"')
    pg.fill('#signPass', 'Pingu2026'); pg.click("#dlg button:has-text('Entrar')"); pg.wait_for_timeout(1800)
    st = pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")
    check(st and st['account'] and st['account'].get('online'), 'entrar con correo y contraseña funciona con el CAPTCHA')
    toks = [t for _, t in fake.captcha_tokens if t]
    check(len(toks) >= 2 and len(set(toks)) == len(toks), f'cada llamada lleva un token nuevo ({len(toks)} tokens, todos distintos)')
    close_dialogs(pg)

    # Cuenta anónima del ranking (cuentas de antes que no se han conectado): también lleva token
    n = len(fake.captcha_tokens)
    ok_anon = pg.evaluate("import('./js/cloud.js').then(m => m.anonSignIn()).then(s => !!s.access).catch(e => 'error ' + e.kind)")
    check(ok_anon is True and fake.captcha_tokens[n][1], 'la cuenta anónima del ranking también pasa el CAPTCHA')
    # Renovar la sesión no pide CAPTCHA
    renders = pg.evaluate('window.__ts.renders')
    ok_refresh = pg.evaluate("""import('./js/cloud.js').then(async m => { const s = await m.anonSignIn(); const r = await m.refreshSession(s.refresh); return !!r.access; }).catch(e => 'error ' + e.kind)""")
    check(ok_refresh is True and pg.evaluate('window.__ts.renders') == renders + 1, 'renovar la sesión no pide CAPTCHA (solo la cuenta nueva lo pidió)')

    # ¿Olvidaste la contraseña?: /recover lleva token, /verify no lo necesita
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    pg.click('#accLogoutBtn'); pg.wait_for_timeout(300)
    pg.click("#dlg .dlg__actions button:has-text('Cerrar sesión')"); pg.wait_for_timeout(2000)
    pg.click('#signForgot'); pg.wait_for_timeout(300)
    n = len(fake.captcha_tokens)
    pg.click("#dlg button:has-text('Enviarme el código')"); pg.wait_for_timeout(1200)
    rec = [t for path, t in fake.captcha_tokens[n:] if path == '/auth/v1/recover']
    check(rec and rec[0], 'pedir el código de recuperación lleva token')
    pg.fill('#fgCode', '123456'); pg.fill('#fgPass1', 'Recuperada9'); pg.fill('#fgPass2', 'Recuperada9')
    pg.click("#dlg button:has-text('Guardar y entrar')"); pg.wait_for_timeout(2000)
    check(fake.users[uid]['password'] == 'Recuperada9', 'con el código del correo se cambia la contraseña (comprobar el código no pide CAPTCHA)')
    close_dialogs(pg)
    check(not errs, 'la política de seguridad deja cargar Turnstile (sin errores de CSP ni Trusted Types)' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ---------- C. Menor de 13: nada de Cloudflare ni de Supabase ----------
    fake = FakeSupabase()
    fake.require_captcha = True
    ctx, pg, errs, loads = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    calls = len(fake.calls)
    register(pg, 'peque_captcha', '2016-02')
    skip_photo(pg)
    check(pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).account.username") == 'peque_captcha', 'menor de 13: crea su cuenta')
    check(not loads and not fake.captcha_tokens and len(fake.calls) == calls, 'menor de 13: no se carga Cloudflare ni se habla con Supabase')
    ctx.close()

    # ---------- D. Cloudflare duda: la casilla aparece dentro de la ventana ----------
    fake = FakeSupabase()
    fake.require_captcha = True
    ctx, pg, errs, loads = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.setItem('__tsInteractive', '1')")
    pg.fill('#accUser', 'toca_casilla'); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    pg.select_option('#accBirthM', '05'); pg.select_option('#accBirthY', '1999'); pg.fill('#accEmail', 'casilla@example.com')
    pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(800)
    inside = pg.evaluate("!!document.querySelector('#dlg .captcha-box .fake-ts') && document.querySelector('#dlg .captcha-box').nextElementSibling?.classList.contains('dlg__actions')")
    check(inside, 'si Cloudflare duda, la casilla aparece dentro de la ventana, encima de los botones')
    pg.screenshot(path='/tmp/claude-0/gs/vis/captcha-casilla.png')
    pg.click('#dlg .fake-ts'); pg.wait_for_timeout(1500)
    check(fake.uid_of('casilla@example.com'), 'al tocar la casilla, la cuenta se crea')
    pg.evaluate("localStorage.removeItem('__tsInteractive')")
    ctx.close()

    # ---------- E. Cloudflare falla: la app lo explica ----------
    for locale, create, msg in [('es-CO', 'Crear cuenta', 'No pudimos comprobar que eres una persona'), ('en-US', 'Create account', 'check that you’re a person')]:
        fake = FakeSupabase()
        fake.require_captcha = True
        ctx, pg, errs, loads = device(browser, fake, locale=locale)
        pg.goto(URL); pg.wait_for_timeout(900)
        pg.evaluate("localStorage.setItem('__tsFail', '1')")
        warns = []
        pg.on('console', lambda m: warns.append(m.text) if m.type == 'warning' else None)
        register(pg, 'falla_ts', '2000-05', 'falla@example.com', create=create)
        err = pg.inner_text('#dlg .form-error') if pg.query_selector('#dlg .form-error') else ''
        check(msg in err and not fake.uid_of('falla@example.com'), f'({locale}) si Cloudflare falla, la app lo explica: "{err.strip()[:70]}"')
        if locale == 'es-CO':
            pg.wait_for_timeout(600)
            check(not errs, 'si Cloudflare falla, no queda ningún error rojo en la consola (sin "Nothing to reset")' + (': ' + ' | '.join(errs) if errs else ''))
            check(any('110200' in w for w in warns), 'la consola dice el código de Cloudflare (aquí 110200) para saber qué pasó')
            check(pg.evaluate('window.__ts.last.retry') == 'never', 'la app le pide a Turnstile no reintentar solo (ella maneja el error)')
        ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
