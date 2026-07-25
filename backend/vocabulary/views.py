from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django.db import IntegrityError
from .models import Word
from .serializers import WordSerializer, WordCreateSerializer


class WordViewSet(viewsets.ModelViewSet):
    serializer_class = WordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Word.objects.filter(user=self.request.user).select_related('episode')
        term = self.request.query_params.get('search')
        if term:
            qs = qs.filter(term__icontains=term)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return WordCreateSerializer
        return WordSerializer

    def perform_create(self, serializer):
        try:
            serializer.save(user=self.request.user)
        except IntegrityError:
            # already saved -> return existing instead of 500
            existing = Word.objects.get(user=self.request.user, term=serializer.validated_data['term'])
            raise serializers.ValidationError({'detail': '该单词已在生词本中', 'id': existing.id})

    @action(detail=False, methods=['delete'])
    def clear(self, request):
        self.get_queryset().delete()
        return Response({'detail': '已清空生词本'}, status=status.HTTP_204_NO_CONTENT)


class AllWordsAdminView(viewsets.ReadOnlyModelViewSet):
    """Studio: browse all users' saved words."""
    serializer_class = WordSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        return Word.objects.all().select_related('user', 'episode')
