from django.apps import AppConfig


class ShadowingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'shadowing'
    verbose_name = 'AI 跟读'
