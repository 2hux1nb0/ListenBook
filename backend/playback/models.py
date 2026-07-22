from django.db import models


class PlayHistory(models.Model):
    """User play history for episodes."""
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='play_history')
    episode = models.ForeignKey('episodes.Episode', on_delete=models.CASCADE, related_name='play_history')
    current_position = models.IntegerField(default=0, help_text='Position in seconds')
    duration = models.IntegerField(default=0, help_text='Total duration in seconds')
    is_completed = models.BooleanField(default=False)
    last_played = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'playback_history'
        unique_together = ('user', 'episode')
        ordering = ['-last_played']

    def __str__(self):
        return f"{self.user.username} - {self.episode.title}"