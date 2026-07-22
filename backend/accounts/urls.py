from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/user/profile/', views.UserProfileView.as_view(), name='user_profile'),
    path('auth/user/stats/', views.LearningStatsView.as_view(), name='learning_stats'),
]