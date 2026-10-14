#!/bin/bash
# ============================================================
#  ListenBook backend - deploy on PythonAnywhere
#  Runs inside a PythonAnywhere Bash console ("bash deploy_pa.sh").
#  Everything is echoed into the log so failures are diagnosable.
# ============================================================
set -u
H="/home/piterju"
VENV="$H/.virtualenvs/lb"
APP="$H/listenbook/backend"
TARBALL="$H/listenbook-backend.tar.gz"
MODE_FILE="$H/.deploy_mode"

echo "########## 0. environment ##########"
echo "RUN-ID   : $(cat "$H/.deploy_runid" 2>/dev/null || echo '<none>')"
date
echo "whoami   : $(whoami)"
echo "HOME     : $H"

echo
echo "########## 1. pick a python3.13 ##########"
PY=""
for c in /usr/bin/python3.13 /usr/local/bin/python3.13 /usr/local/bin/python3 python3.13 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    v=$("$c" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null)
    echo "  candidate $c -> ${v:-?}"
    if [ "$v" = "3.13" ] && [ -z "$PY" ]; then PY=$(command -v "$c"); fi
  fi
done
echo "PY = ${PY:-<none>}"
[ -n "$PY" ] || { echo "FATAL: no python3.13"; exit 11; }
"$PY" -c 'import sys;print(sys.version)'

echo
echo "########## 2. extract app ##########"
[ -f "$TARBALL" ] || { echo "FATAL: tarball missing"; exit 12; }

# Never lose data that only exists on the server: stash the live SQLite file
# (and keep it if the incoming tarball does not carry one).
KEEP_DB="$H/.keep_db.sqlite3"
if [ -f "$APP/db.sqlite3" ]; then
  cp -p "$APP/db.sqlite3" "$KEEP_DB" && echo "stashed existing db.sqlite3 -> $KEEP_DB"
fi
echo "tarball contains db.sqlite3: $(tar tzf "$TARBALL" | grep -c 'backend/db\.sqlite3$')"

rm -rf "$H/listenbook"
mkdir -p "$H/listenbook"
tar xzf "$TARBALL" -C "$H/listenbook" || { echo "FATAL: tar failed"; exit 13; }

if [ ! -f "$APP/db.sqlite3" ] && [ -f "$KEEP_DB" ]; then
  cp -p "$KEEP_DB" "$APP/db.sqlite3" && echo "restored online db.sqlite3 (tarball had none)"
fi
echo "--- tree ---"
find "$H/listenbook" -maxdepth 2 | sed "s|$H|~|" | sort
echo "--- media ---"
find "$APP/media" -type f | sed "s|$H|~|"
echo "--- db ---"
ls -la "$APP/db.sqlite3" 2>/dev/null || echo "WARN no db.sqlite3"
echo "--- requirements ---"
cat "$APP/requirements.txt"

echo
echo "########## 3. build python environment ##########"
MODE=""
REUSE=0
mkdir -p "$H/.virtualenvs"

# Re-use an existing healthy virtualenv whenever possible — rebuilding it on
# every redeploy would burn the free tier's 100 CPU-seconds/day budget.
if [ -x "$VENV/bin/python" ]; then
  if "$VENV/bin/python" -c "import django, rest_framework, rest_framework_simplejwt, django_filters, corsheaders, PIL" 2>/dev/null; then
    REUSE=1
    MODE="venv"
    echo "REUSE existing venv (all dependencies importable): $VENV"
  else
    echo "existing venv is incomplete/broken -> rebuilding"
  fi
fi

if [ "$REUSE" != "1" ]; then
  rm -rf "$VENV"
  if "$PY" -m venv "$VENV" >/tmp/_venv_out 2>&1 && [ -x "$VENV/bin/python" ]; then
    MODE="venv"
    echo "mode = venv  ($VENV)"
  else
    echo "python -m venv FAILED, output was:"
    tail -8 /tmp/_venv_out
    rm -rf "$VENV"
    if "$PY" -m virtualenv "$VENV" >/tmp/_venv_out2 2>&1 && [ -x "$VENV/bin/python" ]; then
      MODE="venv"
      echo "mode = venv via virtualenv module"
    else
      echo "virtualenv module also FAILED:"
      tail -8 /tmp/_venv_out2
      MODE="user"
      echo "mode = user-site fallback (pip install --user)"
    fi
  fi
