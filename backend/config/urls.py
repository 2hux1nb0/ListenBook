import os
import re
import mimetypes
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.http import FileResponse, HttpResponse, Http404


def serve_studio(request, path=''):
    """Serve the Admin Studio (pure static) from <PROJECT_ROOT>/studio."""
    studio_root = os.path.abspath(os.path.join(settings.PROJECT_ROOT, 'studio'))
    if not path:
        path = 'index.html'
    full = os.path.normpath(os.path.join(studio_root, path))
    if not full.startswith(studio_root):
        raise Http404()
    if os.path.isfile(full):
        return FileResponse(open(full, 'rb'))
    index = os.path.join(studio_root, 'index.html')
    if os.path.isfile(index):
        return FileResponse(open(index, 'rb'))
    raise Http404()


def serve_frontend(request, file_path=''):
    """Serve frontend files from project root."""
    root = settings.PROJECT_ROOT
    if file_path:
        # file_path from url is just the filename, we need to figure out the subdir
        # Check common subdirs
        for subdir in ('css', 'js', 'images'):
            target = root / subdir / file_path
            if target.exists() and target.is_file():
                return FileResponse(open(target, 'rb'))
    # Fallback: index.html
    index = root / 'index.html'
    if index.exists():
        return FileResponse(open(index, 'rb'))
    return HttpResponse('Not Found', status=404)


def serve_media(request, path=''):
    """Serve MEDIA_ROOT files with HTTP Range support.

    Django's ``django.views.static.serve`` (used by the DEBUG ``static()``
    helper) does NOT send ``Accept-Ranges`` and returns ``200`` for Range
    requests, which makes the browser treat audio/video as non-seekable.
    A non-seekable element clamps ``currentTime`` back to 0 on every seek,
    so clicking the progress bar / the ±10s buttons "restart from the
    beginning". Serving real ``206 Partial Content`` + ``Accept-Ranges``
    fixes seeking for the <audio> element.
    """
    media_root = settings.MEDIA_ROOT
    path = path.lstrip('/')
    full = os.path.normpath(os.path.join(media_root, path))
    root_abs = os.path.abspath(media_root)
    if full != root_abs and not full.startswith(root_abs + os.sep):
        raise Http404()
    if not os.path.isfile(full):
        raise Http404()

    content_type, encoding = mimetypes.guess_type(full)
    content_type = content_type or 'application/octet-stream'
    file_size = os.path.getsize(full)

    range_header = request.META.get('HTTP_RANGE')
    if range_header:
        m = re.match(r'bytes=(\d*)-(\d*)\s*$', range_header.strip())
        if m:
            start_s, end_s = m.group(1), m.group(2)
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            if start > end or start >= file_size:
                resp = HttpResponse(status=416)
                resp['Content-Range'] = 'bytes */%d' % file_size
                return resp
            end = min(end, file_size - 1)
            length = end - start + 1
            with open(full, 'rb') as fh:
                fh.seek(start)
                chunk = fh.read(length)
            resp = HttpResponse(chunk, status=206, content_type=content_type)
            if encoding:
                resp['Content-Encoding'] = encoding
            resp['Content-Range'] = 'bytes %d-%d/%d' % (start, end, file_size)
            resp['Content-Length'] = str(length)
            resp['Accept-Ranges'] = 'bytes'
            return resp

    # Full file — stream it and advertise that we support Range requests.
    resp = FileResponse(open(full, 'rb'), content_type=content_type)
    if encoding:
        resp['Content-Encoding'] = encoding
    resp['Accept-Ranges'] = 'bytes'
    resp['Content-Length'] = str(file_size)
    return resp


urlpatterns = [
    # Static assets: css/, js/, images/
    path('css/<str:file_path>', serve_frontend, name='css_assets'),
    path('js/<str:file_path>', serve_frontend, name='js_assets'),
    path('images/<str:file_path>', serve_frontend, name='images_assets'),
    path('admin/', admin.site.urls),
    path('studio/', serve_studio, name='studio_root'),
    path('studio/<path:path>', serve_studio, name='studio_assets'),
    path('api/', include('accounts.urls')),
    path('api/', include('podcasts.urls')),
    path('api/', include('episodes.urls')),
    path('api/', include('playback.urls')),
    path('api/', include('favorites.urls')),
    path('api/', include('notes.urls')),
    path('api/', include('membership.urls')),
    path('api/', include('vocabulary.urls')),
    path('api/', include('ai.urls')),
    path('api/', include('shadowing.urls')),
    path('', serve_frontend, name='frontend_root'),
    # Media files — Range-capable so <audio>/<video> can seek (DEBUG only;
    # in production a real web server serves MEDIA_ROOT).
    path('media/<path:path>', serve_media, name='media'),
]

if settings.DEBUG:
    # Media is served by serve_media above (Range support). The generic
    # static() helper is intentionally not used here because it omits
    # Accept-Ranges and breaks seeking.
    pass
