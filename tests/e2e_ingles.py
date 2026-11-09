"""
FrostPom — la app en inglés: recorre todas las vistas y diálogos con el navegador en inglés
y avisa si queda texto en español (frases que faltan en js/i18n-en.js).

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_ingles.py http://localhost:8000/
"""
import os, sys, re, json, tempfile
from playwright.sync_api import sync_playwright
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _classic import classic, classic_text
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
OUT = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='frostpom-en-')
IGNORE = {'Español', 'FrostPom necesita JavaScript para funcionar.'}
SPANISH = re.compile(r"[áéíóúñ¿¡]|\b(de|la|el|los|las|tu|tus|para|con|sin|que|una|uno|hoy|días|sesión|sesiones|estudio|estudiar|minutos|gemas|correo|contraseña|cuenta|ahora|más|menos|aquí|cuando|toca|elige|ver|polo|racha|temporada|logro|logros|mascota|compañero|descanso|ajustes|perfil|genial|luego|listo|vale|bien|nuevo|nueva|elegir|probar|gratis)\b", re.I)
JS = r"""() => {
  const out = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement; if (!el || el.closest('script,style,[hidden],.scenery')) continue;
    const v = n.nodeValue.trim(); if (v) out.add(v);
  }
  for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) for (const a of ['aria-label','title','placeholder','alt']) { const v = el.getAttribute(a); if (v) out.add('@'+a+': '+v); }
  out.add('@title: ' + document.title);
  return [...out];
}"""
found = {}
def grab(pg, where):
    for t in pg.evaluate(JS):
        if SPANISH.search(t) and t not in found and not any(i in t for i in IGNORE): found[t] = where
with sync_playwright() as p:
    b = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
    ctx = b.new_context(viewport={'width':1280,'height':900}, locale='en-US')
    ctx.route('**/js/config.js', classic)
    ctx.route("https://*.supabase.co/auth/v1/**", lambda r: r.fulfill(status=200, content_type='application/json', body='{}'))
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    grab(pg, 'onboarding'); pg.screenshot(path=OUT+'/onboarding.png')
    pg.fill('#accUser','pingu_test'); pg.fill('#accPass1','Pingu2026'); pg.fill('#accPass2','Pingu2026'); pg.fill('#accEmail','pingu@example.com')
    pg.click("#dlg button:has-text('Create account')"); pg.wait_for_timeout(1500)
    grab(pg, 'photo'); pg.screenshot(path=OUT+'/photo.png')
    pg.click("#dlg button:has-text('Not now')"); pg.wait_for_timeout(800)
    for route in ['enfocar','progreso','ranking','perfil','ajustes']:
        pg.goto(URL+'#/'+route); pg.wait_for_timeout(900); grab(pg, route)
        pg.screenshot(path=OUT+f'/{route}.png', full_page=True)
    pg.goto(URL+'#/enfocar'); pg.wait_for_timeout(500)
    pg.click('#shopBtn'); pg.wait_for_timeout(600); grab(pg,'tray'); pg.screenshot(path=OUT+'/tray.png')
    pg.click('#trayClose'); pg.wait_for_timeout(300)
    pg.click('#mainBtn'); pg.wait_for_timeout(1500); grab(pg,'running'); pg.screenshot(path=OUT+'/running.png')
    pg.click('#mainBtn'); pg.wait_for_timeout(300)
    pg.click('#hudCrown'); pg.wait_for_timeout(700); grab(pg,'premium'); pg.screenshot(path=OUT+'/premium.png')
    # activar la prueba: ceremonia del regalo, elegir mascota y la ventana "Eres Premium"
    pg.click("#dlg button:has-text('Try Premium for free')"); pg.wait_for_timeout(1500)
    for i in range(6):
        if not pg.is_visible('#dlg'): break
        grab(pg, f'premium-on-{i}'); pg.screenshot(path=OUT+f'/premium-on-{i}.png')
        later = pg.query_selector("#dlg button:has-text('Later')")
        (later or pg.query_selector('#dlg .dlg__actions button:last-child')).click(); pg.wait_for_timeout(900)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.click('#hudCrown'); pg.wait_for_timeout(700); grab(pg,'premium-active'); pg.screenshot(path=OUT+'/premium-active.png')
    btns = pg.eval_on_selector_all('#dlg .dlg__actions button', 'b => b.map(x => x.textContent.trim())')
    assert 'Awesome' in btns, btns
    pg.click("#dlg button:has-text('Choose pet')"); pg.wait_for_timeout(700); grab(pg,'gift'); pg.screenshot(path=OUT+'/gift.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.goto(URL+'#/perfil'); pg.wait_for_timeout(600)
    pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.wait_for_timeout(300); grab(pg,'perfil-open')
    b2 = pg.query_selector('.badge'); 
    if b2: b2.click(); pg.wait_for_timeout(300); grab(pg,'badge')
    # login + forgot
    pg.evaluate("sessionStorage.clear(); localStorage.removeItem('st2_remember')"); pg.reload(); pg.wait_for_timeout(1000)
    grab(pg,'login'); pg.screenshot(path=OUT+'/login.png')
    pg.click('#forgotBtn'); pg.wait_for_timeout(500); grab(pg,'forgot1')
    pg.fill('#fpMail','pingu@example.com'); pg.click("#dlg button:has-text('Send me the code')"); pg.wait_for_timeout(800)
    grab(pg,'forgot2'); pg.screenshot(path=OUT+'/forgot2.png')
    b.close()
for k, v in found.items(): print(f"EN ESPAÑOL ({v}): {k}")
for e in errs: print("ERROR DE LA PÁGINA:", e)
print(f"Capturas en inglés: {OUT}")
ok = not found and not errs
print("\nTodo en inglés." if ok else f"\n{len(found)} textos sin traducir, {len(errs)} errores.")
sys.exit(0 if ok else 1)
