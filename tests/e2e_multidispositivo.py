"""
FrostPom — tu cuenta en todos tus aparatos (v4.5) con un Supabase SIMULADO (tests/_fake_supabase.py).

Dos navegadores con la MISMA cuenta en línea y el mismo servidor simulado:
  1. Empezar en A → B lo ve en menos de 12 s (con la misma cuenta regresiva).
  2. Pausar en B → A se pausa ("Pausado desde otro aparato").
  3. Llega a cero en los dos → se guarda UNA sola vez (XP, minutos y ranking).
  4. "Terminar y guardar" en B → A lo ve terminado.
  5. Los dos sin internet → al reconectar se suman los minutos de los dos y no se pierde la compra
     (la mezcla de tres copias, js/merge.js) y el pomodoro que terminó en los dos se cuenta una vez.
  6. Un servidor sin la v4.5 (schema.sql viejo): la app sigue como antes, sin errores.

Uso (con la app servida: python -m http.server 8000):
    python tests/e2e_multidispositivo.py http://localhost:8000/
"""
import os, sys, re, json, datetime, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fake_supabase import FakeSupabase

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
OUT = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='frostpom-multi-')
SUPA = 'https://tcxdmziakgppabwyrydd.supabase.co'
results = []


def check(cond, msg):
    results.append((bool(cond), msg))
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)


def device(browser, fake, locale='es-CO'):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale=locale, service_workers='block')
    net = {'off': False}
    # Sin internet: las llamadas al servidor simulado fallan (set_offline no frena las rutas simuladas)
    ctx.route(f'{SUPA}/**', lambda r: r.abort('internetdisconnected') if net['off'] else fake.handle(r))
    # Se anotan todos los avisos (así la prueba no depende de cuánto duran en pantalla)
    ctx.add_init_script("document.addEventListener('frostpom:toast', (e) => { (window.__toasts = window.__toasts || []).push(e.detail.text); });")
    pg = ctx.new_page()
    pg.net = net
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    logs = []
    pg.on('console', lambda m: logs.append(m.text))
    pg.clock.install(time=datetime.datetime(2026, 11, 11, 16, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-5))))
    pg.logs = logs
    return ctx, pg, errs


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def title(pg):
    return pg.evaluate("document.getElementById('dlg').open ? document.getElementById('dlgTitle')?.textContent || '' : ''")


def toasts(pg):
    return pg.evaluate("(window.__toasts || []).join(' | ')")


def clear_toasts(*pages):
    for pg in pages:
        pg.evaluate("window.__toasts = []")


def status(pg):
    return pg.get_attribute('#ring', 'data-status'), pg.get_attribute('#ring', 'data-mode')


def clock_sec(pg):
    parts = [int(x) for x in pg.inner_text('#clock').strip().split(':')]
    sec = 0
    for x in parts:
        sec = sec * 60 + x
    return sec


def settle(fake, pages, ms=700, rounds=1):
    """Deja correr la red y los temporizadores cortos en todos los aparatos (y el servidor igual)."""
    for _ in range(rounds):
        fake.skew_ms += ms
        for pg in pages:
            pg.clock.run_for(ms)
        pages[0].wait_for_timeout(150)


def jump(fake, pages, ms):
    """Pasa el tiempo en todos los aparatos y en el servidor a la vez (como en la vida real)."""
    fake.skew_ms += ms
    for pg in pages:
        pg.clock.fast_forward(ms)
    settle(fake, pages, 600, 2)


def register(pg, user, birth, email, password='Pingu2026'):
    pg.fill('#accUser', user); pg.fill('#accPass1', password); pg.fill('#accPass2', password)
    y, m = birth.split('-')
    pg.select_option('#accBirthM', m); pg.select_option('#accBirthY', y)
    pg.fill('#accEmail', email)
    pg.click("#dlg button:has-text('Crear cuenta'), #dlg button:has-text('Create account')")
    pg.wait_for_timeout(1200); pg.clock.run_for(600)


def skip_photo(pg):
    if 'Ponle' in title(pg) or 'Put a face' in title(pg):
        pg.click("#dlg button:has-text('Ahora no'), #dlg button:has-text('Not now')"); pg.wait_for_timeout(800); pg.clock.run_for(1200)


def dismiss(pg):
    for _ in range(6):
        if not pg.evaluate("document.getElementById('dlg').open"):
            return
        btn = pg.query_selector('#dlg .dlg__actions button:last-child') or pg.query_selector('#dlg button')
        btn.click(); pg.wait_for_timeout(300); pg.clock.run_for(700)


def sign_in(pg, email, password='Pingu2026'):
    pg.goto(URL); pg.wait_for_timeout(900); pg.clock.run_for(600)
    pg.click('#toSignIn'); pg.wait_for_timeout(400); pg.clock.run_for(600)
    pg.fill('#signMail', email); pg.fill('#signPass', password)
    pg.click("#dlg button:has-text('Entrar')"); pg.wait_for_timeout(1500); pg.clock.run_for(1500)
    dismiss(pg)


