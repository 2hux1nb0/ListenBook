from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('notes', views.NoteViewSet, basename='note')

urlpatterns = [
    path('', include(router.urls)),
]