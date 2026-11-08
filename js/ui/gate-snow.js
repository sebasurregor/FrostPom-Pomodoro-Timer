/*
 * FrostPom — nevada suave en la pantalla de entrar / crear cuenta (v3.8.3).
 *
 * Es más delicada que la nieve del paisaje de adentro: pocos copos con borde difuminado,
 * en tres profundidades (lejos: pequeños y lentos; cerca: grandes, borrosos y pocos).
 * Cada copo tiene dos capas: la de afuera cae (y aparece y se desvanece poco a poco) y la de
 * adentro se balancea de lado a lado, así el movimiento no es una línea recta.
 * Solo se anima mientras se ve la pantalla de entrada (#gateScene está oculto el resto del
 * tiempo) y se apaga con "Menos animaciones". Todo con transform/opacity: no pesa.
 */
const LAYERS = [
  // cantidad, tamaño (px), opacidad, caída (s), balanceo (px)
  { n: 20, size: [3, 4.5], op: [0.45, 0.65], fall: [19, 26], sway: [6, 12] },  // lejos
  { n: 14, size: [5, 7], op: [0.7, 0.85], fall: [13, 18], sway: [10, 18] },    // en medio
  { n: 6, size: [11, 15], op: [0.35, 0.5], fall: [9, 12], sway: [16, 26] },    // cerca (desenfocados)
];

// Aleatorio con semilla: los copos quedan bien repartidos y siempre igual (sin saltos al recargar)
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function mountGateSnow(scene = document.getElementById('gateScene')) {
  if (!scene || scene.querySelector('.gate-snow')) return;
  const rnd = seeded(2026);
  const pick = ([a, b]) => a + (b - a) * rnd();
  const box = document.createElement('div');
  box.className = 'gate-snow';
  LAYERS.forEach((L, layer) => {
    for (let i = 0; i < L.n; i++) {
      const fall = pick(L.fall);
      const flake = document.createElement('span');
      flake.className = `gate-flake gate-flake--${layer}`;
      // repartidos a lo ancho en franjas, para que no se amontonen
      flake.style.setProperty('--x', `${((i + rnd() * 0.9) / L.n) * 100}%`);
      flake.style.setProperty('--s', `${pick(L.size).toFixed(1)}px`);
      flake.style.setProperty('--o', pick(L.op).toFixed(2));
      flake.style.setProperty('--fall', `${fall.toFixed(1)}s`);
      flake.style.setProperty('--delay', `${(-rnd() * fall).toFixed(1)}s`); // ya está nevando al abrir
      flake.style.setProperty('--drift', `${Math.round(pick([-25, 45]))}px`);
      const dot = document.createElement('span');
      dot.className = 'gate-flake__dot';
      dot.style.setProperty('--sway', `${pick(L.sway).toFixed(0)}px`);
      dot.style.setProperty('--sway-t', `${pick([3.2, 6]).toFixed(1)}s`);
      dot.style.setProperty('--sway-delay', `${(-rnd() * 6).toFixed(1)}s`);
      flake.append(dot);
      box.append(flake);
    }
  });
  scene.append(box);
}
