import os
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
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
    path('', serve_frontend, name='frontend_root'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
