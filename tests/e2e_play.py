"""
FrostPom v4.7.0 — Premium con Google Play (RevenueCat), con Capacitor, el complemento de RevenueCat y
Supabase SIMULADOS. Decisiones del autor (16 nov 2026, docs/GOOGLE-PLAY-BILLING.md): RevenueCat,
US$ 2,99 al mes o US$ 19,99 al año, 7 días gratis, primero solo Android.

Comprueba que:
  A. Con el cobro apagado (como salen los zips), Android sigue en modo prueba y no se habla con RevenueCat.
  B. Sin cuenta en línea, o con menos de 13 años, no se puede suscribir y a RevenueCat no se le manda nada.
  C. Quien usaba la prueba gratis: un aviso (una vez) y ya no es Premium gratis en Android.
  D. Comprar: planes con el precio de Google, ahorro del anual, 7 días gratis, condiciones claras;
     cancelar no dice nada, pago pendiente avisa; al comprar llega el regalo una vez, el servidor revisa
     la compra (premium-sync) y Premium se nota en la app. "Administrar suscripción" abre Google Play.
  E. El servidor manda al abrir: vencido (aviso), período de gracia (Premium + aviso), en espera.
  F. Restaurar compras, el aviso al eliminar la cuenta y Google Play sin conexión.
  G. En inglés.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_play.py http://localhost:8000/
"""
import re, os, sys, json
from datetime import datetime, timedelta, timezone
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


# El mismo Capacitor de mentira que tests/e2e_anuncios.py
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

