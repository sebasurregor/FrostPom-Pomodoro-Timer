"""
FrostPom — prepara los sonidos de concentración (v4.0.2).

Toma los MP3 originales de Pixabay y deja en assets/sounds/ un archivo por sonido:
  1. Recorta un pedazo tranquilo (sin golpes ni ruidos raros) que dure lo justo.
  2. Lo vuelve un BUCLE SIN CORTE: los últimos segundos se mezclan suavemente con los primeros
     (fundido de potencia constante), así el final empalma con el comienzo.
  3. Iguala el VOLUMEN: todos quedan a -20 LUFS (la fogata a -21,5, porque sus chasquidos son
     muy picudos). LUFS mide qué tan fuerte lo oye una persona, no el pico más alto.
  4. Suaviza solo los picos sueltos (gotas, chasquidos) para que no pasen de -2 dBFS.
  5. Agrega 1 s antes y 1 s después, copiados del mismo bucle. El bucle en la app va de 1 s a
     1 s + largo (effects.js → RECORDED). Si el decodificador de MP3 corre el audio unos
     milisegundos, igual en la unión hay el mismo sonido a los dos lados.
  6. Lo guarda en MP3 liviano (olas en mono: casi no tenía diferencia entre izquierda y derecha).

Requisitos: Python 3 con numpy y scipy, y ffmpeg instalado.
Uso:
    python tools/preparar_sonidos.py CARPETA_CON_LOS_MP3_ORIGINALES
Los archivos originales se buscan por su número de Pixabay (ver ORIGINALES).
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np
import scipy.io.wavfile as wf

SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sounds')
OBJETIVO = -20.0   # LUFS
MARGEN = 1.0       # segundos antes y después del bucle
TECHO = 0.79       # picos a -2 dBFS (el MP3 sube un poco los picos)

# Sonido de FrostPom -> archivo original de Pixabay (autor y número)
ORIGINALES = {
    'blanco':  'themediaguy-soft-soothing-deep-white-noise-378857',
    'marron':  'cosmic-scapes-soft-brown-noise-299934',
    'lluvia':  'dragon-studio-gentle-rain-01-437305',
    'olas':    'dragon-studio-soothing-ocean-waves-372489',
    'fogata':  'soundreality-fire-sound-334130',
    'pajaros': 'whitenoisesleepers-rainy-day-in-town-with-birds-singing-194011',
}
# id: (desde qué segundo, largo del bucle, segundos de fundido, canales, kbps, compresor de ffmpeg)
# Los pedazos se eligieron midiendo el volumen segundo a segundo (sin golpes fuertes) y, en
# "pajaros", donde más se oyen los pájaros. En "olas" el bucle empieza y termina entre dos olas.
CORTES = {
    'blanco':  (60.0,  30.0, 3.0, 2, 160, None),
    'marron':  (120.0, 30.0, 3.0, 2, 128, None),
    'lluvia':  (480.0, 60.0, 4.0, 2, 128, None),
    'olas':    (20.0,  91.0, 2.0, 1, 96,  'acompressor=threshold=-26dB:ratio=2:attack=200:release=1500:makeup=1'),
    'fogata':  (1.5,   38.5, 3.0, 2, 128, None),
    'pajaros': (455.0, 90.0, 4.0, 2, 128, None),
}
OBJETIVOS = {'fogata': -21.5}
TECHOS = {'fogata': 0.6}


def lufs(ruta):
    """Volumen percibido (LUFS integrados) según ffmpeg (norma EBU R128)."""
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', ruta, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', o)[-1])


def suavizar_picos(x, techo):
    """Por encima del 60 % del techo, los picos se redondean (tanh) sin pasar del techo."""
    t = 0.6 * techo
    a = np.abs(x)
    y = x.copy()
    m = a > t
    y[m] = np.sign(x[m]) * (t + (techo - t) * np.tanh((a[m] - t) / (techo - t)))
    return y


def preparar(carpeta, sid, tmp):
    desde, largo, fundido, canales, kbps, compresor = CORTES[sid]
    original = next(os.path.join(carpeta, f) for f in os.listdir(carpeta) if ORIGINALES[sid] in f)
    wav = os.path.join(tmp, f'{sid}.wav')
    filtro = ['-af', compresor] if compresor else []
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', original, *filtro, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_f32le', wav], check=True)
    sr, x = wf.read(wav)
    x = x.astype(np.float64)
    if canales == 1:
        x = x.mean(axis=1, keepdims=True)
    a, n, f = int(desde * sr), int(largo * sr), int(fundido * sr)
    trozo = x[a:a + n + f]
    # Bucle sin corte: el comienzo sube (seno) mientras lo que seguía al final baja (coseno)
    ang = (np.arange(f) / f * np.pi / 2)[:, None]
    bucle = trozo[:n].copy()
    bucle[:f] = trozo[:f] * np.sin(ang) + trozo[n:n + f] * np.cos(ang)
    # Volumen: se ajusta la ganancia hasta llegar al objetivo (suavizar picos baja un poquito)
    objetivo, techo = OBJETIVOS.get(sid, OBJETIVO), TECHOS.get(sid, TECHO)
    prueba = os.path.join(tmp, f'{sid}-prueba.wav')
    wf.write(prueba, sr, bucle.astype(np.float32))
    ganancia = objetivo - lufs(prueba)
    for _ in range(4):
        y = suavizar_picos(bucle * 10 ** (ganancia / 20), techo)
        wf.write(prueba, sr, y.astype(np.float32))
        medido = lufs(prueba)
        if abs(medido - objetivo) < 0.2:
            break
        ganancia += objetivo - medido
    p = int(MARGEN * sr)
    completo = np.concatenate([y[-p:], y, y[:p]])   # 1 s antes y 1 s después, del mismo bucle
    final = os.path.join(tmp, f'{sid}-final.wav')
    wf.write(final, sr, completo.astype(np.float32))
    destino = os.path.join(SALIDA, f'{sid}.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', final, '-map_metadata', '-1', '-vn', '-ac', str(canales),
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', destino], check=True)
    print(f'{sid:8s} {largo:5.1f} s de bucle, {lufs(destino):6.1f} LUFS, {os.path.getsize(destino) / 1024:5.0f} KB')
    return {'loopStart': MARGEN, 'loopEnd': round(MARGEN + largo, 3)}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    os.makedirs(SALIDA, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        bucles = {sid: preparar(sys.argv[1], sid, tmp) for sid in CORTES}
    print('\nCopia estos valores en js/ui/effects.js (RECORDED) si cambiaste algún corte:')
    print(json.dumps(bucles, indent=1))
