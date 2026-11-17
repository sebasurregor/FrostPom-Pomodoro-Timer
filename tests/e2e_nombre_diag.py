"""
FrostPom v4.8.2 — (1) el nombre escondido en el ranking (decisión del autor, opción a: con un nombre
NUEVO vuelve a aparecer) y (2) el diagnóstico de Ajustes → Acerca de en la app de Android.

Comprueba que:
  A. Si los reportes o la moderación escondieron tu nombre, al abrir la app sale "Tu nombre está
     oculto en el ranking" con "Ahora no" (una vez al día); al elegir otro, vuelves a aparecer.
  B. Si el dueño prohibió una palabra después (el servidor dice "blocked"), hay que elegir otro.
  C. Ajustes → Acerca de dice si la app trae el reproductor y los widgets, cómo están los anuncios
     (listos de prueba / la app se compiló sin AdMob) y Google Play. En la web no sale.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_nombre_diag.py http://localhost:8000/
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




def uid_by_name(fake, name):
    return next((k for k, p in fake.profiles.items() if p['username'].lower() == name.lower()), None)


def open_about(pg):
    close_dialogs(pg)
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(300); pg.clock.run_for(600); pg.wait_for_timeout(300)
    return pg.evaluate("(() => { const r = document.getElementById('diagRow'); return r && !r.hidden ? document.getElementById('diagText').textContent : ''; })()")


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Escondido por reportes: aviso amable, "Ahora no" y nombre nuevo ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, native=False)
    boot(pg)
    register(pg, 'nombre.reportado', '2000-05', 'rep@example.com')
    close_dialogs(pg)
    uid = uid_by_name(fake, 'nombre.reportado')
    check(uid, 'la cuenta entró al ranking')
    fake.profiles[uid]['hidden'] = True
    fake.reports.append(('seed0', uid, 'ofensivo'))
    boot(pg)
    check(title(pg) == 'Tu nombre está oculto en el ranking' and 'reportaron el nombre nombre.reportado' in body(pg),
          'escondido por reportes: al abrir la app sale «Tu nombre está oculto en el ranking»')
    check(pg.query_selector("#dlg button:has-text('Ahora no')"), 'y se puede dejar para después («Ahora no»)')
    pg.wait_for_timeout(1000); pg.screenshot(path=f'{SHOTS}/nombre-oculto.png')
    pg.click("#dlg button:has-text('Ahora no')"); settle(pg, 600)
    check(not dlg_open(pg), '«Ahora no» cierra la ventana')
    boot(pg)
    check(title(pg) != 'Tu nombre está oculto en el ranking', 'el mismo día no vuelve a insistir')
    # Otro día: elige otro nombre y vuelve a aparecer
    pg.evaluate("localStorage.removeItem('st2_name_hidden_asked')")
    boot(pg)
    check(title(pg) == 'Tu nombre está oculto en el ranking', 'al otro día lo vuelve a ofrecer')
    pg.fill('#accUser', 'nombre.amable')
    pg.click("#dlg button:has-text('Guardar')"); pg.wait_for_timeout(800); pg.clock.run_for(1200); pg.wait_for_timeout(300)
    prof = fake.profiles[uid]
    check(not dlg_open(pg) and prof['username'] == 'nombre.amable' and not prof.get('hidden'),
          'con un nombre NUEVO vuelve a aparecer en el ranking (opción a)')
    check(not [r for r in fake.reports if r[1] == uid], 'y sus reportes viejos se borran')
    check(pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).account.username") == 'nombre.amable', 'la cuenta queda con el nombre nuevo')
    check(open_about(pg) == '', 'en la web no sale el diagnóstico de Android')
    check(not errs, 'A: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- B. Palabra prohibida después: hay que elegir otro ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, native=False)
    boot(pg)
    register(pg, 'nombre.vetado', '2000-05', 'vet@example.com')
    close_dialogs(pg)
    uid = uid_by_name(fake, 'nombre.vetado')
    fake.profiles[uid]['blocked'] = True
    fake.profiles[uid]['hidden'] = True
    boot(pg)
    check(title(pg) == 'Elige un nombre nuevo' and 'ya no está permitido' in body(pg), 'palabra prohibida después: «Elige un nombre nuevo»')
    check(not pg.query_selector("#dlg button:has-text('Ahora no')"), 'y no se puede dejar para después')
    fake.profiles[uid].pop('blocked')
    pg.fill('#accUser', 'nombre.limpio')
    pg.click("#dlg button:has-text('Guardar')"); pg.wait_for_timeout(800); pg.clock.run_for(1200); pg.wait_for_timeout(300)
    check(not dlg_open(pg) and fake.profiles[uid]['username'] == 'nombre.limpio' and not fake.profiles[uid].get('hidden'), 'con otro nombre vuelve a aparecer')
    check(not errs, 'B: sin errores' + (': ' + ' | '.join(errs[:3]) if errs else ''))
    ctx.close()

    # ---------- C. Diagnóstico en la app de Android ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    boot(pg)
    register(pg, 'droid_diag', '2000-05', 'diag@example.com')
    close_dialogs(pg); boot(pg)
    txt = open_about(pg)
    check('Diagnóstico:' in txt and 'reproductor y widgets ✗' in txt and 'anuncios: listos (de prueba)' in txt and 'Google Play ✓' in txt,
          f'Android: el diagnóstico dice reproductor ✗ (esta prueba no lo trae), anuncios listos de prueba y Google Play ✓ ({txt})')
    pg.wait_for_timeout(500); pg.screenshot(path=f'{SHOTS}/diagnostico.png')
    ctx.close()
    # Sin el complemento de AdMob en la app
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', service_workers='block')
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)
    ctx.add_init_script(FAKE_CAP)
    pg = sheets_patch(ctx.new_page())
    pg.clock.install(time=datetime(2026, 11, 17, 9, 0))
    boot(pg)
    register(pg, 'droid_sin', '2000-05', 'sin@example.com')
    close_dialogs(pg); boot(pg)
    txt = open_about(pg)
    check('anuncios: la app se compiló sin AdMob' in txt and 'Google Play ✗' in txt, f'sin AdMob en la app, el diagnóstico lo dice ({txt})')
    ctx.close()

    browser.close()

bad = [m for ok, m in results if not ok]
print()
print('Todo bien.' if not bad else f'{len(bad)} fallas.')
sys.exit(1 if bad else 0)
