"""
FrostPom v4.5.2 — la racha se ve: el fuego que se enciende, crece y se congela.

Comprueba que:
  - sin estudiar hoy, el fuego del HUD y de la tarjeta de la racha está congelado; al estudiar, se enciende;
  - el primer día de una racha sale la vista del fuego encendiéndose con "+1 día de racha";
  - a los 5 días (un hito) sale la vista con el fuego más grande; los demás días, solo un aviso;
  - si la racha se apagó ayer, al abrir la app sale tu compañero triste con el fuego congelado, y se
    puede revivir con gemas (sin gemas suficientes lo explica); los días que faltaron quedan congelados;
  - la vista sale una sola vez, y después se puede revivir desde Progreso;
  - si faltaron 3 días, ya no se ofrece; los anuncios todavía están apagados (no hay botón);
  - el día "congelado" del calendario usa el dibujo nuevo, en español y en inglés.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_racha.py http://localhost:8000/
"""
import os, re, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
SHOTS = '/tmp/claude-0/gs/vis'
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


# Los días se calculan EN la página (hora local del navegador), igual que la app
SEED = """([days, gems, extra]) => {
  const key = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const daily = {};
  for (const [off, sec, frozen] of days) daily[key(off)] = { studySec: sec, creditedSec: sec, sessions: sec ? 1 : 0, partials: 0, breaks: 0, xp: 0, noPauseSessions: 0, frozen: frozen || 0 };
  const s = {
    v: 4, createdAt: new Date(Date.now() - 40 * 864e5).toISOString(),
    profile: { nick: 'pingu_racha', avatar: '🐧', companion: 'pinguino', country: 'CO', onboarded: true },
    progress: { xp: 300, gems, gifted: [] }, daily, settings: { reduceMotion: true, ...(extra || {}) },
  };
  localStorage.clear();
  localStorage.setItem('st2_state', JSON.stringify(s));
  sessionStorage.setItem('st2_acc_later', '1');
  localStorage.setItem('st2_motion_hint', '1');
  localStorage.setItem('st2_board', JSON.stringify({ asked: true, noticed: true }));
}"""

STUDY = """async () => {
  const ctx = await import('./js/ui/context.js');
  const E = await import('./js/engine.js');
  const end = Date.now();
  const rec = { mode: 'study', completed: true, plannedSec: 1500, actualSec: 1500, startedAt: new Date(end - 1500e3).toISOString(), endMs: end, endedAt: new Date(end).toISOString(), pauses: 0 };
  ctx.mutate((s) => E.applyRecord(s, rec, { todayKey: ctx.today() }));
}"""


def open_app(browser, days, gems=140, locale='es-CO', route='#/enfocar', width=412, height=900, theme='light'):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, locale=locale, service_workers='block', color_scheme=theme)
    fake = FakeSupabase()
    ctx.route(f'{SUPA}/**', fake.handle)
    ctx.route_web_socket(re.compile(r'^wss://[^/]*supabase\.co/realtime/'), fake.ws_connect)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + route)
    pg.evaluate(SEED, [days, gems, {}])
    pg.reload()
    pg.wait_for_timeout(1200)
    return ctx, pg, errs


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? (document.getElementById('dlgTitle')?.textContent || '') : ''")


