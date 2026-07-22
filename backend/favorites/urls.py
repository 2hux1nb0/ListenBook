from django.urls import path
from . import views

urlpatterns = [
    path('favorites/', views.FavoriteListView.as_view(), name='favorites'),
]