"""
FrostPom v4.5.3 — los anuncios de AdMob, con Capacitor, AdMob y Supabase SIMULADOS.

Decisiones del autor (16 nov 2026, docs/ANUNCIOS.md). Comprueba que:
  A. Un menor de 13 en la app de Android NUNCA inicia AdMob ni ve botones de anuncios, aunque estén encendidos.
  B. En la web (y con los anuncios apagados) no se carga nada de anuncios.
  C. 13+: primero el consentimiento y después AdMob (con contenido apto y sin marcarlo como app infantil):
     - "Ver un anuncio: +10 gemas", hasta 5 al día; cerrar el anuncio antes = sin premio;
     - pantalla completa al empezar el descanso del 4.º pomodoro (nunca antes, ni durante el estudio),
       y el descanso empieza recién cuando se cierra el anuncio;
     - con Premium: sin pantalla completa, pero sí puede ganar gemas.
  D. La mascota muerta revive viendo 3 anuncios (el avance se guarda) sin gastar gemas.
  E. La racha apagada se revive con 1 anuncio por cada día que faltó.
  F. Donde la ley lo pide (Europa): el mensaje de consentimiento antes de iniciar, y "Opciones de privacidad
     de los anuncios" en Ajustes.
  G. Cuenta en línea sin la fecha en este equipo: anuncios no personalizados y de contenido para menores.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_anuncios.py http://localhost:8000/
"""
import re, os, sys
from datetime import datetime
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
      { name: 'App', methods: [...M(['minimizeApp', 'exitApp']), ...M(['addListener', 'removeListener'], 'callback')] },
      { name: 'LocalNotifications', methods: M(['checkPermissions', 'requestPermissions', 'createChannel', 'schedule', 'cancel']) },
      { name: 'Haptics', methods: M(['vibrate', 'impact']) },
      { name: 'Browser', methods: M(['open', 'close']) },
    ],
    nativePromise(plugin, method, options) {
      calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
      if (plugin === 'LocalNotifications' && method === 'checkPermissions') return Promise.resolve({ display: 'granted' });
      if (plugin === 'LocalNotifications' && method === 'requestPermissions') return Promise.resolve({ display: 'granted' });
      if (plugin === 'LocalNotifications' && method === 'schedule') return Promise.resolve({ notifications: [] });
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

# El complemento @capacitor-community/admob de mentira: anota todo y deja elegir qué pasa
# (consentimiento, anuncio completo o cerrado antes, sin anuncios disponibles).
FAKE_ADMOB = r"""
(() => {
  const cap = window.Capacitor; const st = window.__cap;
  const saved = JSON.parse(sessionStorage.getItem('__ads') || '{}');
  st.ads = { consent: saved.consent || 'NOT_REQUIRED', privacy: saved.privacy || 'NOT_REQUIRED', reward: 'ok', noFill: false };
  cap.PluginHeaders.push({ name: 'AdMob', methods: [
    ...['initialize', 'requestConsentInfo', 'showConsentForm', 'showPrivacyOptionsForm', 'prepareRewardVideoAd', 'showRewardVideoAd', 'prepareInterstitial', 'showInterstitial'].map((name) => ({ name, rtype: 'promise' })),
    ...['addListener', 'removeListener'].map((name) => ({ name, rtype: 'callback' })),
  ] });
  const base = cap.nativePromise;
  cap.nativePromise = (plugin, method, options) => {
    if (plugin !== 'AdMob') return base(plugin, method, options);
    st.calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
    const a = st.ads;
    const info = () => ({ status: a.consent, isConsentFormAvailable: a.consent === 'REQUIRED', canRequestAds: a.consent !== 'REQUIRED', privacyOptionsRequirementStatus: a.privacy });
    if (method === 'requestConsentInfo') return Promise.resolve(info());
    if (method === 'showConsentForm') { a.consent = 'OBTAINED'; return Promise.resolve(info()); }
    if (method === 'prepareRewardVideoAd' || method === 'prepareInterstitial') return a.noFill ? Promise.reject(new Error('No fill')) : Promise.resolve({ adUnitId: options.adId });
    if (method === 'showRewardVideoAd') return a.reward === 'ok' ? Promise.resolve({ type: 'coins', amount: 1 }) : Promise.reject({ code: 'REWARDED_AD_CANCELLED', message: 'The ad was cancelled' });
    return Promise.resolve({});
  };
})();
"""


def BAD_OK(r):
    # Con el reloj adelantado, el ranking simulado rechaza algunas horas (como el de verdad): no es de los anuncios
    return any(x in r.url for x in ('finish_session', 'start_session', 'claim_block', 'set_timer'))


def device(browser, fake, native=True, ads=True, admob=True, locale='es-CO', clock=True):
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)
    if ads:
        def cfg(route):
            resp = route.fetch()
            body = re.sub(r'(ads: Object\.freeze\(\{[\s\S]*?enabled: )false', r'\1true', resp.text(), count=1)
            route.fulfill(response=resp, body=body)
        ctx.route('**/js/config.js', cfg)
    if native:
        ctx.add_init_script(FAKE_CAP)
        if admob:
            ctx.add_init_script(FAKE_ADMOB)
    pg = sheets_patch(ctx.new_page())
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('response', lambda r: errs.append(f'{r.status} {r.url.split("/")[-1]}') if r.status >= 400 and 'supabase' in r.url and not BAD_OK(r) else None)
    if clock:
        pg.clock.install(time=datetime(2026, 11, 16, 9, 0))
    return ctx, pg, errs


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def dlg_open(pg):
    return pg.evaluate("document.getElementById('dlg').open")


