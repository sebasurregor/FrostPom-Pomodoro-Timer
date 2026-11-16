// FrostPom (v4.7.0) — la app pide "revisa mi Premium" justo después de comprar o restaurar.
// Revisa la sesión de la persona (no se puede pedir por otra cuenta) y le pregunta a RevenueCat.
// La lógica está en ../_shared/premium.js (con pruebas). Paso a paso: docs/GOOGLE-PLAY-BILLING.md
// Desplegar: supabase functions deploy premium-sync --no-verify-jwt
import { handleSync } from '../_shared/premium.js';

const env = (name: string) => Deno.env.get(name) ?? '';

Deno.serve((req: Request) => handleSync(req, { env, fetch }));
