"""
Supabase SIMULADO para las pruebas en navegador (e2e_ranking.py y e2e_cuentas.py): Auth
(cuentas anónimas, correo + contraseña, códigos de recuperación) y las funciones del servidor
(ranking y progreso de las cuentas en línea), en memoria. Las reglas reales se prueban aparte en
PostgreSQL: server/supabase/test/run_local.sh
"""
import json
from urllib.parse import urlparse, parse_qs


class FakeSupabase:
    """Lo mínimo de Supabase Auth (anónimas, correo + contraseña, códigos) y de las funciones
    del ranking y de las cuentas en línea, en memoria."""

    def __init__(self):
        self.n = 0
        self.users = {}      # uid -> {anon, email}
        self.tokens = {}     # access -> uid
        self.refresh = {}    # refresh -> uid
        self.profiles = {}   # uid -> {username, country, avatar, show, xp}
        self.minutes = {}    # uid -> minutos de la semana
        self.sessions = {}   # sid -> {uid, planned, status}
        self.codes = {}
        self.calls = []      # (fn, args, uid)
        self.abort = set()   # funciones (o 'signup', 'token') que fallan "sin internet"
        self.saves = {}      # uid -> {data, version}
        self.require_captcha = False   # como "Enable CAPTCHA protection" en Supabase
        self.captcha_tokens = []       # (ruta, token) recibidos
        self.used_tokens = set()       # cada token de Turnstile sirve una sola vez
        self.reports = []              # (v4.1) (quien reporta, uid reportado, motivo)
        seeds = [('Zorro.lector', 'MX', '🦊', 180, None), ('Luna_K', 'ES', '🦉', 95, 'luna@example.com'),
                 ('pingu.sabio', 'CL', '🐧', 60, None), ('Ana_23', 'AR', '🦭', 30, None)]
        for i, (name, country, av, mins, email) in enumerate(seeds):
            uid = f'seed{i}'
            self.users[uid] = {'anon': email is None, 'email': email, 'password': 'Luna2026x' if email else None}
            self.profiles[uid] = {'username': name, 'country': country, 'avatar': av, 'show': True, 'xp': 900}
            self.minutes[uid] = mins

    def new_uid(self):
        self.n += 1
        return f'00000000-0000-4000-8000-{self.n:012d}'  # como los de Supabase (UUID)

    def session(self, uid):
        self.n += 1
        acc, ref = f'acc-{uid}-{self.n}', f'ref-{uid}-{self.n}'
        self.tokens[acc] = uid
        self.refresh[ref] = uid
        u = self.users[uid]
        return {'access_token': acc, 'refresh_token': ref, 'expires_in': 3600, 'token_type': 'bearer',
                'user': {'id': uid, 'is_anonymous': u['anon'], 'email': u.get('email') or ''}}

    def add_account(self, email, password, save=None):
        uid = self.new_uid()
        self.users[uid] = {'anon': False, 'email': email, 'password': password}
        if save is not None:
            self.saves[uid] = {'data': save, 'version': 1}
        return uid

    def uid_of(self, email):
        return next((k for k, v in self.users.items() if v.get('email') == email), None)

    def fn_calls(self, fn):
        return [c for c in self.calls if c[0] == fn]

    def handle(self, route):
        req = route.request
        path = urlparse(req.url).path
        try:
            body = json.loads(req.post_data or '{}')
        except Exception:
            body = {}
        bearer = (req.headers.get('authorization') or '').replace('Bearer ', '')
        uid = self.tokens.get(bearer)

        def ok(data, status=200):
            route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

        # CAPTCHA: crear cuentas, entrar con contraseña y pedir códigos (no renovar ni /verify)
        guarded = path in ('/auth/v1/signup', '/auth/v1/recover') or (path == '/auth/v1/token' and 'grant_type=password' in req.url)
        if guarded and req.method == 'POST':
            tok = (body.get('gotrue_meta_security') or {}).get('captcha_token')
            self.captcha_tokens.append((path, tok))
            if self.require_captcha and (not tok or not str(tok).startswith('tok-') or tok in self.used_tokens):
                return ok({'code': 400, 'error_code': 'captcha_failed', 'msg': 'captcha protection: request disallowed (captcha verification process failed)'}, 400)
            if tok:
                self.used_tokens.add(tok)

        if path == '/auth/v1/signup':
            if 'signup' in self.abort:
                return route.abort()
            if body.get('email'):
                email = body['email']
                if any(u.get('email') == email for u in self.users.values()):
                    return ok({'code': 422, 'error_code': 'user_already_exists', 'msg': 'User already registered'}, 422)
                nu = self.new_uid(); self.users[nu] = {'anon': False, 'email': email, 'password': body.get('password')}
                self.calls.append(('email_signup', {'email': email}, nu))
                return ok(self.session(nu))
            nu = self.new_uid(); self.users[nu] = {'anon': True, 'email': None}
            self.calls.append(('anon_signup', {}, nu))
            return ok(self.session(nu))
        if path == '/auth/v1/token' and 'grant_type=password' in req.url:
            if 'token' in self.abort:
                return route.abort()
            u = self.uid_of(body.get('email'))
            if not u or self.users[u].get('password') != body.get('password'):
                return ok({'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'}, 400)
            self.calls.append(('password_login', {'email': body.get('email')}, u))
            return ok(self.session(u))
        if path == '/auth/v1/user' and req.method == 'PUT':
            if not uid:
                return ok({'msg': 'JWT expired'}, 401)
            if self.users[uid].get('password') == body.get('password'):
                return ok({'error_code': 'same_password', 'msg': 'New password should be different'}, 422)
            self.users[uid]['password'] = body.get('password')
            self.calls.append(('update_password', {}, uid))
            return ok({'id': uid})
        if path == '/auth/v1/token':
            u = self.refresh.pop(body.get('refresh_token'), None)
            if not u or u not in self.users:
                return ok({'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'}, 400)
            return ok(self.session(u))
        if path == '/auth/v1/recover':
            return ok({})
        if path == '/auth/v1/verify':
            if body.get('token') != '123456':
                return ok({'error_code': 'otp_expired', 'msg': 'Token has expired or is invalid'}, 403)
            u = next((k for k, v in self.users.items() if v.get('email') == body.get('email')), None)
            if not u:
                u = self.new_uid(); self.users[u] = {'anon': False, 'email': body.get('email')}
            return ok(self.session(u))
        if path == '/auth/v1/logout':
            # Como Supabase: sin ?scope=local cierra la sesión en TODOS los equipos de esa cuenta
            scope = parse_qs(urlparse(req.url).query).get('scope', ['global'])[0]
            self.calls.append(('logout', {'scope': scope}, uid))
            if uid:
                n = bearer.rsplit('-', 1)[-1]
                for t in [t for t, u in self.refresh.items() if u == uid and (scope == 'global' or t.rsplit('-', 1)[-1] == n)]:
                    self.refresh.pop(t, None)
                for t in [t for t, u in self.tokens.items() if u == uid and (scope == 'global' or t == bearer)]:
                    self.tokens.pop(t, None)
            return route.fulfill(status=204, body='')
        if not path.startswith('/rest/v1/rpc/'):
            return ok({'msg': 'not found'}, 404)

        fn = path.rsplit('/', 1)[1]
        if fn in self.abort:
            return route.abort()
        self.calls.append((fn, body, uid))
        if fn == 'username_available':
            name = str(body.get('p_username', '')).lower()
            return ok(not any(p['username'].lower() == name and k != uid for k, p in self.profiles.items()))
        if fn == 'get_leaderboard':
            rows = [(k, p, self.minutes.get(k, 0)) for k, p in self.profiles.items() if p['show'] and not p.get('hidden') and self.minutes.get(k, 0) > 0]
            rows.sort(key=lambda r: (-r[2], r[1]['username'].lower()))
            out, pos, prev = [], 0, None
            for i, (k, p, m) in enumerate(rows):
                if m != prev:
                    pos = i + 1
                prev = m
                out.append({'pos': pos, 'username': p['username'], 'country': p['country'], 'avatar': p['avatar'], 'minutes': m, 'xp': p['xp'], 'is_me': k == uid})
            return ok(out[: int(body.get('p_limit') or 50)])
        if not uid:
            return ok({'code': 'PGRST301', 'message': 'JWT expired'}, 401)
        if fn == 'set_profile':
            name = body['p_username']
            if any(p['username'].lower() == name.lower() and k != uid for k, p in self.profiles.items()):
                return ok({'code': '23505', 'message': 'name_taken'}, 409)
            prev = self.profiles.get(uid, {})
            self.profiles[uid] = {'username': name, 'country': body.get('p_country'), 'avatar': body.get('p_avatar') or '🐧', 'show': body.get('p_show', True), 'xp': prev.get('xp', 0)}
            return ok([{'username': name, 'show_on_board': self.profiles[uid]['show']}])
        if fn == 'report_name':  # (v4.1) mismas reglas que server/supabase/schema.sql
            if body.get('p_reason') not in ('ofensivo', 'suplantacion', 'datos', 'otro'):
                return ok({'code': '22023', 'message': 'Motivo no válido'}, 400)
            if sum(1 for r in self.reports if r[0] == uid) >= 20:
                return ok({'code': '54000', 'message': 'too_many_reports'}, 400)
            name = str(body.get('p_username', '')).strip().lower()
            target = next((k for k, p in self.profiles.items() if p['username'].lower() == name and p['show'] and not p.get('hidden')), None)
            if target and target != uid and not any(r[0] == uid and r[1] == target for r in self.reports):
                self.reports.append((uid, target, body['p_reason']))
                if len({r[0] for r in self.reports if r[1] == target}) >= 3:
                    self.profiles[target]['hidden'] = True
            return route.fulfill(status=204, body='')
        if fn == 'set_board_visibility':
            self.profiles[uid]['show'] = bool(body.get('p_show'))
            return route.fulfill(status=204, body='')
        if fn == 'start_session':
            self.n += 1
            sid = f'sid-{self.n}'
            self.sessions[sid] = {'uid': uid, 'planned': body['p_planned_sec'], 'status': 'active'}
            return ok(sid)
        if fn == 'finish_session':
            s = self.sessions.get(body.get('p_session_id'))
            if not s or s['uid'] != uid or s['status'] != 'active':
                return ok({'code': 'P0002', 'message': 'Sesión no encontrada o ya terminada'}, 404)
            s['status'] = 'done'
            credit = min(int(body.get('p_actual_sec') or 0), s['planned'])
            self.minutes[uid] = self.minutes.get(uid, 0) + credit // 60
            if body.get('p_xp') is not None:
                self.profiles[uid]['xp'] = int(body['p_xp'])
            return ok([{'credited_sec': credit, 'capped': False}])
        if fn == 'create_transfer_code':
            code = f'code-{uid}'
            self.codes[code] = uid
            return ok(code)
        if fn == 'redeem_transfer_code':
            src = self.codes.pop(body.get('p_code'), None)
            if not src:
                return ok({'code': 'P0002', 'message': 'code_invalid'}, 404)
            if src in self.profiles and uid not in self.profiles:
                self.profiles[uid] = self.profiles.pop(src)
                self.minutes[uid] = self.minutes.pop(src, 0)
            if self.users.get(src, {}).get('anon'):
                self.users.pop(src, None)
            return ok(True)
        if fn == 'export_my_data':
            return ok({'profile': self.profiles.get(uid), 'daily_totals': [], 'sessions': [s for s in self.sessions.values() if s['uid'] == uid]})
        if fn == 'delete_my_account':
            self.profiles.pop(uid, None); self.minutes.pop(uid, None)
            if self.users.get(uid, {}).get('anon'):
                self.users.pop(uid, None)
            return route.fulfill(status=204, body='')
        if fn in ('load_progress', 'save_progress') and self.users.get(uid, {}).get('anon'):
            return ok({'code': '42501', 'message': 'account_required'}, 403)
        if fn == 'load_progress':
            sv = self.saves.get(uid)
            return ok([] if not sv else [{'data': sv['data'], 'version': sv['version'], 'updated_at': '2026-11-08T12:00:00Z'}])
        if fn == 'save_progress':
            data = dict(body.get('p_data') or {})
            data.pop('account', None)
            if isinstance(data.get('profile'), dict):
                data['profile'] = {**data['profile']}; data['profile'].pop('photo', None)
            sv = self.saves.get(uid)
            if sv and int(body.get('p_base_version') or 0) != sv['version']:
                return ok({'code': '40001', 'message': 'save_conflict', 'details': str(sv['version'])}, 409)
            v = (sv['version'] + 1) if sv else 1
            self.saves[uid] = {'data': data, 'version': v}
            return ok(v)
        if fn == 'delete_my_cloud_account':
            self.saves.pop(uid, None); self.profiles.pop(uid, None); self.minutes.pop(uid, None); self.users.pop(uid, None)
            return route.fulfill(status=204, body='')
        return ok({'code': 'PGRST202', 'message': 'Could not find the function'}, 404)
