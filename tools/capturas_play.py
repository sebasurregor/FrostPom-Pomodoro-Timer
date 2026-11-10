"""
FrostPom — imágenes para la ficha de Google Play (v4.1; la mascota con nombre desde la v4.2).

Genera en docs/google-play/:
  - icono-512.png                       (512 × 512, el ícono cuadrado; Google le pone la forma)
  - imagen-destacada-es.png / -en.png   (1024 × 500, "Feature graphic")
  - capturas-es/ y capturas-en/         (1080 × 1920, teléfono vertical)

Usa una cuenta de demostración (nada de datos reales) y un ranking simulado.

Uso (con la app servida: python -m http.server 8000):
    python tools/capturas_play.py http://localhost:8000/
"""
import datetime
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from _fake_supabase import FakeSupabase  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
OUT = os.path.join(ROOT, 'docs', 'google-play')
TZ = datetime.timezone(datetime.timedelta(hours=-5))

SEED = """async ({ theme }) => {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const daily = {};
  const mins = [75, 50, 100, 25, 125, 75, 0, 50, 100, 75, 150, 25, 50, 0, 100, 75, 125, 50, 75, 100, 25];
  mins.forEach((m, i) => { if (m) daily[day(i + 1)] = { studySec: m * 60, creditedSec: m * 60, sessions: Math.round(m / 25), partials: 0, breaks: Math.round(m / 25), xp: m, noPauseSessions: Math.round(m / 25) }; });
  daily[day(0)] = { studySec: 50 * 60, creditedSec: 50 * 60, sessions: 2, partials: 0, breaks: 1, xp: 50, noPauseSessions: 2 };
  const s = { v: 4, createdAt: new Date(Date.now() - 864e5 * 40).toISOString(),
    profile: { nick: 'pingu_estudia', avatar: '🐧', companion: null, country: 'CO', onboarded: true },
    pets: { pinguino: { fullness: 85, at: new Date(Date.now() - 36e5).toISOString(), name: 'Copito' } }, // v4.2: con nombre
    premium: { active: true }, progress: { xp: 1450, gems: 140 }, daily,
    settings: { theme } };
  const sec = await import('./js/security.js');
  s.account = { username: 'pingu_estudia', birth: '2004-05', ...(await sec.hashPassword('Pingu2026')) };
  localStorage.setItem('st2_board', JSON.stringify({ asked: true, noticed: true }));
  localStorage.setItem('st2_state', JSON.stringify(s));
  sessionStorage.setItem('st2_unlocked', '1');
  for (const n of ['paywall_day', 'last_day']) localStorage.setItem('st2_' + n, day(0));
  localStorage.setItem('st2_motion_hint', '1');
}"""

SHOTS = [
    # (archivo, ruta, hora, tema, acción)
    ('01-enfocar', '#/enfocar', 10, 'light', None),
    ('02-tienda', '#/enfocar', 10, 'light', 'tray'),
    ('03-progreso', '#/progreso', 10, 'light', 'estudio'),  # (v4.3) el calendario se abre como ventana
    ('04-ranking', '#/ranking', 10, 'light', None),
    ('05-perfil', '#/perfil', 10, 'light', None),
    ('06-noche', '#/enfocar', 20, 'dark', None),
]

