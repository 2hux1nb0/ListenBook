from django.db import models


class Note(models.Model):
    """User notes on episodes."""
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='notes')
    episode = models.ForeignKey('episodes.Episode', on_delete=models.CASCADE, related_name='notes')
    content = models.TextField()
    timestamp_seconds = models.IntegerField(default=0, help_text='Timestamp in seconds')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notes_note'
        ordering = ['-created_at']

    def __str__(self):
        return f"Note by {self.user.username} on {self.episode.title}"