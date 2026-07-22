from django.contrib import admin
from .models import Favorite


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'podcast', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'podcast__title']
    ordering = ['-created_at']