"""Thin client for the ListenBook Django API (PythonAnywhere).

Uses the admin account's JWT to write Podcast / Episode rows. Reads are public.

Auth flow: POST /api/auth/login/ -> {tokens: {access}}  (simplejwt)
"""
import json
import urllib.error
import urllib.parse
import urllib.request

from . import common


class Backend:
    def __init__(self, base_url, username, password, log=print):
        self.base = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token = None
        self.log = log

    # ------------------------------------------------------------------ http

    def _req(self, method, path, payload=None, auth=True, timeout=60):
        url = f"{self.base}{path}"
        headers = dict(common.DEFAULT_HEADERS)
        headers["Accept"] = "application/json"
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth:
            if not self.token:
                self.login()
            headers["Authorization"] = f"Bearer {self.token}"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                return r.status, (json.loads(body.decode("utf-8", "replace")) if body else None)
        except urllib.error.HTTPError as e:
            body = e.read()
            try:
                parsed = json.loads(body.decode("utf-8", "replace"))
            except ValueError:
                parsed = body.decode("utf-8", "replace")[:400]
            return e.code, parsed
        except Exception as e:  # noqa: BLE001
            return 0, str(e)

    # ------------------------------------------------------------------ auth

    def login(self):
        st, body = self._req(
            "POST", "/api/auth/login/",
            {"username": self.username, "password": self.password}, auth=False)
        if st != 200 or not isinstance(body, dict):
            raise RuntimeError(f"登录失败 (HTTP {st}): {body}")
        try:
            self.token = body["tokens"]["access"]
        except (KeyError, TypeError):
            raise RuntimeError(f"登录返回结构异常: {body}")
        self.log(f"   已登录 {self.username}")
        return self.token

    # --------------------------------------------------------------- podcast

    def list_podcasts(self, limit=500):
        """All podcasts (public endpoint). Cached for the process lifetime."""
        if getattr(self, "_pods", None) is None:
            st, body = self._req("GET", f"/api/admin/podcasts/?limit={limit}", auth=False)
            rows = []
            if st == 200 and isinstance(body, dict):
                rows = body.get("results") if "results" in body else body
            self._pods = rows if isinstance(rows, list) else []
        return self._pods

    def find_podcast(self, slug=None, title=None):
        """Look up by slug first (stable), then by exact title."""
        rows = self.list_podcasts()
        for p in rows:
            if slug and p.get("slug") == slug:
                return p
        for p in rows:
            if title and (p.get("title") or "").strip().lower() == title.strip().lower():
                return p
        return None

    def create_podcast(self, payload):
        st, body = self._req("POST", "/api/admin/podcasts/", payload)
        if st in (200, 201):
            return body
        raise RuntimeError(f"创建播客失败 (HTTP {st}): {body}")

    def update_podcast(self, pid, payload):
        st, body = self._req("PATCH", f"/api/admin/podcasts/{pid}/", payload)
        if st in (200, 201):
            return body
        raise RuntimeError(f"更新播客失败 (HTTP {st}): {body}")

    # --------------------------------------------------------------- episode

    def list_episodes(self, podcast_id):
        """All episodes for a podcast, as full dicts.

        NOTE: this hits ``/api/admin/episodes/`` which is *admin-only* -- the
        public ``/api/episodes/`` only returns ``is_active=True`` rows, so dedup
        against the admin view avoids re-creating an episode that an admin had
        temporarily hidden. Must therefore be an authenticated call.
        """
        out = []
        page = 1
        while True:
            st, body = self._req(
                "GET", f"/api/admin/episodes/?podcast={podcast_id}&limit=200&page={page}")
            if st != 200 or not isinstance(body, dict):
                break
            rows = body.get("results", [])
            if isinstance(rows, list):
                out.extend(rows)
            if not body.get("next"):
                break
            page += 1
            if page > 25:
                break
        return out

    def existing_audio_urls(self, podcast_id):
        """Set of audio_url already stored for this podcast (dedup key)."""
        return {e["audio_url"].strip()
                for e in self.list_episodes(podcast_id)
                if e.get("audio_url")}

    def create_episode(self, payload):
        st, body = self._req("POST", "/api/admin/episodes/", payload)
        if st in (200, 201):
            return body
        raise RuntimeError(f"创建剧集失败 (HTTP {st}): {body}")

    def update_episode(self, episode_id, payload):
        """PATCH an existing episode (used by --backfill to add subtitles)."""
        st, body = self._req("PATCH", f"/api/admin/episodes/{episode_id}/", payload)
        if st in (200, 201):
            return body
        raise RuntimeError(f"更新剧集 #{episode_id} 失败 (HTTP {st}): {body}")

    def refresh_podcast_count(self, pid, count):
        try:
            self.update_podcast(pid, {"episode_count": count})
        except Exception as e:  # noqa: BLE001
            self.log(f"   更新集数失败：{e}")
