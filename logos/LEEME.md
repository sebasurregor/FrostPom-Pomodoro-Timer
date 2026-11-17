# Los logos de FrostPom

Estos son tus logos originales (2048 × 2048, cuadrado redondeado sobre fondo blanco). No viajan
dentro de la app: de aquí salen todos los íconos.

| Archivo | Cuándo |
|---|---|
| `navidad.jpg` | Temporada de Navidad (el que está puesto desde la v4.7.2) |
| `normal.jpg` | El de siempre, con el pico abierto |
| `normal-pico-cerrado.jpg` | El de siempre, con el pico cerrado |

## Cambiar el logo de toda la app

```
pip install pillow numpy opencv-python-headless
python tools/iconos.py normal
```

(Cambia `normal` por `navidad` o `normal-pico-cerrado`, o pon la ruta de otra imagen con el mismo
formato.) El comando escribe, en un solo paso:

- los íconos de la web (`assets/icons/`): pestaña, iPhone, "instalar app" e ícono "maskable";
- los de Android (`android-recursos/res/`): ícono adaptable (cada teléfono le pone su forma), el
  redondo de los Android viejos y la pantalla de inicio;
- los de las tiendas: `docs/google-play/icono-512.png` y `docs/microsoft-store/logo-300.png`.

Después: `npm run android:actualizar`, sube la versión como siempre y, si quieres que se vea en las
tiendas, sube el ícono nuevo en Play Console y en Partner Center.

`actual-redondeado.png` y `actual-lleno.png` los escribe el comando (son el logo puesto ahora, con
las esquinas transparentes y rellenas): no hace falta tocarlos.
