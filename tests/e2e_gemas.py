"""
FrostPom v4.8.0 — "¿Necesitas más gemas?" y los paquetes de gemas con Google Play, con Capacitor,
AdMob, RevenueCat y Supabase SIMULADOS. Pedido del autor (17 nov 2026): al tocar la gema, la gema
con el brillo detrás y tres opciones (anuncios, ir a estudiar y comprar paquetes de varios tamaños).
Paquetes elegidos: 60 · 330 · 700 · 1.500 gemas (US$ 0,99 · 4,99 · 9,99 · 19,99).

Comprueba que:
  A. En la web: la ventana sale al tocar la gema; "Estudiar" lleva a Enfocar; comprar dice "Solo en
     la app de Android"; no hay anuncios.
  B. Android 13+ con cuenta en línea: anuncio (+10, quedan 5 → 4) sin cerrar la ventana; los 4
     paquetes con el precio de Google y "Mejor precio"; comprar suma las gemas UNA vez y da las
     gracias; cancelar no dice nada; pago pendiente avisa; la gema de la tienda también abre la ventana.
  C. Una compra que quedó sin sumar (la app se cerró al pagar) llega al abrir la app, una sola vez.
  D. Sin cuenta en línea: pide conectarla. Menor de 13: ni comprar ni anuncios.
  E. En inglés.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_gemas.py http://localhost:8000/
"""
import re, os, sys, json
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
      if (plugin === 'LocalNotifications' && /Permissions$/.test(method)) return Promise.resolve({ display: 'granted' });
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

FAKE_ADMOB = r"""
(() => {
  const cap = window.Capacitor; const st = window.__cap;
  st.ads = { reward: 'ok' };
  cap.PluginHeaders.push({ name: 'AdMob', methods: [
    ...['initialize', 'requestConsentInfo', 'showConsentForm', 'showPrivacyOptionsForm', 'prepareRewardVideoAd', 'showRewardVideoAd', 'prepareInterstitial', 'showInterstitial'].map((name) => ({ name, rtype: 'promise' })),
    ...['addListener', 'removeListener'].map((name) => ({ name, rtype: 'callback' })),
  ] });
  const base = cap.nativePromise;
  cap.nativePromise = (plugin, method, options) => {
    if (plugin !== 'AdMob') return base(plugin, method, options);
    st.calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
    if (method === 'requestConsentInfo') return Promise.resolve({ status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    if (method === 'prepareRewardVideoAd' || method === 'prepareInterstitial') return Promise.resolve({ adUnitId: options.adId });
    if (method === 'showRewardVideoAd') return st.ads.reward === 'ok' ? Promise.resolve({ type: 'coins', amount: 1 }) : Promise.reject({ code: 'REWARDED_AD_CANCELLED', message: 'The ad was cancelled' });
    return Promise.resolve({});
  };
})();
"""

# RevenueCat de mentira: los paquetes de gemas (productos de una sola compra) y sus compras.
# r.nonSubs = las compras que RevenueCat tiene anotadas para la cuenta (sobreviven a recargar).
FAKE_PURCHASES = r"""
(() => {
  const cap = window.Capacitor; const st = window.__cap;
  const saved = JSON.parse(sessionStorage.getItem('__rc') || '{}');
  st.rc = Object.assign({ buy: 'ok', offline: false, user: '', configured: false, nonSubs: [], n: 0 }, saved);
  const keep = () => sessionStorage.setItem('__rc', JSON.stringify({ nonSubs: st.rc.nonSubs, n: st.rc.n }));
  cap.PluginHeaders.push({ name: 'Purchases', methods: [
    ...['configure', 'logIn', 'logOut', 'getOfferings', 'purchasePackage', 'restorePurchases', 'getCustomerInfo', 'getProducts', 'purchaseStoreProduct', 'removeCustomerInfoUpdateListener'].map((name) => ({ name, rtype: 'promise' })),
    { name: 'addCustomerInfoUpdateListener', rtype: 'callback' },
  ] });
  const prod = (id, price, priceString) => ({ identifier: id, title: 'Gemas (FrostPom)', description: '', price, priceString, currencyCode: 'USD', productCategory: 'NON_SUBSCRIPTION', productType: 'CONSUMABLE' });
  const PRODUCTS = [prod('gemas_60', 0.99, 'US$ 0,99'), prod('gemas_330', 4.99, 'US$ 4,99'), prod('gemas_700', 9.99, 'US$ 9,99'), prod('gemas_1500', 19.99, 'US$ 19,99')];
  const info = () => ({ entitlements: { active: {}, all: {} }, nonSubscriptionTransactions: st.rc.nonSubs.slice() });
  const fail = (code, message, extra = {}) => Promise.reject(Object.assign(new Error(message), { code, data: { code: Number(code), message, ...extra } }));
  const base = cap.nativePromise;
  cap.nativePromise = (plugin, method, options) => {
    if (plugin !== 'Purchases') return base(plugin, method, options);
    st.calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
    const r = st.rc;
    if (method === 'configure') { r.user = options.appUserID; r.configured = true; return Promise.resolve(); }
    if (!r.configured) return fail('23', 'Purchases must be configured before calling this function');
    if (method === 'getProducts') {
      if (r.offline) return fail('10', 'Error performing request.');
      return Promise.resolve({ products: PRODUCTS.filter((p) => options.productIdentifiers.includes(p.identifier)) });
    }
    if (method === 'purchaseStoreProduct') {
      if (r.buy === 'cancel') return fail('1', 'Purchase was cancelled.', { userCancelled: true });
      if (r.buy === 'pending') return fail('20', 'The payment is pending.');
      const t = { transactionIdentifier: 'GPA.3300-' + (++r.n), productIdentifier: options.product.identifier, purchaseDate: new Date().toISOString() };
      r.nonSubs.push(t); keep();
      return Promise.resolve({ productIdentifier: t.productIdentifier, customerInfo: info(), transaction: t });
    }
    if (method === 'getCustomerInfo') return Promise.resolve({ customerInfo: info() });
    if (method === 'getOfferings') return Promise.resolve({ all: {}, current: null });
    return Promise.resolve({});
  };
})();
"""


