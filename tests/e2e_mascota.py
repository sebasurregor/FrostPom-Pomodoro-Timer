"""
FrostPom v4.2 — tu compañero siente hambre, se puede morir, revivir y tener nombre.

Comprueba que:
  A. Al comer, los corazones hacen el ciclo completo una y otra vez (antes el salto de la
     envoltura tapaba la animación y el pingüino se quedaba en el primer cuadro). El zorro, la
     foca y el tiburón tienen sus corazones; el oso polar salta contento.
  B. Entre más hambre, más triste se ve: triste (25–49), lloroso (menos de 25), llorando (0),
     débil (último día) y la tumba, en los cinco animales.
  C. Si se muere: aviso una sola vez, "!" en la tienda, la bandeja muestra la tumba y el botón
     de revivir; no se le puede dar comida; revivir cuesta 30 gemas, conserva el nombre y vuelve
     con la barriguita a la mitad; sin gemas suficientes el botón se apaga y explica cuánto falta.
  D. Nombre: el lápiz abre el diálogo, se revisa (largo, palabras feas), aparece la etiqueta sobre
     la cabeza, no se traduce en inglés y se puede quitar.
  E. Solo le da hambre al que está contigo: al cambiar de compañero el anterior descansa; en el
     perfil se ven su nombre y, si murió, su tumba.
  F. Datos de la v4.1: al actualizar nadie encuentra a su mascota muerta (3 días de gracia).
  G. Paisaje: el zorro camina con su sprite de 4 cuadros y de noche asa malvaviscos junto al oso.
  H. Con "Menos animaciones" el llanto y los corazones quedan quietos en un cuadro.
  J. (v4.3.1) Sin nombre, tocar al compañero abre "Ponle nombre"; con nombre, habla. Y sin nombre,
     de vez en cuando pide uno (más o menos 1 de cada 4 frases, nunca dos seguidas; también en inglés).
  K. (v4.3.1) En el celular (360 × 640, 384 × 832 y 412 × 915), con la bandeja de comida abierta el
     compañero y su nombre quedan enteros por encima de ella, el reloj se lee y se le puede arrastrar
     la comida.
  M. (v4.3.2) En 360 × 640, 384 × 832, 412 × 915 y 1280 × 800, con la bandeja cerrada y abierta, el botón de
     la tienda no se monta sobre el compañero ni sobre su nombre; las 4 pestañas llenan la barra parejo; en el
     celular el sol de día no toca los botoncitos de duración y sonido.
  L. Sin errores en la consola ni archivos que falten.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_mascota.py http://localhost:8000/
"""
import datetime
import json
import os
import sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase
from _sheets import patch as sheets_patch  # (v4.3) en el celular, varias secciones se abren como ventana

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('  OK  ' if cond else '  XX  ') + msg)


def ago(hours):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def state(companion=None, pets=None, gems=140, v=4, reduce=False):
    return {
        'v': v, 'createdAt': ago(24 * 40),
        'profile': {'nick': 'pingu_prueba', 'avatar': '🐧', 'companion': companion, 'country': 'CO', 'onboarded': True},
        'progress': {'xp': 300, 'gems': gems, 'gifted': ['oso-polar', 'oso-marino', 'tiburon-martillo', 'zorro-artico']},
        'pets': pets or {}, 'settings': {'reduceMotion': reduce},
    }


SEED = """(s) => {
  localStorage.clear();
  localStorage.setItem('st2_state', JSON.stringify(s));
  sessionStorage.setItem('st2_acc_later', '1');
  localStorage.setItem('st2_motion_hint', '1');
  localStorage.setItem('st2_board', JSON.stringify({ asked: true, noticed: true }));
}"""


def open_app(browser, st, locale='es-CO', route='#/enfocar', width=412, height=900):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, locale=locale, service_workers='block')
    ctx.route(f'{SUPA}/**', FakeSupabase().handle)
    pg = sheets_patch(ctx.new_page())
    errs, missing = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: missing.append(r.url) if r.status >= 400 and r.url.startswith(URL) else None)
    pg.goto(URL + route)
    pg.evaluate(SEED, st)
    pg.reload()
    pg.wait_for_timeout(900)
    return ctx, pg, errs, missing


