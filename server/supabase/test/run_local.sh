#!/usr/bin/env bash
# Crea una base de datos temporal, carga el esquema y corre las pruebas.
# Uso: PGHOST=localhost PGPORT=5432 PGUSER=postgres ./server/supabase/test/run_local.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="frostpom_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/local_auth_stub.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/../schema.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/tests.sql"
