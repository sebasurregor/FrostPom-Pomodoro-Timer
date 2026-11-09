"""
FrostPom — prueba del cobro de Premium con Microsoft Store (simulado).
Se cambia config.js para encender el cobro y se finge la Digital Goods API de Edge:
no se cobra nada de verdad.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_cobro.py http://localhost:8000/
"""
import os
import sys

from playwright.sync_api import sync_playwright
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _classic import classic, classic_text

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
failures = []


def check(cond, msg):
    print(("OK   " if cond else "FALLO ") + msg)
    if not cond:
        failures.append(msg)


# Finge la tienda: precio, compra y lista de compras (se puede cambiar con window.__owned)
FAKE_STORE = """
(() => {
  const owned = () => JSON.parse(localStorage.getItem('__owned') || '[]');
  window.__payments = 0;
  window.getDigitalGoodsService = async (method) => {
    if (method !== 'https://store.microsoft.com/billing') throw new Error('método desconocido');
    return {
      getDetails: async (ids) => ids.map((id) => ({ itemId: id, title: 'FrostPom Premium', price: { currency: 'USD', value: '2.99' } })),
      listPurchases: async () => owned().map((id) => ({ itemId: id, purchaseToken: 'tok-' + id })),
    };
  };
  window.PaymentRequest = class {
    constructor(methods) { this.sku = methods[0].data.sku; this.method = methods[0].supportedMethods; }
    async show() {
      if (localStorage.getItem('__cancel') === '1') { const e = new Error('cancelado'); e.name = 'AbortError'; throw e; }
      window.__payments += 1;
      localStorage.setItem('__owned', JSON.stringify([this.sku]));
      return { details: { purchaseToken: 'tok-' + this.sku }, complete: async () => {} };
    }
  };
})();
"""


def enable_charges(route):
    resp = route.fetch()
    body = classic_text(resp.text()).replace("chargesEnabled: false", "chargesEnabled: true")
    route.fulfill(response=resp, body=body)


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
    browser = p.chromium.launch(**launch)

    # 1) Dentro de la tienda (con la API)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="es-CO", service_workers="block")
    ctx.route("**/js/config.js", enable_charges)
    ctx.add_init_script(FAKE_STORE)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.fill("#accUser", "pingu_cobro"); pg.fill("#accPass1", "Pingu2026"); pg.fill("#accPass2", "Pingu2026")
    pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(600)

    pg.click("#hudCrown"); pg.wait_for_timeout(700)
    txt = pg.inner_text("#dlg")
    check("Suscribirme" in txt and "2,99" in txt, "el botón muestra el precio que da la tienda")
    check("Probar Premium gratis" not in txt, "con cobro real ya no se ofrece la prueba gratis")
    pg.evaluate("localStorage.setItem('__cancel', '1')")
    pg.click("#dlg button:has-text('Suscribirme')"); pg.wait_for_timeout(600)
    check(not state(pg)["premium"]["active"], "si se cancela el pago, no se activa Premium")
    pg.evaluate("localStorage.removeItem('__cancel')")
    gems = state(pg)["progress"]["gems"]
    pg.click("#hudCrown"); pg.wait_for_timeout(700)
    pg.click("#dlg button:has-text('Suscribirme')"); pg.wait_for_timeout(1200)
    st = state(pg)
    check(st["premium"]["active"] and pg.evaluate("window.__payments") == 1, "al pagar se activa Premium")
    check(st["progress"]["gems"] == gems + 1000, "llega el regalo de 1000 gemas")
    check("Tu regalo" in pg.inner_text("#dlg"), "aparece la ceremonia del regalo")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    if pg.evaluate("document.getElementById('dlg').open"):
        pg.click("#dlg button:has-text('Luego')"); pg.wait_for_timeout(400)

    pg.click("#hudCrown"); pg.wait_for_timeout(600)
    check("Administrar suscripción" in pg.inner_text("#dlg") and "Desactivar prueba" not in pg.inner_text("#dlg"), "siendo Premium se ofrece administrar la suscripción")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # La suscripción se cancela en la cuenta de Microsoft: al volver a abrir, Premium se quita solo
    pg.evaluate("localStorage.setItem('__owned', '[]')")
    pg.reload(); pg.wait_for_timeout(1000)
    pg.fill("#loginPass", "Pingu2026") if pg.evaluate("!!document.querySelector('#dlg[open] #loginPass')") else None
    if pg.evaluate("!!document.querySelector('#dlg[open] #loginPass')"):
        pg.click("#dlg button:has-text('Entrar')"); pg.wait_for_timeout(1200)
    pg.wait_for_timeout(500)
    check(not state(pg)["premium"]["active"], "si la suscripción ya no está, Premium se desactiva al abrir")
    check(state(pg)["progress"]["gems"] == gems + 1000, "las gemas del regalo se quedan (el regalo es una sola vez)")
    pg.evaluate("localStorage.setItem('__owned', JSON.stringify(['frostpom_premium_mensual']))")
    pg.reload(); pg.wait_for_timeout(1500)
    check(state(pg)["premium"]["active"], "si la tienda dice que está activa, Premium vuelve solo")
    check(not errors, "sin errores en la página" + (f": {errors}" if errors else ""))
    ctx.close()

    # 2) En el navegador normal (sin la API): no se puede comprar
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 800}, locale="es-CO", service_workers="block")
    ctx2.route("**/js/config.js", enable_charges)
    pg2 = ctx2.new_page()
    pg2.goto(URL); pg2.wait_for_timeout(800)
    pg2.fill("#accUser", "pingu_web"); pg2.fill("#accPass1", "Pingu2026"); pg2.fill("#accPass2", "Pingu2026")
    pg2.click("#dlg button:has-text('Crear cuenta')"); pg2.wait_for_timeout(1500)
    pg2.click("#dlg button:has-text('Ahora no')"); pg2.wait_for_timeout(600)
    pg2.click("#hudCrown"); pg2.wait_for_timeout(700)
    t2 = pg2.inner_text("#dlg")
    check("instala FrostPom desde Microsoft Store" in t2 and "Suscribirme" not in t2, "en el navegador se explica que se compra en Microsoft Store")
    ctx2.close()
    browser.close()

print("\nTodo bien." if not failures else f"\n{len(failures)} fallos.")
sys.exit(1 if failures else 0)
