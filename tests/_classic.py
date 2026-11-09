"""
Configuración "clásica" para las pruebas que revisan el resto de la app: ranking global y
cuentas en línea apagados (así el registro no pide fecha de nacimiento ni correo obligatorio).
El ranking y las cuentas en línea tienen sus propias pruebas: e2e_ranking.py y e2e_cuentas.py.
"""


def classic_text(body):
    return body.replace("mode: 'remote'", "mode: 'local'").replace("online: true", "online: false")


def classic(route):
    resp = route.fetch()
    route.fulfill(response=resp, body=classic_text(resp.text()))
