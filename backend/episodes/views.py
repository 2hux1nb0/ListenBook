from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAdminUser
from .models import Episode
from .serializers import EpisodeListSerializer, EpisodeDetailSerializer


class EpisodeViewSet(viewsets.ModelViewSet):
    """Public episode API. Reads are open; writes require admin."""
    queryset = Episode.objects.filter(is_active=True).select_related('podcast')
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        if self.action in ['retrieve']:
            return EpisodeDetailSerializer
        return EpisodeListSerializer

    def get_permissions(self):
        if self.request.method in ['GET', 'HEAD', 'OPTIONS']:
            return [IsAuthenticatedOrReadOnly()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = super().get_queryset()
        podcast_id = self.request.query_params.get('podcast')
        if podcast_id:
            qs = qs.filter(podcast_id=podcast_id)
        return qs

    def create(self, request, *args, **kwargs):
        if 'audio_file' in request.FILES:
            request.data._mutable = True
            request.data['audio_url'] = ''
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if 'audio_file' in request.FILES:
            request.data._mutable = True
            request.data['audio_url'] = ''
        return super().update(request, *args, **kwargs)


class AdminEpisodeViewSet(viewsets.ModelViewSet):
    """Admin-only episode management (all episodes, incl. inactive)."""
    queryset = Episode.objects.all().select_related('podcast')
    serializer_class = EpisodeDetailSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        podcast_id = self.request.query_params.get('podcast')
        if podcast_id:
            qs = qs.filter(podcast_id=podcast_id)
        return qs

    @action(detail=True, methods=['patch'])
    def toggle(self, request, pk=None):
        episode = self.get_object()
        episode.is_active = not episode.is_active
        episode.save()
        return Response({'is_active': episode.is_active})
