"""
FrostPom v4.1 — lo que piden Google Play y la app de Android, con Supabase y Capacitor SIMULADOS.

Comprueba que:
  A. Ranking: cada nombre de otra persona tiene ⋯ con "Reportar nombre" y "No ver más a esta
     persona"; el reporte llega al servidor con el motivo; quien reporta deja de ver ese nombre;
     "Mostrar de nuevo" lo devuelve; el tope diario se explica; tu propia fila no tiene ⋯.
  B. Sin cuenta en línea (menor de 13) el reporte se ofrece por correo.
  C. "Crear cuenta" dice que aceptas las normas (con enlaces que abren aparte), y las páginas
     normas.html y eliminar-cuenta.html cargan sin errores, en español e inglés.
  D. Dentro de la app (Capacitor simulado): sin service worker; canal de notificaciones; botón
     atrás (ventanas, pantallas y minimizar); permiso de notificaciones al primer pomodoro;
     aviso programado al salir de la app y cancelado al volver; vibración nativa;
     recordatorios semanales con el día correcto; enlaces a páginas en el navegador del teléfono.
  F. (v4.6) Con el complemento FrostTimer simulado (la notificación en curso y el widget): cada
     cambio del reloj le llega con sus datos; lo que se toca en la notificación o en el widget con
     la app cerrada se aplica al volver con su hora; el aviso del final ya no lo programa
     LocalNotifications; el permiso de alarmas exactas se pide una vez, después del primer pomodoro.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_android.py http://localhost:8000/
"""
import json
import os
import sys
import time
from datetime import datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase
from _sheets import patch as sheets_patch  # (v4.3) en el celular, varias secciones se abren como ventana

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


