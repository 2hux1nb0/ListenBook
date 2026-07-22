from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('podcasts.urls')),
    path('api/', include('episodes.urls')),
    path('api/', include('playback.urls')),
    path('api/', include('favorites.urls')),
    path('api/', include('notes.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)