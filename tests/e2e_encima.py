"""
FrostPom v4.4.1 — "Siempre encima": el reloj en una ventanita encima de las demás ventanas.

Comprueba que:
  A. En el computador (Chrome/Edge, que tienen Document Picture-in-Picture) aparece el botón del pin
     arriba a la derecha del reloj, sin taparlo; en el celular y en navegadores sin esa función, no.
  B. Al tocarlo se abre la ventanita con sus estilos (el diseño del mockup del autor): título, la hora
     igual a la de la app, la frase, la barra con el compañero y los cinco botones. El botón de la app
     cambia al pin tachado.
  C. Los botones de la ventanita mueven el reloj de la app: empezar, pausar (también con la barra
     espaciadora), reiniciar, saltar al descanso y "lo siguiente empieza solo" (el mismo ajuste de
     Ajustes). Los avisos de la app también salen en la ventanita.
  D. Con el pin tachado (en la app o en la ventanita) se cierra y todo vuelve a como estaba.
  E. En inglés, los textos de la ventanita salen en inglés.
  F. Sin errores en la consola.

Ojo: aquí NO se usa page.route (el servidor simulado): Playwright deja de cargar los archivos de la
ventanita cuando intercepta las peticiones. Por eso se usa un estado sin cuenta (no llama al
servidor) y, por si acaso, cualquier llamada a Supabase falla al instante (nunca toca el de verdad).

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_encima.py http://localhost:8000/
"""
import os
import sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_mascota import SEED, state  # la misma semilla (sin cuenta: no llama al servidor)

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
results = []

# Nunca llamar a Supabase de verdad desde esta prueba
NO_CLOUD = """(() => {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => (String((input && input.url) || input).includes('supabase.co')
    ? Promise.reject(new TypeError('sin servidor en esta prueba')) : real(input, init));
})();"""
SIN_PIP = "delete window.documentPictureInPicture;"


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('  OK  ' if cond else '  XX  ') + msg)


