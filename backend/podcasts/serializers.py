from rest_framework import serializers
from .models import Category, Podcast


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'icon', 'color', 'sort_order', 'is_active']


class PodcastListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    episode_count_display = serializers.IntegerField(source='episode_count', read_only=True)

    class Meta:
        model = Podcast
        fields = [
            'id', 'title', 'slug', 'author', 'description', 'cover_image',
            'category', 'category_name', 'difficulty', 'language',
            'is_featured', 'is_active', 'episode_count', 'episode_count_display',
            'subscriber_count', 'avg_rating', 'created_at'
        ]


class PodcastDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    category_icon = serializers.CharField(source='category.icon', read_only=True, default='')
    episode_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Podcast
        fields = '__all__'