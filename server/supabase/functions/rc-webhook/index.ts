// FrostPom (v4.7.0) — el aviso de RevenueCat cuando cambia una suscripción.
// La lógica está en ../_shared/premium.js (con pruebas). Paso a paso: docs/GOOGLE-PLAY-BILLING.md
// Desplegar: supabase functions deploy rc-webhook --no-verify-jwt
import { handleWebhook } from '../_shared/premium.js';

const env = (name: string) => Deno.env.get(name) ?? '';

Deno.serve((req: Request) => handleWebhook(req, { env, fetch }));
