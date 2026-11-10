"""
(v4.3) En el celular, varias secciones se abren como ventana (js/ui/sheets.js): Duración, Tu
estudio, Historial, Compañeros, Temporadas, Temas y Logros. Las pruebas escritas antes tocaban esos
botones directamente, como si siempre se vieran.

patch(pg) hace que pg.click / fill / check / press… primero abran la ventana donde está lo que se va a
tocar (y cierren la que esté abierta si se va a tocar otra cosa). En pantallas grandes no hace nada.
Las pruebas de las ventanas mismas (los botones, la ×, Escape) están en e2e_smoke.py.
"""

REVEAL_JS = """async (el) => {
  const sec = el.closest('[data-sheet]');
  const open = document.querySelector('[data-sheet].is-open');
  if (sec && sec === open) return;
  const m = await import('./js/ui/sheets.js');
  if (open) m.closeSheet({ restore: false });
  if (sec && getComputedStyle(sec).display === 'none') m.openSheet(sec);
}"""

ACTIONS = ('click', 'dblclick', 'fill', 'check', 'uncheck', 'press', 'select_option', 'set_input_files', 'tap', 'hover')


def reveal(pg, selector):
    """Abre la ventana donde está `selector` (si está escondido en una)."""
    try:
        loc = pg.locator(selector).first
        if loc.count():
            loc.evaluate(REVEAL_JS)
    except Exception:
        pass  # si no se puede, la acción normal dirá qué pasó


def patch(pg):
    for name in ACTIONS:
        orig = getattr(pg, name)

        def wrapped(selector, *args, _orig=orig, **kwargs):
            reveal(pg, selector)
            return _orig(selector, *args, **kwargs)

        setattr(pg, name, wrapped)
    return pg