def saved(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def face(pg):
    return pg.evaluate("document.querySelector('#buddy').dataset.face")


def art_class(pg):
    return pg.evaluate("(() => { const e = document.querySelector('#buddy .buddy__body > *'); return e ? e.className : ''; })()")


def toasts(pg):
    return pg.evaluate("[...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')")


def feed_first(pg):
    pg.click('#shopBtn')
    pg.wait_for_timeout(300)
    pg.focus('#trayFoods .tray-food:not([disabled])')
    pg.keyboard.press('Enter')


def frames_seen(pg, sel, ms=2600, step=100):
    seen = set()
    for _ in range(ms // step):
        seen.add(pg.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); return e ? getComputedStyle(e).backgroundPositionX : 'none'; }})()"))
        pg.wait_for_timeout(step)
    return seen


def main():
    all_errs, all_missing = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def done(ctx, errs, missing):
            all_errs.extend(errs)
            all_missing.extend(missing)
            ctx.close()

        # ------------------------------------------------------------------ A
        print('A. Corazones en bucle al comer')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 30, 'at': ago(0.1)}}))
        feed_first(pg)
        pg.wait_for_timeout(150)
        check('sprite--amor' in art_class(pg), 'el pingüino pone ojos de corazón al comer')
        anim = pg.evaluate("getComputedStyle(document.querySelector('#buddy .sprite--amor')).animationName")
        check('sprite-run' in anim, f'la animación de los corazones no la tapa el salto ({anim})')
        body = pg.evaluate("getComputedStyle(document.querySelector('#buddy .buddy__body')).animationName")
        check(body == 'pet-eat', 'el salto va en la envoltura del compañero')
        seen = frames_seen(pg, '#buddy .sprite--amor', 2400)
        check(len(seen) >= 3, f'recorre los 3 cuadros de corazones ({sorted(seen)})')
        check(pg.evaluate("document.querySelector('#buddy .sprite--amor') !== null"), 'sigue con corazones mientras come (2 vueltas)')
        pg.wait_for_timeout(1500)
        check('sprite--amor' not in art_class(pg), 'al terminar de comer vuelve a su cara de siempre')
        done(ctx, errs, missing)

        for pet, sheet in [('zorro-artico', 'zorro-amor'), ('oso-marino', 'oso-marino-amor'), ('tiburon-martillo', 'tiburon-amor')]:
            ctx, pg, errs, missing = open_app(browser, state(pet, {pet: {'fullness': 30, 'at': ago(0.1)}}))
            feed_first(pg)
            pg.wait_for_timeout(150)
            check(f'psprite--{sheet}' in art_class(pg), f'{pet}: tiene su animación de corazones')
            seen = frames_seen(pg, '#buddy .psprite', 2200)
            check(len(seen) >= 3, f'{pet}: los corazones avanzan por los cuadros ({len(seen)} distintos)')
            done(ctx, errs, missing)
        ctx, pg, errs, missing = open_app(browser, state('oso-polar', {'oso-polar': {'fullness': 10, 'at': ago(0.1)}}))
        feed_first(pg)
        pg.wait_for_timeout(150)
        check('companion--img' in art_class(pg) and face(pg) == 'amor', 'el oso polar (sin corazones) se ve contento y salta al comer')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ B
        print('B. Entre más hambre, más triste')
        cases = [(60, 0.1, 'feliz'), (40, 0.1, 'triste'), (15, 0.1, 'lloroso'), (0, 5, 'llorando'), (0, 60, 'debil'), (0, 100, 'muerto')]
        for pet, sheet in [('pinguino', 'pinguino-llora'), ('oso-polar', 'oso-llora'), ('oso-marino', 'oso-marino-llora'), ('tiburon-martillo', 'tiburon-llora'), ('zorro-artico', 'zorro-llora')]:
            ok = []
            for full, hours, want in cases:
                comp = None if pet == 'pinguino' else pet
                ctx, pg, errs, missing = open_app(browser, state(comp, {pet: {'fullness': full, 'at': ago(hours)}}))
                f, cls = face(pg), art_class(pg)
                good = f == want and (
                    (want == 'muerto' and 'psprite--tumba' in cls)
                    or (want == 'feliz' and 'psprite' not in cls)
                    or (want not in ('feliz', 'muerto') and f'psprite--{sheet}' in cls and f'is-{want}' in cls))
                ok.append(good or f'{want}≠{f}:{cls}')
                if want == 'llorando' and pet == 'pinguino':
                    seen = frames_seen(pg, '#buddy .psprite', 2800)
                    check(len(seen) >= 4, f'llorando recorre el llanto completo ({sorted(seen)})')
                    check('!' == pg.text_content('#shopHungry') and pg.is_visible('#shopHungry'), 'la tienda avisa con "!"')
                    pg.click('#shopBtn')
                    pg.wait_for_timeout(300)
                    hint = pg.text_content('#trayHint')
                    check('se muere' in hint and 'día' in hint, f'la bandeja dice cuánto le queda ({hint.strip()})')
                done(ctx, errs, missing)
            check(all(x is True for x in ok), f'{pet}: feliz → triste → lloroso → llorando → débil → tumba ({[x for x in ok if x is not True]})')

        # ------------------------------------------------------------------ C
        print('C. Se murió: tumba, aviso y revivir')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(100), 'name': 'Copito'}}, gems=45))
        pg.wait_for_timeout(600)
        t = toasts(pg)
        check('Copito se murió de hambre' in t, 'avisa que se murió (con su nombre)')
        label = pg.get_attribute('#shopBtn', 'aria-label')
        check('se murió' in label, 'el botón de la tienda dice que se murió (lectores de pantalla)')
        check(pg.text_content('#buddy .nametag') == 'Copito', 'la tumba lleva su nombre')
        pg.click('#buddy')
        pg.wait_for_timeout(400)
        check(pg.is_visible('#trayRevive') and not pg.is_visible('#trayFoods'), 'tocar la tumba abre la tienda con el botón de revivir (sin comida)')
        check(pg.text_content('#h-tray') == 'Revive a Copito', 'el título dice "Revive a Copito"')
        check(pg.is_enabled('#reviveBtn') and '30' in pg.text_content('#reviveBtn'), 'revivir cuesta 30 gemas')
        bad = pg.evaluate("import('./js/engine.js').then((E) => { const s = JSON.parse(localStorage.getItem('st2_state')); return E.feedPet(s, 'pescado').reason; })")
        check(bad == 'dead', 'muerto no se le puede dar comida')
        pg.click('#reviveBtn')
        pg.wait_for_timeout(300)
        s = saved(pg)
        check(s['progress']['gems'] == 15, 'se cobraron las 30 gemas')
        check(s['pets']['pinguino'].get('name') == 'Copito' and s['pets']['pinguino']['fullness'] == 50 and 'dead' not in s['pets']['pinguino'], 'vuelve con su nombre y la barriguita a la mitad')
        check(face(pg) == 'amor', 'vuelve feliz, con corazones')
        check('Volvió' in toasts(pg), 'celebra que volvió')
        check(pg.is_visible('#trayFoods') and not pg.is_visible('#trayRevive'), 'la tienda vuelve a mostrar la comida')
        pg.reload()
        pg.wait_for_timeout(900)
        check('se murió' not in toasts(pg), 'el aviso de que se murió no se repite')
        done(ctx, errs, missing)

        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(100)}}, gems=12))
        pg.click('#shopBtn')
        pg.wait_for_timeout(300)
        check(pg.is_disabled('#reviveBtn') and 'Te faltan 18 gemas' in pg.text_content('#reviveNote'), 'sin gemas suficientes: botón apagado y cuántas faltan')
        pg.reload()
        pg.wait_for_timeout(900)
        check('se murió' not in toasts(pg), 'el aviso sale una sola vez por cada muerte')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ D
        print('D. Nombre con etiqueta')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1)}}))
        check(pg.evaluate("document.querySelector('#buddy .nametag') === null"), 'sin nombre no hay etiqueta')
        pg.click('#shopBtn')
        pg.wait_for_timeout(200)
        pg.click('#trayNameBtn')
        pg.wait_for_timeout(300)
        pg.fill('#petNameInput', 'Pingüinito del Polo Sur')
        pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(200)
        check(pg.is_visible('#dlg') and 'máximo 16' in pg.text_content('#dlg .form-error'), 'nombre muy largo: lo explica')
        pg.fill('#petNameInput', 'puta')
        pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(200)
        check('no está permitido' in pg.text_content('#dlg .form-error'), 'palabra fea: no se permite')
        pg.fill('#petNameInput', '  Señor   Copito ')
        check(pg.text_content('#dlg .nametag--preview') == 'Señor Copito', 'muestra cómo se verá la etiqueta')
        pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(300)
        check(pg.text_content('#buddy .nametag') == 'Señor Copito', 'la etiqueta aparece sobre su cabeza')
        check(pg.evaluate("getComputedStyle(document.querySelector('#buddy .nametag')).fontFamily").startswith('"Pixelify Sans"'), 'la etiqueta usa letra de píxeles')
        check(saved(pg)['pets']['pinguino']['name'] == 'Señor Copito', 'el nombre se guarda')
        check(pg.text_content('#h-tray') == 'Dale de comer a Señor Copito', 'la tienda lo llama por su nombre')
        pg.click('#trayNameBtn')
        pg.wait_for_timeout(300)
        pg.click('#dlg .dlg__actions button:has-text("Quitar nombre")')
        pg.wait_for_timeout(300)
        check(pg.evaluate("document.querySelector('#buddy .nametag') === null") and 'name' not in saved(pg)['pets']['pinguino'], 'se puede quitar el nombre')
        done(ctx, errs, missing)

        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1), 'name': 'Pescado'}}), locale='en-US')
        check(pg.text_content('#buddy .nametag') == 'Pescado', 'en inglés el nombre no se traduce')
        pg.click('#shopBtn')
        pg.wait_for_timeout(200)
        check(pg.text_content('#h-tray') == 'Feed Pescado', 'la tienda en inglés: "Feed Pescado"')
        done(ctx, errs, missing)

        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(100)}}), locale='en-US')
        pg.wait_for_timeout(500)
        t = toasts(pg)
        pg.click('#shopBtn')
        pg.wait_for_timeout(300)
        texts = [t, pg.text_content('#h-tray'), pg.text_content('#trayHint'), pg.text_content('#reviveBtn'), pg.text_content('#reviveNote'), pg.get_attribute('#shopBtn', 'aria-label')]
        en = ['Your penguin starved', 'Revive your penguin', 'died after 3 days without food', 'Revive for', 'half full', 'starved']
        check(all(w in x for w, x in zip(en, texts)), f'la tumba y revivir, en inglés {texts}')
        done(ctx, errs, missing)
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(5)}}), locale='en-US')
        pg.click('#shopBtn')
        pg.wait_for_timeout(300)
        hint = pg.text_content('#trayHint')
        check('If it doesn’t eat within 2 days and 19 hours' in hint, f'cuánto le queda, en inglés ({hint.strip()})')
        pg.click('#trayNameBtn')
        pg.wait_for_timeout(300)
        check(pg.text_content('#dlgTitle') == 'Name your buddy' and 'Only you can see it' in pg.text_content('#dlg'), 'el diálogo del nombre, en inglés')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ E
        print('E. Solo le da hambre al que está contigo')
        ctx, pg, errs, missing = open_app(browser, state(None, {
            'pinguino': {'fullness': 80, 'at': ago(1), 'name': 'Copito'},
            'tiburon-martillo': {'fullness': 0, 'at': ago(10), 'dead': ago(5), 'rest': True, 'name': 'Martillo'},
        }), route='#/perfil')
        pg.wait_for_timeout(300)
        cards = pg.evaluate("[...document.querySelectorAll('#companionGrid .companion-card')].map((c) => ({ dead: c.classList.contains('is-dead'), tag: (c.querySelector('.nametag') || {}).textContent || '', tomb: !!c.querySelector('.companion--tomb') }))")
        check(any(c['dead'] and c['tomb'] and c['tag'] == 'Martillo' for c in cards), 'el perfil muestra la tumba y el nombre del que murió')
        check(any(c['tag'] == 'Copito' and not c['dead'] for c in cards), 'y el nombre del pingüino')
        pg.click('#companionGrid .companion-card:not(.is-using) .btn--gold >> nth=0')
        pg.wait_for_timeout(300)
        s = saved(pg)
        comp = s['profile']['companion']
        check(s['pets']['pinguino'].get('rest') is True and s['pets']['pinguino'].get('name') == 'Copito', 'el pingüino queda descansando (con su nombre)')
        check(comp in s['pets'] and 'rest' not in s['pets'][comp] and s['pets'][comp]['fullness'] == 60, f'el nuevo compañero ({comp}) llega con 60 y empieza a tener hambre')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ F
        print('F. Datos de la v4.1')
        old = state(None, {}, v=3)
        old['createdAt'] = ago(24 * 90)  # nunca le dio de comer: con las reglas viejas, en 0 hace meses
        ctx, pg, errs, missing = open_app(browser, old)
        pg.wait_for_timeout(500)
        check(face(pg) == 'llorando', 'al actualizar no está muerto: llora (tiene 3 días para comer)')
        s = saved(pg)
        check(s['v'] == 4 and s['pets']['pinguino']['fullness'] == 0, 'los datos pasan a la v4 con su barriguita')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ G
        print('G. Paisaje')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1)}}), width=1280)
        check(pg.evaluate("document.querySelector('.walker--fox .sprite--zorro-camina') !== null"), 'el zorro camina con su sprite de 4 cuadros')
        check(pg.evaluate("document.querySelector('.sc-roast2 image').getAttribute('href')") == 'assets/sprites/zorro-malvavisco.webp', 'de noche el zorro asa malvaviscos junto a la fogata')
        # La prueba "pone la noche" a mano. Pero la app, cada minuto, vuelve a poner la fase según la hora real
        # (updatePhase en main.js): si ese minuto cae justo aquí, la noche se quita y la prueba fallaba a veces.
        # Por eso NIGHT vuelve a poner la noche si la app la quitó. Además, el paisaje cambia de fase con una
        # transición de 2,5 s, que con el equipo ocupado tarda un poco más: se espera a que termine (hasta 12 s)
        # en vez de un tiempo fijo. (Sin wait_for_function: con Trusted Types, Playwright no puede usarlo aquí.)
        NIGHT = "(() => { const s = document.querySelector('.scenery'); if (s.dataset.phase !== 'night') s.dataset.phase = 'night'; })()"
        CAMP = "getComputedStyle(document.querySelector('.sc-camp')).opacity"
        pg.evaluate(NIGHT)
        camp = ''
        for _ in range(60):
            pg.wait_for_timeout(200)
            pg.evaluate(NIGHT)
            camp = pg.evaluate(CAMP)
            if camp == '1':
                break
        check(camp == '1', f'la fogata se ve de noche (opacidad {camp})')
        xs = set()
        for _ in range(26):
            pg.evaluate(NIGHT)
            xs.add(pg.evaluate("getComputedStyle(document.querySelector('.sc-roast2__strip')).transform"))
            pg.wait_for_timeout(400)
        check(len(xs) >= 3, f'el zorro cambia de cuadro ({len(xs)} distintos)')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ H
        print('H. Menos animaciones')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(5)}}, reduce=True))
        seen = frames_seen(pg, '#buddy .psprite', 1500)
        check(seen == {'25%'}, f'el llanto queda quieto en un cuadro ({seen})')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ J
        print('J. Tocar al compañero le pone nombre')
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1)}}))
        pg.click('#buddy')
        pg.wait_for_timeout(400)
        check(pg.evaluate("document.getElementById('dlg').open && !!document.querySelector('#dlg #petNameInput')"), 'sin nombre: tocarlo abre "Ponle nombre a tu compañero"')
        pg.fill('#petNameInput', 'Copito')
        pg.click('#dlg [data-primary]')
        pg.wait_for_timeout(300)
        check(pg.text_content('#buddy .nametag') == 'Copito', 'y el nombre queda puesto')
        pg.wait_for_timeout(2800)  # termina de hablar
        pg.click('#buddy')
        pg.wait_for_timeout(300)
        check(not pg.evaluate("document.getElementById('dlg').open") and pg.evaluate("!!document.querySelector('#buddy .say')"), 'con nombre: tocarlo no abre el diálogo, habla')
        done(ctx, errs, missing)

        # El recordatorio: con el azar fijo en 0 pide nombre; en 0.9 no. Nunca dos veces seguidas.
        SAYS = "async (r) => { Math.random = () => r; const m = await import('./js/ui/focus.js'); m.buddySays(); const s = document.querySelector('#buddy .say'); return s ? s.textContent : ''; }"
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1)}}))
        a, b, c = pg.evaluate(SAYS, 0), pg.evaluate(SAYS, 0), pg.evaluate(SAYS, 0)
        check('nombre' in a and 'Tócame' in a, f'sin nombre, a veces pide uno ({a})')
        check('nombre' not in b, f'pero nunca dos veces seguidas ({b})')
        check('nombre' in c, f'y después lo vuelve a pedir ({c})')
        d, e = pg.evaluate(SAYS, 0.9), pg.evaluate(SAYS, 0.9)
        check('nombre' not in d and 'nombre' not in e, f'las demás veces dice su onomatopeya ({d} / {e})')
        done(ctx, errs, missing)
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1), 'name': 'Copito'}}))
        a, b = pg.evaluate(SAYS, 0), pg.evaluate(SAYS, 0)
        check('nombre' not in a and 'nombre' not in b, f'con nombre nunca lo pide ({a} / {b})')
        done(ctx, errs, missing)
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 0, 'at': ago(100)}}))
        check(pg.evaluate(SAYS, 0) == '', 'muerto no dice nada')
        done(ctx, errs, missing)
        ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 80, 'at': ago(0.1)}}), locale='en-US')
        a = pg.evaluate(SAYS, 0)
        check('name' in a and 'Tap me' in a, f'en inglés, el recordatorio está traducido ({a})')
        done(ctx, errs, missing)

        # ------------------------------------------------------------------ K
        print('K. En el celular, la bandeja no tapa al compañero')
        GEOM = """(() => {
          const R = (s) => document.querySelector(s).getBoundingClientRect();
          const b = R('#buddy'), t = R('#foodTray'), n = R('#buddy .nametag');
          return { open: document.documentElement.classList.contains('tray-open'), buddyBottom: b.bottom, trayTop: t.top,
                   tagTop: n.top, tagBottom: n.bottom, clock: parseFloat(getComputedStyle(document.querySelector('#clock')).fontSize) };
        })()"""
        for w, hgt in [(360, 640), (384, 832), (412, 915)]:
            ctx, pg, errs, missing = open_app(browser, state(None, {'pinguino': {'fullness': 30, 'at': ago(0.1), 'name': 'Copito'}}), width=w, height=hgt)
            pg.click('#shopBtn')
            pg.wait_for_timeout(500)
            g = pg.evaluate(GEOM)
            check(g['open'] and g['buddyBottom'] <= g['trayTop'], f'{w}×{hgt}: el compañero queda entero encima de la bandeja (abajo {g["buddyBottom"]:.0f} ≤ bandeja {g["trayTop"]:.0f})')
            check(g['tagTop'] >= 0 and g['tagBottom'] <= g['trayTop'], f'{w}×{hgt}: su nombre se ve ({g["tagTop"]:.0f}–{g["tagBottom"]:.0f})')
            check(g['clock'] >= 32, f'{w}×{hgt}: el reloj sigue legible ({g["clock"]:.0f} px)')
            gems0 = saved(pg)['progress']['gems']
            a = pg.locator('#trayFoods .tray-food[data-food="pescado"]').bounding_box()
            b = pg.locator('#buddy').bounding_box()
            x0, y0 = a['x'] + a['width'] / 2, a['y'] + a['height'] / 2
            x1, y1 = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
            pg.mouse.move(x0, y0)
            pg.mouse.down()
            for k in range(1, 11):
                pg.mouse.move(x0 + (x1 - x0) * k / 10, y0 + (y1 - y0) * k / 10)
            pg.mouse.up()
            pg.wait_for_timeout(300)
            check(saved(pg)['progress']['gems'] == gems0 - 2, f'{w}×{hgt}: arrastrar el pescado hasta él se lo da')
            pg.click('#trayClose')
            pg.wait_for_timeout(200)
            check(not pg.evaluate("document.documentElement.classList.contains('tray-open')"), f'{w}×{hgt}: al cerrar la bandeja, el reloj vuelve a su tamaño')
            done(ctx, errs, missing)

        # ------------------------------------------------------------------ M
        print('M. El botón de la tienda no tapa al compañero; la barra de abajo, pareja; el sol, lejos de los botones')
        RECT = "(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }"

        def overlap(a, b):
            return bool(a and b and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3])

        for w, hgt in [(360, 640), (384, 832), (412, 915), (1280, 800)]:
            ctx, pg, errs, missing = open_app(browser, state('zorro-artico', {'zorro-artico': {'fullness': 20, 'at': ago(0.1), 'name': 'Zorrito'}}), width=w, height=hgt)
            for opened in (False, True):
                if opened:
                    pg.click('#shopBtn')
                    pg.wait_for_timeout(500)
                shop, buddy, tag = pg.evaluate(RECT, '#shopBtn'), pg.evaluate(RECT, '#buddy'), pg.evaluate(RECT, '#buddy .nametag')
                how = 'bandeja abierta' if opened else 'bandeja cerrada'
                check(not overlap(shop, buddy) and not overlap(shop, tag), f'{w}×{hgt}, {how}: el botón de la tienda no se monta sobre el compañero ni su nombre')
                check(shop[2] < buddy[0], f'{w}×{hgt}, {how}: el botón queda al lado contrario del compañero')
            tabs = pg.evaluate("[...document.querySelectorAll('.tabs .tab')].map((t) => t.getBoundingClientRect().width)")
            bar = pg.evaluate("(() => { const n = document.querySelector('.tabs'); const r = n.getBoundingClientRect(); const c = getComputedStyle(n); return r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - parseFloat(c.borderLeftWidth) - parseFloat(c.borderRightWidth); })()")
            if w < 900:
                check(len(tabs) == 4 and abs(sum(tabs) - bar) < 2 and max(tabs) - min(tabs) < 1, f'{w}×{hgt}: las 4 pestañas llenan la barra parejo ({[round(t) for t in tabs]} de {bar:.0f})')
                pg.evaluate("document.querySelector('.scenery').dataset.phase = 'day'")
                sun = pg.evaluate(RECT, '.sc-sun--day')
                chips = [pg.evaluate(RECT, '#ambientBtn'), pg.evaluate(RECT, '#durationChip')]
                check(not any(overlap(sun, c) for c in chips), f'{w}×{hgt}: el sol de día no toca los botones de sonido y duración ({[round(v) for v in sun]})')
            else:
                check(len(tabs) == 4 and max(tabs) - min(tabs) < 1 and pg.evaluate("getComputedStyle(document.querySelector('.tabs')).gridAutoFlow") == 'row', 'computador: el menú sigue en una sola columna')
            done(ctx, errs, missing)

        browser.close()

    print('L. Consola y archivos')
    errs = [e for e in all_errs if 'supabase' not in e.lower() and 'Failed to load resource' not in e]
    check(not errs, f'sin errores en la consola {errs[:3]}')
    check(not all_missing, f'no falta ningún archivo {sorted(set(all_missing))[:5]}')
    fails = [m for ok, m in results if not ok]
    print(f'\n{len(results) - len(fails)}/{len(results)} comprobaciones correctas')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
