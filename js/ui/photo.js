/*
 * StudyTimer — foto de perfil.
 * La foto se recorta cuadrada (con zoom y arrastrando para encuadrar) y se vuelve a dibujar
 * en un lienzo de 256 × 256. Así:
 *  - pesa poco (unos 20 KB) y cabe en el almacenamiento local;
 *  - se borran los datos ocultos de la foto original (EXIF: ubicación GPS, modelo del
 *    teléfono, fecha), porque solo se guardan los píxeles.
 * La foto se queda SOLO en este dispositivo. En el ranking los demás ven tu animal: cuando
 * exista el servidor, la foto nunca se envía (ver docs/SEGURIDAD.md).
 */
import { $, h } from './dom.js';
import { openDialog, toast } from './feedback.js';

const OUT = 256; // tamaño final en píxeles
const VIEW = 240; // tamaño del recorte en pantalla
const MAX_FILE = 15 * 1024 * 1024;
export const PHOTO_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
export const PHOTO_MAX_CHARS = 300000;

/** Abre el selector de archivos (o la cámara en el celular). Debe llamarse desde un toque o clic. */
function chooseFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', hidden: true });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Elegir, encuadrar y convertir. Devuelve la foto como data URL (WebP o JPEG) o null. */
export async function pickProfilePhoto() {
  const file = await chooseFile();
  if (!file) return null;
  if (file.size > MAX_FILE) {
    toast('Esa foto es muy pesada (máximo 15 MB).', 'warn');
    return null;
  }
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    toast('No pudimos abrir esa imagen. Prueba con una foto JPG o PNG.', 'warn');
    return null;
  }
  return cropDialog(bmp);
}

function cropDialog(bmp) {
  const canvas = h('canvas', { class: 'photo-crop__canvas', width: String(VIEW * 2), height: String(VIEW * 2), 'aria-label': 'Vista previa de tu foto. Arrástrala para encuadrarla.', role: 'img' });
  const zoom = h('input', { type: 'range', id: 'photoZoom', min: '1', max: '3', step: '0.01', value: '1', 'aria-label': 'Zoom' });
  const base = VIEW / Math.min(bmp.width, bmp.height); // la foto siempre cubre el círculo
  let z = 1;
  let ox = 0; // desplazamiento del centro, en px de pantalla
  let oy = 0;
  const clamp = () => {
    const s = base * z;
    const maxX = Math.max(0, (bmp.width * s - VIEW) / 2);
    const maxY = Math.max(0, (bmp.height * s - VIEW) / 2);
    ox = Math.min(maxX, Math.max(-maxX, ox));
    oy = Math.min(maxY, Math.max(-maxY, oy));
  };
  const drawTo = (ctx, size) => {
    const k = size / VIEW;
    const s = base * z * k;
    const w = bmp.width * s;
    const hgt = bmp.height * s;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, size / 2 - w / 2 + ox * k, size / 2 - hgt / 2 + oy * k, w, hgt);
  };
  const ctx = canvas.getContext('2d');
  const redraw = () => { clamp(); drawTo(ctx, VIEW * 2); };
  zoom.addEventListener('input', () => { z = Number(zoom.value); redraw(); });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ox = drag.ox + (e.clientX - drag.x);
    oy = drag.oy + (e.clientY - drag.y);
    redraw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    z = Math.min(3, Math.max(1, z - e.deltaY * 0.002));
    zoom.value = String(z);
    redraw();
  }, { passive: false });
  redraw();

  let result = null;
  return openDialog({
    title: 'Tu foto de perfil',
    className: 'dlg--photo',
    body: [
      h('div', { class: 'photo-crop' }, canvas),
      h('label', { class: 'photo-crop__zoom', for: 'photoZoom' }, h('span', { 'aria-hidden': 'true', text: '🔍' }), ' Zoom', zoom),
      h('p', { class: 'dlg__note', text: 'Arrastra la foto para encuadrarla. Se guarda solo en este dispositivo: en el ranking, los demás verán tu animal.' }),
    ],
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      {
        label: 'Usar esta foto', value: 'ok', variant: 'btn--gold', primary: true,
        validate: () => {
          const out = h('canvas', { width: String(OUT), height: String(OUT) });
          drawTo(out.getContext('2d'), OUT);
          let url = out.toDataURL('image/webp', 0.86);
          if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/jpeg', 0.86); // Safari antiguo
          if (!PHOTO_RE.test(url) || url.length > PHOTO_MAX_CHARS) {
            toast('No pudimos guardar esa foto. Prueba con otra.', 'warn');
            return false;
          }
          result = url;
          return true;
        },
      },
    ],
    onOpen: () => zoom.focus(),
  }).then((v) => {
    if (bmp.close) bmp.close();
    return v === 'ok' ? result : null;
  });
}

/** Imagen de la foto para un avatar. */
export function photoImg(url, size) {
  return h('img', { class: 'avatar__photo', src: url, alt: '', width: String(size), height: String(size), draggable: 'false', decoding: 'async' });
}