# Puente de Capacitor de mentira: lo que el teléfono le pone a la página antes de que cargue.
FAKE_CAP = r"""
(() => {
  const calls = []; const listeners = {}; let perm = 'prompt';
  window.__cap = { calls, listeners, setPerm: (p) => { perm = p; } };
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
      if (plugin === 'LocalNotifications' && method === 'checkPermissions') return Promise.resolve({ display: perm });
      if (plugin === 'LocalNotifications' && method === 'requestPermissions') { perm = 'granted'; return Promise.resolve({ display: perm }); }
      if (plugin === 'LocalNotifications' && method === 'schedule') return Promise.resolve({ notifications: (options.notifications || []).map((n) => ({ id: n.id })) });
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


# (v4.6) El complemento FrostTimer de mentira (native/frostpom-timer): anota lo que recibe y deja
# simular botones tocados en la notificación o en el widget (pending + el evento actionsPending).
FAKE_TIMER = r"""
(() => {
  const cap = window.Capacitor; const st = window.__cap;
  st.pending = []; st.exact = false;
  cap.PluginHeaders.push({ name: 'FrostTimer', methods: [
    ...['update', 'getPendingActions', 'canScheduleExactAlarms', 'openExactAlarmSettings'].map((name) => ({ name, rtype: 'promise' })),
    ...['addListener', 'removeListener'].map((name) => ({ name, rtype: 'callback' })),
  ] });
  const base = cap.nativePromise;
  cap.nativePromise = (plugin, method, options) => {
    if (plugin !== 'FrostTimer') return base(plugin, method, options);
    st.calls.push([plugin, method, JSON.parse(JSON.stringify(options || {}))]);
    if (method === 'getPendingActions') return Promise.resolve({ actions: st.pending.splice(0) });
    if (method === 'canScheduleExactAlarms') return Promise.resolve({ value: st.exact });
    return Promise.resolve({});
  };
})();
"""


def device(browser, fake, locale='es-CO', native=False, timer=False):
    ctx = browser.new_context(viewport={'width': 412, 'height': 900}, locale=locale,
                              service_workers='allow' if native else 'block')
    ctx.route(f'{SUPA}/**', fake.handle)
    if native:
        ctx.add_init_script(FAKE_CAP)
    if timer:
        ctx.add_init_script(FAKE_TIMER)
    pg = sheets_patch(ctx.new_page())
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    return ctx, pg, errs


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def dlg_open(pg):
    return pg.evaluate("document.getElementById('dlg').open")


def toasts(pg):
    return pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ')")


def register(pg, user, birth, email=''):
    pg.fill('#accUser', user); pg.fill('#accPass1', 'Pingu2026'); pg.fill('#accPass2', 'Pingu2026')
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    if email:
        pg.fill('#accEmail', email)
    pg.click("#dlg button:has-text('Crear cuenta'), #dlg button:has-text('Create account')")
    pg.wait_for_timeout(1500)


def close_dialogs(pg):
    for _ in range(6):
        if not dlg_open(pg):
            return
        if 'Ponle' in title(pg) or 'Put a face' in title(pg):
            pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')")
        else:
            pg.click('#dlg .dlg__actions button:last-child')
        pg.wait_for_timeout(500)


def calls(pg, plugin=None, method=None):
    out = pg.evaluate('window.__cap.calls')
    return [c for c in out if (plugin is None or c[0] == plugin) and (method is None or c[1] == method)]


def back(pg):
    pg.evaluate("window.__cap.listeners['App.backButton']({ canGoBack: false })")
    pg.wait_for_timeout(350)


def nick_texts(pg):
    return pg.evaluate("[...document.querySelectorAll('#podium .podium__nick, #board .row__nick')].map(e => e.textContent)")


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))

    # ---------- A. Reportar y ocultar en el ranking (cuenta en línea) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    consent = pg.evaluate("""(() => { const c = document.querySelector('#dlg .consent'); if (!c) return null;
      return { text: c.textContent, links: [...c.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.target, a.rel]) }; })()""")
    check(consent and 'aceptas las normas de la comunidad' in consent['text']
          and ['normas.html', '_blank', 'noopener'] in consent['links'] and ['privacidad.html', '_blank', 'noopener'] in consent['links'],
          'al crear la cuenta se aceptan las normas de la comunidad (los enlaces abren aparte y no borran lo escrito)')
    register(pg, 'tester_rep', '2000-05', 'rep@example.com')
    close_dialogs(pg)
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    more = pg.evaluate("[...document.querySelectorAll('.row__more')].map(b => b.getAttribute('aria-label'))")
    check(len(more) == 4 and 'Opciones para Luna_K' in more, f'cada nombre de otra persona tiene ⋯ ({len(more)} botones)')
    check(not pg.query_selector('.is-you .row__more'), 'tu propia fila no tiene ⋯')
    pg.click("button[aria-label='Opciones para Luna_K']"); pg.wait_for_timeout(400)
    check(title(pg) == 'Opciones para Luna_K', 'el menú dice de qué nombre se trata')
    pg.click("#dlg button:has-text('Reportar nombre')"); pg.wait_for_timeout(400)
    radios = pg.evaluate("[...document.querySelectorAll('#dlg input[name=reportReason]')].map(i => [i.id, i.checked])")
    check(len(radios) == 4 and radios[0][1] and all(r[0] for r in radios), 'el reporte pide el motivo (4 opciones, la primera marcada, todas con id)')
    pg.click("label:has(#reportReason-suplantacion)")
    pg.click("#dlg button:has-text('Enviar reporte')"); pg.wait_for_timeout(1200)
    me = next((k for k, v in fake.users.items() if v.get('email') == 'rep@example.com'), None)
    check(fake.reports == [(me, 'seed1', 'suplantacion')], f'el reporte llega al servidor con el motivo elegido: {fake.reports}')
    check(not dlg_open(pg) and 'Gracias por avisar' in toasts(pg), 'al enviar, la ventana se cierra y la app da las gracias')
    check('Luna_K' not in ' '.join(nick_texts(pg)), 'quien reporta deja de ver ese nombre')
    check('Ocultaste a 1 persona' in pg.inner_text('#board'), 'al final del ranking dice cuántas personas ocultaste')

    pg.click("button[aria-label='Opciones para Ana_23']"); pg.wait_for_timeout(400)
    pg.click("#dlg button:has-text('No ver más a esta persona')"); pg.wait_for_timeout(800)
    check('Ana_23' not in ' '.join(nick_texts(pg)) and 'Ya no verás a Ana_23' in toasts(pg), '"No ver más a esta persona" la oculta al instante')
    check(len(fake.reports) == 1, 'ocultar no envía nada al servidor')
    pg.reload(); pg.wait_for_timeout(1200)
    close_dialogs(pg)
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    check(not any(n in ' '.join(nick_texts(pg)) for n in ('Ana_23', 'Luna_K')) and 'Ocultaste a 2 personas' in pg.inner_text('#board'),
          'las personas ocultas siguen ocultas al volver a abrir la app')
    pg.click('#boardUnhide'); pg.wait_for_timeout(1200)
    check(all(n in ' '.join(nick_texts(pg)) for n in ('Ana_23', 'Luna_K')) and not pg.query_selector('#boardUnhide'), '"Mostrar de nuevo" las devuelve')

    # Tope diario: el servidor dice que no, la ventana lo explica y no se cierra
    fake.reports.extend([(me, f'x{i}', 'otro') for i in range(20)])
    pg.click("button[aria-label='Opciones para pingu.sabio']"); pg.wait_for_timeout(400)
    pg.click("#dlg button:has-text('Reportar nombre')"); pg.wait_for_timeout(300)
    pg.click("#dlg button:has-text('Enviar reporte')"); pg.wait_for_timeout(1000)
    check(dlg_open(pg) and 'muchos reportes hoy' in pg.inner_text('#dlg .form-error'), 'con demasiados reportes en el día, la ventana lo explica')
    pg.click("#dlg button:has-text('Cancelar')"); pg.wait_for_timeout(400)
    bad = [e for e in errs if 'Failed to load resource' not in e]  # el 400 del tope lo anota el navegador: es lo que se prueba
    check(not bad, 'sin errores en la consola' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    ctx.close()

    # ---------- A2. En inglés ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, locale='en-US')
    pg.goto(URL); pg.wait_for_timeout(900)
    check('accept the community guidelines' in (pg.inner_text('#dlg .consent') or ''), 'en inglés: "By creating your account you accept the community guidelines…"')
    register(pg, 'tester_en', '2000-05', 'en@example.com')
    close_dialogs(pg)
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    pg.click("button[aria-label='Options for Luna_K']"); pg.wait_for_timeout(400)
    labels = pg.evaluate("[...document.querySelectorAll('#dlg .dlg__actions button')].map(b => b.textContent)")
    check(labels == ['Report name', 'Don’t show this person', 'Cancel'], f'en inglés: {labels}')
    pg.click("#dlg button:has-text('Report name')"); pg.wait_for_timeout(300)
    reasons = pg.evaluate("[...document.querySelectorAll('#dlg .report-reason')].map(l => l.textContent)")
    check(reasons[0] == 'It’s rude or offensive' and len(reasons) == 4, 'los motivos también están en inglés')
    ctx.close()

    # ---------- B. Sin cuenta en línea (menor de 13): el reporte va por correo ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    register(pg, 'peque_rep', '2016-02')
    close_dialogs(pg)
    calls_before = len(fake.calls)
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    pg.click("button[aria-label='Opciones para Luna_K']"); pg.wait_for_timeout(400)
    pg.click("#dlg button:has-text('Reportar nombre')"); pg.wait_for_timeout(400)
    txt = pg.inner_text('#dlg') if dlg_open(pg) else ''
    check('startupprometeus@gmail.com' in txt and 'Escribir el correo' in txt, 'un menor de 13 (sin cuenta en línea) puede reportar por correo')
    check(not fake.reports and all(c[0] == 'get_leaderboard' for c in fake.calls[calls_before:]), 'y la app no le crea una sesión ni le envía nada al servidor')
    ctx.close()

    # ---------- C. Páginas nuevas ----------
    ctx, pg, errs = device(browser, FakeSupabase())
    for page, must in [('normas.html', ['Normas de la comunidad de FrostPom', 'Reportar nombre', 'No ver más a esta persona', 'community guidelines']),
                       ('eliminar-cuenta.html', ['Eliminar tu cuenta de FrostPom', 'Startup Prometeus', 'startupprometeus@gmail.com', 'Qué se borra', 'Delete your FrostPom account']),
                       ('privacidad.html', ['eliminar-cuenta.html', 'normas.html', 'Google Play'])]:
        errs.clear()
        pg.goto(URL + page); pg.wait_for_timeout(500)
        html = pg.content()
        check(all(m in html for m in must) and not errs, f'{page} carga sin errores y dice lo necesario')
    mail = pg.goto(URL + 'eliminar-cuenta.html') and pg.get_attribute('a.legal__btn', 'href')
    check(mail and mail.startswith('mailto:startupprometeus@gmail.com?subject=Eliminar'), 'la página de borrado tiene el botón para escribirnos (sin la app)')
    ctx.close()

    # ---------- D. Dentro de la app de Android (Capacitor simulado) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, native=True)
    pg.goto(URL); pg.wait_for_timeout(1500)
    check(pg.evaluate("document.documentElement.classList.contains('is-native')"), 'la app sabe que está dentro de Android')
    chan = calls(pg, 'LocalNotifications', 'createChannel')
    check(chan and chan[0][2]['id'] == 'frostpom' and chan[0][2]['importance'] == 4, 'crea su canal de notificaciones')
    check('App.backButton' in pg.evaluate('Object.keys(window.__cap.listeners)'), 'escucha el botón atrás de Android')
    # En la pantalla de entrada (obligatoria) el botón atrás minimiza la app sin cerrar la ventana
    back(pg)
    check(dlg_open(pg) and calls(pg, 'App', 'minimizeApp'), 'en "Crea tu cuenta", atrás minimiza la app (no se salta el registro)')
    pg.click("#dlg .consent a[href='normas.html']"); pg.wait_for_timeout(400)
    opened = calls(pg, 'Browser', 'open')
    check(opened and opened[-1][2]['url'] == 'https://sebasurregor.github.io/FrostPom-Pomodoro-Timer/normas.html' and pg.url.startswith(URL),
          'las normas se abren en el navegador del teléfono (sin salir del registro)')
    register(pg, 'droid_user', '2000-05', 'droid@example.com')
    close_dialogs(pg)
    regs = pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
    check(regs == 0, 'dentro de la app no se registra el service worker')

    # Botón atrás en las pantallas
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(500)
    back(pg)
    check(pg.url.endswith('#/perfil'), 'atrás en Ajustes vuelve a Perfil')
    back(pg)
    check(pg.url.endswith('#/enfocar'), 'atrás en Perfil vuelve a Enfocar')
    n_min = len(calls(pg, 'App', 'minimizeApp'))
    back(pg)
    check(len(calls(pg, 'App', 'minimizeApp')) == n_min + 1, 'atrás en Enfocar manda la app a segundo plano')
    pg.goto(URL + '#/ranking'); pg.wait_for_timeout(1500)
    pg.click("button[aria-label='Opciones para Luna_K']"); pg.wait_for_timeout(400)
    back(pg)
    check(not dlg_open(pg) and pg.url.endswith('#/ranking'), 'atrás cierra una ventana abierta (y no cambia de pantalla)')

    # Primer pomodoro: pide permiso; al salir de la app programa el aviso; al volver lo cancela
    pg.goto(URL + '#/enfocar'); pg.wait_for_timeout(400)
    pg.click('#mainBtn'); pg.wait_for_timeout(800)
    check(calls(pg, 'LocalNotifications', 'requestPermissions'), 'al empezar el primer pomodoro pide permiso de notificaciones')
    vib = calls(pg, 'Haptics', 'vibrate')
    check(vib and vib[0][2] == {'duration': 25}, 'vibra con el motor del teléfono')
    t0 = time.time() * 1000
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: false })"); pg.wait_for_timeout(500)
    sch = [c for c in calls(pg, 'LocalNotifications', 'schedule') if c[2]['notifications'][0]['id'] == 1]
    n = sch[-1][2]['notifications'][0] if sch else {}
    at = n.get('schedule', {}).get('at', '')
    from datetime import datetime
    at_ms = datetime.fromisoformat(at.replace('Z', '+00:00')).timestamp() * 1000 if at else 0
    check(n.get('title') == '¡Sesión completa!' and n.get('channelId') == 'frostpom' and n.get('isExactNotification') is False
          and n.get('schedule', {}).get('allowWhileIdle') is True and 24 * 60_000 < at_ms - t0 <= 25 * 60_000 + 2000,
          f"al salir de la app, el teléfono programa el aviso del final (en {round((at_ms - t0) / 60000, 1)} min, sin pedir alarmas exactas)")
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: true })"); pg.wait_for_timeout(400)
    canc = calls(pg, 'LocalNotifications', 'cancel')
    check(canc and canc[-1][2] == {'notifications': [{'id': 1}]}, 'al volver a la app, el aviso se cancela (no llega repetido)')
    pg.click('#mainBtn'); pg.wait_for_timeout(300)  # pausa
    before = len(calls(pg, 'LocalNotifications', 'schedule'))
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: false })"); pg.wait_for_timeout(400)
    check(len(calls(pg, 'LocalNotifications', 'schedule')) == before, 'con el pomodoro en pausa no se programa ningún aviso')
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: true })"); pg.wait_for_timeout(300)

    # Recordatorios semanales: lunes y viernes a las 07:30 (en Capacitor 1 = domingo)
    ok = pg.evaluate("""import('./js/native.js').then(m => m.scheduleReminders({ on: true, time: '07:30', days: [1, 5], title: 'Hora', body: 'Ya' }))""")
    rem = calls(pg, 'LocalNotifications', 'schedule')[-1][2]['notifications']
    check(ok and [(r['id'], r['schedule']['on']) for r in rem] == [(101, {'weekday': 2, 'hour': 7, 'minute': 30}), (105, {'weekday': 6, 'hour': 7, 'minute': 30})]
          and all(r['isExactNotification'] is False for r in rem), 'los recordatorios se programan el día correcto (lunes = 2, viernes = 6 en Capacitor)')
    pg.evaluate("import('./js/native.js').then(m => m.scheduleReminders({ on: false }))"); pg.wait_for_timeout(200)
    last = calls(pg, 'LocalNotifications', 'cancel')[-1][2]['notifications']
    check([x['id'] for x in last] == [100, 101, 102, 103, 104, 105, 106], 'apagar los recordatorios los quita todos')

    # Ajustes: el botón de notificaciones usa el permiso del teléfono; la privacidad abre aparte
    pg.goto(URL + '#/ajustes'); pg.wait_for_timeout(700)
    check(pg.inner_text('#notifBtn') == 'Notificaciones activadas' and pg.is_disabled('#notifBtn'), 'Ajustes muestra el permiso de notificaciones del teléfono')
    pg.click("a[data-page='privacidad.html']"); pg.wait_for_timeout(400)
    check(calls(pg, 'Browser', 'open')[-1][2]['url'].endswith('/FrostPom-Pomodoro-Timer/privacidad.html') and pg.url.endswith('#/ajustes'),
          'la política de privacidad se abre en el navegador del teléfono')
    bad = [e for e in errs if 'Failed to load resource' not in e]
    check(not bad, 'sin errores en la consola dentro de la app' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    ctx.close()

    # ---------- F. (v4.6) La notificación en curso y el widget (complemento FrostTimer simulado) ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake, native=True, timer=True)
    pg.clock.install(time=datetime(2026, 11, 11, 16, 0))
    pg.goto(URL); pg.wait_for_timeout(1500); pg.clock.run_for(500)
    register(pg, 'droid_widget', '2015-03')  # cuenta solo de este aparato (el complemento no necesita internet)
    close_dialogs(pg)
    pg.goto(URL + '#/enfocar'); pg.wait_for_timeout(500); pg.clock.run_for(300)

    def ups():
        return [c[2] for c in calls(pg, 'FrostTimer', 'update')]

    first = ups()
    check(first and first[-1]['status'] == 'idle' and first[-1]['texts']['modes']['study'] == 'Modo enfoque' and first[-1]['durations']['study'] == 25 * 60,
          'al abrir, el teléfono recibe el reloj en reposo con los textos y las duraciones')
    pg.click('#mainBtn'); pg.wait_for_timeout(300); pg.clock.run_for(300)
    now = pg.evaluate('Date.now()')
    u = ups()[-1]
    check(u['status'] == 'running' and u['mode'] == 'study' and abs(u['endAt'] - (now + 25 * 60_000)) < 3000 and len(u['block']) >= 8,
          'al empezar, el teléfono recibe la hora del fin (la notificación cuenta sola) y el número del bloque')
    n = len(ups())
    pg.clock.run_for(3000)
    check(len(ups()) == n, 'mientras corre no se le manda nada cada segundo (solo cuando algo cambia)')
    pg.clock.run_for(10_000)
    pg.click('#mainBtn'); pg.wait_for_timeout(300); pg.clock.run_for(300)
    u = ups()[-1]
    check(u['status'] == 'paused' and 24 * 60_000 < u['remainingMs'] < 25 * 60_000 and u['endAt'] == 0, 'en pausa recibe lo que falta (sin hora de fin)')
    # Con la app "cerrada" se toca Continuar en la notificación hace 2 minutos; al volver se aplica con esa hora
    block = u['block']
    left = u['remainingMs']
    now = pg.evaluate('Date.now()')
    pg.evaluate(f"window.__cap.pending.push({{ act: 'resume', at: {now - 120_000}, block: '{block}' }})")
    sch_before = len(calls(pg, 'LocalNotifications', 'schedule'))
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: false })"); pg.wait_for_timeout(300)
    check(len(calls(pg, 'LocalNotifications', 'schedule')) == sch_before, 'con el complemento, el aviso del final ya no lo programa LocalNotifications (lo lleva el complemento)')
    pg.evaluate("window.__cap.listeners['App.appStateChange']({ isActive: true })"); pg.wait_for_timeout(500); pg.clock.run_for(300)
    st = pg.evaluate("JSON.parse(localStorage.getItem('st2_timer'))")
    check(st['status'] == 'running' and abs(st['runStartMs'] - (now - 120_000)) < 50, 'al volver, se aplica "Continuar" con la hora en que se tocó')
    u = ups()[-1]
    check(u['status'] == 'running' and abs(u['endAt'] - (now - 120_000 + left)) < 1500, 'y el teléfono recibe la hora del fin corregida')
    # Con la app abierta: "Terminar y guardar" en la notificación (llega el evento actionsPending)
    sessions0 = len(pg.evaluate("JSON.parse(localStorage.getItem('st2_state')).sessions"))
    now = pg.evaluate('Date.now()')
    pg.evaluate(f"window.__cap.pending.push({{ act: 'finish', at: {now}, block: '{block}' }})")
    pg.evaluate("window.__cap.listeners['FrostTimer.actionsPending']({})"); pg.wait_for_timeout(600); pg.clock.run_for(500)
    stt = pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")
    check(len(stt['sessions']) == sessions0 + 1 and stt['sessions'][0]['id'] == block and not stt['sessions'][0]['completed'] and stt['sessions'][0]['actualSec'] >= 130,
          f"\"Terminar y guardar\" desde la notificación guarda la sesión ({stt['sessions'][0]['actualSec']} s)")
    check(ups()[-1]['status'] == 'idle', 'y el teléfono quita el pomodoro de la notificación')
    # Una acción vieja (de otro bloque) no se aplica
    pg.evaluate("window.__cap.pending.push({ act: 'pause', at: Date.now(), block: 'otro-bloque-0000' })")
    pg.evaluate("window.__cap.listeners['FrostTimer.actionsPending']({})"); pg.wait_for_timeout(400)
    check(pg.get_attribute('#ring', 'data-status') == 'idle', 'una acción de otro bloque se ignora')
    # Empezar desde el widget hace 3 minutos (app cerrada)
    if pg.get_attribute('#ring', 'data-mode') != 'study':
        pg.click('#skipBtn'); pg.wait_for_timeout(300)
    now = pg.evaluate('Date.now()')
    pg.evaluate(f"window.__cap.pending.push({{ act: 'start', at: {now - 180_000}, block: '' }})")
    pg.evaluate("window.__cap.listeners['FrostTimer.actionsPending']({})"); pg.wait_for_timeout(500); pg.clock.run_for(500)
    clock = [int(x) for x in pg.inner_text('#clock').split(':')]
    left_sec = clock[0] * 60 + clock[1]
    check(pg.get_attribute('#ring', 'data-status') == 'running' and 21 * 60 + 50 <= left_sec <= 22 * 60, f'"Empezar" desde el widget cuenta desde que se tocó (faltan {pg.inner_text("#clock")} de 25:00)')
    # Primer pomodoro completo: se pide (una vez) el permiso de alarmas exactas
    pg.clock.fast_forward('22:00'); pg.clock.run_for(3000)
    close_dialogs_but = None
    for _ in range(4):
        if dlg_open(pg) and '¿Te aviso justo a tiempo?' not in title(pg):
            pg.click('#dlg .dlg__actions button:last-child'); pg.wait_for_timeout(300)
    pg.clock.run_for(4500); pg.wait_for_timeout(500)
    check(title(pg) == '¿Te aviso justo a tiempo?' and 'Alarmas y recordatorios' in pg.inner_text('#dlg'),
          'después del primer pomodoro completo explica y pide el permiso de alarmas exactas')
    pg.click("#dlg button:has-text('Abrir ajustes')"); pg.wait_for_timeout(400)
    check(calls(pg, 'FrostTimer', 'openExactAlarmSettings'), '"Abrir ajustes" abre la pantalla de Android de ese permiso')
    check(pg.evaluate("localStorage.getItem('st2_exact_asked')") == '1', 'y no se vuelve a preguntar')
    bad = [e for e in errs if 'Failed to load resource' not in e]
    check(not bad, 'sin errores con el complemento' + (': ' + ' | '.join(bad[:3]) if bad else ''))
    ctx.close()

    # ---------- E. En la web nada de esto cambia ----------
    fake = FakeSupabase()
    ctx, pg, errs = device(browser, fake)
    pg.goto(URL); pg.wait_for_timeout(900)
    check(not pg.evaluate("document.documentElement.classList.contains('is-native')")
          and not pg.evaluate("[...performance.getEntriesByType('resource')].some(r => r.name.includes('capacitor-core'))"),
          'en la web no se carga nada de Capacitor')
    ctx.close()
    browser.close()

bad = [m for ok, m in results if not ok]
print('\nTodo bien.' if not bad else f'\n{len(bad)} fallas.')
sys.exit(0 if not bad else 1)