def dlg_text(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlg').innerText : ''")


def wait_dlg(pg):
    # Antes salen los otros premios (XP, logros, subir de rango): la vista de la racha va al final
    for _ in range(40):
        if pg.query_selector('#dlg.dlg--streak[open]'):
            break
        if pg.query_selector('#dlg[open]:not(.dlg--streak)'):
            pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(1300)  # la llama termina de encenderse


def saved(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Primer día: el fuego se enciende ----------
    ctx, pg, errs = open_app(browser, [])
    check(not title(pg), 'sin racha que revivir, al abrir no sale ninguna vista')
    check('fuego-congelado' in pg.get_attribute('#hudStreak .pic', 'src'), 'sin estudiar hoy, el fuego del HUD está congelado')
    pg.evaluate(STUDY); wait_dlg(pg)
    txt = dlg_text(pg)
    check(pg.query_selector('#dlg.dlg--streak') and '¡Encendiste tu racha!' in txt and '+1 día de racha' in txt and '1 día' in title(pg),
          'el primer día sale la vista del fuego encendiéndose con «+1 día de racha»')
    check(pg.query_selector('#dlg .sfire.sfire--t0.is-lighting .sfire__main svg path.sfire__body'), 'la llama es el dibujo vectorial de la fogata (se enciende)')
    check(len(pg.query_selector_all('#dlg .streak-track__step')) == 6 and len(pg.query_selector_all('#dlg .streak-track__step.is-on')) == 1, 'las metas 1 · 5 · 10 · 20 · 50 · 100, con la primera lograda')
    pg.screenshot(path=f'{SHOTS}/racha-dia1.png')
    pg.click('#dlg [data-primary]'); pg.wait_for_timeout(500)
    check('fuego.png' in pg.get_attribute('#hudStreak .pic', 'src') and 'fuego-congelado' not in pg.get_attribute('#hudStreak .pic', 'src'), 'después de estudiar, el fuego del HUD se enciende')
    pg.evaluate(STUDY); pg.wait_for_timeout(700)
    check(not title(pg), 'otro pomodoro el mismo día no vuelve a mostrar la vista')
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # ---------- B. Día 5: el fuego crece; día 3: solo un aviso ----------
    ctx, pg, errs = open_app(browser, [[-4, 1500], [-3, 1500], [-2, 1500], [-1, 1500]], theme='dark')
    pg.evaluate(STUDY); wait_dlg(pg)
    txt = dlg_text(pg)
    check('¡Tu fuego creció!' in txt and '5 días' in title(pg) and 'Próxima meta: 10 días' in txt and pg.query_selector('#dlg .sfire.sfire--t1'),
          'a los 5 días sale la vista con el fuego más grande y la próxima meta')
    pg.screenshot(path=f'{SHOTS}/racha-dia5-oscuro.png')
    pg.click('#dlg [data-primary]'); pg.wait_for_timeout(300)
    ctx.close()
    ctx, pg, errs = open_app(browser, [[-2, 1500], [-1, 1500]])
    pg.evaluate("window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.toast')) if (!window.__toasts.includes(t.textContent)) window.__toasts.push(t.textContent); }).observe(document.getElementById('toasts'), { childList: true })")
    pg.evaluate(STUDY)
    for _ in range(20):
        if pg.query_selector('#dlg[open]:not(.dlg--streak)'):
            pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(200)
    toast = ' | '.join(pg.evaluate('window.__toasts'))
    check(not pg.query_selector('#dlg.dlg--streak[open]') and '+1 día de racha: llevas 3 días seguidos.' in toast, f'los demás días solo sale un aviso: "{toast[:60]}"')
    ctx.close()
    # Un hito grande (100 días): el fuego más grande, dorado
    ctx, pg, errs = open_app(browser, [[-d, 1500] for d in range(1, 100)], width=360, height=640)
    pg.evaluate(STUDY); wait_dlg(pg)
    check('100 días' in title(pg) and pg.query_selector('#dlg .sfire.sfire--t5 .sfire__side--l2'), 'a los 100 días, el fuego más grande (con más llamas)')
    fits = pg.evaluate("(() => { const b = document.querySelector('#dlg .dlg__box').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; })()")
    check(fits, 'en un celular pequeño (360 × 640), la vista cabe a lo ancho')
    pg.screenshot(path=f'{SHOTS}/racha-dia100-360.png')
    ctx.close()

    # ---------- C. La racha se apagó ayer: tu compañero triste y revivirla ----------
    ctx, pg, errs = open_app(browser, [[-4, 1500], [-3, 1500], [-2, 1500]], gems=140)
    txt = dlg_text(pg)
    check(title(pg) == 'Tu racha se apagó' and 'Tenías 3 días seguidos' in txt and 'volverías a tener 4 días' in txt, 'al abrir, sale la vista de la racha apagada')
    check(pg.query_selector('#dlg .streak-lost__pet .psprite--pinguino-llora.is-llorando') and pg.query_selector('#dlg img.streak-lost__fire[src*="fuego-congelado-lg"]'),
          'con tu compañero llorando y el fuego congelado')
    check(not pg.query_selector("#dlg button:has-text('anuncio')"), 'los anuncios todavía están apagados: no hay botón de anuncio')
    pg.screenshot(path=f'{SHOTS}/racha-apagada.png')
    pg.click("#dlg button:has-text('Revivir por 100 gemas')"); pg.wait_for_timeout(700)
    st = saved(pg)
    frozen = [k for k, d in st['daily'].items() if d.get('frozen')]
    check(not title(pg) and st['progress']['gems'] == 40 and len(frozen) == 1, 'revivir cuesta 100 gemas y congela el día que faltó')
    toast = pg.evaluate("[...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')")
    check('¡Tu racha volvió! Llevas 4 días' in toast, 'aviso: «¡Tu racha volvió!»')
    check(pg.inner_text('#hudStreakN') == '4' and 'fuego-congelado' in pg.get_attribute('#hudStreak .pic', 'src'), 'el HUD dice 4 días (y sigue congelado hasta que estudies hoy)')
    pg.goto(URL + '#/progreso'); pg.wait_for_timeout(700)
    check(pg.query_selector('.cal__goal--frozen img[src*="fuego-congelado"]'), 'en el calendario, el día revivido tiene el fuego congelado')
    pg.reload(); pg.wait_for_timeout(1000)
    check(not title(pg), 'ya revivida, al abrir no vuelve a salir')
    ctx.close()

    # Sin gemas suficientes: lo explica; la vista sale una vez y sigue en Progreso
    ctx, pg, errs = open_app(browser, [[-5, 1500], [-4, 1500], [-3, 1500]], gems=150)
    txt = dlg_text(pg)
    check('faltaron 2 días' in txt and 'Revivir por 200 gemas' in txt, 'si faltaron 2 días, cuesta 200 gemas')
    pg.click("#dlg button:has-text('Revivir por 200 gemas')"); pg.wait_for_timeout(400)
    err = pg.inner_text('#dlg .form-error')
    check('Te faltan 50 gemas' in err and 'is-progress' not in (pg.get_attribute('#dlg .form-error', 'class') or ''), f'sin gemas suficientes lo explica (en rojo): "{err[:40]}"')
    pg.click("#dlg button:has-text('Empezar de nuevo')"); pg.wait_for_timeout(400)
    pg.reload(); pg.wait_for_timeout(1000)
    check(not title(pg), 'la vista sale una sola vez')
    pg.goto(URL + '#/progreso'); pg.wait_for_timeout(700)
    card = pg.inner_text('.streak-card')
    check('se apagó' in card and pg.query_selector('#streakRevive'), 'en Progreso sigue la opción de revivirla')
    check('fuego-congelado' in pg.get_attribute('.streak-card__icon img', 'src'), 'la tarjeta de la racha muestra el fuego congelado')
    pg.click('#streakRevive'); pg.wait_for_timeout(500)
    check(title(pg) == 'Tu racha se apagó', 'desde Progreso se abre la misma vista')
    pg.click("#dlg button:has-text('Empezar de nuevo')"); pg.wait_for_timeout(300)
    check(not errs, 'sin errores en la consola' + (': ' + ' | '.join(errs) if errs else ''))
    ctx.close()

    # Faltaron 3 días: ya no se ofrece
    ctx, pg, errs = open_app(browser, [[-6, 1500], [-5, 1500], [-4, 1500]])
    check(not title(pg), 'si faltaron 3 días, ya no se ofrece revivirla')
    ctx.close()

    # ---------- D. En inglés ----------
    ctx, pg, errs = open_app(browser, [[-4, 1500], [-3, 1500], [-2, 1500]], locale='en-US')
    txt = dlg_text(pg)
    check(title(pg) == 'Your streak went out' and 'Revive for 100 gems' in txt and 'Start over' in txt, 'en inglés: «Your streak went out»')
    pg.click("#dlg button:has-text('Start over')"); pg.wait_for_timeout(300)
    pg.evaluate(STUDY); wait_dlg(pg)
    check('You lit your streak!' in dlg_text(pg) and '+1 streak day' in dlg_text(pg), 'en inglés: «You lit your streak!» y «+1 streak day»')
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