def toasts(pg):
    return pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ')")


def register(pg, user, birth, email=''):
    pg.fill('#accUser', user); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    if email:
        pg.fill('#accEmail', email)
    pg.click("#dlg button:has-text('Crear cuenta'), #dlg button:has-text('Create account')")
    pg.wait_for_timeout(1200); pg.clock.run_for(800)


def close_dialogs(pg, n=8):
    for _ in range(n):
        if not dlg_open(pg):
            return
        if 'Ponle' in title(pg) or 'Put a face' in title(pg):
            pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')")
        else:
            pg.click('#dlg .dlg__actions button:last-child')
        pg.wait_for_timeout(300); pg.clock.run_for(400)


def calls(pg, plugin='AdMob', method=None):
    out = pg.evaluate('window.__cap ? window.__cap.calls : []')
    return [c for c in out if (plugin is None or c[0] == plugin) and (method is None or c[1] == method)]


def gems(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).progress.gems")


def boot(pg, wait=1500):
    pg.goto(URL); pg.wait_for_timeout(wait); pg.clock.run_for(5000); pg.wait_for_timeout(300)


def open_tray(pg):
    pg.goto(URL + '#/enfocar'); pg.wait_for_timeout(300)
    if pg.evaluate("document.getElementById('foodTray').hidden"):
        pg.click('#shopBtn'); pg.wait_for_timeout(400)


def mode(pg):
    return pg.get_attribute('#ring', 'data-mode')


def until(pg, fn, steps=24):
    """Adelanta el reloj de a poco hasta que fn() sea verdad (las respuestas del servidor tardan algo de tiempo real)."""
    for _ in range(steps):
        if fn():
            return True
        pg.clock.run_for(400); pg.wait_for_timeout(120)
    return fn()


def running(pg):
    return pg.get_attribute('#ring', 'data-status') == 'running'


def to_study(pg):
    """Deja el reloj listo para un pomodoro (si está en el descanso, lo salta)."""
    close_dialogs(pg)
    if mode(pg) != 'study':
        pg.click('#skipBtn'); pg.wait_for_timeout(200); pg.clock.run_for(300)
        close_dialogs(pg)


def pomodoro(pg):
    """Un pomodoro de 25 min completo, con la app abierta (y lo que pase al terminar)."""
    to_study(pg)
    if not running(pg):
        pg.click('#mainBtn'); pg.wait_for_timeout(200)
    pg.clock.fast_forward('25:00')
    until(pg, lambda: mode(pg) != 'study', 12)
    pg.clock.run_for(2500); pg.wait_for_timeout(300)
    close_dialogs(pg)


