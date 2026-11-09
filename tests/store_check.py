"""
Revisión "lista para la tienda" (Microsoft Store / PWABuilder), en un navegador real.

Uso (con la app servida):
    python tests/store_check.py http://localhost:8000/
    python tests/store_check.py https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/      # ya publicada

Opcional: accesibilidad con axe-core (npm install axe-core) o AXE_PATH=/ruta/axe.min.js

Revisa:
  1. Manifiesto sin errores: campos que pide la tienda, íconos y capturas que existen y miden lo que dicen.
  2. Que el navegador la considere instalable (lo mismo que mira Edge/PWABuilder).
  3. Service worker activo, con todo el modo sin conexión guardado (si falta un archivo, falla).
  4. Que abra y funcione sin conexión (también la política de privacidad).
  5. Que ninguna vista pida archivos que no existen (404) ni tenga errores en consola.
  6. Que no haya desplazamiento horizontal en 8 tamaños de ventana (de 360 px a 1920 px).
  7. Accesibilidad (axe-core): sin problemas graves o críticos.
Termina con código 1 si algo falla.
"""
import io, json, os, sys
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
if not URL.endswith("/"): URL += "/"
HERE = os.path.dirname(os.path.abspath(__file__))
AXE = os.environ.get("AXE_PATH") or os.path.join(HERE, "..", "node_modules", "axe-core", "axe.min.js")
VIEWS = ["enfocar", "progreso", "ranking", "perfil", "ajustes"]
SIZES = [(1920, 1080), (1366, 768), (1280, 720), (1024, 768), (800, 600), (500, 800), (390, 844), (360, 640)]
failures, notes = [], []

def check(cond, msg):
    print(("OK   " if cond else "FALLO ") + msg)
    if not cond: failures.append(msg)

def png_size(data):
    try:
        from PIL import Image
        return Image.open(io.BytesIO(data)).size
    except Exception:
        return None

SEED = """async () => {
  const s = { v: 3, createdAt: new Date(Date.now() - 864e5 * 40).toISOString(),
    profile: { nick: 'pingu_estudia', avatar: '🐧', companion: null, country: 'CO', onboarded: true },
    premium: { active: true }, progress: { xp: 800, gems: 40 } };
  const sec = await import('./js/security.js');
  s.account = { username: 'pingu_estudia', ...(await sec.hashPassword('Pingu2026')) };
  localStorage.setItem('st2_state', JSON.stringify(s));
  sessionStorage.setItem('st2_unlocked', '1');
  const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const n of ['paywall_day', 'last_day']) localStorage.setItem('st2_' + n, k);
  localStorage.setItem('st2_motion_hint', '1');
}"""

