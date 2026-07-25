from django.db import models


class Episode(models.Model):
    """Podcast episode model."""
    podcast = models.ForeignKey('podcasts.Podcast', on_delete=models.CASCADE, related_name='episodes')
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default='')
    audio_file = models.FileField(upload_to='episodes/audio/', blank=True, null=True)
    audio_url = models.URLField(blank=True, default='')
    youtube_id = models.CharField(max_length=50, blank=True, default='', help_text='YouTube 视频ID（content_type=youtube 时填写）')
    audio_duration = models.IntegerField(help_text='Duration in seconds', default=0)
    audio_size = models.BigIntegerField(default=0)
    subtitle_en = models.TextField(blank=True, default='')
    subtitle_zh = models.TextField(blank=True, default='')
    episode_number = models.IntegerField(default=0)
    season_number = models.IntegerField(default=1)
    publish_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    play_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'episodes_episode'
        ordering = ['-publish_date', '-episode_number']

    def __str__(self):
        return f"{self.podcast.title} - {self.title}"

    @property
    def duration_display(self):
        """Format duration as HH:MM:SS or MM:SS."""
        m, s = divmod(self.audio_duration, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"