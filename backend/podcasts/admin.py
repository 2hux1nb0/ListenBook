from django.contrib import admin
from django.utils.html import format_html
from .models import Category, Podcast, PodcastFollower


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'icon', 'color_preview', 'sort_order', 'is_active', 'created_at']
    list_editable = ['sort_order', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
    ordering = ['sort_order', 'name']

    def color_preview(self, obj):
        return format_html(
            '<div style="width:24px;height:24px;border-radius:4px;background:{};border:1px solid #ddd"></div>',
            obj.color
        )
    color_preview.short_description = '颜色'


@admin.register(Podcast)
class PodcastAdmin(admin.ModelAdmin):
    list_display = ['cover_preview', 'title', 'author', 'category', 'difficulty_badge', 
                    'is_featured', 'is_active', 'episode_count', 'created_at']
    list_editable = ['is_featured', 'is_active']
    list_filter = ['is_active', 'is_featured', 'difficulty', 'category', 'language']
    search_fields = ['title', 'author', 'description']
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ['cover_preview_large', 'created_at', 'updated_at']
    ordering = ['-created_at']
    fieldsets = (
        ('基本信息', {
            'fields': ('title', 'slug', 'author', 'description', 'category', 'language')
        }),
        ('封面和媒体', {
            'fields': ('cover_image', 'cover_preview_large')
        }),
        ('分级和状态', {
            'fields': ('difficulty', 'is_featured', 'is_active')
        }),
        ('统计信息', {
            'fields': ('episode_count', 'subscriber_count', 'avg_rating')
        }),
        ('其他', {
            'fields': ('website_url', 'feed_url', 'created_at', 'updated_at')
        }),
    )
    actions = ['make_published', 'make_unpublished', 'make_featured', 'make_unfeatured']

    def cover_preview(self, obj):
        if obj.cover_image:
            return format_html(
                '<img src="{}" style="width:40px;height:40px;border-radius:4px;object-fit:cover">',
                obj.cover_image.url
            )
        return format_html('<div style="width:40px;height:40px;border-radius:4px;background:#eee;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px">无图</div>')
    cover_preview.short_description = '封面'

    def cover_preview_large(self, obj):
        if obj.cover_image:
            return format_html(
                '<img src="{}" style="max-width:300px;max-height:300px;border-radius:8px">',
                obj.cover_image.url
            )
        return '暂无封面'
    cover_preview_large.short_description = '封面预览'

    def difficulty_badge(self, obj):
        colors = {'beginner': '#2e7d32', 'intermediate': '#1565c0', 'advanced': '#c62828'}
        bg = {'beginner': '#e8f5e9', 'intermediate': '#e3f2fd', 'advanced': '#fce4ec'}
        labels = {'beginner': '初级', 'intermediate': '中级', 'advanced': '高级'}
        return format_html(
            '<span style="background:{};color:{};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600">{}</span>',
            bg.get(obj.difficulty, '#eee'),
            colors.get(obj.difficulty, '#333'),
            labels.get(obj.difficulty, obj.difficulty)
        )
    difficulty_badge.short_description = '难度'

    def make_published(self, request, queryset):
        queryset.update(is_active=True)
        self.message_user(request, f'已上架 {queryset.count()} 个播客')
    make_published.short_description = '上架选中的播客'

    def make_unpublished(self, request, queryset):
        queryset.update(is_active=False)
        self.message_user(request, f'已下架 {queryset.count()} 个播客')
    make_unpublished.short_description = '下架选中的播客'

    def make_featured(self, request, queryset):
        queryset.update(is_featured=True)
        self.message_user(request, f'已推荐 {queryset.count()} 个播客')
    make_featured.short_description = '推荐选中的播客'

    def make_unfeatured(self, request, queryset):
        queryset.update(is_featured=False)
        self.message_user(request, f'已取消推荐 {queryset.count()} 个播客')
    make_unfeatured.short_description = '取消推荐选中的播客'


@admin.register(PodcastFollower)
class PodcastFollowerAdmin(admin.ModelAdmin):
    list_display = ['user', 'podcast', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'podcast__title']