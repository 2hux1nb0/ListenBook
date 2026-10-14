#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One-command redeploy of the ListenBook Django backend to PythonAnywhere.

Everything goes through the PythonAnywhere REST API, so no browser and no
interactive console is needed.

Usage
-----
    python redeploy_backend_pa.py                # push code; KEEP the live SQLite DB
    python redeploy_backend_pa.py --with-db      # also push local db.sqlite3 (first-time deploy)
    python redeploy_backend_pa.py --no-verify    # skip the post-deploy endpoint checks
    python redeploy_backend_pa.py --keep-front   # do not print frontend hints

Config lives in .cf_deploy/
    pa_token.txt        PythonAnywhere API token      (required)
    pa_user.txt         PythonAnywhere username       (default: piterju)
    pa_secret_key.txt   production Django SECRET_KEY  (auto-generated if absent)

Server-side helpers live in pa_deploy/
    deploy_pa.sh        runs on PythonAnywhere: extract, venv, pip, check, collectstatic
"""
from __future__ import annotations

import argparse
import io
import json
import os
import secrets
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
CF_DIR = os.path.join(HERE, '.cf_deploy')
PA_DIR = os.path.join(HERE, 'pa_deploy')
TMP_DIR = os.path.join(HERE, '.deploy_tmp')

DONE_MARKER = 'DEPLOY_SCRIPT_DONE_OK'

BOOTSTRAP_WSGI = '''"""Temporary bootstrap WSGI - launches deploy_pa.sh once, then idles.

