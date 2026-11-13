"""
FrostPom v4.3.3 — pruebas visuales: fotos de cada pantalla, comparadas con las fotos aprobadas.

Sirve para pillar errores que se VEN (un botón montado sobre otro, un texto cortado, un color que
cambió sin querer) antes de que lleguen al celular. La prueba abre la app en un navegador de verdad,
toma una foto de cada pantalla y la compara, punto por punto, con la foto de referencia guardada en
tests/visual/baseline/. Si una pantalla cambió, la prueba falla y deja tres imágenes en
tests/visual/out/: la esperada, la actual y la diferencia (lo que cambió, pintado de fucsia).

Pantallas: las puertas de entrada (crear cuenta, iniciar sesión, "¡Hola de nuevo!"), Enfocar quieto
y con el reloj corriendo, la bandeja de comida, cada ventana del celular (Duración, Tu estudio,
Historial, Compañeros, Temporadas, Temas, Logros), Progreso, Ranking (la lista y la tarjeta de
estado), Perfil, Ajustes, los diálogos principales y la tumba de la mascota.

Tamaños: celulares de 360 × 640, 384 × 832 y 412 × 915, tableta de 768 × 1024 y computador de
1366 × 768; tema claro y oscuro; en español, y en inglés en un celular y en el computador.

Para que dos fotos de lo mismo salgan iguales: la fecha y la hora están fijas (page.clock), "Menos
animaciones" está encendido, los datos son siempre los mismos (la misma semilla de e2e_mascota.py),
el servidor es el simulado (tests/_fake_supabase.py), se espera a que carguen las letras y las
imágenes, el azar siempre da los mismos números, y se tapa lo que se mueve al azar (la nieve, los
animales que caminan y sus globos, el confeti y los avisos).

Uso:
    python tests/visual.py                    compara con las fotos de referencia
    python tests/visual.py --update           vuelve a tomar las fotos de referencia
    python tests/visual.py --tamano cel-360   solo los tamaños cuyo nombre contiene "cel-360"
    python tests/visual.py --pantalla ajustes solo las pantallas cuyo nombre contiene "ajustes"
    python tests/visual.py http://127.0.0.1:8000/     usa una app que ya está servida
Sin dirección, la prueba sirve la carpeta del proyecto ella misma. Termina con código 1 si algo
cambió. La guía está en docs/PRUEBAS-VISUALES.md.
"""
import argparse
import datetime
import functools
import http.server
import io
import os
import shutil
import sys
import threading
import time

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from _fake_supabase import FakeSupabase  # el servidor simulado
from e2e_mascota import SEED, state as estado_mascota  # la misma semilla de las otras pruebas

SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
BASE = os.path.join(HERE, 'visual', 'baseline')  # las fotos aprobadas (se suben a GitHub)
OUT = os.path.join(HERE, 'visual', 'out')        # lo que cambió (no se sube: .gitignore)

# ---------- Qué tan distinto es "distinto" ----------
TOLERANCIA = 24        # un punto cuenta como cambiado si algún color se movió más que esto (de 0 a 255)
PUNTOS_MAXIMOS = 40    # la pantalla falla si cambiaron más puntos que estos (menos que una letra). Es un
                       # número fijo y no un porcentaje: en una página larga, una palabra es un porcentaje diminuto

# ---------- La fecha fija: martes 10 de marzo de 2026, 10:00 a. m. en Colombia (de día) ----------
ZONA = datetime.timezone(datetime.timedelta(hours=-5))
AHORA = datetime.datetime(2026, 3, 10, 10, 0, 0, tzinfo=ZONA)
HOY = AHORA.strftime('%Y-%m-%d')

# ---------- Tamaños, temas e idiomas ----------
#            nombre        ancho  alto  celular
TAMANOS = [('cel-360',      360,  640, True),
           ('cel-384',      384,  832, True),
           ('cel-412',      412,  915, True),
           ('tableta',      768, 1024, True),
           ('escritorio',  1366,  768, False)]
TEMAS = [('claro', 'light'), ('oscuro', 'dark')]
INGLES_EN = ('cel-384', 'escritorio')  # el inglés se revisa en un celular y en el computador (tema claro)

# Lo que se mueve al azar se tapa (se esconde) antes de cada foto. También el número de versión de
# Ajustes: así subir la versión no hace fallar la prueba.
TAPAR = ['canvas.scenery__snow', 'canvas.gate-snow', '.scenery__walkers', '.say', '#fx', '#toasts', '#appVersion']
TAPAR_JS = """(sels) => {
  for (const el of document.querySelectorAll(sels.join(','))) el.style.setProperty('visibility', 'hidden', 'important');
}"""