def device(browser, fake, native=True, locale='es-CO'):
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)

    def cfg(route):
        resp = route.fetch()
        body = re.sub(r'(ads: Object\.freeze\(\{[\s\S]*?enabled: )false', r'\1true', resp.text(), count=1)
        body = body.replace("revenueCatKey: '',", "revenueCatKey: 'goog_PRUEBA_publica',", 1)
        route.fulfill(response=resp, body=body)
    ctx.route('**/js/config.js', cfg)
    if native:
        ctx.add_init_script(FAKE_CAP)
        ctx.add_init_script(FAKE_ADMOB)
        ctx.add_init_script(FAKE_PURCHASES)
    # Todos los avisos que salieron (aunque ya se hayan ido)
    ctx.add_init_script("""document.addEventListener('DOMContentLoaded', () => {
      const box = document.getElementById('toasts'); window.__toastLog = [];
      if (box) new MutationObserver(() => { for (const n of box.querySelectorAll('.toast')) if (!window.__toastLog.includes(n.textContent)) window.__toastLog.push(n.textContent); })
        .observe(box, { childList: true, subtree: true });
    });""")
    pg = sheets_patch(ctx.new_page())
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.clock.install(time=datetime(2026, 11, 17, 9, 0))
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
        elif 'mascota de regalo' in title(pg) or 'gift pet' in title(pg) or title(pg) in ('FrostPom Premium', 'La prueba gratis de Premium terminó'):
            pg.click('#dlg .dlg__actions button:first-child')
        else:
            pg.click('#dlg .dlg__actions button:last-child')
        pg.wait_for_timeout(300); pg.clock.run_for(400)


def boot(pg, wait=1500):
    # Recarga de verdad (ir a la misma dirección con "#" no recarga la página)
    pg.goto(URL + '#/enfocar')
    pg.reload()
    pg.wait_for_timeout(wait); pg.clock.run_for(5000); pg.wait_for_timeout(400)


def gems(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).progress.gems")


def orders(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).progress.gemOrders || []")


def rc_calls(pg, method):
    return [c for c in pg.evaluate('window.__cap ? window.__cap.calls : []') if c[0] == 'Purchases' and c[1] == method]


def tap_gems(pg):
    close_dialogs(pg)
    pg.click('#hudGems'); pg.wait_for_timeout(400); pg.clock.run_for(600); pg.wait_for_timeout(200)


