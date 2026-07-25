from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('tiers', views.MembershipTierViewSet, basename='membership-tier')

urlpatterns = [
    path('', include(router.urls)),
    path('membership/status/', views.UserMembershipView.as_view({'get': 'status'}), name='membership-status'),
    path('membership/subscribe/', views.UserMembershipView.as_view({'post': 'subscribe'}), name='membership-subscribe'),
    path('membership/cancel/', views.UserMembershipView.as_view({'post': 'cancel'}), name='membership-cancel'),
]