# El azar de la app siempre da los mismos números (así el avatar sugerido y las frases no cambian)
AZAR_FIJO = """(() => {
  let a = 20260310;
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();"""

MAS_DATOS = """(x) => {
  for (const [k, v] of Object.entries(x.local || {})) localStorage.setItem(k, v);
  for (const k of x.quitarSesion || []) sessionStorage.removeItem(k);
  for (const [k, v] of Object.entries(x.sesion || {})) sessionStorage.setItem(k, v);
}"""

ABRIR_VENTANA = """async (nombre) => {
  const m = await import('./js/ui/sheets.js');
  if (document.querySelector('[data-sheet].is-open')) m.closeSheet({ restore: false });
  m.openSheet(document.querySelector(`[data-sheet="${nombre}"]`));
}"""

CERRAR_VENTANA = """async () => {
  const m = await import('./js/ui/sheets.js');
  if (document.querySelector('[data-sheet].is-open')) m.closeSheet({ restore: false });
}"""

# =====================================================================
# Los datos de siempre (la semilla)
# =====================================================================
def iso(t):
    return t.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def hace(horas):
    return iso(AHORA - datetime.timedelta(hours=horas))


def dia(n):
    """La fecha de hace n días, como la guarda la app (2026-03-10)."""
    return (AHORA - datetime.timedelta(days=n)).strftime('%Y-%m-%d')


