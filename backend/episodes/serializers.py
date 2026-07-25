from rest_framework import serializers
from .models import Episode


class EpisodeListSerializer(serializers.ModelSerializer):
    duration_display = serializers.CharField(read_only=True)
    podcast_title = serializers.CharField(source='podcast.title', read_only=True)

    class Meta:
        model = Episode
        fields = [
            'id', 'title', 'podcast', 'podcast_title', 'description',
            'audio_file', 'audio_url', 'audio_duration', 'duration_display',
            'episode_number', 'season_number', 'publish_date',
            'is_active', 'play_count', 'subtitle_en', 'subtitle_zh',
            'youtube_id'
        ]


class EpisodeDetailSerializer(serializers.ModelSerializer):
    duration_display = serializers.CharField(read_only=True)

    class Meta:
        model = Episode
        fields = '__all__'