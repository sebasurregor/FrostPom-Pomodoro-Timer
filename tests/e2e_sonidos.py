"""
FrostPom — sonidos de concentración grabados (v4.0.2).

Comprueba en un Chrome real que:
  - cada grabación se descarga, se decodifica y suena en bucle entre loopStart y loopEnd;
  - en la unión del bucle hay el mismo sonido a los dos lados (no se oye el corte), también con
    el decodificador de MP3 del navegador;
  - "Lluvia y pájaros" aparece, es Premium y en inglés se llama "Rain and birds";
  - sin internet y sin la grabación descargada, suena la versión generada (nunca queda mudo);
  - Viento polar y Ruido rosa se siguen generando en el dispositivo.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_sonidos.py http://localhost:8000/
"""
import os, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _classic import classic

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


# Anota cada sonido que empieza (duración del audio, bucle) y guarda la última grabación decodificada
SPY = """
(() => {
  window.__starts = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    const b = this.buffer;
    window.__starts.push({ dur: b ? b.duration : 0, ch: b ? b.numberOfChannels : 0, loop: this.loop,
      ls: this.loopStart, le: this.loopEnd, offset: a[1] || 0 });
    return start.apply(this, a);
  };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (data, ok, fail) {
    const p = decode.call(this, data);
    p.then((buf) => { window.__lastBuffer = buf; ok && ok(buf); }, (e) => { fail && fail(e); });
    return p;
  };
})();
"""

# Nombre del chip, id, duración del archivo (bucle + 1 s antes + 1 s después), fin del bucle
RECORDED = [
    ('Ruido blanco', 'blanco', 32, 31),
    ('Lluvia', 'lluvia', 62, 61),
    ('Ruido marrón', 'marron', 32, 31),
    ('Olas del mar', 'olas', 93, 92),
    ('Fogata', 'fogata', 40.5, 39.5),
    ('Lluvia y pájaros', 'pajaros', 92, 91),
]

# En la unión del bucle: ¿el sonido de los dos lados es el mismo? (el error más bajo debe estar
# justo en la unión, sin desfase)
SEAM = """
(le) => {
  const b = window.__lastBuffer; const sr = b.sampleRate; const x = b.getChannelData(0);
  const s = Math.round(1 * sr), e = Math.round(le * sr), w = 2048;
  const err = (lag) => { let d = 0, a = 0; for (let i = -w; i < w; i++) { const u = x[s + i], v = x[e + i + lag]; d += (u - v) ** 2; a += u * u; } return Math.sqrt(d / a); };
  let best = 0, bestErr = Infinity;
  for (let lag = -40; lag <= 40; lag++) { const v = err(lag); if (v < bestErr) { bestErr = v; best = lag; } }
  return { lag: best, err: err(0), errFar: err(37) };
}
"""


def wait_start(pg, n, timeout=8000):
    """Espera a que empiece un sonido nuevo (la grabación tarda un poco en bajar y decodificarse)."""
    for _ in range(timeout // 100):
        if pg.evaluate('window.__starts.length') > n:
            return pg.evaluate('window.__starts[window.__starts.length - 1]')
        pg.wait_for_timeout(100)
    return None


def new_device(browser, locale='es-CO'):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale=locale, service_workers='block')
    ctx.route('**/js/config.js', classic)
    ctx.add_init_script(SPY)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, pg, errs


def register(pg, user, create='Crear cuenta', later='Ahora no'):
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.fill('#accUser', user); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    pg.click(f"#dlg button:has-text('{create}')"); pg.wait_for_timeout(1200)
    pg.click(f"#dlg button:has-text('{later}')"); pg.wait_for_timeout(800)
    for _ in range(5):
        if not pg.evaluate("document.getElementById('dlg').open"):
            break
        pg.click('#dlg .dlg__actions button:last-child'); pg.wait_for_timeout(400)


