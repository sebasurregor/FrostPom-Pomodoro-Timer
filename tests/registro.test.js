/*
 * (v4.9.0) Lo que vio un tester al crear su cuenta en Android: "las contraseñas no coinciden" aunque
 * se veían iguales, y un correo con un espacio después del punto ("email. com").
 * Ejecuta: node --test tests/ (o npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail } from '../js/cloud.js';
import { checkPassword } from '../js/security.js';

test('registro: el correo sin los espacios que pone el teclado', () => {
  assert.equal(cleanEmail('temp.email@email. com'), 'temp.email@email.com');
  assert.equal(cleanEmail('  Ana.Perez@Gmail.com '), 'ana.perez@gmail.com');
  assert.equal(cleanEmail('ana @ gmail . com'), 'ana@gmail.com');
  assert.equal(cleanEmail('sin-arroba.com'), '', 'sin @ sigue siendo un error');
});

test('registro: una contraseña no puede empezar ni terminar con un espacio', () => {
  assert.equal(checkPassword('k2345678.a*T').ok, true);
  assert.equal(checkPassword('k2345678.a*T ').ok, false);
  assert.equal(checkPassword(' k2345678.a*T').ok, false);
  assert.equal(checkPassword('mi clave 2026').ok, true, 'los espacios en medio sí se permiten');
});
