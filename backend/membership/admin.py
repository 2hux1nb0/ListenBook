from django.contrib import admin
from .models import MembershipTier, UserMembership


@admin.register(MembershipTier)
class MembershipTierAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'price_monthly', 'price_yearly', 'is_active', 'sort_order')
    list_editable = ('price_monthly', 'price_yearly', 'is_active', 'sort_order')


@admin.register(UserMembership)
class UserMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'tier', 'status', 'is_active', 'expires_at', 'payment_method')
    list_filter = ('status', 'tier')
    search_fields = ('user__username',)