fi
echo "$MODE" > "$MODE_FILE"

echo
echo "########## 4. install dependencies (mode=$MODE reuse=$REUSE) ##########"
if [ "$REUSE" = "1" ]; then
  PYBIN="$VENV/bin/python"
  echo "skipped: reusing the existing virtualenv"
  "$VENV/bin/pip" freeze 2>/dev/null | sort
elif [ "$MODE" = "venv" ]; then
  PYBIN="$VENV/bin/python"
  "$VENV/bin/pip" install --no-cache-dir --disable-pip-version-check -r "$APP/requirements.txt" 2>&1 | tail -25
  echo "--- installed ---"
  "$VENV/bin/pip" freeze 2>/dev/null | sort
else
  PYBIN="$PY"
  "$PY" -m pip install --no-cache-dir --disable-pip-version-check --user -r "$APP/requirements.txt" 2>&1 | tail -25
  echo "--- installed ---"
  "$PY" -m pip list 2>/dev/null | grep -iE "django|rest|pillow|jwt|cors|filter|decouple"
fi

echo
echo "########## 5. import check ##########"
"$PYBIN" - <<'PYEOF'
import importlib, sys
for m in ["django","rest_framework","rest_framework_simplejwt","django_filters","corsheaders","PIL"]:
    try:
        mod = importlib.import_module(m)
        print("  OK   %-28s %s" % (m, getattr(mod, "__version__", "")))
    except Exception as e:
        print("  FAIL %-28s %r" % (m, e))
print("python:", sys.version.replace("\n"," "))
PYEOF

echo
echo "########## 6. django check ##########"
echo "--- environment inherited by this process (diagnostics) ---"
env | grep -iE "^(CORS|CSRF|DJANGO|DB_|PYTHON)" | sort || echo "(none)"
cd "$APP" || exit 16
# Run the check against production-like settings, i.e. exactly the values the
# WSGI entry point uses at runtime. Without CORS_ALLOWED_ORIGINS set, a naive
# settings module can end up with [''] and fail corsheaders.E013.
env DJANGO_DEBUG=False \
    CORS_ALLOWED_ORIGINS="https://listenbook-ebj.pages.dev,https://piterju.pythonanywhere.com" \
    CSRF_TRUSTED_ORIGINS="https://piterju.pythonanywhere.com,https://listenbook-ebj.pages.dev" \
    "$PYBIN" manage.py check 2>&1 | tail -30

echo
echo "########## 6.5 migrate ##########"
# Apply schema changes (e.g. new columns added for the crawler). Safe to run on
# every deploy: Django only applies migrations that are not recorded yet, and
# existing rows are preserved.
env DJANGO_DEBUG=False \
    CORS_ALLOWED_ORIGINS="https://listenbook-ebj.pages.dev,https://piterju.pythonanywhere.com" \
    CSRF_TRUSTED_ORIGINS="https://piterju.pythonanywhere.com,https://listenbook-ebj.pages.dev" \
    "$PYBIN" manage.py migrate --noinput 2>&1 | tail -25
echo "--- pending migrations after apply (should be empty) ---"
env DJANGO_DEBUG=False "$PYBIN" manage.py showmigrations --plan 2>&1 | grep -E "^\[ \]" || echo "(none pending)"

echo
echo "########## 7. collectstatic ##########"
env DJANGO_DEBUG=False "$PYBIN" manage.py collectstatic --noinput 2>&1 | tail -8
echo "staticfiles top level:"; ls "$APP/staticfiles" 2>/dev/null | head

echo
echo "########## 8. summary ##########"
echo "MODE          : $MODE"
echo "PYBIN         : $PYBIN"
echo "APP           : $APP"
echo "STATIC        : $APP/staticfiles"
echo "MEDIA         : $APP/media"
echo "=== DEPLOY_SCRIPT_DONE_OK ==="