def settle(pg, ms=1200):
    pg.wait_for_timeout(500); pg.clock.run_for(ms); pg.wait_for_timeout(300)


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. En la web ----------
    ctx, pg, errs = device(browser, FakeSupabase(), native=False)
    boot(pg)
    register(pg, 'web_gem', '2000-05', 'webgem@example.com')
    close_dialogs(pg)
    tap_gems(pg)
    check(title(pg) == '¿Necesitas más gemas?' and pg.query_selector('#dlg .gemhero .rankup__rays') and pg.query_selector('#dlg .gemart'),
          'tocar la gema abre «¿Necesitas más gemas?» con la gema grande y el brillo detrás')
    check(f"Tienes {gems(pg)} gemas" in body(pg).replace('.', ''), 'dice cuántas gemas tienes')
    check(not pg.query_selector('#gemOpt-ad'), 'en la web no hay anuncios')
    buy = pg.query_selector('#gemOpt-buy')
    check(buy and buy.is_disabled() and 'Solo en la app de Android' in buy.inner_text(), 'en la web, comprar dice «Solo en la app de Android» (desactivado)')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-web.png')
    pg.click('#gemOpt-study'); settle(pg, 600)
    check(not dlg_open(pg) and '#/enfocar' in pg.url and 'te da gemas' in toasts(pg), '«Estudiar un pomodoro» cierra la ventana, lleva a Enfocar y lo explica')
    check(pg.evaluate("document.getElementById('mainBtn').classList.contains('is-nudge')"), 'y el botón de empezar salta para que lo encuentres')
    check(not errs, 'web: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- B. Android 13+ con cuenta en línea ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'droid_gem', '2000-05', 'droidgem@example.com')
    close_dialogs(pg)
    boot(pg); close_dialogs(pg)
    tap_gems(pg)
    ad = pg.query_selector('#gemOpt-ad')
    check(ad and 'Ver un anuncio: +10 gemas' in ad.inner_text() and 'Quedan 5 hoy' in ad.inner_text(), 'Android 13+: «Ver un anuncio: +10 gemas» (quedan 5 hoy)')
    buy = pg.query_selector('#gemOpt-buy')
    check(buy and not buy.is_disabled() and 'Google Play' in buy.inner_text(), '«Comprar gemas» está activo')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-android.png')
    g0 = gems(pg)
    pg.click('#gemOpt-ad'); settle(pg)
    check(gems(pg) == g0 + 10 and dlg_open(pg) and 'Quedan 4 hoy' in pg.inner_text('#gemOpt-ad') and f'Tienes {g0 + 10} gemas' in body(pg),
          'ver el anuncio suma 10 gemas sin cerrar la ventana (quedan 4 hoy)')

    # Los paquetes
    pg.click('#gemOpt-buy'); settle(pg, 2000)
    txt = body(pg)
    packs = pg.eval_on_selector_all('#dlg .gempack', 'els => els.map(e => e.id)')
    check(title(pg) == 'Paquetes de gemas' and packs == ['gemPack-gemas_60', 'gemPack-gemas_330', 'gemPack-gemas_700', 'gemPack-gemas_1500'],
          f'«Paquetes de gemas»: los 4, de menor a mayor ({packs})')
    check(all(x in txt for x in ('60 gemas', '330 gemas', '700 gemas', '1.500 gemas', 'US$ 0,99', 'US$ 4,99', 'US$ 9,99', 'US$ 19,99', '+30 de regalo', '+300 de regalo')),
          'cada paquete con sus gemas, las de regalo y el precio de Google')
    check(pg.query_selector('#gemPack-gemas_1500.is-best') and 'Mejor precio' in pg.inner_text('#gemPack-gemas_1500'), '«Mejor precio» en el que da más gemas por cada dólar')
    check(rc_calls(pg, 'getProducts') and rc_calls(pg, 'getProducts')[0][2] == {'productIdentifiers': ['gemas_60', 'gemas_330', 'gemas_700', 'gemas_1500'], 'type': 'NON_SUBSCRIPTION'},
          'a RevenueCat se le piden los 4 productos de una sola compra')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-paquetes.png')
    # Volver con la flecha
    pg.click('#dlgBack'); settle(pg, 600)
    check(title(pg) == '¿Necesitas más gemas?', 'la flecha vuelve a «¿Necesitas más gemas?»')
    # Cancelar: nada
    pg.evaluate("window.__cap.rc.buy = 'cancel'")
    pg.click('#gemOpt-buy'); settle(pg, 2000)
    g1 = gems(pg)
    pg.click('#gemPack-gemas_330'); settle(pg)
    check(gems(pg) == g1 and not dlg_open(pg) and 'pendiente' not in toasts(pg), 'cancelar la compra no suma ni dice nada')
    # Pendiente: avisa
    pg.evaluate("window.__cap.rc.buy = 'pending'")
    tap_gems(pg); pg.click('#gemOpt-buy'); settle(pg, 2000)
    pg.click('#gemPack-gemas_330'); settle(pg)
    check(gems(pg) == g1 and 'pendiente' in toasts(pg), 'pago pendiente: avisa que las gemas llegan solas cuando Google lo confirme')
    # Comprar de verdad
    pg.evaluate("window.__cap.rc.buy = 'ok'")
    tap_gems(pg); pg.click('#gemOpt-buy'); settle(pg, 2000)
    pg.click('#gemPack-gemas_330'); settle(pg, 2000)
    bought = rc_calls(pg, 'purchaseStoreProduct')
    check(bought and bought[-1][2]['product']['identifier'] == 'gemas_330', 'se compra el producto «gemas_330» con Google Play')
    check(gems(pg) == g1 + 330 and title(pg) == '+330 gemas' and '¡Gracias por apoyar FrostPom!' in body(pg), 'llegan las 330 gemas y una ventana de gracias con la gema')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-gracias.png')
    od = orders(pg)
    check(len(od) == 1 and od[0]['tx'] == 'GPA.3300-1' and od[0]['gems'] == 330, f'la compra queda anotada para no sumarla dos veces ({od})')
    close_dialogs(pg)
    # RevenueCat vuelve a avisar de la misma compra: nada
    pg.evaluate("(async () => { const m = await import('./js/ui/gems-ui.js'); await m.reconcileGems(); })()"); settle(pg)
    check(gems(pg) == g1 + 330 and len(orders(pg)) == 1, 'si RevenueCat vuelve a mostrar la misma compra, no se suma otra vez')
    # La gema de la tienda de comida también abre la ventana
    pg.evaluate("document.getElementById('shopBtn').click()"); settle(pg, 600)
    pg.click('.tray-gems'); settle(pg, 600)
    check(title(pg) == '¿Necesitas más gemas?', 'la gema de la tienda de comida también abre «¿Necesitas más gemas?»')
    close_dialogs(pg)

    # ---------- C. Una compra que quedó sin sumar (la app se cerró al pagar) ----------
    pg.evaluate("""(() => {
      const r = JSON.parse(sessionStorage.getItem('__rc') || '{}');
      r.nonSubs = (r.nonSubs || []).concat([{ transactionIdentifier: 'GPA.CERRADA-1', productIdentifier: 'gemas_60', purchaseDate: new Date().toISOString() }]);
      sessionStorage.setItem('__rc', JSON.stringify(r));
      localStorage.setItem('st2_gem_pending', String(Date.now()));
    })()""")
    g2 = gems(pg)
    boot(pg); settle(pg, 3000)
    log = ' | '.join(pg.evaluate('window.__toastLog || []'))
    check(gems(pg) == g2 + 60 and any(o['tx'] == 'GPA.CERRADA-1' for o in orders(pg)) and 'Llegaron 60 gemas' in log,
          f'al abrir la app llegan las 60 gemas de la compra que quedó sin sumar (y lo avisa) [{gems(pg) - g2}]')
    check(pg.evaluate("localStorage.getItem('st2_gem_pending')") is None, 'y ya no queda nada pendiente')
    close_dialogs(pg)
    boot(pg); settle(pg, 3000)
    check(gems(pg) == g2 + 60 and len(orders(pg)) == 2, 'al volver a abrir no se suman otra vez')
    check(not errs, 'Android: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- D. Sin cuenta en línea / menor de 13 ----------
    ctx, pg, errs = device(browser, FakeSupabase())
    boot(pg)
    register(pg, 'local_gem', '2000-05', 'localgem@example.com')
    close_dialogs(pg)
    pg.evaluate("(async () => { const c = await import('./js/ui/context.js'); c.mutate((s) => { delete s.account.online; return {}; }); })()")
    boot(pg); close_dialogs(pg)
    tap_gems(pg)
    pg.click('#gemOpt-buy'); settle(pg)
    check('conecta tu cuenta en línea' in body(pg) and pg.query_selector("#dlg button:has-text('Conectar mi cuenta')") and not rc_calls(pg, 'purchaseStoreProduct'),
          'sin cuenta en línea: pide conectarla para comprar (y no se compra nada)')
    ctx.close()

    ctx, pg, errs = device(browser, FakeSupabase())
    boot(pg)
    register(pg, 'peque_gem', '2015-03')
    close_dialogs(pg)
    tap_gems(pg)
    check(title(pg) == '¿Necesitas más gemas?' and not pg.query_selector('#gemOpt-buy') and not pg.query_selector('#gemOpt-ad') and pg.query_selector('#gemOpt-study'),
          'menor de 13: solo «Estudiar un pomodoro» (ni comprar ni anuncios)')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-menor.png')
    ctx.close()

    # ---------- E. En inglés ----------
    ctx, pg, errs = device(browser, FakeSupabase(), locale='en-US')
    boot(pg)
    register(pg, 'english_gem', '2000-05', 'englishgem@example.com')
    close_dialogs(pg)
    tap_gems(pg)
    check(title(pg) == 'Need more gems?' and 'Study a pomodoro' in body(pg) and 'Buy gems' in body(pg), 'en inglés: «Need more gems?», «Study a pomodoro», «Buy gems»')
    pg.click('#gemOpt-buy'); settle(pg, 2000)
    check(title(pg) == 'Gem packs' and 'Best value' in body(pg) and '+30 bonus' in body(pg), 'en inglés: «Gem packs», «Best value», «+30 bonus»')
    pg.wait_for_timeout(1300); pg.screenshot(path=f'{SHOTS}/gemas-ingles.png')
    check(not errs, 'inglés: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
