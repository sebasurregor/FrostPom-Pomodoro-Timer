"""
FrostPom — cambia el logo de TODA la app con un solo comando (v4.7.2).

Los logos del autor están en logos/ (cuadrado redondeado sobre fondo blanco, 2048 px):
    logos/navidad.jpg               el de temporada (diciembre)
    logos/normal.jpg                el de siempre, con el pico abierto
    logos/normal-pico-cerrado.jpg   el de siempre, con el pico cerrado

Uso:
    pip install pillow numpy opencv-python-headless
    python tools/iconos.py navidad          (o: normal, normal-pico-cerrado, o la ruta de otra imagen)

Qué hace:
 1. Recorta el cuadrado redondeado y le quita el fondo blanco de las esquinas (redondeado.png).
 2. Hace una versión "llena" (sin esquinas blancas: las rellena con el color de al lado), que es
    la que piden Android (cada teléfono le pone su forma), iPhone y Google Play.
 3. Escribe todos los íconos: los de la web (assets/icons), los de Android (tools/recursos_android.py)
    y los de las tiendas (docs/google-play/icono-512.png y docs/microsoft-store/logo-300.png).
Después: npm run android:actualizar (copia los íconos a Android) y sube la versión, como siempre.
"""
import base64
import io
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGOS = os.path.join(ROOT, 'logos')
ICONS = os.path.join(ROOT, 'assets', 'icons')
RADIUS = 0.19        # el radio de las esquinas de los logos del autor (19 % del lado)
SIDE = 1024          # tamaño de trabajo


def source(arg):
    path = arg if os.path.isfile(arg) else os.path.join(LOGOS, f'{arg}.jpg')
    if not os.path.isfile(path):
        sys.exit(f'[X] No encontré el logo "{arg}". Opciones: ' + ', '.join(sorted(os.path.splitext(f)[0] for f in os.listdir(LOGOS))))
    return path


def bounds(img):
    """El cuadrado del logo dentro del fondo blanco."""
    a = np.asarray(img.convert('RGB')).astype(int)
    ys, xs = np.where(a.min(axis=2) < 235)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))


def rounded_mask(size, radius=RADIUS, inset=0):
    big = size * 4
    m = Image.new('L', (big, big), 0)
    r = int(big * radius)
    i = inset * 4
    ImageDraw.Draw(m).rounded_rectangle((i, i, big - 1 - i, big - 1 - i), radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make(path):
    img = Image.open(path).convert('RGB')
    sq = img.crop(bounds(img)).resize((SIDE, SIDE), Image.LANCZOS)
    # Redondeado: esquinas transparentes
    rounded = sq.convert('RGBA')
    rounded.putalpha(rounded_mask(SIDE))
    # Lleno: las esquinas (fuera del cuadrado redondeado, con un margen) se rellenan con lo de al lado
    hole = np.asarray(rounded_mask(SIDE, inset=10)) < 250
    filled = cv2.inpaint(cv2.cvtColor(np.asarray(sq), cv2.COLOR_RGB2BGR), hole.astype(np.uint8) * 255, 24, cv2.INPAINT_TELEA)
    full = Image.fromarray(cv2.cvtColor(filled, cv2.COLOR_BGR2RGB))
    # Suaviza el relleno para que no se note (solo en las esquinas)
    soft = full.filter(ImageFilter.GaussianBlur(18))
    corner = Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
    full = Image.composite(soft, full, corner)
    return rounded, full


def save(img, path, size=None, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = img.resize((size, size), Image.LANCZOS) if size else img
    out.save(path, optimize=True, **kw)
    return path


def maskable(full, size=512, scale=0.86):
    """Ícono "maskable" (Android en la web): el logo al 86 %, con sus bordes estirados hasta el
    borde, para que ningún recorte (círculo, gota…) le quite el gorro o deje una franja."""
    inner = round(size * scale)
    pad = (size - inner) // 2
    a = np.asarray(full.convert('RGB').resize((inner, inner), Image.LANCZOS))
    a = np.pad(a, ((pad, size - inner - pad), (pad, size - inner - pad), (0, 0)), mode='edge')
    bg = Image.fromarray(a).filter(ImageFilter.GaussianBlur(size * 0.03))
    bg.paste(full.convert('RGB').resize((inner, inner), Image.LANCZOS), (pad, pad))
    return bg


def favicon_svg(rounded):
    buf = io.BytesIO()
    rounded.resize((96, 96), Image.LANCZOS).save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 96 96">'
            f'<image width="96" height="96" href="data:image/png;base64,{b64}" xlink:href="data:image/png;base64,{b64}"/></svg>\n')


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'navidad'
    rounded, full = make(source(name))
    made = []
    # Lo que usa tools/recursos_android.py (no viaja dentro de la app)
    made.append(save(rounded, os.path.join(LOGOS, 'actual-redondeado.png')))
    made.append(save(full, os.path.join(LOGOS, 'actual-lleno.png')))
    # Web (PWA)
    for s in (48, 96, 192, 512):
        made.append(save(rounded, os.path.join(ICONS, f'icon-{s}.png'), s))
    made.append(save(full.convert('RGB'), os.path.join(ICONS, 'apple-touch-icon.png'), 180))
    made.append(save(maskable(full), os.path.join(ICONS, 'icon-maskable-512.png')))
    with open(os.path.join(ICONS, 'icon.svg'), 'w', encoding='utf-8') as f:
        f.write(favicon_svg(rounded))
    made.append(os.path.join(ICONS, 'icon.svg'))
    # Tiendas
    made.append(save(full.convert('RGB'), os.path.join(ROOT, 'docs', 'google-play', 'icono-512.png'), 512))
    made.append(save(rounded, os.path.join(ROOT, 'docs', 'microsoft-store', 'logo-300.png'), 300))
    print(f'Logo "{name}": {len(made)} archivos.')
    # Android
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'recursos_android.py')], check=True)


if __name__ == '__main__':
    main()