# El complemento @revenuecat/purchases-capacitor de mentira: precios de Google, compra (o cancelada,
# pendiente…), restaurar. Al comprar, "RevenueCat" se entera (window.__rcBought) como el de verdad.
FAKE_PURCHASES = r"""
(() => {
  const cap = window.Capacitor; const st = window.__cap;
  const saved = JSON.parse(sessionStorage.getItem('__rc') || '{}');
  st.rc = Object.assign({ buy: 'ok', restore: 'none', trial: true, offline: false, user: '', configured: false, lifetime: true }, saved);
  cap.PluginHeaders.push({ name: 'Purchases', methods: [
    ...['configure', 'logIn', 'logOut', 'getOfferings', 'purchasePackage', 'restorePurchases', 'getCustomerInfo', 'removeCustomerInfoUpdateListener'].map((name) => ({ name, rtype: 'promise' })),
    { name: 'addCustomerInfoUpdateListener', rtype: 'callback' },
  ] });
  const iso = (t) => new Date(t).toISOString();
  const days = (trial) => (trial ? 7 : 30) * 864e5;
  const product = (id, price, priceString, perMonth) => ({ identifier: id, title: 'FrostPom Premium', price, priceString, pricePerMonthString: perMonth, currencyCode: 'USD', introPrice: null,
    defaultOption: st.rc.trial ? { id: 'prueba-7-dias', freePhase: { billingPeriod: { unit: 'DAY', value: 7, iso8601: 'P7D' } } } : { id: 'base', freePhase: null } });
  const pkg = (id, type, prod) => ({ identifier: id, packageType: type, product: prod, offeringIdentifier: 'default', presentedOfferingContext: { offeringIdentifier: 'default', placementIdentifier: null, targetingContext: null } });
  const info = (plan, trial) => ({ managementURL: 'https://play.google.com/store/account/subscriptions?sku=frostpom_premium&package=com.startupprometeus.frostpom', entitlements: { active: {}, all: plan ? { premium: {
    identifier: 'premium', isActive: true, willRenew: true, periodType: trial ? 'TRIAL' : 'NORMAL', expirationDate: iso(Date.now() + days(trial)), store: 'PLAY_STORE',
    productIdentifier: 'frostpom_premium', productPlanIdentifier: plan, isSandbox: true, unsubscribeDetectedAt: null, billingIssueDetectedAt: null } } : {} } });
  const server = (plan, trial) => ({ premium: true, status: trial ? 'trial' : 'active', store: 'play_store', product: 'frostpom_premium:' + plan, period_type: trial ? 'trial' : 'normal',
    expires_at: iso(Date.now() + days(trial)), will_renew: true, billing_issue: false, sandbox: true });
  // (v4.9.0) De por vida: una compra de una sola vez, sin fecha de vencimiento
  const lifeInfo = () => ({ entitlements: { active: {}, all: { premium: { identifier: 'premium', isActive: true, willRenew: false, periodType: 'NORMAL', expirationDate: null, store: 'PLAY_STORE',
    productIdentifier: 'frostpom_premium_vida', isSandbox: true, unsubscribeDetectedAt: null, billingIssueDetectedAt: null } } } });
  const lifeServer = () => ({ premium: true, status: 'active', store: 'play_store', product: 'frostpom_premium_vida', period_type: null, expires_at: null, will_renew: false, billing_issue: false, sandbox: true });
  const fail = (code, message, extra = {}) => Promise.reject(Object.assign(new Error(message), { code, data: { code: Number(code), message, ...extra } }));
  const base = cap.nativePromise;
  cap.nativePromise = (plugin, method, options) => {
    if (plugin !== 'Purchases') return base(plugin, method, options);
    st.calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
    const r = st.rc;
    if (method === 'configure') { r.user = options.appUserID; r.configured = true; return Promise.resolve(); }
    if (!r.configured) return fail('23', 'Purchases must be configured before calling this function');
    if (method === 'logIn') { r.user = options.appUserID; return Promise.resolve({ customerInfo: info(null), created: false }); }
    if (method === 'getOfferings') {
      if (r.offline) return fail('10', 'Error performing request.');
      const m = pkg('$rc_monthly', 'MONTHLY', product('frostpom_premium:mensual', 2.99, 'US$ 2,99', 'US$ 2,99'));
      const a = pkg('$rc_annual', 'ANNUAL', product('frostpom_premium:anual', 19.99, 'US$ 19,99', 'US$ 1,67'));
      const l = { identifier: '$rc_lifetime', packageType: 'LIFETIME', product: { identifier: 'frostpom_premium_vida', title: 'FrostPom Premium de por vida', price: 29.99, priceString: 'US$ 29,99', currencyCode: 'USD', productCategory: 'NON_SUBSCRIPTION' }, offeringIdentifier: 'default' };
      const o = { identifier: 'default', availablePackages: r.lifetime ? [m, a, l] : [m, a], monthly: m, annual: a, lifetime: r.lifetime ? l : null };
      return Promise.resolve({ all: { default: o }, current: o });
    }
    if (method === 'purchasePackage') {
      if (r.buy === 'cancel') return fail('1', 'Purchase was cancelled.', { userCancelled: true });
      if (r.buy === 'pending') return fail('20', 'The payment is pending.');
      if (options.aPackage.packageType === 'LIFETIME') return window.__rcBought(r.user, lifeServer()).then(() => ({ productIdentifier: 'frostpom_premium_vida', customerInfo: lifeInfo() }));
      const plan = options.aPackage.packageType === 'ANNUAL' ? 'anual' : 'mensual';
      return window.__rcBought(r.user, server(plan, r.trial)).then(() => ({ productIdentifier: 'frostpom_premium', customerInfo: info(plan, r.trial) }));
    }
    if (method === 'restorePurchases') {
      if (r.restore !== 'ok') return Promise.resolve({ customerInfo: info(null) });
      return window.__rcBought(r.user, server('mensual', false)).then(() => ({ customerInfo: info('mensual', false) }));
    }
    if (method === 'getCustomerInfo') return Promise.resolve({ customerInfo: info(null) });
    return Promise.resolve({});
  };
})();
"""

OPEN_LOG = "window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };"


