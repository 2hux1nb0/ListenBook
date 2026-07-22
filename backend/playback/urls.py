from django.urls import path
from . import views

urlpatterns = [
    path('playback/history/', views.PlayHistoryView.as_view(), name='play_history'),
    path('playback/stats/', views.LearningStatsView.as_view(), name='playback_stats'),
]