def make_premium(pg):
    pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('st2_state')); s.premium.active = true; s.premium.giftPending = false;
        localStorage.setItem('st2_state', JSON.stringify(s)); }""")
    pg.reload(); pg.wait_for_timeout(1200)
    for _ in range(5):
        if not pg.evaluate("document.getElementById('dlg').open"):
            break
        pg.click('#dlg .dlg__actions button:last-child'); pg.wait_for_timeout(400)


def chip(name):
    return f"#ambientGrid .sound-chip:has(.sound-chip__name:text-is('{name}'))"


with sync_playwright() as p:
    args = ['--autoplay-policy=no-user-gesture-required']
    browser = p.chromium.launch(args=args, **({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- Sin Premium: el sonido nuevo aparece con su corona ----------
    ctx, pg, errs = new_device(browser)
    register(pg, 'oye_sonidos')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    names = pg.evaluate("[...document.querySelectorAll('#ambientGrid .sound-chip__name')].map(n => n.textContent)")
    check('Lluvia y pájaros' in names, 'aparece el sonido nuevo "Lluvia y pájaros"')
    check('is-locked' in (pg.get_attribute(chip('Lluvia y pájaros'), 'class') or ''), '"Lluvia y pájaros" es Premium (con corona)')
    n = pg.evaluate('window.__starts.length')
    pg.click(chip('Lluvia')); st = wait_start(pg, n)
    check(st and st['loop'] and abs(st['dur'] - 62) < 0.2, 'sin Premium, "Lluvia" ya suena con la grabación nueva')

    # ---------- Con Premium: todas las grabaciones ----------
    make_premium(pg)
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    for name, sid, dur, le in RECORDED:
        n = pg.evaluate('window.__starts.length')
        pg.click(chip(name)); st = wait_start(pg, n)
        ok = st and st['loop'] and abs(st['dur'] - dur) < 0.2 and abs(st['ls'] - 1) < 1e-6 and abs(st['le'] - le) < 1e-6 and abs(st['offset'] - 1) < 1e-6
        check(ok, f'"{name}": suena la grabación en bucle (de 1 s a {le} s de {dur} s)' + ('' if ok else f' → {st}'))
        seam = pg.evaluate(SEAM, le)
        check(seam['lag'] == 0 and seam['err'] < seam['errFar'], f'"{name}": la unión del bucle calza (desfase {seam["lag"]}, diferencia {seam["err"]:.2f} vs {seam["errFar"]:.2f} si estuviera corrida)')
        check(pg.evaluate(f"JSON.parse(localStorage.getItem('st2_state')).settings.ambient") == sid, f'"{name}" queda elegido')
        pg.wait_for_timeout(300)
    # Los generados siguen igual
    for name in ['Viento polar', 'Ruido rosa']:
        n = pg.evaluate('window.__starts.length')
        pg.click(chip(name)); st = wait_start(pg, n, 3000)
        check(st and st['loop'] and abs(st['dur'] - 4) < 0.01, f'"{name}" se sigue generando en el dispositivo')
    check(not errs, 'sin errores' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ---------- Sin internet y sin la grabación: suena la versión generada ----------
    ctx, pg, errs = new_device(browser)
    register(pg, 'sin_red')
    make_premium(pg)
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    ctx.route('**/assets/sounds/**', lambda route: route.abort('internetdisconnected'))
    for name in ['Olas del mar', 'Lluvia y pájaros']:
        n = pg.evaluate('window.__starts.length')
        pg.click(chip(name)); st = wait_start(pg, n, 4000)
        check(st and st['loop'] and abs(st['dur'] - 4) < 0.01, f'"{name}" sin internet: suena la versión generada (no queda mudo)')
    check(not errs, 'sin errores sin internet' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ---------- En inglés ----------
    ctx, pg, errs = new_device(browser, 'en-US')
    register(pg, 'hear_sounds', 'Create account', 'Not now')
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(600)
    names = pg.evaluate("[...document.querySelectorAll('#ambientGrid .sound-chip__name')].map(n => n.textContent)")
    check('Rain and birds' in names and 'Lluvia y pájaros' not in names, f'en inglés se llama "Rain and birds" ({", ".join(names)})')
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
