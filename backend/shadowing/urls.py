from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('records', views.ShadowRecordAdminViewSet, basename='admin-shadow-record')

urlpatterns = [
    path('shadowing/record/', views.shadow_record_view, name='shadow-record'),
    path('shadowing/history/', views.shadow_history_view, name='shadow-history'),
    path('studio/', include(router.urls)),
]
