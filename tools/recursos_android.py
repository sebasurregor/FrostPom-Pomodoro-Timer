"""
FrostPom — genera los íconos y la pantalla de inicio de la app de Android (v4.1).

Sale de los íconos que ya tiene la app (assets/icons/icon-maskable-512.png e icon-512.png) y
escribe en android-recursos/res/ los mismos archivos que trae la plantilla de Capacitor, con los
mismos nombres y tamaños. tools/app-android.mjs los copia al proyecto de Android.

Uso (solo si cambias el ícono; los archivos ya vienen generados):
    pip install pillow
    python tools/recursos_android.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FULL = os.path.join(ROOT, 'assets', 'icons', 'icon-maskable-512.png')   # cuadrado lleno (sin transparencia)
SRC_ROUND = os.path.join(ROOT, 'assets', 'icons', 'icon-512.png')           # con esquinas redondeadas
OUT = os.path.join(ROOT, 'android-recursos', 'res')
BG = '#2d68bc'   # el mismo azul del manifiesto (background_color)

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SPLASH = {
    'drawable': (480, 320),
    'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
    'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
    'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
    'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
}


def save(img, *parts):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return path


def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)


def circle(img):
    """Recorta en círculo (ícono redondo de los Android antiguos), con borde suave."""
    big = img.size[0] * 4
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    out = img.copy()
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


def tomato_silhouette(size):
    """Ícono de la barra de notificaciones: un tomate (pomodoro) blanco sobre transparente, con la
    estrella de hojas recortada arriba y el tallo. Android pide una silueta de un solo color."""
    import math
    s = size * 8
    im = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(im)
    cx, cy, r = s * 0.5, s * 0.58, s * 0.40
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)                      # el tomate
    kx, ky = cx, cy - r * 0.6                                                  # centro de las hojas
    star = []
    for i in range(10):                                                        # estrella de 5 puntas
        ang = math.radians(-90 + 36 * i + 36)                                  # una punta hacia abajo
        rad = r * (0.66 if i % 2 == 0 else 0.24)
        star.append((kx + math.cos(ang) * rad, ky + math.sin(ang) * rad * 0.62))
    d.polygon(star, fill=0)                                                    # recortada del tomate
    w = s * 0.075
    d.rounded_rectangle((kx - w / 2, ky - r * 0.72, kx + w / 2, ky + s * 0.01), radius=int(w / 2), fill=255)  # el tallo
    mask = im.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    out.putalpha(mask)
    return out


def splash(w, h, icon):
    """Pantalla de inicio: el azul de FrostPom con el ícono redondeado al centro."""
    img = Image.new('RGBA', (w, h), BG)
    side = int(min(w, h) * 0.42)
    ic = fit(icon, side)
    img.alpha_composite(ic, ((w - side) // 2, (h - side) // 2))
    return img.convert('RGB')


def main():
    full = Image.open(SRC_FULL).convert('RGBA')
    rounded = Image.open(SRC_ROUND).convert('RGBA')
    made = []
    for name, k in DENS.items():
        made.append(save(fit(rounded, round(48 * k)), f'mipmap-{name}', 'ic_launcher.png'))
        made.append(save(circle(fit(full, round(48 * k))), f'mipmap-{name}', 'ic_launcher_round.png'))
        # Ícono adaptable (Android 8+): el dibujo ocupa los 108 dp; cada teléfono le pone su forma
        made.append(save(fit(full, round(108 * k)), f'mipmap-{name}', 'ic_launcher_foreground.png'))
        made.append(save(tomato_silhouette(round(24 * k)), f'drawable-{name}', 'ic_stat_frostpom.png'))
    for folder, (w, h) in SPLASH.items():
        made.append(save(splash(w, h, rounded), folder, 'splash.png'))
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
           f'    <color name="ic_launcher_background">{BG}</color>\n</resources>\n')
    path = os.path.join(OUT, 'values', 'ic_launcher_background.xml')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(xml)
    made.append(path)
    print(f'{len(made)} archivos en {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