def main():
    errs = []
    with sync_playwright() as p:
        browser = browser_ = p.chromium.launch()

        def open_app(width=1366, height=768, mobile=False, lang=None, no_pip=False):
            ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile,
                                      locale='es-CO', service_workers='block', reduced_motion='reduce')
            ctx.add_init_script(NO_CLOUD)
            if no_pip:
                ctx.add_init_script(SIN_PIP)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
            pg.on('console', lambda m: m.type == 'error' and errs.append(f'console: {m.text}'))
            pg.goto(URL + '#/enfocar')
            pg.evaluate(SEED, state('pinguino'))
            if lang:
                pg.evaluate(f"localStorage.setItem('st2_lang', '{lang}')")
            pg.reload()
            pg.wait_for_timeout(1200)
            return ctx, pg

        print('A. El botón del pin')
        ctx, pg = open_app()
        check(pg.is_visible('#pinBtn'), 'en el computador aparece el botón del pin')
        check(pg.get_attribute('#pinBtn', 'aria-pressed') == 'false' and 'encima' in (pg.get_attribute('#pinBtn', 'aria-label') or ''),
              'el botón dice para qué sirve y empieza apagado')
        boxes = pg.evaluate("""() => {
          const r = (s) => document.querySelector(s).getBoundingClientRect();
          const a = r('#pinBtn'), clock = r('#clock'), ring = r('#ring'), shop = r('#shopBtn');
          const hit = (x, y) => !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top);
          return { inRing: a.left >= ring.left - 1 && a.right <= ring.right + 1 && a.top >= ring.top - 1, overClock: hit(a, clock), overShop: hit(a, shop) };
        }""")
        check(boxes['inRing'] and not boxes['overClock'] and not boxes['overShop'], 'queda en la esquina del reloj, sin tapar la hora ni la tienda')

        print('B. La ventanita')
        with ctx.expect_page() as info:
            pg.click('#pinBtn')
        pip = info.value
        pip.on('pageerror', lambda e: errs.append(f'pip pageerror: {e}'))
        pip.on('console', lambda m: m.type == 'error' and errs.append(f'pip console: {m.text}'))
        pip.set_viewport_size({'width': 460, 'height': 230})
        pip.wait_for_timeout(700)
        styled = pip.evaluate("getComputedStyle(document.querySelector('.pip__card')).position === 'absolute' && getComputedStyle(document.querySelector('.pip__scene')).backgroundImage.includes('artico-amigos')")
        check(styled, 'la ventanita carga sus estilos y el paisaje de los animales')
        check(pip.text_content('.pip__title') == 'Modo enfoque' and pip.inner_text('.pip__title') == 'MODO ENFOQUE', 'el título dice "MODO ENFOQUE"')
        check(pip.text_content('.pip__clock') == pg.text_content('#clock') == '25:00', 'la hora es la misma de la app (25:00)')
        check(pip.text_content('.pip__sub') == 'Listo cuando tú lo estés' and pip.text_content('.pip__bubble') == '¿Empezamos?', 'la frase y el globito de los animales')
        check(pip.locator('.pip__controls button').count() == 5, 'tiene los cinco botones del mockup')
        check(pip.get_attribute('.pip__pet', 'src').endswith('assets/companions/pinguino.webp'), 'tu compañero va encima de la barra')
        check(pip.is_disabled('button[data-act="reset"]') and pip.is_disabled('button[data-act="finish"]'), 'sin empezar, "Reiniciar" y "Terminar" están apagados')
        check(pg.get_attribute('#pinBtn', 'aria-pressed') == 'true' and pg.evaluate("document.documentElement.classList.contains('pip-open')"),
              'el botón de la app cambia al pin tachado')

        print('C. Los botones mueven el reloj de la app')
        pip.click('button[data-act="toggle"]')
        pip.wait_for_timeout(2300)
        check(pg.get_attribute('#ring', 'data-status') == 'running' and pip.get_attribute('.pip', 'data-status') == 'running', '▶ empieza el pomodoro en la app')
        a, b = pip.text_content('.pip__clock'), pg.text_content('#clock')
        check(a == b and a < '25:00', f'la hora baja igual en las dos ({a} y {b})')
        check(pip.text_content('.pip__bubble') == '¡Estudiando juntos!' and pip.text_content('.pip__sub') == 'Hora de concentrarse', 'mientras estudias: "¡Estudiando juntos!"')
        check(float(pip.evaluate("getComputedStyle(document.querySelector('.pip')).getPropertyValue('--done')") or 0) > 0, 'la barra avanza')
        pip.click('button[data-act="finish"]')
        pip.wait_for_timeout(300)
        check(pip.is_visible('.pip__notice') and 'al menos 1 minuto' in pip.text_content('.pip__notice'), 'los avisos de la app también salen en la ventanita')
        pip.evaluate('document.activeElement && document.activeElement.blur()')  # sin un botón con el foco
        pip.keyboard.press('Space')
        pip.wait_for_timeout(300)
        check(pg.get_attribute('#ring', 'data-status') == 'paused' and pip.text_content('.pip__sub') == 'En pausa', 'la barra espaciadora pausa (en la ventanita)')
        before = pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).settings.autoBreak")
        pip.click('button[data-act="auto"]')
        pip.wait_for_timeout(300)
        after = pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).settings.autoBreak")
        check(after == (not before) and pip.get_attribute('button[data-act="auto"]', 'aria-pressed') == str(after).lower(),
              '🔁 cambia "lo siguiente empieza solo" (el mismo ajuste de Ajustes)')
        pg.goto(URL + '#/ajustes')
        pg.wait_for_timeout(400)
        check(pg.is_checked('#afterStudyAuto' if after else '#afterStudyWait'), 'y Ajustes muestra el cambio')
        pg.goto(URL + '#/enfocar')
        pg.wait_for_timeout(300)
        pip.click('button[data-act="reset"]')
        pip.wait_for_timeout(300)
        check(pg.get_attribute('#ring', 'data-status') == 'idle' and pip.text_content('.pip__clock') == '25:00', '⏮ reinicia el bloque')
        pip.click('button[data-act="skip"]')
        pip.wait_for_timeout(300)
        check(pg.get_attribute('#ring', 'data-mode') == 'break' and pip.text_content('.pip__title') == 'Descanso' and pip.get_attribute('.pip', 'data-mode') == 'break',
              '⏭ salta al descanso (y la ventanita lo dice)')
        check(pip.is_disabled('button[data-act="finish"]'), 'en el descanso "Terminar y guardar" no aplica')

        print('D. Cerrar')
        with pip.expect_event('close'):
            pip.click('.pip__unpin')
        pg.wait_for_timeout(300)
        check(pg.get_attribute('#pinBtn', 'aria-pressed') == 'false' and not pg.evaluate("document.documentElement.classList.contains('pip-open')"),
              'el pin tachado de la ventanita la cierra y el botón vuelve a ser el pin')
        with ctx.expect_page() as info:
            pg.click('#pinBtn')
        pip = info.value
        pip.wait_for_timeout(500)
        with pip.expect_event('close'):
            pg.click('#pinBtn')
        pg.wait_for_timeout(300)
        check(pg.get_attribute('#pinBtn', 'aria-pressed') == 'false', 'tocar el pin tachado de la app también la cierra')
        ctx.close()

        print('E. En inglés')
        ctx, pg = open_app(lang='en')
        with ctx.expect_page() as info:
            pg.click('#pinBtn')
        pip = info.value
        pip.wait_for_timeout(500)
        check(pip.text_content('.pip__title') == 'Focus session' and pip.text_content('.pip__bubble') == 'Shall we start?', 'la ventanita habla inglés')
        check(pip.get_attribute('button[data-act="toggle"]', 'aria-label') == 'Start studying', 'y sus botones también')
        ctx.close()

        print('A2. Donde no existe')
        ctx, pg = open_app(width=390, height=844, mobile=True)
        check(not pg.is_visible('#pinBtn'), 'en el celular no aparece (no hay ventanas encima)')
        ctx.close()
        ctx, pg = open_app(no_pip=True)
        check(pg.is_hidden('#pinBtn'), 'en un navegador sin esa función (Safari, Firefox viejo) no aparece')
        ctx.close()
        browser_.close()

    print('F. Consola')
    errs = [e for e in errs if 'Service Worker' not in e]
    check(not errs, f'sin errores en la consola {errs[:3]}')
    ok = sum(1 for r in results if r[0])
    print(f'\n{ok}/{len(results)} comprobaciones correctas')
    sys.exit(0 if ok == len(results) else 1)


if __name__ == '__main__':
    main()
