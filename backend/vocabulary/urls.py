from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('vocabulary', views.WordViewSet, basename='word')

# Studio admin router
admin_router = DefaultRouter()
admin_router.register('words', views.AllWordsAdminView, basename='admin-word')

urlpatterns = [
    path('', include(router.urls)),
    path('studio/', include(admin_router.urls)),
]