Replaced by the real Django WSGI file as soon as the deploy finishes.
"""
import os
import subprocess

HOME = '/home/{user}'
LOG = HOME + '/deploy_pa.log'
SCRIPT = HOME + '/deploy_pa.sh'
MARK = HOME + '/.deploy_launched'


def _launch_once():
    """Start the deploy script exactly once (atomic marker creation)."""
    try:
        os.close(os.open(MARK, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644))
    except OSError:
        return False
    try:
        logf = open(LOG, 'w')
        logf.write('bootstrap: launching deploy script\\n')
        logf.flush()
        env = dict(os.environ)
        env['HOME'] = HOME
        cmd = 'nohup /bin/bash %s >> %s 2>&1 < /dev/null &' % (SCRIPT, LOG)
        subprocess.Popen(cmd, shell=True, cwd=HOME, env=env,
                         start_new_session=True)
    except Exception as exc:
        try:
            with open(LOG, 'a') as fh:
                fh.write('bootstrap error: %r\\n' % (exc,))
        except Exception:
            pass
    return True


def application(environ, start_response):
    # Deliberately checked on every request, not at import time: PythonAnywhere
    # may keep a worker alive that was started before this file was uploaded,
    # so a module-level attempt alone is not reliable.
    if not os.path.exists(MARK):
        _launch_once()
    body = b'ListenBook bootstrap: idle\\n'
    start_response('200 OK', [('Content-Type', 'text/plain'),
                              ('Content-Length', str(len(body)))])
    return [body]
'''

REAL_WSGI = '''"""WSGI entry point for the ListenBook backend on PythonAnywhere."""
import os
import sys

HOME = '/home/{user}'
APP_DIR = HOME + '/listenbook/backend'

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
os.environ['DJANGO_DEBUG'] = 'False'
os.environ['DJANGO_SECRET_KEY'] = '{secret}'
os.environ['DJANGO_ALLOWED_HOSTS'] = '{user}.pythonanywhere.com'
os.environ['CORS_ALLOWED_ORIGINS'] = '{cors}'
os.environ['CSRF_TRUSTED_ORIGINS'] = '{csrf}'

if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
'''

FRONTEND_ORIGIN = 'https://listenbook-ebj.pages.dev'


def log(msg: str) -> None:
    print(msg, flush=True)


def read_cfg(name: str, default: str | None = None) -> str:
    path = os.path.join(CF_DIR, name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as fh:
            return fh.read().strip()
    if default is None:
        raise SystemExit('missing config file: %s' % path)
    return default


def write_cfg(name: str, value: str) -> None:
    os.makedirs(CF_DIR, exist_ok=True)
    with open(os.path.join(CF_DIR, name), 'w', encoding='utf-8') as fh:
        fh.write(value)


class PA:
    def __init__(self, user: str, token: str) -> None:
        self.user = user
        self.token = token
        self.base = 'https://www.pythonanywhere.com/api/v0/user/%s' % user

    # ---------------------------------------------------------------- request
    def _req(self, method, path, data=None, ctype=None, timeout=120):
        url = self.base + path if path.startswith('/') else self.base + '/' + path
        headers = {'Authorization': 'Token ' + self.token}
        if ctype:
            headers['Content-Type'] = ctype
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()
        except Exception as exc:
            return -1, repr(exc).encode()

    def form(self, method, path, fields, timeout=120):
        body = urllib.parse.urlencode(fields).encode()
        return self._req(method, path, body,
                         'application/x-www-form-urlencoded', timeout)

    def get(self, path, timeout=120):
        return self._req('GET', path, timeout=timeout)

    def delete(self, api_path, timeout=60):
        """DELETE against an API path that already includes its own prefix."""
        return self._req('DELETE', api_path, timeout=timeout)

    def delete_file(self, remote_abs_path, timeout=60):
        """Delete a file/dir on the server.

        NOTE: the trailing '/files/path' is mandatory. Forgetting it does not
        raise — the API simply answers 404 and the file silently survives,
        which once caused a stale deploy log to be read as a fresh result.
        """
        return self._req('DELETE', '/files/path' + remote_abs_path, timeout=timeout)

    # ---------------------------------------------------------------- upload
    def upload(self, remote_abs_path, local_file, timeout=900):
        """Upload one file. PythonAnywhere needs multipart/form-data with the
        field name `content`; application/octet-stream is rejected with 415."""
        boundary = '----ListenBook' + uuid.uuid4().hex
        with open(local_file, 'rb') as fh:
            payload = fh.read()
        parts = []
        parts.append(('--%s\r\n' % boundary).encode())
        parts.append((
            'Content-Disposition: form-data; name="content"; filename="%s"\r\n'
            % os.path.basename(local_file)).encode())
        parts.append(b'Content-Type: application/octet-stream\r\n\r\n')
        parts.append(payload)
        parts.append(('\r\n--%s--\r\n' % boundary).encode())
        body = b''.join(parts)
        path = '/files/path' + remote_abs_path
        for attempt in range(3):
            status, raw = self._req(
                'POST', path, body,
                'multipart/form-data; boundary=%s' % boundary, timeout=timeout)
            if status in (200, 201):
                return status
            log('      upload retry %d/%d for %s -> %s %s'
                % (attempt + 1, 3, remote_abs_path, status, raw[:200]))
            time.sleep(3)
        raise SystemExit('upload failed for %s: %s %s' % (remote_abs_path, status, raw[:400]))

    def read_remote(self, remote_abs_path, timeout=120):
        status, raw = self._req('GET', '/files/path' + remote_abs_path, timeout=timeout)
        if status != 200:
            return None
        return raw

    def webapp(self, domain):
        status, raw = self.get('/webapps/%s/' % domain)
        if status != 200:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None


def build_tarball(include_db: bool) -> str:
    os.makedirs(TMP_DIR, exist_ok=True)
    out = os.path.join(TMP_DIR, 'listenbook-backend.tar.gz')
    src = os.path.join(HERE, 'backend')
    skip_names = {'__pycache__', 'staticfiles', '.DS_Store'}
    if not include_db:
        skip_names.add('db.sqlite3')

    def flt(tarinfo):
        base = os.path.basename(tarinfo.name)
        if base in skip_names or base.endswith('.pyc'):
            return None
        return tarinfo

    with tarfile.open(out, 'w:gz') as tar:
        tar.add(src, arcname='backend', filter=flt)

    size = os.path.getsize(out)
    log('   tarball: %s (%.1f MB, db.sqlite3 %s)'
        % (out, size / 1048576.0, 'included' if include_db else 'EXCLUDED (live DB kept)'))
    return out


def wait_for_log(pa: PA, run_id: str, deadline_s=600, label='deploy'):
    """Poll the server-side log until THIS run reports success.

    The log must contain `run_id`, which the orchestrator writes to
    /home/<user>/.deploy_runid just before triggering. Without it, a leftover
    log from an earlier run would be mistaken for this run's result.
    """
    log_path = '/home/%s/deploy_pa.log' % pa.user
    started = time.time()
    last_len = -1
    while time.time() - started < deadline_s:
        raw = pa.read_remote(log_path)
        if raw:
            text = raw.decode('utf-8', 'replace')
            if run_id not in text:
                # leftover from a previous run (or a run that never started)
                time.sleep(6)
                continue
            if len(text) != last_len:
                last_len = len(text)
                tail = text.strip().splitlines()[-1] if text.strip() else ''
                log('   [%3ds] log %6d bytes | %s'
                    % (int(time.time() - started), len(text), tail[:110]))
            if DONE_MARKER in text:
                return text
            if 'FATAL:' in text:
                log('\n!! the server-side script reported a fatal error:\n')
                log(text)
                raise SystemExit(1)
        time.sleep(6)
    raise SystemExit('timed out waiting for the %s log (run id %s, last size %s)'
                     % (label, run_id, last_len))


def main() -> int:
    ap = argparse.ArgumentParser(description='Redeploy the ListenBook backend to PythonAnywhere')
    ap.add_argument('--with-db', action='store_true',
                    help='also upload the local backend/db.sqlite3 (overwrites online data!)')
    ap.add_argument('--no-verify', action='store_true', help='skip post-deploy checks')
    args = ap.parse_args()

    token = read_cfg('pa_token.txt')
    user = read_cfg('pa_user.txt', 'piterju')
    secret = read_cfg('pa_secret_key.txt', '')
    if not secret:
        secret = secrets.token_urlsafe(64)
        write_cfg('pa_secret_key.txt', secret)
        log('generated a new Django SECRET_KEY -> .cf_deploy/pa_secret_key.txt')

    domain = '%s.pythonanywhere.com' % user
    pa = PA(user, token)

    log('== ListenBook backend -> PythonAnywhere ==')
    log('   user   : %s' % user)
    log('   domain : %s' % domain)
    log('   db     : %s' % ('local db.sqlite3 WILL BE UPLOADED' if args.with_db
                            else 'online database is preserved'))

    log('\n[1/7] build the deployment tarball')
    tarball = build_tarball(args.with_db)

    log('\n[2/7] upload tarball + server-side script')
    pa.upload('/home/%s/listenbook-backend.tar.gz' % user, tarball)
    log('      uploaded tarball')
    pa.upload('/home/%s/deploy_pa.sh' % user, os.path.join(PA_DIR, 'deploy_pa.sh'))
    log('      uploaded deploy_pa.sh')

    log('\n[3/7] install the bootstrap WSGI and start the deploy')
    with open(os.path.join(TMP_DIR, 'bootstrap_wsgi.py'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(BOOTSTRAP_WSGI.format(user=user))
    pa.upload('/var/www/%s_pythonanywhere_com_wsgi.py' % user,
              os.path.join(TMP_DIR, 'bootstrap_wsgi.py'))
    log('      bootstrap WSGI in place')

    # A random run id travels with this deploy, so the log we read back can
    # only have been produced by this run — never by a leftover from before.
    run_id = uuid.uuid4().hex[:16]
    os.makedirs(TMP_DIR, exist_ok=True)
    runid_path = os.path.join(TMP_DIR, 'deploy_runid.txt')
    with open(runid_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(run_id)
    pa.upload('/home/%s/.deploy_runid' % user, runid_path)
    log('      run id: %s' % run_id)

    # Clear every trace of the previous run so its output cannot be mistaken
    # for this run's result.
    st_log, _ = pa.delete_file('/home/%s/deploy_pa.log' % user)
    st_mark, _ = pa.delete_file('/home/%s/.deploy_launched' % user)
    log('      cleared previous log (http %s) + launch marker (http %s)' % (st_log, st_mark))
    if pa.read_remote('/home/%s/deploy_pa.log' % user) is not None:
        raise SystemExit('the previous deploy log is still there — aborting so a '
                         'stale run can never be reported as this run')

    # The venv is recreated during the deploy; pointing the web app at it now
    # would make the bootstrap WSGI itself fail to start.
    st, raw = pa.form('PATCH', '/webapps/%s/' % domain, {'virtualenv_path': ''})
    log('      virtualenv detached (status %s)' % st)

    st, raw = pa._req('POST', '/webapps/%s/reload/' % domain)
    log('      reload -> %s' % st)
    time.sleep(8)

    # Any request boots the worker, which runs the bootstrap and fires the
    # script. PythonAnywhere may briefly keep serving from old workers, so
    # keep poking until the log actually shows up.
    log('      poking the site until the bootstrap starts')
    for attempt in range(1, 10):
        try:
            urllib.request.urlopen('https://%s/?t=%d' % (domain, attempt), timeout=60).read()
        except Exception as exc:
            log('      trigger %d -> %s' % (attempt, exc))
        time.sleep(4)
        raw = pa.read_remote('/home/%s/deploy_pa.log' % user)
        if raw and run_id in raw.decode('utf-8', 'replace'):
            log('      bootstrap started on attempt %d' % attempt)
            break
    else:
        raise SystemExit('the bootstrap never started — check var/log/%s.error.log' % domain)

    log('\n[4/7] waiting for the server-side deploy (this is where pip runs)')
    text = wait_for_log(pa, run_id)
    log('\n   ---- last lines of the server log ----')
    for line in text.strip().splitlines()[-18:]:
        log('   | ' + line)

    log('\n[5/7] restore the real Django WSGI entry point')
    cors = '%s,https://%s' % (FRONTEND_ORIGIN, domain)
    with open(os.path.join(TMP_DIR, 'pa_wsgi.py'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(REAL_WSGI.format(user=user, secret=secret, cors=cors, csrf=cors))
    pa.upload('/var/www/%s_pythonanywhere_com_wsgi.py' % user,
              os.path.join(TMP_DIR, 'pa_wsgi.py'))
    log('      real WSGI uploaded')

    log('\n[6/7] attach the virtualenv and reload')
    st, raw = pa.form('PATCH', '/webapps/%s/' % domain, {
        'virtualenv_path': '/home/%s/.virtualenvs/lb' % user,
        'source_directory': '/home/%s/listenbook/backend' % user,
    })
    info = pa.webapp(domain) or {}
    log('      virtualenv_path  = %s' % info.get('virtualenv_path'))
    log('      source_directory = %s' % info.get('source_directory'))

    # /media/ must NOT be a static mapping: PythonAnywhere's static server does
    # not implement HTTP Range, which breaks seeking in <audio>/<video>.
    st, raw = pa.get('/webapps/%s/static_files/' % domain)
    try:
        mappings = json.loads(raw)
    except Exception:
        mappings = []
    for m in mappings:
        if m.get('url', '').startswith('/media'):
            pa.delete('/webapps/%s/static_files/%s/' % (domain, m['id']))
            log('      removed /media/ static mapping (Django serves it, Range works)')
    if not any(m.get('url', '').startswith('/static') for m in mappings):
        pa.form('POST', '/webapps/%s/static_files/' % domain, {
            'url': '/static/',
            'path': '/home/%s/listenbook/backend/staticfiles/' % user,
        })
        log('      added /static/ static mapping')

    st, raw = pa._req('POST', '/webapps/%s/reload/' % domain)
    log('      reload -> %s' % st)
    time.sleep(8)

    if args.no_verify:
        log('\n[7/7] verification skipped (--no-verify)')
        return 0

    log('\n[7/7] verifying the live backend')
    checks = [
        ('/api/podcasts/', 200), ('/api/categories/', 200), ('/api/tiers/', 200),
        ('/api/vocabulary/', 401), ('/api/playback/stats/', 401),
        ('/static/admin/css/base.css', 200), ('/admin/login/', 200),
    ]
    bad = 0
    for path, want in checks:
        try:
            req = urllib.request.Request('https://%s%s' % (domain, path))
            with urllib.request.urlopen(req, timeout=60) as resp:
                got = resp.status
        except urllib.error.HTTPError as exc:
            got = exc.code
        except Exception as exc:
            got = 'ERR(%s)' % exc
        ok = 'OK ' if got == want else 'BAD'
        if got != want:
            bad += 1
        log('   %s %-30s got %-6s want %s' % (ok, path, got, want))

    # Range support on media -> 206
    try:
        req = urllib.request.Request(
            'https://%s/media/episodes/audio/real_test.mp3' % domain,
            headers={'Range': 'bytes=0-1023'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            log('   %s %-30s got %-6s want 206' % ('OK ' if resp.status == 206 else 'BAD',
                                                   '/media/... (Range)', resp.status))
    except Exception as exc:
        log('   BAD /media Range -> %r' % exc)
        bad += 1

    log('')
    if bad:
        log('!! %d check(s) failed' % bad)
        return 1
    log('all checks passed. frontend: %s' % FRONTEND_ORIGIN)
    return 0


if __name__ == '__main__':
    sys.exit(main())
