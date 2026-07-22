from rest_framework import serializers
from .models import Favorite
from podcasts.serializers import PodcastListSerializer


class FavoriteSerializer(serializers.ModelSerializer):
    podcast_detail = PodcastListSerializer(source='podcast', read_only=True)

    class Meta:
        model = Favorite
        fields = ['id', 'podcast', 'podcast_detail', 'created_at']
        read_only_fields = ['id', 'created_at']