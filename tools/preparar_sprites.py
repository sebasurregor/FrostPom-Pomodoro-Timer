"""
FrostPom — convierte las tiras de dibujos del autor (fondo blanco) en las hojas de sprites de la app (v4.2).

Qué hace con cada tira:
  1. Quita el fondo blanco (relleno desde los bordes) y suaviza los bordes.
     La sombra gris de abajo se conserva, como en los sprites que ya tenía la app.
  2. Separa los cuadros: los dibujos más grandes son los animales, y cada pedacito suelto
     (un corazón, una lágrima, la sombra) se va con el animal más cercano.
  3. Quita la fogata que viene dibujada en cada cuadro del zorro con malvavisco
     (en el paisaje ya hay una fogata, la misma del oso).
  4. Pone todos los cuadros en celdas iguales, con el animal siempre en el mismo lugar
     (centrado por la parte de abajo del cuerpo, para que no "tiemble" al animarse) y del
     mismo tamaño que su dibujo de siempre (assets/companions o el pingüino quieto).
  5. Guarda una hoja .webp por animación en assets/sprites/, y la tumba (tumba.webp).

Uso (solo si cambias los dibujos; las hojas ya vienen generadas):
    pip install pillow numpy scipy
    python tools/preparar_sprites.py CARPETA_CON_LOS_DIBUJOS

La carpeta debe tener los archivos con los nombres de FUENTES (abajo). Si un archivo no está,
esa hoja se salta. Tarda unos 15 segundos por hoja.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sprites')

# Tamaño de referencia: el animal de cada animación queda del MISMO tamaño que su dibujo
# de siempre (assets/companions o el pingüino quieto), para que no "crezca" al cambiar de animación.
REF = {
    'pinguino': ('sprites/pinguino-quieto.webp', 256),
    'oso': ('companions/oso-polar.webp', 384),
    'oso-marino': ('companions/oso-marino.webp', 384),
    'tiburon': ('companions/tiburon-martillo.webp', 384),
    'zorro': ('companions/zorro-artico.webp', 384),
}

# Celda de las animaciones del compañero de Enfocar: 320 × 320, con el animal ubicado como en
# un cuadro de 256 × 256 centrado abajo (sobra espacio arriba y a los lados para los corazones y
# las lágrimas). En la app se muestra 1,25 veces más grande que el dibujo de siempre.
CELDA_GRANDE = 320
CAJA = 256

# nombre de salida: (archivo de origen, cuadros, animal, opciones)
#   modo = 'compa' (compañero de Enfocar), 'camina' (paisaje) o 'fogata' (paisaje, de noche)
#   espejo = cuadros que se voltean (izquierda <-> derecha)
#   borrar = zonas (polígonos en píxeles del dibujo original) que se borran antes de separar
#   ajuste = un poco más grande o más pequeño que el tamaño de referencia (1 = igual)
FUENTES = {
    'pinguino-llora':   ('pinguino-llora.jpg', 5, 'pinguino', {'modo': 'compa', 'ajuste': 0.9}),
    'oso-llora':        ('oso-llora.jpg', 5, 'oso', {'modo': 'compa'}),
    'oso-marino-llora': ('oso-marino-llora.jpg', 5, 'oso-marino', {'modo': 'compa'}),
    'oso-marino-amor':  ('oso-marino-amor.jpg', 4, 'oso-marino', {'modo': 'compa'}),
    'tiburon-llora':    ('tiburon-llora.jpg', 5, 'tiburon', {'modo': 'compa'}),
    'tiburon-amor':     ('tiburon-amor.jpg', 4, 'tiburon', {'modo': 'compa'}),
    'zorro-llora':      ('zorro-llora.jpg', 5, 'zorro', {'modo': 'compa'}),
    'zorro-amor':       ('zorro-amor.jpg', 4, 'zorro', {'modo': 'compa'}),
    'zorro-camina':     ('zorro-camina.jpg', 4, 'zorro', {'modo': 'camina'}),
    # En el 5.º cuadro la fogata toca el malvavisco: se borra a mano (coordenadas del dibujo original).
    'zorro-malvavisco': ('zorro-malvavisco.jpg', 5, 'zorro', {'modo': 'fogata', 'espejo': [0, 1, 2, 3], 'borrar': [
        [(2015, 566), (2150, 566), (2175, 585), (2205, 600), (2205, 745), (2015, 745)],
        [(2055, 553), (2130, 553), (2130, 567), (2055, 567)],
    ]}),
}
TUMBA = ('tumba.jpg', 'tumba.webp')

BG_D = 14        # "casi blanco": 255 - el canal más oscuro
PASA_D = 70      # lo claro y gris (fondo y sombra) por donde se puede rellenar
PASA_SAT = 16    # ...y sin color (la sombra es gris; el agua del tiburón es azul y no pasa)
BORDE_D = 170    # oscuridad de un contorno "lleno" (para el borde suave)


def quitar_fondo(rgb):
    """rgb: arreglo HxWx3 (uint8). Devuelve (RGBA uint8 sin el fondo blanco, máscara de la sombra)."""
    a = rgb.astype(np.float32)
    d = 255 - a.min(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    pasa = (d < PASA_D) & (sat < PASA_SAT)
    # Relleno desde los bordes: solo lo claro y gris conectado con el borde es fondo o sombra
    lab, _ = ndi.label(pasa)
    borde = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    borde = borde[borde > 0]
    llega = np.isin(lab, borde)
    fondo = llega & (d < BG_D)
    sombra = llega & ~fondo
    out = np.dstack([a, np.full(d.shape, 255, np.float32)])
    out[fondo, 3] = 0
    # Sombra: gris uniforme (el de su centro) con transparencia según qué tan gris es
    if sombra.any():
        nucleo = sombra & (d > 30)
        gris = np.median(a[nucleo], axis=0) if nucleo.any() else np.array([205, 205, 210], np.float32)
        dg = max(1.0, 255 - float(gris.min()))
        alfa = np.clip((d - 4) / dg, 0, 1)
        out[sombra, :3] = gris
        out[sombra, 3] = 255 * alfa[sombra]
    # Borde suave: los píxeles del dibujo que tocan el fondo se "despegan" del blanco
    toca = ndi.binary_dilation(fondo, structure=np.ones((3, 3))) & ~llega
    al = np.clip(d / BORDE_D, 0.05, 1)
    for c in range(3):
        canal = out[..., c]
        canal[toca] = np.clip((a[..., c][toca] - (1 - al[toca]) * 255) / al[toca], 0, 255)
    out[toca, 3] = 255 * al[toca]
    return out.clip(0, 255).astype(np.uint8), sombra


def es_fogata(px):
    """¿Este grupo de píxeles es una fogata? (llamas naranjas/amarillas y leños cafés)"""
    r, g, b = px[:, 0].astype(int), px[:, 1].astype(int), px[:, 2].astype(int)
    llama = (r > 200) & (g > 80) & (b < 120) & (r - b > 110)
    lenio = (r > 100) & (r < 210) & (g > 50) & (g < 160) & (b < 110) & (r - b > 55)
    return (llama | lenio).mean() > 0.30


def separar(rgba, sombra, n, sin_fogata=False, sin_sombra=False):
    """Separa los n dibujos de la tira. Cada pedacito suelto (corazón, gota, sombra) va con el
    dibujo más cercano. Devuelve [(imagen RGBA del cuadro, máscara del cuerpo)]."""
    al = rgba[..., 3] > 0
    cuerpo = al & ~sombra
    lab, k = ndi.label(cuerpo, structure=np.ones((3, 3)))
    ids = np.arange(1, k + 1)
    area = ndi.sum(cuerpo, lab, ids)
    quitar = set()
    if sin_fogata:
        for i in ids:
            if area[i - 1] > 200 and es_fogata(rgba[lab == i][:, :3]):
                quitar.add(i)
    vivos = [i for i in ids if i not in quitar and area[i - 1] > 0]
    anclas = sorted(sorted(vivos, key=lambda i: -area[i - 1])[:n],
                    key=lambda i: np.where(lab == i)[1].mean())
    cx = np.array([np.where(lab == i)[1].mean() for i in anclas])
    dueno = np.zeros(lab.shape, np.int32) - 1
    for i in vivos:
        xs = np.where(lab == i)[1]
        dueno[lab == i] = int(np.argmin(np.abs(cx - xs.mean())))
    if not sin_sombra:
        # Cada sombra va entera con el dibujo más cercano; si una sombra toca dos dibujos,
        # se reparte píxel por píxel.
        # se reparte según qué cuerpo queda encima (o el más cercano).
        labs, ks = ndi.label(sombra & al, structure=np.ones((3, 3)))
        rangos = [np.where((lab == i).any(axis=0))[0] for i in anclas]
        r0 = np.array([r.min() for r in rangos])
        r1 = np.array([r.max() for r in rangos])
        for i in range(1, ks + 1):
            ys, xs = np.where(labs == i)
            toca = [j for j in range(len(rangos)) if r0[j] <= xs.max() and xs.min() <= r1[j]]
            if len(toca) > 1:
                fuera = np.maximum(0, np.maximum(r0[None, :] - xs[:, None], xs[:, None] - r1[None, :]))
                desempate = np.abs(cx[None, :] - xs[:, None]) * 1e-6
                dueno[ys, xs] = np.argmin(fuera + desempate, axis=1)
            else:
                dueno[ys, xs] = toca[0] if toca else int(np.argmin(np.abs(cx - xs.mean())))
    cuadros = []
    for j, a_id in enumerate(anclas):
        m = dueno == j
        # Cada animal tiene una sola sombra: se descartan los pedacitos sueltos de la del vecino
        ls, kk = ndi.label(m & sombra, structure=np.ones((3, 3)))
        if kk > 1:
            tam = ndi.sum(m & sombra, ls, range(1, kk + 1))
            m &= ~((ls > 0) & (ls != int(np.argmax(tam)) + 1))
        img = rgba.copy()
        img[~m] = 0
        cuadros.append((img, lab == a_id))
    return cuadros


def recortar(img, cuerpo):
    ys, xs = np.where(img[..., 3] > 8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return img[y0:y1, x0:x1], cuerpo[y0:y1, x0:x1]


def area_ref(animal):
    ruta, celda = REF[animal]
    a = np.asarray(Image.open(os.path.join(ROOT, 'assets', ruta)).convert('RGBA'))[..., 3] > 60
    lab, k = ndi.label(a, structure=np.ones((3, 3)))
    area = ndi.sum(a, lab, range(1, k + 1)).max()
    return area * (CAJA / celda) ** 2  # en una caja de 256


def centro_base(cuerpo):
    """Centro horizontal de la parte de abajo del cuerpo (para que el animal no se mueva de lado)."""
    ys = np.where(cuerpo.any(axis=1))[0]
    y1 = ys.max()
    y0 = int(y1 - (y1 - ys.min()) * 0.35)
    xs = np.where(cuerpo[y0:y1 + 1].any(axis=0))[0]
    return (xs.min() + xs.max()) / 2


def pegar(sheet, i, celda_w, im, x, y):
    capa = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    capa.paste(im, (x, y))
    mascara = Image.new('L', sheet.size, 0)
    mascara.paste(255, (i * celda_w, 0, (i + 1) * celda_w, sheet.height))
    return Image.composite(Image.alpha_composite(sheet, capa), sheet, mascara)


def hoja(src, n, animal, opts):
    rgba, sombra = quitar_fondo(np.asarray(Image.open(src).convert('RGB')))
    modo = opts['modo']
    if opts.get('borrar'):
        zona = Image.new('L', (rgba.shape[1], rgba.shape[0]), 0)
        for poli in opts['borrar']:
            ImageDraw.Draw(zona).polygon(poli, fill=255)
        z = np.asarray(zona) > 0
        rgba[z] = 0
        sombra = sombra & ~z
    cuadros = separar(rgba, sombra, n, sin_fogata=modo == 'fogata', sin_sombra=modo == 'fogata')
    piezas = []
    for i, (img, cuerpo) in enumerate(cuadros):
        img, cuerpo = recortar(img, cuerpo)
        if i in opts.get('espejo', []):
            img, cuerpo = img[:, ::-1].copy(), cuerpo[:, ::-1].copy()
        piezas.append((img, cuerpo))
    # Todos los cuadros comparten la línea del piso (lo más bajo de cada uno)
    if modo == 'compa':
        area = np.median([c.sum() for _, c in piezas[:2]])
        esc = (area_ref(animal) / area) ** 0.5 * opts.get('ajuste', 1)
        cw = ch = CELDA_GRANDE
        abajo = round(CAJA * 20 / 384)  # el mismo margen de abajo de los dibujos de siempre
    elif modo == 'camina':
        cw = ch = 256
        esc = cw * 0.94 / max(im.shape[1] for im, _ in piezas)
        abajo = 6
    else:  # fogata: el zorro sentado mirando a la izquierda, con el palito hacia la fogata
        cw, ch = 400, 320
        esc = ch * 0.92 / max(im.shape[0] for im, _ in piezas)
        abajo = 8
    sheet = Image.new('RGBA', (cw * n, ch), (0, 0, 0, 0))
    info = []
    for i, (img, cuerpo) in enumerate(piezas):
        im = Image.fromarray(img)
        w2, h2 = max(1, round(im.width * esc)), max(1, round(im.height * esc))
        im = im.resize((w2, h2), Image.LANCZOS)
        if modo == 'camina':
            x = round(i * cw + (cw - w2) / 2)  # caminando: centrado (la cola va atrás)
        elif modo == 'fogata':
            # el lomo del zorro (lo de más a la derecha del cuerpo) queda siempre en el mismo lugar
            xs = np.where(cuerpo.any(axis=0))[0]
            x = round(i * cw + cw - 10 - xs.max() * esc)
        else:
            x = round(i * cw + cw / 2 - centro_base(cuerpo) * esc)
        y = ch - abajo - h2
        sheet = pegar(sheet, i, cw, im, x, y)
        info.append((x - i * cw, y, w2, h2))
    return sheet, info


def tumba(src):
    rgba, _ = quitar_fondo(np.asarray(Image.open(src).convert('RGB')))
    ys, xs = np.where(rgba[..., 3] > 20)
    im = Image.fromarray(rgba[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1])
    # Del tamaño de un compañero: ocupa la caja de 256 como los dibujos de siempre
    esc = CAJA * 0.80 / max(im.size)
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    out = Image.new('RGBA', (CELDA_GRANDE, CELDA_GRANDE), (0, 0, 0, 0))
    out.paste(im, ((CELDA_GRANDE - im.width) // 2, CELDA_GRANDE - round(CAJA * 20 / 384) - im.height), im)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    carpeta = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for nombre, (archivo, n, animal, opts) in FUENTES.items():
        src = os.path.join(carpeta, archivo)
        if not os.path.exists(src):
            print('  (falta', archivo, '— se salta)')
            continue
        img, _ = hoja(src, n, animal, opts)
        dst = os.path.join(OUT, nombre + '.webp')
        img.save(dst, 'WEBP', quality=86, method=6)
        print(f'  {nombre}.webp  {img.width}x{img.height}  {os.path.getsize(dst) // 1024} KB')
    src = os.path.join(carpeta, TUMBA[0])
    if os.path.exists(src):
        dst = os.path.join(OUT, TUMBA[1])
        tumba(src).save(dst, 'WEBP', quality=86, method=6)
        print(f'  {TUMBA[1]}  {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