def device(browser, fake, play=True, locale='es-CO'):
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)
    if play:
        def cfg(route):
            resp = route.fetch()
            body = re.sub(r'(play: Object\.freeze\(\{\s*enabled: )false', r'\1true', resp.text(), count=1)
            body = body.replace("revenueCatKey: '',", "revenueCatKey: 'goog_PRUEBA_publica',", 1)
            route.fulfill(response=resp, body=body)
        ctx.route('**/js/config.js', cfg)
    # Lo que RevenueCat sabe después de comprar (el complemento de mentira se lo cuenta al "servidor")
    ctx.expose_binding('__rcBought', lambda source, uid, st: fake.rc.__setitem__(uid, st))
    ctx.add_init_script(FAKE_CAP)
    ctx.add_init_script(FAKE_PURCHASES)
    ctx.add_init_script(OPEN_LOG)
    pg = sheets_patch(ctx.new_page())
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('response', lambda r: errs.append(f'{r.status} {r.url.split("/")[-1]}') if r.status >= 400 and 'supabase' in r.url and 'premium-sync' not in r.url else None)
    pg.clock.install(time=datetime(2026, 11, 16, 9, 0))
    return ctx, pg, errs


def dlg_open(pg):
    return pg.evaluate("document.getElementById('dlg').open")


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def body(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.querySelector('#dlg .dlg__box').innerText : ''")


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
        elif 'mascota de regalo' in title(pg) or 'gift pet' in title(pg):
            pg.click('#dlg .dlg__actions button:first-child')  # "Luego"
        elif title(pg) in ('FrostPom Premium', 'La prueba gratis de Premium terminó'):
            pg.click('#dlg .dlg__actions button:first-child')  # "Ahora no" (nunca comprar sin querer)
        else:
            pg.click('#dlg .dlg__actions button:last-child')
        pg.wait_for_timeout(300); pg.clock.run_for(400)


def boot(pg, wait=1500):
    pg.goto(URL); pg.wait_for_timeout(wait); pg.clock.run_for(5000); pg.wait_for_timeout(400)


def calls(pg, method=None):
    out = pg.evaluate('window.__cap ? window.__cap.calls : []')
    return [c for c in out if c[0] == 'Purchases' and (method is None or c[1] == method)]


def premium(pg):
    return pg.evaluate("(async () => (await import('./js/ui/context.js')).isPremium())()")


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def open_premium(pg):
    close_dialogs(pg)
    if not pg.is_visible('#hudCrown'):
        pg.goto(URL + '#/enfocar'); pg.wait_for_timeout(300); pg.clock.run_for(500)
        close_dialogs(pg)
    pg.click('#hudCrown'); pg.wait_for_timeout(500); pg.clock.run_for(800); pg.wait_for_timeout(300)


def seed(pg, fn_js):
    pg.evaluate("(async () => { const c = await import('./js/ui/context.js'); c.mutate((s) => { " + fn_js + " }); })()")


def until(pg, fn, steps=20):
    for _ in range(steps):
        if fn():
            return True
        pg.clock.run_for(400); pg.wait_for_timeout(120)
    return fn()


def server_row(status, days, premium_=True, renew=True, issue=False):
    exp = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    return {'premium': premium_, 'status': status, 'store': 'play_store', 'product': 'frostpom_premium:mensual', 'period_type': 'normal',
            'expires_at': exp, 'will_renew': renew, 'billing_issue': issue, 'sandbox': False}


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Cobro apagado (como salen los zips): modo prueba, sin RevenueCat ----------
    ctx, pg, errs = device(browser, FakeSupabase(), play=False)
    boot(pg)
    register(pg, 'apagado_pl', '2000-05', 'apagado@example.com')
    close_dialogs(pg)
    open_premium(pg)
    check('Probar Premium gratis' in body(pg) and not calls(pg), 'cobro apagado: Android sigue en modo prueba y no se habla con RevenueCat')
    ctx.close()

    # ---------- B. Sin cuenta en línea / menor de 13: no se puede suscribir ----------
    ctx, pg, errs = device(browser, FakeSupabase())
    boot(pg)
    register(pg, 'local_pl', '2000-05', 'local@example.com')
    close_dialogs(pg)
    # Una cuenta de este equipo que todavía no está en línea (como las de antes de la v4.0)
    seed(pg, "delete s.account.online; return {};")
    boot(pg); close_dialogs(pg)
    pg.evaluate("window.__cap.calls.length = 0")
    open_premium(pg)
    check('conecta tu cuenta en línea' in body(pg) and pg.query_selector("#dlg button:has-text('Conectar mi cuenta')"),
          'sin cuenta en línea: pide conectarla (con el correo) para suscribirse')
    check(not calls(pg), 'sin cuenta en línea: a RevenueCat no se le manda nada')
    close_dialogs(pg)
    check(not premium(pg) and 'Probar Premium gratis' not in pg.inner_text('body'), 'y no hay "Probar Premium gratis" en la app con cobro')
    ctx.close()

    ctx, pg, errs = device(browser, FakeSupabase())
    boot(pg)
    register(pg, 'peque_pl', '2015-03')
    close_dialogs(pg)
    open_premium(pg)
    check('menores de 13' in body(pg) and not calls(pg), 'menor de 13: Premium no se ofrece para comprar (y RevenueCat no sabe nada)')
    ctx.close()

    # ---------- C, D. Cuenta en línea 13+: la prueba gratis termina y se compra ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'droid_pl', '2000-05', 'droid@example.com')
    close_dialogs(pg)
    uid = fake.uid_of('droid@example.com')
    check(uid and state(pg)['account'].get('online') is True, 'la cuenta quedó en línea')
    seed(pg, "s.premium.active = true; s.premium.since = new Date().toISOString(); return {};")  # usaba la prueba gratis
    g0 = state(pg)['progress']['gems']
    boot(pg)
    check(title(pg) == 'La prueba gratis de Premium terminó' and 'sigue siendo tuyo' in body(pg),
          'quien usaba la prueba gratis ve UNA vez que ahora Premium es una suscripción de Google Play')
    check(fake.fn_calls('get_entitlements') and not premium(pg), 'al abrir se pregunta al servidor, y la prueba gratis ya no da Premium')
    pg.screenshot(path=f'{SHOTS}/play-fin-prueba.png')
    pg.click("#dlg button:has-text('Entendido')"); pg.wait_for_timeout(300)
    boot(pg)
    check(title(pg) != 'La prueba gratis de Premium terminó', 'el aviso no se repite')
    close_dialogs(pg)

    open_premium(pg)
    conf = calls(pg, 'configure')
    check(conf and conf[0][2] == {'apiKey': 'goog_PRUEBA_publica', 'appUserID': uid, 'automaticDeviceIdentifierCollectionEnabled': False},
          f'RevenueCat solo recibe el id de la cuenta (nunca el correo) y sin identificadores de publicidad ({conf[:1]})')
    txt = body(pg)
    check('US$ 19,99 al año' in txt and 'Ahorra 44 %' in txt and 'Equivale a US$ 1,67 al mes' in txt and 'US$ 2,99 al mes' in txt,
          'los planes con el precio de Google: anual (ahorra 44 %) y mensual')
    check('DE POR VIDA' in txt.upper() and 'US$ 29,99, un solo pago' in txt and 'Para siempre' in txt,
          '(v4.9.0) y el de por vida: US$ 29,99, un solo pago')
    pg.click('#dlg .plan[data-plan="lifetime"]'); pg.wait_for_timeout(150)
    check('un solo pago' in pg.inner_text('#playTerms') and 'sin renovaciones' in pg.inner_text('#playTerms') and pg.inner_text('#dlg [data-primary="true"]') == 'Comprar de por vida, US$ 29,99',
          'de por vida: las condiciones dicen «un solo pago, sin renovaciones» y el botón «Comprar de por vida»')
    pg.screenshot(path=f'{SHOTS}/play-de-por-vida.png')
    pg.click('#dlg .plan[data-plan="annual"]'); pg.wait_for_timeout(150)
    terms = pg.inner_text('#playTerms')
    check('7 días gratis' in terms and 'renovación automática' in terms and 'Google Play → Suscripciones' in terms and 'no se cobra nada' in terms,
          'antes de pagar se dice claro: prueba gratis, renovación automática y cómo cancelar')
    check(pg.inner_text('#dlg [data-primary="true"]') == 'Empezar 7 días gratis', 'el botón dice «Empezar 7 días gratis»')
    pg.screenshot(path=f'{SHOTS}/play-comprar.png')
    pg.click('#dlg .plan[data-plan="monthly"]'); pg.wait_for_timeout(150)
    check('US$ 2,99 al mes' in pg.inner_text('#playTerms') and pg.get_attribute('#dlg .plan[data-plan="monthly"]', 'aria-checked') == 'true',
          'al elegir el mensual, las condiciones cambian')
    pg.click('#dlg .plan[data-plan="annual"]'); pg.wait_for_timeout(150)
    # Cancelar en la ventana de Google: no pasa nada (ni mensaje de error)
    pg.evaluate("window.__cap.rc.buy = 'cancel'")
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    check(dlg_open(pg) and pg.inner_text('#dlg .form-error') == '' and not premium(pg), 'si cierras la ventana de Google, no pasa nada (sin mensajes de error)')
    pg.evaluate("window.__cap.rc.buy = 'pending'")
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(400); pg.clock.run_for(400)
    check('pendiente' in pg.inner_text('#dlg .form-error') and not premium(pg), 'pago pendiente: lo dice, y Premium espera a que Google lo confirme')
    pg.evaluate("window.__cap.rc.buy = 'ok'")
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    bought = calls(pg, 'purchasePackage')
    check(bought and bought[-1][2]['aPackage']['identifier'] == '$rc_annual', 'se compra el plan elegido (anual)')
    check(premium(pg), 'al comprar, Premium se nota en la app al instante')
    check(until(pg, lambda: (fake.entitlements.get(uid) or {}).get('status') == 'trial'), 'el servidor revisó la compra (premium-sync) y la guardó: prueba gratis')
    sync = fake.fn_calls('premium-sync')
    check(sync and sync[-1][2] == uid, 'premium-sync se pidió con la sesión de la cuenta')
    st = state(pg)
    check(st['progress']['gems'] == g0 + 1000 and st['premium']['bonusClaimed'] is True, 'llegó el regalo de bienvenida (1000 gemas), una sola vez')
    pg.screenshot(path=f'{SHOTS}/play-regalo.png')
    close_dialogs(pg)
    check(pg.evaluate("document.getElementById('hudCrown').classList.contains('is-active')"), 'la corona del HUD se enciende')
    check(pg.evaluate("(async () => (await import('./js/ui/context.js')).prefs().premium)()"), 'las funciones Premium se desbloquean')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(400)
    check('prueba gratis hasta el' in pg.inner_text('#premiumStatus') and 'Compra de prueba' in pg.inner_text('#premiumStatus'),
          'en Ajustes: «Estás en tu prueba gratis hasta el …» (y que es una compra de prueba)')
    open_premium(pg)
    check(title(pg) == 'Eres Premium' and 'prueba gratis hasta el' in body(pg), 'la ventana de Premium dice el estado de la suscripción')
    pg.screenshot(path=f'{SHOTS}/play-eres-premium.png')
    pg.click("#dlg button:has-text('Administrar suscripción')"); pg.wait_for_timeout(300)
    opened = pg.evaluate('window.__opened')
    check(opened and opened[-1].startswith('https://play.google.com/store/account/subscriptions'), '«Administrar suscripción» abre Google Play')
    gems_after = state(pg)['progress']['gems']
    # Al volver a abrir: manda el servidor (y el regalo no se repite)
    boot(pg)
    close_dialogs(pg)
    check(premium(pg) and state(pg)['progress']['gems'] == gems_after, 'al volver a abrir sigue siendo Premium (lo dice el servidor) y el regalo no se repite')

    # ---------- E. El servidor manda: gracia, en espera, vencido ----------
    fake.entitlements[uid] = server_row('grace', 2, issue=True)
    fake.rc[uid] = fake.entitlements[uid]
    boot(pg)
    check(premium(pg) and 'no pudo cobrar' in toasts(pg), 'período de gracia: sigue siendo Premium, con un aviso para revisar el pago')
    close_dialogs(pg)
    fake.entitlements[uid] = server_row('on_hold', -1, premium_=False, renew=False, issue=True)
    fake.rc[uid] = fake.entitlements[uid]
    boot(pg)
    check(not premium(pg) and 'en espera' in toasts(pg), 'en espera: sin Premium y con un aviso para arreglar el pago')
    close_dialogs(pg)
    open_premium(pg)
    check('en espera' in body(pg) and pg.query_selector("#dlg button:has-text('Abrir Google Play')"), 'la ventana de Premium explica la espera y abre Google Play')
    close_dialogs(pg)
    fake.entitlements[uid] = server_row('active', 20)
    fake.rc[uid] = fake.entitlements[uid]
    boot(pg); close_dialogs(pg)
    check(premium(pg), 'arreglado el pago: Premium vuelve solo')
    fake.entitlements[uid] = server_row('expired', -1, premium_=False, renew=False)
    fake.rc[uid] = fake.entitlements[uid]
    g1 = state(pg)['progress']['gems']
    boot(pg)
    check(not premium(pg) and 'Tu Premium terminó' in toasts(pg) and state(pg)['progress']['gems'] == g1,
          'vencido: sin Premium, con un aviso, y nunca se quita lo ganado (gemas)')
    close_dialogs(pg)

    # ---------- F. Restaurar, aviso al eliminar la cuenta y sin conexión ----------
    pg.evaluate("window.__cap.rc.restore = 'ok'")
    open_premium(pg)
    pg.click('#playRestore'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    check(premium(pg) and 'Recuperamos tu Premium' in toasts(pg), '«Restaurar compras» recupera Premium')
    check(until(pg, lambda: (fake.entitlements.get(uid) or {}).get('status') == 'active'), 'y el servidor lo revisa')
    close_dialogs(pg)
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(400)
    pg.evaluate("(async () => { (await import('./js/ui/account.js')).deleteAccountFlow(); })()"); pg.wait_for_timeout(400)
    check(pg.query_selector('#delPlayWarn') and 'NO la cancela' in pg.inner_text('#delPlayWarn'),
          'antes de eliminar la cuenta, avisa que la suscripción de Google Play no se cancela sola')
    pg.click("#dlg button:has-text('Cancelar')"); pg.wait_for_timeout(300)
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'sinred_pl', '2000-05', 'sinred@example.com')
    close_dialogs(pg)
    pg.evaluate("window.__cap.rc.offline = true")
    open_premium(pg)
    check('no pudimos traer el precio' in body(pg) and pg.query_selector("#dlg button:has-text('Reintentar')"),
          'sin conexión con Google Play: lo dice y ofrece reintentar (nunca un precio inventado)')
    pg.evaluate("window.__cap.rc.offline = false")
    pg.click("#dlg button:has-text('Reintentar')"); pg.wait_for_timeout(500); pg.clock.run_for(800)
    check('US$ 2,99 al mes' in body(pg), 'al reintentar con conexión, aparecen los precios')
    # Sin la prueba gratis (ya la usó en otra cuenta de Google): el botón dice el precio
    close_dialogs(pg)
    pg.evaluate("window.__cap.rc.trial = false")
    open_premium(pg)
    check(pg.inner_text('#dlg [data-primary="true"]') == 'Suscribirme, US$ 19,99' and 'gratis' not in pg.inner_text('#playTerms'),
          'quien ya tuvo la prueba gratis ve el precio en el botón (sin prometer días gratis)')
    close_dialogs(pg)
    # premium-sync no desplegado todavía: la compra igual se nota aquí
    fake.sync_status = 404
    pg.evaluate("window.__cap.rc.trial = true")
    open_premium(pg)
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    check(premium(pg), 'si premium-sync todavía no está, la compra igual se nota en el teléfono (y el servidor se pone al día después)')
    close_dialogs(pg)
    ctx.close()

    # ---------- G. En inglés ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, locale='en-US')
    boot(pg)
    register(pg, 'english_pl', '2000-05', 'english@example.com')
    close_dialogs(pg)
    open_premium(pg)
    txt = body(pg)
    check(pg.inner_text('#dlg [data-primary="true"]') == 'Start 7 days free' and 'Restore purchases' in txt and 'Save 44%' in txt and 'renewing automatically' in txt,
          'en inglés: «Start 7 days free», «Restore purchases», «Save 44%»')
    pg.screenshot(path=f'{SHOTS}/play-ingles.png')
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- H. (v4.9.0) Premium de por vida: comprar, sin «Administrar», y pasarse desde una suscripción ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'vida_pl', '2000-05', 'vida@example.com')
    close_dialogs(pg)
    uid = fake.uid_of('vida@example.com')
    open_premium(pg)
    pg.click('#dlg .plan[data-plan="lifetime"]'); pg.wait_for_timeout(150)
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    bought = calls(pg, 'purchasePackage')
    check(bought and bought[-1][2]['aPackage']['identifier'] == '$rc_lifetime', 'de por vida: se compra el paquete «Lifetime»')
    check(premium(pg), 'de por vida: Premium al instante')
    check(until(pg, lambda: (fake.entitlements.get(uid) or {}).get('product') == 'frostpom_premium_vida'), 'y el servidor lo guarda (sin fecha de vencimiento)')
    close_dialogs(pg)
    open_premium(pg)
    check(title(pg) == 'Eres Premium' and 'Premium de por vida' in body(pg) and not pg.query_selector("#dlg button:has-text('Administrar suscripción')"),
          'de por vida: «Tienes Premium de por vida» y sin «Administrar suscripción» (no hay nada que cancelar)')
    pg.screenshot(path=f'{SHOTS}/play-vida-eres.png')
    close_dialogs(pg)
    boot(pg); close_dialogs(pg)
    check(premium(pg), 'de por vida: al volver a abrir sigue siendo Premium (lo dice el servidor)')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(300); pg.clock.run_for(400)
    pg.click('#accDeleteBtn'); pg.wait_for_timeout(300)
    check(pg.query_selector('#delLifetimeWarn'), 'al eliminar la cuenta avisa que el Premium de por vida se pierde')
    pg.click("#dlg button:has-text('Cancelar')"); pg.wait_for_timeout(200)
    check(not errs, 'H: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # Con una suscripción mensual: «Pasarme a de por vida»
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'sube_pl', '2000-05', 'sube@example.com')
    close_dialogs(pg)
    pg.evaluate("window.__cap.rc.trial = false")
    open_premium(pg)
    pg.click('#dlg .plan[data-plan="monthly"]'); pg.wait_for_timeout(150)
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    close_dialogs(pg)
    open_premium(pg)
    check(pg.query_selector("#dlg button:has-text('Pasarme a de por vida')") and pg.query_selector("#dlg button:has-text('Administrar suscripción')"),
          'con suscripción: «Pasarme a de por vida» (y «Administrar suscripción»)')
    pg.click("#dlg button:has-text('Pasarme a de por vida')"); pg.wait_for_timeout(500); pg.clock.run_for(800); pg.wait_for_timeout(300)
    check(len(pg.query_selector_all('#dlg .plan')) == 1 and pg.query_selector('#dlg .plan[data-plan="lifetime"]'), 'pasarse: solo se ofrece el de por vida')
    pg.click('#dlg [data-primary="true"]'); pg.wait_for_timeout(600); pg.clock.run_for(800); pg.wait_for_timeout(300)
    log = pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ')")
    check('Cancela tu suscripción en Google Play' in log, 'al pasarse, recuerda cancelar la suscripción (Google no la cancela sola)')
    check(not errs, 'H2: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
