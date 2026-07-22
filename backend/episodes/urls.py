from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('episodes', views.EpisodeViewSet, basename='episode')
router.register('admin/episodes', views.AdminEpisodeViewSet, basename='admin-episode')

urlpatterns = [
    path('', include(router.urls)),
]