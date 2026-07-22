from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom User model for ListenLeap."""
    nickname = models.CharField(max_length=100, blank=True, default='')
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.TextField(blank=True, default='')
    preferred_language = models.CharField(max_length=10, default='zh-CN')
    learning_level = models.CharField(
        max_length=20,
        choices=[
            ('beginner', '初级'),
            ('intermediate', '中级'),
            ('advanced', '高级'),
        ],
        blank=True,
        default=''
    )
    daily_goal_minutes = models.IntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts_user'

    def __str__(self):
        return self.username


class LearningStats(models.Model):
    """User learning statistics."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='learning_stats')
    total_listen_minutes = models.IntegerField(default=0)
    total_episodes_played = models.IntegerField(default=0)
    streak_days = models.IntegerField(default=0)
    last_active_date = models.DateField(blank=True, null=True)
    weekly_goal_minutes = models.IntegerField(default=210)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts_learning_stats'

    def __str__(self):
        return f"Stats for {self.user.username}"