def seed(pg, fn_js):
    """Cambia el estado de la app (fn_js es el cuerpo de una función que recibe s)."""
    pg.evaluate("(async () => { const c = await import('./js/ui/context.js'); c.mutate((s) => { " + fn_js + " }); })()")


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Menor de 13: nada de anuncios ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'peque_ads', '2015-03')
    close_dialogs(pg)
    boot(pg)
    open_tray(pg)
    check(not calls(pg), 'menor de 13: la app NUNCA inicia AdMob (ni consentimiento, ni anuncios)')
    check(pg.evaluate("document.getElementById('trayAdGems').hidden"), 'menor de 13: en la tienda no hay "Ver un anuncio"')
    pg.click('#trayClose')
    for _ in range(4):
        pomodoro(pg)
    check(not calls(pg), 'menor de 13: después de 4 pomodoros tampoco hay anuncio de pantalla completa')
    ctx.close()

    # ---------- B. En la web (y con los anuncios apagados): nada ----------
    ctx, pg, errs = device(browser, FakeSupabase(), native=False)
    boot(pg)
    register(pg, 'web_ads', '2000-05', 'web@example.com')
    close_dialogs(pg)
    check(not pg.evaluate("[...performance.getEntriesByType('resource')].some(r => /capacitor-core|admob/i.test(r.name))")
          and pg.evaluate("document.getElementById('trayAdGems').hidden"), 'en la web no se carga nada de anuncios')
    ctx.close()
    ctx, pg, errs = device(browser, FakeSupabase(), ads=False)
    boot(pg)
    register(pg, 'off_ads', '2000-05', 'off@example.com')
    close_dialogs(pg); boot(pg)
    check(not calls(pg), 'con config.ads.enabled = false (como salen los zips), la app no inicia AdMob')
    ctx.close()

    # ---------- C. 13+: consentimiento, gemas, pantalla completa y Premium ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'droid_ads', '2000-05', 'droid@example.com')
    close_dialogs(pg)
    boot(pg)
    seq = [c[1] for c in calls(pg)]
    check(seq[:2] == ['requestConsentInfo', 'initialize'], f'primero el consentimiento y después AdMob ({seq[:3]})')
    init = calls(pg, method='initialize')[0][2]
    check(init.get('tagForChildDirectedTreatment') is False and init.get('maxAdContentRating') == 'Teen' and init.get('tagForUnderAgeOfConsent') is False,
          f'AdMob se inicia para 13+ con contenido limitado ({init})')
    check(not calls(pg, method='prepareInterstitial') and not calls(pg, method='showInterstitial'), 'al abrir la app no hay anuncio de pantalla completa')
    # Ganar gemas
    open_tray(pg)
    check(not pg.evaluate("document.getElementById('trayAdGems').hidden") and 'Ver un anuncio: +10 gemas' in pg.inner_text('#adGemsBtn')
          and pg.inner_text('#adGemsLeft') == 'Quedan 5 hoy', 'en la tienda: «Ver un anuncio: +10 gemas» (quedan 5 hoy)')
    pg.screenshot(path=f'{SHOTS}/anuncios-tienda.png')
    g0 = gems(pg)
    pg.click('#adGemsBtn'); pg.wait_for_timeout(500); pg.clock.run_for(500)
    prep = calls(pg, method='prepareRewardVideoAd')
    check(prep and prep[-1][2]['adId'] == 'ca-app-pub-3940256099942544/5224354917' and prep[-1][2]['isTesting'] is True and prep[-1][2]['npa'] is False,
          'usa la unidad de PRUEBA de Google mientras config.ads.testing = true')
    check(gems(pg) == g0 + 10 and pg.inner_text('#adGemsLeft') == 'Quedan 4 hoy', 'viendo el anuncio completo ganas 10 gemas')
    pg.evaluate("window.__cap.ads.reward = 'cancel'")
    pg.click('#adGemsBtn'); pg.wait_for_timeout(500); pg.clock.run_for(500)
    check(gems(pg) == g0 + 10 and 'esta vez no hay premio' in toasts(pg), 'si cierras el anuncio antes de terminar, no hay gemas (y lo dice)')
    pg.evaluate("window.__cap.ads.reward = 'ok'")
    for _ in range(4):
        pg.click('#adGemsBtn'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    check(gems(pg) == g0 + 50 and pg.is_disabled('#adGemsBtn') and pg.inner_text('#adGemsLeft') == 'Vuelve mañana por más', 'hasta 5 al día (50 gemas): después, «Vuelve mañana por más»')
    pg.click('#trayClose')
    # Pantalla completa: nada en los pomodoros 1 a 3
    for i in range(3):
        pomodoro(pg)
    check(not calls(pg, method='showInterstitial'), 'en los pomodoros 1 a 3 no hay anuncio de pantalla completa')
    check(calls(pg, method='prepareInterstitial') == [], 'tampoco se carga antes de tiempo')
    # El 4.º: se carga al empezar y sale al terminar; el descanso espera a que se cierre
    to_study(pg)
    pg.click('#mainBtn'); pg.wait_for_timeout(300)
    check(len(calls(pg, method='prepareInterstitial')) == 1 and not calls(pg, method='showInterstitial'), 'al empezar el 4.º pomodoro se carga el anuncio (sin mostrarlo)')
    pg.clock.run_for(3000); pg.wait_for_timeout(200)
    check(not calls(pg, method='showInterstitial'), 'durante el estudio nunca se muestra')
    # (de un salto: con una cuenta en línea, el reloj en vivo usa la hora real del servidor simulado)
    pg.clock.fast_forward('25:00')
    check(until(pg, lambda: len(calls(pg, method='showInterstitial')) == 1), 'al terminar el 4.º pomodoro sale el anuncio de pantalla completa')
    pg.clock.run_for(5000); pg.wait_for_timeout(200)
    check(mode(pg) != 'study' and not running(pg),
          'mientras el anuncio está abierto, el descanso no empieza (no pierdes ni un segundo)')
    pg.evaluate("window.__cap.listeners['AdMob.interstitialAdDismissed']()")
    check(until(pg, lambda: running(pg) and mode(pg) != 'study'), 'al cerrar el anuncio, empieza el descanso')
    close_dialogs(pg)
    pomodoro(pg)
    check(len(calls(pg, method='showInterstitial')) == 1, 'el contador empieza de nuevo: el pomodoro siguiente no tiene anuncio')
    # Premium: sin pantalla completa, pero puede ganar gemas
    seed(pg, "s.premium.active = true; s.premium.since = new Date().toISOString(); return {};")
    for _ in range(4):
        pomodoro(pg)
    check(len(calls(pg, method='showInterstitial')) == 1, 'con Premium: nunca hay anuncio de pantalla completa')
    pg.evaluate("localStorage.removeItem('st2_ads')")
    open_tray(pg)
    check(not pg.evaluate("document.getElementById('trayAdGems').hidden"), 'con Premium: sí puede ver anuncios para ganar gemas (si quiere)')
    pg.click('#trayClose')
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs[:3]) if errs else ''))

    # ---------- D. La mascota muerta revive con 3 anuncios ----------
    seed(pg, "const id = s.profile.companion || 'pinguino'; s.pets[id] = { fullness: 0, at: new Date(Date.now() - 6 * 864e5).toISOString(), dead: new Date(Date.now() - 2 * 864e5).toISOString() }; s.progress.gems = 3; return {};")
    open_tray(pg)
    check(not pg.evaluate("document.getElementById('reviveAdBtn').hidden") and '(0 de 3)' in pg.inner_text('#reviveAdBtn') and pg.is_disabled('#reviveBtn'),
          'mascota muerta y sin gemas: «Revivir con anuncios (0 de 3)»')
    pg.screenshot(path=f'{SHOTS}/anuncios-revivir.png')
    pg.click('#reviveAdBtn'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    check('(1 de 3)' in pg.inner_text('#reviveAdBtn') and 'Anuncio 1 de 3' in toasts(pg), 'después del primero: (1 de 3)')
    boot(pg)  # el avance se guarda aunque cierres la app
    open_tray(pg)
    check('(1 de 3)' in pg.inner_text('#reviveAdBtn'), 'el avance se guarda al cerrar y abrir la app')
    pg.click('#reviveAdBtn'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    pg.click('#reviveAdBtn'); pg.wait_for_timeout(600); pg.clock.run_for(600)
    alive = pg.evaluate("(async () => { const P = await import('./js/pet.js'); const c = await import('./js/ui/context.js'); return !P.isDead(c.state, P.currentPetId(c.state)); })()")
    check(alive and gems(pg) == 3, 'con el 3.º anuncio revive, sin gastar gemas')
    pg.click('#trayClose')

    # ---------- E. La racha apagada: 1 anuncio por cada día que faltó ----------
    pg.goto(URL + '#/enfocar'); pg.wait_for_timeout(300)
    to_study(pg)  # con un bloque corriendo, la vista de la racha espera (no interrumpe)
    seed(pg, """
      const key = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      for (const k of Object.keys(s.daily)) delete s.daily[k];
      for (const off of [-5, -4, -3]) s.daily[key(off)] = { studySec: 1500, creditedSec: 1500, sessions: 1, partials: 0, breaks: 0, xp: 0, noPauseSessions: 0, frozen: 0 };
      s.progress.gems = 0; return {};""")
    pg.evaluate("localStorage.removeItem('st2_streak_lost_seen')")
    boot(pg)
    check(title(pg) == 'Tu racha se apagó' and pg.query_selector("#dlg button:has-text('Ver anuncios y revivirla (0 de 2)')"),
          'racha apagada con 2 días que faltaron: «Ver anuncios y revivirla (0 de 2)»')
    pg.screenshot(path=f'{SHOTS}/anuncios-racha.png')
    pg.click("#dlg button:has-text('Ver anuncios y revivirla')"); pg.wait_for_timeout(500); pg.clock.run_for(500)
    check(dlg_open(pg) and pg.query_selector("#dlg button:has-text('(1 de 2)')"), 'después del primero, la ventana sigue: (1 de 2)')
    pg.click("#dlg button:has-text('Ver anuncios y revivirla')"); pg.wait_for_timeout(700); pg.clock.run_for(700)
    st = pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")
    check(not (dlg_open(pg) and title(pg) == 'Tu racha se apagó') and pg.inner_text('#hudStreakN') == '5' and st['progress']['gems'] == 0,
          'con el 2.º se revive (5 días), sin gastar gemas')
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- F. Europa: consentimiento y opciones de privacidad ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    pg.add_init_script("sessionStorage.setItem('__ads', JSON.stringify({ consent: 'REQUIRED', privacy: 'REQUIRED' }))")
    boot(pg)
    register(pg, 'eu_ads', '2000-05', 'eu@example.com')
    close_dialogs(pg)
    boot(pg)
    seq = [c[1] for c in calls(pg)]
    check(seq[:3] == ['requestConsentInfo', 'showConsentForm', 'initialize'], f'donde la ley lo pide, el mensaje de consentimiento sale antes de iniciar ({seq[:3]})')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(500)
    check(not pg.evaluate("document.getElementById('adPrivacyRow').hidden"), 'en Ajustes aparece «Opciones de privacidad de los anuncios»')
    pg.click('#adPrivacyBtn'); pg.wait_for_timeout(300)
    check(calls(pg, method='showPrivacyOptionsForm'), 'y abre el formulario de privacidad de Google')
    ctx.close()

    # ---------- G. Cuenta en línea sin la fecha en este equipo ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'teen_ads', '2000-05', 'teen@example.com')
    close_dialogs(pg)
    seed(pg, "delete s.account.birth; return {};")
    boot(pg)
    init = calls(pg, method='initialize')
    check(init and init[0][2].get('tagForUnderAgeOfConsent') is True and init[0][2].get('maxAdContentRating') == 'ParentalGuidance',
          'en línea sin saber la edad exacta: se trata como menor de 16 (contenido para menores)')
    open_tray(pg)
    pg.click('#adGemsBtn'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    prep = calls(pg, method='prepareRewardVideoAd')
    check(prep and prep[-1][2]['npa'] is True, 'y los anuncios no son personalizados')
    # Sin anuncios disponibles: lo dice y no da nada
    pg.evaluate("window.__cap.ads.noFill = true"); g0 = gems(pg)
    pg.click('#adGemsBtn'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    check(gems(pg) == g0 and 'No hay un anuncio disponible' in toasts(pg), 'si no hay anuncio disponible, lo dice (y no hay gemas)')
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- H. En inglés ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, locale='en-US')
    boot(pg)
    register(pg, 'en_ads', '2000-05', 'en@example.com')
    close_dialogs(pg); boot(pg); open_tray(pg)
    check('Watch an ad: +10 gems' in pg.inner_text('#adGemsBtn') and pg.inner_text('#adGemsLeft') == '5 left today', 'en inglés: «Watch an ad: +10 gems» (5 left today)')
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
