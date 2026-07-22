from django.db import models


class Favorite(models.Model):
    """User favorites (bookmarks)."""
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='favorites')
    podcast = models.ForeignKey('podcasts.Podcast', on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'favorites_favorite'
        unique_together = ('user', 'podcast')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} -> {self.podcast.title}"