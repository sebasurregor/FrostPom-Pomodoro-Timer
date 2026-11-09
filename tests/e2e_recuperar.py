"""
FrostPom — prueba de "¿Olvidaste la contraseña?" con correo.
Supabase se simula (no se envía ningún correo de verdad): se interceptan /signup, /recover,
/verify y /logout y se revisa qué manda la app.

Uso (con la app servida en otra terminal: python -m http.server 8000):
    python tests/e2e_recuperar.py http://localhost:8000/
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _classic import classic, classic_text

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
failures = []
calls = []


def check(cond, msg):
    print(("OK   " if cond else "FALLO ") + msg)
    if not cond:
        failures.append(msg)


def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('st2_state'))")


def fake_supabase(route):
    req = route.request
    path = req.url.split("/auth/v1", 1)[1]
    body = json.loads(req.post_data or "{}")
    calls.append((path, body, req.headers.get("apikey"), req.headers.get("authorization")))
    if path == "/verify":
        if body.get("token") == "123456":
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"access_token": "tok", "token_type": "bearer"}))
        return route.fulfill(status=403, content_type="application/json", body=json.dumps({"code": 403, "error_code": "otp_expired", "msg": "Token has expired or is invalid"}))
    if path == "/logout":
        return route.fulfill(status=204, body="")
    return route.fulfill(status=200, content_type="application/json", body="{}")


with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
    browser = p.chromium.launch(**launch)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="es-CO")
    ctx.route("**/js/config.js", classic)
    ctx.route("https://*.supabase.co/auth/v1/**", fake_supabase)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    # 1) Registro con correo
    pg.goto(URL); pg.wait_for_timeout(800)
    check(pg.evaluate("!!document.querySelector('#dlg #accEmail')"), "el registro tiene el campo de correo (opcional)")
    pg.fill("#accUser", "pingu_correo"); pg.fill("#accPass1", "Pingu2026"); pg.fill("#accPass2", "Pingu2026")
    pg.fill("#accEmail", "mal-correo")
    pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(400)
    check("mal escrito" in pg.inner_text("#dlg"), "un correo mal escrito no se acepta")
    pg.fill("#accEmail", "Pingu@Ejemplo.com")
    pg.click("#dlg button:has-text('Crear cuenta')"); pg.wait_for_timeout(1500)
    pg.click("#dlg button:has-text('Ahora no')"); pg.wait_for_timeout(600)
    st = state(pg)
    check(st["account"].get("email") == "pingu@ejemplo.com", "el correo se guarda en minúsculas")
    check(st["account"].get("emailLinked") is True, "el correo queda registrado en Supabase")
    signup = [c for c in calls if c[0] == "/signup"]
    check(len(signup) == 1 and signup[0][1]["email"] == "pingu@ejemplo.com", "se llamó a /signup con el correo")
    check(signup and signup[0][1]["password"] != "Pingu2026" and len(signup[0][1]["password"]) >= 40, "a Supabase va una contraseña aleatoria, nunca la tuya")
    check(signup and signup[0][2] == "sb_publishable_P3zAO_4mbYu-190JTAHqjA_HezuxMeb", "la petición lleva la clave publicable")

    # 2) Ajustes muestra el correo a medias
    pg.goto(URL + "#/ajustes"); pg.wait_for_timeout(600)
    check(pg.inner_text("#accMailText") == "p••••@ejemplo.com", "Ajustes muestra el correo a medias")

    # 3) Olvidé la contraseña
    pg.evaluate("sessionStorage.clear(); localStorage.removeItem('st2_remember')")
    pg.reload(); pg.wait_for_timeout(900)
    check(pg.evaluate("!!document.querySelector('#dlg #forgotBtn')"), "el inicio de sesión tiene '¿Olvidaste la contraseña?'")
    pg.click("#forgotBtn"); pg.wait_for_timeout(400)
    check("p••••@ejemplo.com" in pg.inner_text("#dlg"), "pide confirmar el correo mostrando solo una pista")
    pg.fill("#fpMail", "otro@ejemplo.com"); pg.click("#dlg button:has-text('Enviarme el código')"); pg.wait_for_timeout(300)
    check("no es el correo" in pg.inner_text("#dlg"), "con otro correo no envía nada")
    check(not any(c[0] == "/recover" for c in calls), "no se llamó a /recover con un correo equivocado")
    pg.fill("#fpMail", "pingu@ejemplo.com"); pg.click("#dlg button:has-text('Enviarme el código')"); pg.wait_for_timeout(600)
    check(any(c[0] == "/recover" and c[1]["email"] == "pingu@ejemplo.com" for c in calls), "se pidió el código a /recover")
    check(pg.evaluate("!!document.querySelector('#dlg #fpCode')"), "aparece la vista para escribir el código")
    pg.fill("#fpCode", "999999"); pg.fill("#fpPass1", "Hielo2027"); pg.fill("#fpPass2", "Hielo2027")
    pg.click("#dlg button:has-text('Guardar contraseña')"); pg.wait_for_timeout(600)
    check("no es correcto" in pg.inner_text("#dlg"), "un código equivocado se rechaza")
    old_hash = state(pg)["account"]["hash"]
    pg.fill("#fpCode", "123 456"); pg.click("#dlg button:has-text('Guardar contraseña')"); pg.wait_for_timeout(1500)
    st = state(pg)
    check(not pg.evaluate("document.getElementById('dlg').open"), "con el código correcto la app se abre")
    check(st["account"]["hash"] != old_hash and st["account"].get("email") == "pingu@ejemplo.com", "la contraseña cambió y el correo se conserva")
    check(any(c[0] == "/logout" and c[3] == "Bearer tok" for c in calls), "la sesión temporal de Supabase se cierra")

    # 4) La contraseña nueva sirve
    pg.evaluate("sessionStorage.clear(); localStorage.removeItem('st2_remember')")
    pg.reload(); pg.wait_for_timeout(900)
    pg.fill("#loginPass", "Hielo2027"); pg.click("#dlg button:has-text('Entrar')"); pg.wait_for_timeout(1200)
    check(not pg.evaluate("document.getElementById('dlg').open"), "se entra con la contraseña nueva")
    check(not errors, "sin errores en la página" + (f": {errors}" if errors else ""))
    browser.close()

print("\nTodo bien." if not failures else f"\n{len(failures)} fallos.")
sys.exit(1 if failures else 0)
