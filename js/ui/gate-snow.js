/*
 * FrostPom — nevada suave en la pantalla de entrar / crear cuenta (v3.8.3; un solo dibujo desde la v4.2.1).
 *
 * Es más delicada que la nieve del paisaje de adentro: pocos copos, en tres profundidades
 * (lejos: pequeños y lentos; cerca: grandes, borrosos y pocos), que caen despacio y se balancean.
 * Usa la misma nieve en <canvas> del paisaje (snow.js): solo se anima mientras se ve la pantalla
 * de entrada y se apaga con "Menos animaciones".
 */
import { createSnow } from './snow.js';

export function mountGateSnow(scene = document.getElementById('gateScene')) {
  if (!scene || scene.querySelector('.gate-snow')) return null;
  return createSnow(scene, {
    weather: 'gate',
    className: 'gate-snow',
    seed: 2026,
    // solo mientras se ve la entrada, y quieta mientras escribes en el celular (ver main.js: is-typing)
    active: () => document.documentElement.classList.contains('gate-open') && !document.documentElement.classList.contains('is-typing'),
  });
}