FEATURE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Lilita One"; src: url("/assets/fonts/lilita-one-latin.woff2") format("woff2"); }
@font-face { font-family: "Nunito"; src: url("/assets/fonts/nunito-latin-wght.woff2") format("woff2"); font-weight: 200 1000; }
html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
.f { position: relative; width: 1024px; height: 500px; overflow: hidden;
  background: radial-gradient(120% 90% at 70% 0%, #2d68bc 0%, #1E4F96 45%, #0E2A55 100%); font-family: "Nunito", sans-serif; }
.aurora { position: absolute; inset: -40px -80px auto -80px; height: 260px; filter: blur(28px); opacity: .55;
  background: linear-gradient(100deg, transparent 5%, #2ED8A3 30%, #45C6EE 50%, #9b6bff 72%, transparent 92%);
  transform: skewY(-6deg); }
.star { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; opacity: .85; }
.hill1 { position: absolute; left: -60px; right: -60px; bottom: -160px; height: 300px; border-radius: 50% 50% 0 0; background: #93c0ed; }
.hill2 { position: absolute; left: 340px; right: -200px; bottom: -190px; height: 300px; border-radius: 50% 50% 0 0; background: #749eda; }
.snow { position: absolute; left: -40px; right: -40px; bottom: -120px; height: 190px; border-radius: 50% 50% 0 0; background: #F4F9FF; }
.icon { position: absolute; left: 92px; top: 92px; width: 300px; height: 300px; border-radius: 68px;
  box-shadow: 0 0 0 7px #0D2346, 0 16px 0 7px #0D2346; }
.txt { position: absolute; left: 452px; top: 108px; width: 520px; color: #fff; }
h1 { margin: 0; font-family: "Lilita One", sans-serif; font-weight: 400; font-size: 104px; line-height: 1; letter-spacing: 1px;
  text-shadow: 0 7px 0 #0D2346; -webkit-text-stroke: 3px #0D2346; paint-order: stroke fill; }
p { margin: 22px 0 0; font-size: 34px; line-height: 1.18; font-weight: 900; text-shadow: 0 3px 0 #0D2346; }
</style></head><body><div class="f">
<div class="aurora"></div>
<span class="star" style="left:60px;top:40px"></span><span class="star" style="left:330px;top:70px"></span>
<span class="star" style="left:520px;top:30px"></span><span class="star" style="left:760px;top:60px"></span>
<span class="star" style="left:940px;top:28px"></span><span class="star" style="left:860px;top:150px"></span>
<div class="hill2"></div><div class="hill1"></div><div class="snow"></div>
<img class="icon" src="/assets/icons/icon-maskable-512.png" alt="">
<div class="txt"><h1>FrostPom</h1><p>TAGLINE</p></div>
</div></body></html>"""

TAGLINE = {'es': 'Estudia con pomodoros,<br>sube de rango y cuida el polo', 'en': 'Study with pomodoros,<br>rank up and save the pole'}


def main():
    os.makedirs(OUT, exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, 'assets', 'icons', 'icon-maskable-512.png'), os.path.join(OUT, 'icono-512.png'))
    with sync_playwright() as p:
        browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
        # Imagen destacada
        for lang in ('es', 'en'):
            ctx = browser.new_context(viewport={'width': 1024, 'height': 500})
            html = FEATURE.replace('TAGLINE', TAGLINE[lang])
            ctx.route(URL + '_destacada.html', (lambda body: lambda route: route.fulfill(status=200, content_type='text/html', body=body))(html))
            pg = ctx.new_page()
            pg.goto(URL + '_destacada.html'); pg.wait_for_timeout(600)
            pg.screenshot(path=os.path.join(OUT, f'imagen-destacada-{lang}.png'))
            ctx.close()
        # Capturas de teléfono
        for lang, locale in (('es', 'es-CO'), ('en', 'en-US')):
            folder = os.path.join(OUT, f'capturas-{lang}')
            os.makedirs(folder, exist_ok=True)
            for name, route, hour, theme, action in SHOTS:
                fake = FakeSupabase()
                ctx = browser.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, locale=locale,
                                          timezone_id='America/Bogota', service_workers='block', color_scheme=theme,
                                          reduced_motion='reduce')
                ctx.route(f'{SUPA}/**', fake.handle)
                pg = ctx.new_page()
                pg.clock.install(time=datetime.datetime(2026, 11, 12, hour, 5, tzinfo=TZ))
                pg.goto(URL); pg.wait_for_timeout(300)
                pg.evaluate(SEED, {'theme': theme})
                pg.goto(URL + route); pg.reload(); pg.wait_for_timeout(1200); pg.clock.run_for(1500)
                for _ in range(4):  # avisos de bienvenida o de temporada
                    if not pg.evaluate("document.getElementById('dlg').open"):
                        break
                    pg.click('#dlg .dlg__actions button:last-child'); pg.wait_for_timeout(300); pg.clock.run_for(800)
                if action == 'tray':
                    pg.click('#shopBtn'); pg.wait_for_timeout(300); pg.clock.run_for(600)
                if action == 'estudio':
                    pg.click('#progTiles .sheet-tile >> nth=0'); pg.wait_for_timeout(300); pg.clock.run_for(600)
                pg.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
                pg.evaluate("window.scrollTo(0, 0)"); pg.clock.run_for(400)
                pg.screenshot(path=os.path.join(folder, f'{name}.png'))
                ctx.close()
        browser.close()
    print('Listo:', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