with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
    browser = p.chromium.launch(**launch)
    # Perfil normal (no incógnito): en incógnito ninguna app se puede instalar.
    import tempfile
    profile_dir = tempfile.mkdtemp(prefix="st-store-")
    ctx = p.chromium.launch_persistent_context(profile_dir, viewport={"width": 1366, "height": 768}, **launch)
    if "localhost" in URL or "127.0.0.1" in URL:
        # En local, el ranking y las cuentas en línea hablan con un Supabase simulado (sin internet)
        sys.path.insert(0, HERE)
        from _fake_supabase import FakeSupabase
        ctx.route("https://*.supabase.co/**", FakeSupabase().handle)
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    errors, missing = [], []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("response", lambda r: missing.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.evaluate(SEED); pg.reload(); pg.wait_for_timeout(1500)

    # 1. Manifiesto
    cdp = ctx.new_cdp_session(pg)
    man = cdp.send("Page.getAppManifest")
    check(not man.get("errors"), "el navegador lee el manifiesto sin errores" + (f": {man.get('errors')}" if man.get("errors") else ""))
    m = json.loads(man.get("data") or "{}")
    murl = man.get("url") or urljoin(URL, "manifest.webmanifest")
    for key in ["id", "name", "short_name", "description", "start_url", "scope", "display", "icons", "background_color", "theme_color", "lang", "screenshots", "categories"]:
        check(key in m, f"manifiesto: tiene '{key}'")
    def fetch(src):
        r = pg.request.get(urljoin(murl, src))
        return r.status, r.body() if r.ok else b""
    for kind in ("icons", "screenshots"):
        for it in m.get(kind, []):
            st, body = fetch(it["src"])
            ok = st == 200
            if ok and it.get("sizes", "any") != "any":
                w, h = map(int, it["sizes"].split("x")); real = png_size(body)
                ok = real is None or real == (w, h)
            check(ok, f"{kind[:-1]} {it['src']} existe y mide {it.get('sizes')}")
    check(any(i.get("purpose") == "maskable" for i in m.get("icons", [])) and any(i.get("sizes") == "512x512" for i in m.get("icons", [])), "manifiesto: ícono 512 y versión 'maskable'")
    for sc in m.get("shortcuts", []):
        check(fetch(sc["icons"][0]["src"])[0] == 200, f"atajo '{sc['short_name']}' con ícono")
    scope = urljoin(murl, m.get("scope", "./"))
    check(urljoin(murl, m.get("start_url", "./")).startswith(scope), "start_url queda dentro del scope")

    # 2. Instalable
    inst = cdp.send("Page.getInstallabilityErrors")
    errs = [e.get("errorId") for e in inst.get("installabilityErrors", [])]
    check(not errs, "el navegador la considera instalable" + (f": {errs}" if errs else ""))

    # 3. Service worker y modo sin conexión
    sw = pg.evaluate("""async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; }""")
    check(sw["active"] and sw["scope"] == scope, f"service worker activo en {sw['scope']}")
    cached = pg.evaluate("""async () => { const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith('frostpom-'))); return (await c.keys()).length; }""")
    check(cached >= 40, f"modo sin conexión guardado ({cached} archivos)")

    # 5. Todas las vistas sin 404 ni errores
    for v in VIEWS:
        pg.goto(URL + "#/" + v); pg.wait_for_timeout(500)
    pg.goto(URL + "#/tienda"); pg.wait_for_timeout(500)
    check(pg.evaluate("!document.getElementById('foodTray').hidden"), "el atajo 'Tienda' abre la bandeja de comida")
    pg.goto(URL + "privacidad.html"); pg.wait_for_timeout(300)
    check("Política de privacidad" in pg.inner_text("h1"), "la política de privacidad abre")
    if "[CORREO DE SOPORTE" in pg.content():
        notes.append("Falta poner tu correo de soporte en privacidad.html (sección 10) antes de publicar.")

    # 4. Sin conexión
    ctx.set_offline(True)
    pg.goto(URL + "#/enfocar"); pg.wait_for_timeout(800)
    check(pg.evaluate("!!document.querySelector('#ring')"), "abre sin conexión")
    pg.goto(URL + "privacidad.html"); pg.wait_for_timeout(300)
    check("Política de privacidad" in pg.inner_text("h1"), "la política de privacidad abre sin conexión")
    ctx.set_offline(False)

    # 6. Tamaños de ventana (sin desplazamiento horizontal)
    for (w, h) in SIZES:
        pg.set_viewport_size({"width": w, "height": h})
        bad = []
        for v in VIEWS:
            pg.goto(URL + "#/" + v); pg.wait_for_timeout(250)
            if pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): bad.append(v)
        check(not bad, f"{w}×{h}: sin desplazamiento horizontal" + (f" (falla en {', '.join(bad)})" if bad else ""))

    # 7. Accesibilidad
    if os.path.exists(AXE):
        axe_src = open(AXE, encoding="utf-8").read()
        actx = browser.new_context(viewport={"width": 1366, "height": 768}, bypass_csp=True)
        ap = actx.new_page(); ap.goto(URL); ap.wait_for_timeout(500); ap.evaluate(SEED)
        serious = {}
        for (w, h) in [(1366, 768), (390, 844)]:
            ap.set_viewport_size({"width": w, "height": h})
            for v in VIEWS:
                ap.goto(URL + "#/" + v); ap.wait_for_timeout(700)
                ap.add_script_tag(content=axe_src)
                res = ap.evaluate("""async () => (await axe.run(document, { resultTypes: ['violations'] })).violations
                    .filter(v => v.impact === 'serious' || v.impact === 'critical')
                    .map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ej: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))""")
                for r in res: serious.setdefault(r["id"], []).append(f"{v}@{w}: {r['n']} ({'; '.join(r['ej'])})")
        for k, where in serious.items(): print(f"      axe {k}: {' | '.join(where[:3])}")
        check(not serious, "accesibilidad (axe): sin problemas graves ni críticos")
        actx.close()
    else:
        notes.append("Accesibilidad: instala axe-core (npm install axe-core) para revisarla.")

    check(not missing, "ningún archivo pedido falta (404)" + (": " + " | ".join(missing[:5]) if missing else ""))
    check(not [e for e in errors if "ERR_INTERNET_DISCONNECTED" not in e], "sin errores en consola" + (": " + " | ".join(errors[:3]) if errors else ""))
    ctx.close()
    browser.close()

for n in notes: print("NOTA " + n)
print("\n" + ("Lista para la tienda." if not failures else f"{len(failures)} fallo(s)."))
sys.exit(1 if failures else 0)