def offline(ctx, pg, off=True):
    pg.net['off'] = off
    ctx.set_offline(off)


def block_of(fake, uid):
    t = fake.timers.get(uid)
    return (t or {}).get('state') or {}


with sync_playwright() as p:
    browser = p.chromium.launch(**({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
    fake = FakeSupabase()

    # ================= Preparación: la misma cuenta en dos aparatos =================
    ctxA, A, errsA = device(browser, fake)
    A.goto(URL); A.wait_for_timeout(900); A.clock.run_for(600)
    register(A, 'pingu_vivo', '2000-05', 'vivo@example.com')
    skip_photo(A)
    dismiss(A)
    A.clock.run_for(9500)
    uid = fake.uid_of('vivo@example.com')
    check(uid and fake.saves.get(uid), 'A: cuenta en línea creada y progreso guardado')

    ctxB, B, errsB = device(browser, fake)
    sign_in(B, 'vivo@example.com')
    check(state(B)['profile']['nick'] == 'pingu_vivo', 'B: entró a la misma cuenta')
    both = [A, B]
    for pg in both:
        pg.goto(URL + '#/enfocar')
    settle(fake, both, 800, 2)
    check(fake.fn_calls('get_timer'), 'los aparatos preguntan por el reloj en vivo (get_timer)')
    xp0 = state(A)['progress']['xp']

    # ================= 1. Empezar en A → B lo ve =================
    clear_toasts(A, B)
    A.click('#mainBtn')
    settle(fake, both, 700, 3)
    sh = block_of(fake, uid)
    check(sh.get('status') == 'running' and sh.get('mode') == 'study' and re.match(r'^[A-Za-z0-9-]{8,64}$', sh.get('block') or ''),
          'A envía el reloj al servidor al empezar (con el número del bloque)')
    started = [s for s in fake.sessions.values() if s['uid'] == uid and s['status'] == 'active']
    sid = next((k for k, s in fake.sessions.items() if s['uid'] == uid and s['status'] == 'active'), None)
    check(sid and sh.get('rank') == sid, 'el número de la sesión del ranking viaja con el reloj')
    block1 = sh.get('block')
    jump(fake, both, 10_000)
    check(status(B) == ('running', 'study'), 'B ve el pomodoro corriendo en menos de 12 s')
    check(abs(clock_sec(A) - clock_sec(B)) <= 2, f'A y B muestran la misma cuenta regresiva ({A.inner_text("#clock")} y {B.inner_text("#clock")})')
    check('Empezado desde otro aparato' in toasts(B), 'B avisa "Empezado desde otro aparato"')
    check(len(fake.fn_calls('start_session')) == 1, 'solo A crea la sesión del ranking (B no la abandona)')

    # ================= 2. Pausar en B → A se pausa =================
    clear_toasts(A, B)
    B.click('#mainBtn')
    settle(fake, both, 700, 2)
    check(block_of(fake, uid).get('status') == 'paused', 'B envía la pausa')
    jump(fake, both, 10_000)
    check(status(A) == ('paused', 'study'), 'A se pausa solo')
    check('Pausado desde otro aparato' in toasts(A), 'A avisa "Pausado desde otro aparato"')
    check(clock_sec(A) == clock_sec(B), f'en pausa los dos muestran exactamente lo mismo ({A.inner_text("#clock")})')

    # ================= 3. Seguir en A y llegar a cero en los dos =================
    clear_toasts(A, B)
    A.click('#mainBtn')
    settle(fake, both, 700, 2)
    jump(fake, both, 10_000)
    check(status(B) == ('running', 'study'), 'B sigue corriendo después de que A reanudó')
    xpA0, xpB0 = state(A)['progress']['xp'], state(B)['progress']['xp']
    fake.skew_ms += 25 * 60 * 1000
    for pg in both:
        pg.clock.fast_forward('25:00')
    settle(fake, both, 800, 4)
    dismiss(A); dismiss(B)
    owners = [d for (u, b), d in fake.claims.items() if u == uid and b == block1]
    check(len(owners) == 1, 'el bloque tiene un solo dueño en el servidor (claim_block)')
    claims = [c for c in fake.fn_calls('claim_block') if c[1].get('p_block') == block1]
    # El segundo puede preguntar o enterarse antes (al revisar el servidor justo antes de guardarlo)
    check(1 <= len(claims) <= 2, f'preguntaron quién lo guarda ({len(claims)} preguntas) y ninguno lo guardó por su cuenta')
    gainA, gainB = state(A)['progress']['xp'] - xpA0, state(B)['progress']['xp'] - xpB0
    check((gainA > 0) != (gainB > 0), f'solo uno de los dos sumó la XP (A +{gainA}, B +{gainB})')
    winner, loser = (A, B) if gainA > 0 else (B, A)
    check('se guardó desde tu otro aparato' in toasts(loser), 'el otro avisa "Sesión completa: se guardó desde tu otro aparato"')
    done = [k for k, s in fake.sessions.items() if s['uid'] == uid and s['status'] == 'done']
    check(sid in done, 'el ranking recibió el final del pomodoro')
    finishes = [c for c in fake.fn_calls('finish_session') if c[1].get('p_session_id') == sid]
    check(len(finishes) == 1, f'y una sola vez ({len(finishes)})')
    # El que perdió trae el progreso del que guardó (y el descanso que empezó solo)
    jump(fake, both, 16_000)
    jump(fake, both, 10_000)
    settle(fake, both, 800, 3)
    xpA, xpB = state(A)['progress']['xp'], state(B)['progress']['xp']
    check(xpA == xpB == xp0 + max(gainA, gainB), f'los dos terminan con la misma XP ({xpA} y {xpB})')
    ids = [s['id'] for s in state(loser)['sessions']]
    check(ids.count(block1) == 1, 'la sesión aparece una sola vez en el historial')
    check(status(A) == status(B) and status(A)[1] == 'break', f'los dos siguen con el descanso ({status(A)} y {status(B)})')

    # ================= 4. "Terminar y guardar" en B =================
    # Se salta el descanso y se empieza otro pomodoro en B
    if status(B)[0] != 'idle' or status(B)[1] != 'study':
        B.click('#skipBtn'); settle(fake, both, 700, 2)
    if status(B)[0] == 'idle':
        B.click('#mainBtn'); settle(fake, both, 700, 3)
    jump(fake, both, 10_000)
    block2 = block_of(fake, uid).get('block')
    check(status(A) == ('running', 'study') and block2 and block2 != block1, 'A ve el pomodoro nuevo de B')
    fake.skew_ms += 5 * 60 * 1000
    for pg in both:
        pg.clock.fast_forward('05:00')
    settle(fake, both, 700)
    clear_toasts(A, B)
    xpA1 = state(A)['progress']['xp']
    B.click('#finishBtn')
    settle(fake, both, 700, 3)
    jump(fake, both, 10_000)
    check(status(A)[0] in ('idle', 'running') and status(A)[1] != 'study' or status(A)[0] == 'idle', f'A ya no tiene el pomodoro terminado ({status(A)})')
    check('Terminado y guardado desde otro aparato' in toasts(A), 'A avisa "Terminado y guardado desde otro aparato"')
    check(state(A)['progress']['xp'] == xpA1, 'A no guarda ese pomodoro por su cuenta')

    # ================= 5. Los dos sin internet =================
    # Otro aparato (simulado) guardó gemas en la cuenta: llegan solas a los dos, sin volver a abrir la app
    sv = fake.saves[uid]
    sv['data']['progress']['gems'] = int(sv['data']['progress'].get('gems') or 0) + 500
    sv['version'] += 1
    gems_cloud = sv['data']['progress']['gems']
    jump(fake, both, 10_000)
    settle(fake, both, 800, 3)
    check(state(A)['progress']['gems'] >= gems_cloud and state(B)['progress']['gems'] >= gems_cloud,
          f'el progreso que guardó otro aparato llega solo a los dos ({state(A)["progress"]["gems"]} y {state(B)["progress"]["gems"]} gemas)')
    # Los dos con el mismo pomodoro corriendo
    for pg in both:
        pg.goto(URL + '#/enfocar')
    settle(fake, both, 700)
    if status(B)[1] != 'study':
        B.click('#skipBtn'); settle(fake, both, 700, 2)
    if status(B)[0] != 'idle':
        B.click('#resetBtn'); settle(fake, both, 700, 2)
    jump(fake, both, 10_000)
    A.click('#mainBtn')
    settle(fake, both, 700, 2)
    jump(fake, both, 10_000)
    blockX = block_of(fake, uid).get('block')
    check(status(A) == status(B) == ('running', 'study'), 'los dos tienen el mismo pomodoro corriendo')
    offline(ctxA, A); offline(ctxB, B)
    # Sin internet, el pomodoro termina en los dos: cada uno lo guarda (no puede preguntar)
    fake.skew_ms += 25 * 60 * 1000
    for pg in both:
        pg.clock.fast_forward('25:00')
    settle(fake, both, 800, 3)
    dismiss(A); dismiss(B)
    idsA = [x['id'] for x in state(A)['sessions']]
    idsB = [x['id'] for x in state(B)['sessions']]
    claimsA = json.loads(A.evaluate("localStorage.getItem('st2_live')") or '{}').get('claims') or []
    check(any(c['block'] == blockX for c in claimsA), 'y lo anotó para preguntar cuando vuelva el internet')
    check(blockX in idsA and blockX in idsB, 'sin internet, cada aparato guardó el pomodoro (y lo anotó para preguntar después)')
    # En A se compra un tema; en B se estudia otro pomodoro
    A.goto(URL + '#/perfil'); settle(fake, both, 600)
    buy = A.query_selector('#skinGrid button[aria-label*="Menta"]')
    if buy:
        buy.click(); A.wait_for_timeout(300); A.clock.run_for(600)
        A.click("#dlg button:has-text('Comprar')"); A.wait_for_timeout(300); A.clock.run_for(600)
    check('menta' in state(A)['progress']['owned'], 'A compra el tema Menta sin internet')
    B.goto(URL + '#/enfocar'); settle(fake, both, 600)
    if status(B)[1] != 'study':
        B.click('#skipBtn'); settle(fake, both, 600)
    if status(B)[0] == 'idle':
        B.click('#mainBtn'); settle(fake, both, 600)
    fake.skew_ms += 25 * 60 * 1000
    for pg in both:
        pg.clock.fast_forward('25:00')
    settle(fake, both, 800, 3)
    dismiss(A); dismiss(B)
    check(len(state(B)['sessions']) > len(idsB), 'B guarda otro pomodoro sin internet')
    # Vuelve el internet
    offline(ctxA, A, False); offline(ctxB, B, False)
    for _ in range(4):
        jump(fake, both, 10_000)
    settle(fake, both, 800, 3)
    stA, stB = state(A), state(B)
    for name, st in (('A', stA), ('B', stB)):
        ids = [x['id'] for x in st['sessions']]
        tot = st['progress']['totals']
        check(ids.count(blockX) == 1, f'{name}: el pomodoro que terminó en los dos aparece una sola vez')
        check(sum(x['actualSec'] for x in st['sessions']) == tot['studySec'], f'{name}: los minutos suman exactamente las sesiones (nada contado dos veces ni perdido): {tot["studySec"] // 60} min')
        check(len(ids) == tot['sessions'] + tot['partials'], f'{name}: el número de sesiones cuadra')
        check(sum(d['studySec'] for d in st['daily'].values()) == tot['studySec'], f'{name}: el calendario cuadra con los totales')
        check('menta' in st['progress']['owned'], f'{name}: el tema comprado sin internet no se perdió')
    check(sorted(x['id'] for x in stA['sessions']) == sorted(x['id'] for x in stB['sessions']), 'los dos aparatos terminan con el mismo historial')
    check(stA['progress']['xp'] == stB['progress']['xp'] and stA['progress']['gems'] == stB['progress']['gems'],
          f'y con la misma XP y gemas ({stA["progress"]["xp"]} XP, {stA["progress"]["gems"]} gemas)')
    owners = [d for (u, b), d in fake.claims.items() if u == uid and b == blockX]
    check(len(owners) == 1, 'el servidor anotó un solo dueño para ese pomodoro')
    check(not errsA and not errsB, 'sin errores en los dos aparatos' + (': ' + ' | '.join(errsA + errsB) if errsA or errsB else ''))

    A.screenshot(path=os.path.join(OUT, 'A.png')); B.screenshot(path=os.path.join(OUT, 'B.png'))
    ctxA.close(); ctxB.close()

    # ================= 6. Servidor sin la v4.5 =================
    old = FakeSupabase()
    old.missing = {'get_timer', 'set_timer', 'claim_block'}
    ctxC, C, errsC = device(browser, old)
    C.goto(URL); C.wait_for_timeout(900); C.clock.run_for(600)
    register(C, 'pingu_viejo', '2000-05', 'viejo@example.com')
    skip_photo(C); dismiss(C)
    C.goto(URL + '#/enfocar'); C.clock.run_for(800)
    xp = state(C)['progress']['xp']
    C.click('#mainBtn'); C.clock.run_for(800)
    C.clock.fast_forward('25:00'); C.clock.run_for(2500)
    dismiss(C)
    check(state(C)['progress']['xp'] > xp, 'con el servidor viejo, el pomodoro se guarda igual que antes')
    check(any('reloj en vivo no está disponible' in m for m in C.logs), 'F12 explica que falta correr el schema.sql de la v4.5')
    check(len(old.fn_calls('get_timer')) <= 1, 'y deja de preguntar (no insiste con cada vuelta)')
    check(not errsC, 'sin errores con el servidor viejo' + (': ' + ' | '.join(errsC) if errsC else ''))
    ctxC.close()

    browser.close()

fails = [m for ok, m in results if not ok]
print(f'\nCapturas: {OUT}')
print('\nTodo bien.' if not fails else f'\n{len(fails)} fallas.')
sys.exit(1 if fails else 0)