def semilla(tema, mascotas=None, cuenta=True, nacimiento='2000-05', gemas=140):
    """Una persona que lleva un tiempo estudiando: con sesiones, racha, logros y un zorro con nombre."""
    pets = mascotas or {'zorro-artico': {'fullness': 62, 'at': hace(0.1), 'name': 'Zorrito'},
                        'pinguino': {'fullness': 80, 'at': hace(30), 'rest': True}}
    s = estado_mascota('zorro-artico', pets, gems=gemas, reduce=True)
    s['createdAt'] = hace(24 * 40)
    s['profile']['nick'] = 'pingu_estudia'
    s['settings'].update({'theme': tema, 'timeZone': 'America/Bogota'})
    s['progress'].update({
        'xp': 1450, 'owned': ['clasico', 'menta'], 'bestStreak': 6, 'combo': 2, 'bestCombo': 4,
        'longestSessionSec': 3000, 'cycle': 2, 'customized': True, 'season': '2026-01',
        'achievements': {'primer-paso': hace(24 * 30), 'a-tu-medida': hace(24 * 29), 'chispa': hace(24 * 20), 'en-marcha': hace(24 * 12)},
        'totals': {'studySec': 54000, 'creditedSec': 54000, 'sessions': 36, 'partials': 3, 'breaks': 30, 'missionsClaimed': 9, 'fed': 14, 'revived': 0},
    })
    s['seasons'] = [{'id': '2025-10', 'months': 3, 'xp': 2600, 'studyMin': 1840, 'activeDays': 41, 'goalDays': 18, 'gems': 60}]
    # Los últimos días (hoy = 0). El día 4 no estudió.
    minutos = {0: 50, 1: 75, 2: 25, 3: 100, 5: 50, 6: 25, 8: 125, 9: 50, 12: 75}
    s['daily'] = {dia(n): {'studySec': m * 60, 'creditedSec': m * 60, 'sessions': m // 25, 'partials': 0, 'breaks': m // 25,
                           'xp': m * 2, 'noPauseSessions': m // 25} for n, m in minutos.items()}
    s['sessions'] = []
    for n, m in minutos.items():
        for i in range(m // 25):
            fin = AHORA - datetime.timedelta(days=n, hours=1 + i)
            s['sessions'].append({'id': f'visual-{n:02d}-{i:02d}', 'plannedMin': 25, 'actualSec': 1500, 'creditedSec': 1500, 'completed': True,
                                  'pauses': i % 2, 'startedAt': iso(fin - datetime.timedelta(minutes=25)), 'endedAt': iso(fin), 'xp': 50})
    if cuenta:
        s['account'] = {'username': 'pingu_estudia', 'hash': 'ab' * 32, 'salt': 'cd' * 16, 'iter': 210000}
        if nacimiento:
            s['account']['birth'] = nacimiento
    return s


UID = '00000000-0000-4000-8000-00000000abcd'


def en_el_ranking(fake):
    """El servidor simulado ya conoce a esta persona: está en el ranking con 120 minutos."""
    fake.users[UID] = {'anon': True, 'email': None}
    fake.profiles[UID] = {'username': 'pingu_estudia', 'country': 'CO', 'avatar': '🐧', 'show': True, 'xp': 1450}
    fake.minutes[UID] = 120
    fake.refresh['ref-visual'] = UID


TABLERO_UNIDO = '{"asked":true,"noticed":true,"joined":true,"name":"pingu_estudia","uid":"%s","refresh":"ref-visual","anon":true}' % UID


# =====================================================================
# Una "sesión de fotos": un tamaño, un tema y un idioma
# =====================================================================
class Fotos:
    def __init__(self, browser, url, tamano, tema, idioma, args):
        self.nombre_tamano, self.ancho, self.alto, self.celular = tamano
        self.tema_nombre, self.tema = tema
        self.idioma = idioma
        self.nombre = f'{self.nombre_tamano}-{self.tema_nombre}-{idioma}'
        self.url = url
        self.args = args
        self.ctx = browser.new_context(
            viewport={'width': self.ancho, 'height': self.alto}, device_scale_factor=1,
            is_mobile=self.celular, has_touch=self.celular,
            locale='en-US' if idioma == 'en' else 'es-CO', timezone_id='America/Bogota',
            color_scheme=self.tema, reduced_motion='reduce', service_workers='block')
        self.ctx.add_init_script(AZAR_FIJO)
        self.pg = None
        self.errores = []   # errores de la app (consola)
        self.hechas = []    # pantallas fotografiadas
        self.cambios = []   # (pantalla, por qué)
        self.nuevas = []    # pantallas sin foto de referencia

    def es_ancho(self):
        """En pantallas de 900 px o más no hay ventanas de celular: las secciones se ven en la página."""
        return self.ancho >= 900

    def quiere(self, pantallas):
        return not self.args.pantalla or any(self.args.pantalla in p for p in pantallas)

    # ---------- Abrir la app con unos datos ----------
    def abrir(self, datos=None, ruta='#/enfocar', servidor=None, local=None, sesion=None):
        """Abre la app desde cero. datos = el estado guardado (None = alguien que llega por primera vez)."""
        if self.pg:
            self.pg.close()
        fake = FakeSupabase()
        if servidor:
            servidor(fake)
        pg = self.pg = self.ctx.new_page()
        pg.route(f'{SUPA}/**', fake.handle)
        pg.on('pageerror', lambda e: self.errores.append(str(e)))
        pg.clock.set_fixed_time(AHORA)
        pg.goto(self.url + 'manifest.webmanifest')  # una página cualquiera del sitio, para poder guardar los datos
        mas = {'local': {'st2_lang': self.idioma, 'st2_paywall_day': HOY, 'st2_last_day': HOY, **(local or {})}, 'sesion': sesion or {}}
        if datos is None:
            pg.evaluate('() => { localStorage.clear(); sessionStorage.clear(); }')
        else:
            pg.evaluate(SEED, datos)
            if datos.get('account'):
                mas['quitarSesion'] = ['st2_acc_later']
        pg.evaluate(MAS_DATOS, mas)
        pg.goto(self.url + ruta)
        self.quieto(700)
        return pg

    def ir(self, ruta):
        self.pg.evaluate('(r) => { location.hash = r; }', ruta)
        self.quieto()

    def quieto(self, ms=350):
        """Espera a que la pantalla termine de armarse: letras, imágenes y respuestas del servidor."""
        pg = self.pg
        pg.wait_for_timeout(ms)
        try:
            pg.wait_for_load_state('networkidle', timeout=5000)
        except Exception:
            pass
        pg.evaluate('() => Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready).then(() => true)')
        for _ in range(40):
            if pg.evaluate('() => [...document.images].every((i) => i.complete)'):
                break
            pg.wait_for_timeout(100)
        pg.wait_for_timeout(150)

    def toca(self, selector):
        self.pg.click(selector)
        self.quieto()

    def toca_js(self, selector):
        """Para los interruptores: la casilla de verdad está escondida debajo del dibujo."""
        self.pg.evaluate('(s) => document.querySelector(s).click()', selector)
        self.quieto()

    def dialogo_abierto(self):
        return self.pg.evaluate("() => document.getElementById('dlg').open")

    def cerrar_dialogo(self):
        self.pg.keyboard.press('Escape')
        self.pg.wait_for_timeout(200)
        if self.dialogo_abierto():  # un diálogo que no se cierra con Escape: se toca su primer botón
            self.pg.click('#dlg .dlg__actions button')
        self.quieto(250)

    # ---------- La foto y la comparación ----------
    def foto(self, pantalla, completa=False):
        """Toma la foto y la compara con la de referencia (o la guarda, con --update)."""
        if self.args.pantalla and self.args.pantalla not in pantalla:
            return
        pg = self.pg
        pg.evaluate(TAPAR_JS, TAPAR)
        # En la foto de la página entera, la barra de abajo del celular (que va pegada a la pantalla)
        # quedaría atravesada en la mitad: se esconde un momento. Ya sale en las demás fotos.
        sin_barra = completa and not self.es_ancho()
        if sin_barra:
            pg.evaluate("() => document.querySelector('.tabs').style.setProperty('visibility', 'hidden')")
        png = pg.screenshot(full_page=completa, animations='disabled', caret='hide', scale='css')
        if sin_barra:
            pg.evaluate("() => document.querySelector('.tabs').style.removeProperty('visibility')")
        actual = Image.open(io.BytesIO(png)).convert('RGB')
        self.hechas.append(pantalla)
        ref = os.path.join(BASE, self.nombre, pantalla + '.png')
        if self.args.update:
            os.makedirs(os.path.dirname(ref), exist_ok=True)
            if os.path.exists(ref):
                vieja = Image.open(ref).convert('RGB')
                if vieja.size == actual.size and ImageChops.difference(vieja, actual).getbbox() is None:
                    return  # idéntica a la que ya estaba: no se toca el archivo
            actual.save(ref, optimize=True)
            self.nuevas.append(pantalla)
            return
        if not os.path.exists(ref):
            self.cambios.append((pantalla, 'no tiene foto de referencia (¿pantalla nueva? corre --update)'))
            guardar_salida(self.nombre, pantalla, None, actual, None)
            return
        esperada = Image.open(ref).convert('RGB')
        cambio, por_que, mapa = distinto(esperada, actual)
        if cambio:
            self.cambios.append((pantalla, por_que))
            guardar_salida(self.nombre, pantalla, esperada, actual, mapa)

    def cerrar(self):
        self.ctx.close()


def distinto(esperada, actual):
    """(¿cambió?, por qué, mapa de los puntos que cambiaron)."""
    if esperada.size != actual.size:
        return True, f'cambió de tamaño: antes {esperada.size[0]} × {esperada.size[1]}, ahora {actual.size[0]} × {actual.size[1]}', None
    r, g, b = ImageChops.difference(esperada, actual).split()
    mayor = ImageChops.lighter(ImageChops.lighter(r, g), b)  # el color que más se movió en cada punto
    mapa = mayor.point(lambda v: 255 if v > TOLERANCIA else 0)
    puntos = mapa.histogram()[255]
    total = actual.size[0] * actual.size[1]
    if puntos > PUNTOS_MAXIMOS:
        caja = mapa.getbbox()
        return True, f'cambiaron {puntos} puntos ({puntos / total:.2%}), entre ({caja[0]}, {caja[1]}) y ({caja[2]}, {caja[3]})', mapa
    return False, '', None


def guardar_salida(config, pantalla, esperada, actual, mapa):
    carpeta = os.path.join(OUT, config)
    os.makedirs(carpeta, exist_ok=True)
    actual.save(os.path.join(carpeta, pantalla + '-actual.png'))
    if esperada is not None:
        esperada.save(os.path.join(carpeta, pantalla + '-esperada.png'))
    if mapa is not None:
        # La foto actual, pálida, con lo que cambió pintado de fucsia
        palida = Image.blend(actual, Image.new('RGB', actual.size, (255, 255, 255)), 0.7)
        Image.composite(Image.new('RGB', actual.size, (255, 0, 200)), palida, mapa).save(os.path.join(carpeta, pantalla + '-diferencia.png'))


# =====================================================================
# Las pantallas
# =====================================================================
def puertas(f):
    f.abrir(None)  # alguien que abre la app por primera vez
    f.foto('puerta-crear-cuenta')
    f.toca('#toSignIn')
    f.foto('puerta-iniciar-sesion')
    f.abrir(semilla(f.tema))  # con cuenta, pero sin haber escrito la contraseña
    f.foto('puerta-hola-de-nuevo')


def enfocar(f):
    f.abrir(semilla(f.tema), sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    f.foto('enfocar-inicio')
    f.toca('#mainBtn')
    f.pg.clock.set_fixed_time(AHORA + datetime.timedelta(seconds=90))  # un minuto y medio después
    f.quieto(1300)
    f.foto('enfocar-corriendo')


def bandeja(f):
    f.abrir(semilla(f.tema), sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    f.toca('#shopBtn')
    f.foto('bandeja-comida')
    f.toca('#trayNameBtn')
    f.foto('dialogo-nombre-mascota')


def tumba(f):
    muerta = {'zorro-artico': {'fullness': 0, 'at': hace(24 * 9), 'name': 'Zorrito'}}
    f.abrir(semilla(f.tema, mascotas=muerta), sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    f.foto('mascota-tumba')
    f.toca('#shopBtn')
    f.foto('mascota-tumba-bandeja')


VENTANAS = [('ventana-duracion', 'Duración', '#/enfocar'), ('ventana-tu-estudio', 'Tu estudio', '#/progreso'),
            ('ventana-historial', 'Historial', '#/progreso'), ('ventana-companeros', 'Compañeros', '#/perfil'),
            ('ventana-temporadas', 'Temporadas', '#/perfil'), ('ventana-temas', 'Temas', '#/perfil'),
            ('ventana-logros', 'Logros', '#/perfil')]


def ventanas(f):
    if f.es_ancho():
        return
    f.abrir(semilla(f.tema), sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    ruta = '#/enfocar'
    for pantalla, nombre, donde in VENTANAS:
        if donde != ruta:
            f.pg.evaluate(CERRAR_VENTANA)
            f.ir(donde)
            ruta = donde
        f.pg.evaluate(ABRIR_VENTANA, nombre)
        f.quieto()
        f.foto(pantalla)


def vistas(f):
    f.abrir(semilla(f.tema), '#/progreso', sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    f.foto('progreso', completa=True)
    f.ir('#/ranking')
    f.foto('ranking-lista', completa=True)
    f.ir('#/perfil')
    f.foto('perfil', completa=True)
    f.ir('#/ajustes')
    f.foto('ajustes', completa=True)


def ranking_estado(f):
    # Una cuenta de antes del ranking (sin fecha de nacimiento): primero el aviso, después la tarjeta
    f.abrir(semilla(f.tema, nacimiento=None), '#/ranking', sesion={'st2_unlocked': '1'}, local={'st2_board': '{}'})
    if f.dialogo_abierto():
        f.foto('dialogo-ranking-llego')
        f.cerrar_dialogo()
    f.foto('ranking-estado', completa=True)


def dialogos(f):
    f.abrir(semilla(f.tema), '#/enfocar', sesion={'st2_unlocked': '1'}, local={'st2_board': TABLERO_UNIDO}, servidor=en_el_ranking)
    f.toca('#hudCrown')
    f.foto('dialogo-premium')
    f.cerrar_dialogo()
    f.ir('#/ranking')
    f.toca('.row__more')
    f.foto('dialogo-opciones-ranking')
    f.cerrar_dialogo()
    f.ir('#/perfil')
    f.toca('#profileCard .link-btn')
    f.foto('dialogo-nacionalidad')
    f.cerrar_dialogo()
    f.ir('#/ajustes')
    f.toca('#accPassBtn')
    f.foto('dialogo-cambiar-contrasena')
    f.cerrar_dialogo()
    f.toca_js('#setBoard')
    f.foto('dialogo-salir-ranking')
    f.cerrar_dialogo()
    f.toca('#accDeleteBtn')
    f.foto('dialogo-eliminar-cuenta')
    f.cerrar_dialogo()


GRUPOS = [
    (puertas, ['puerta-crear-cuenta', 'puerta-iniciar-sesion', 'puerta-hola-de-nuevo']),
    (enfocar, ['enfocar-inicio', 'enfocar-corriendo']),
    (bandeja, ['bandeja-comida', 'dialogo-nombre-mascota']),
    (tumba, ['mascota-tumba', 'mascota-tumba-bandeja']),
    (ventanas, [v[0] for v in VENTANAS]),
    (vistas, ['progreso', 'ranking-lista', 'perfil', 'ajustes']),
    (ranking_estado, ['dialogo-ranking-llego', 'ranking-estado']),
    (dialogos, ['dialogo-premium', 'dialogo-opciones-ranking', 'dialogo-nacionalidad', 'dialogo-cambiar-contrasena',
                'dialogo-salir-ranking', 'dialogo-eliminar-cuenta']),
]


# =====================================================================
# Servir la app (si no se pasó una dirección)
# =====================================================================
class Callado(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Callado, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'


def main():
    ap = argparse.ArgumentParser(description='Pruebas visuales de FrostPom (ver docs/PRUEBAS-VISUALES.md)')
    ap.add_argument('url', nargs='?', help='dirección de la app ya servida (si falta, la prueba la sirve)')
    ap.add_argument('--update', action='store_true', help='volver a tomar las fotos de referencia')
    ap.add_argument('--tamano', default='', help='solo los tamaños cuyo nombre contiene este texto (cel-360, oscuro, -en…)')
    ap.add_argument('--pantalla', default='', help='solo las pantallas cuyo nombre contiene este texto (ajustes, dialogo…)')
    args = ap.parse_args()

    srv = None
    url = args.url
    if not url:
        srv, url = servir()
    if not url.endswith('/'):
        url += '/'

    configs = [(t, tema, 'es') for t in TAMANOS for tema in TEMAS]
    configs += [(t, TEMAS[0], 'en') for t in TAMANOS if t[0] in INGLES_EN]
    todo = not args.tamano and not args.pantalla
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)

    empezo = time.time()
    total, fallas, nuevas, errores, vistas_ok = 0, [], 0, [], {}
    with sync_playwright() as p:
        browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
        for tamano, tema, idioma in configs:
            f = Fotos(browser, url, tamano, tema, idioma, args)
            if args.tamano and args.tamano not in f.nombre:
                f.cerrar()
                continue
            for grupo, pantallas in GRUPOS:
                if not f.quiere(pantallas):
                    continue
                try:
                    grupo(f)
                except Exception as e:  # una pantalla que no se pudo abrir también es una falla
                    f.cambios.append((grupo.__name__, f'no se pudo tomar la foto: {str(e).splitlines()[0][:160]}'))
            f.cerrar()
            total += len(f.hechas)
            nuevas += len(f.nuevas)
            vistas_ok[f.nombre] = f.hechas
            errores += [f'{f.nombre}: {e}' for e in f.errores]
            fallas += [(f.nombre, pantalla, por_que) for pantalla, por_que in f.cambios]
            marca = 'XX' if f.cambios else 'OK'
            extra = f', {len(f.nuevas)} guardadas' if args.update else (f', {len(f.cambios)} con cambios' if f.cambios else '')
            print(f'  {marca}  {f.nombre}: {len(f.hechas)} pantallas{extra}', flush=True)
        browser.close()
    if srv:
        srv.shutdown()

    # Fotos de referencia que ya no corresponden a ninguna pantalla
    sobran = []
    if todo and os.path.isdir(BASE):
        for config in sorted(os.listdir(BASE)):
            for archivo in sorted(os.listdir(os.path.join(BASE, config))):
                if archivo.endswith('.png') and archivo[:-4] not in vistas_ok.get(config, []):
                    sobran.append(os.path.join(config, archivo))
        if args.update:
            for s in sobran:
                os.remove(os.path.join(BASE, s))

    segundos = int(time.time() - empezo)
    print()
    for e in sorted(set(errores)):
        print(f'  XX  error de la app: {e}')
    if args.update:
        print(f'{total} pantallas fotografiadas en {segundos} s; {nuevas} fotos de referencia nuevas o cambiadas en tests/visual/baseline/.')
        if sobran:
            print(f'Se borraron {len(sobran)} fotos de pantallas que ya no existen: ' + ', '.join(sobran))
        if fallas:
            print('No se pudieron tomar:')
            for config, pantalla, por_que in fallas:
                print(f'  XX  {config} / {pantalla}: {por_que}')
        sys.exit(1 if fallas or errores else 0)
    if sobran:
        print(f'Aviso: {len(sobran)} fotos de referencia ya no corresponden a ninguna pantalla (--update las borra): ' + ', '.join(sobran))
    if fallas:
        print(f'{len(fallas)} de {total} pantallas CAMBIARON. Mira tests/visual/out/ (esperada, actual y diferencia):')
        for config, pantalla, por_que in fallas:
            print(f'  XX  {config} / {pantalla}: {por_que}')
        print('Si el cambio es un error, arréglalo. Si es un cambio que el autor aprobó: python tests/visual.py --update')
    else:
        print(f'{total} pantallas iguales a las de referencia ({segundos} s).')
    sys.exit(1 if fallas or errores else 0)


if __name__ == '__main__':
    main()
