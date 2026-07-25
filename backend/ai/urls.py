from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('explanations', views.AIExplanationAdminViewSet, basename='admin-ai-explanation')

urlpatterns = [
    path('ai/explain/', views.explain_view, name='ai-explain'),
    path('studio/', include(router.urls)),
]
