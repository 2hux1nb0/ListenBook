from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from .models import Category, Podcast
from .serializers import CategorySerializer, PodcastListSerializer, PodcastDetailSerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]


class PodcastViewSet(viewsets.ModelViewSet):
    queryset = Podcast.objects.filter(is_active=True).select_related('category')
    serializer_class = PodcastListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'difficulty', 'is_featured', 'language']
    search_fields = ['title', 'author', 'description']
    ordering_fields = ['created_at', 'avg_rating', 'episode_count', 'subscriber_count']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PodcastDetailSerializer
        return PodcastListSerializer

    @action(detail=False, methods=['get'])
    def featured(self, request):
        podcasts = Podcast.objects.filter(is_featured=True, is_active=True)[:10]
        serializer = PodcastListSerializer(podcasts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_difficulty(self, request):
        difficulty = request.query_params.get('level', 'beginner')
        podcasts = Podcast.objects.filter(difficulty=difficulty, is_active=True)[:10]
        serializer = PodcastListSerializer(podcasts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def episodes(self, request, pk=None):
        podcast = self.get_object()
        episodes = podcast.episodes.filter(is_active=True)
        from episodes.serializers import EpisodeListSerializer
        serializer = EpisodeListSerializer(episodes, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category__slug=category)
        return qs


class AdminPodcastViewSet(viewsets.ModelViewSet):
    """Admin podcast management 
    - GET: public read (for background data loading)
    - POST/PATCH/DELETE: admin only
    """
    queryset = Podcast.objects.all().select_related('category')
    serializer_class = PodcastListSerializer
    
    def get_permissions(self):
        if self.request.method in ['GET', 'HEAD', 'OPTIONS']:
            return [IsAuthenticatedOrReadOnly()]
        return [IsAdminUser()]

    @action(detail=True, methods=['patch'])
    def toggle(self, request, pk=None):
        podcast = self.get_object()
        podcast.is_active = not podcast.is_active
        podcast.save()
        return Response({
            'status': 'active' if podcast.is_active else 'inactive',
            'is_active': podcast.is_active
        })

    @action(detail=True, methods=['patch'])
    def toggle_featured(self, request, pk=None):
        podcast = self.get_object()
        podcast.is_featured = not podcast.is_featured
        podcast.save()
        return Response({'is_featured': podcast.is_featured})