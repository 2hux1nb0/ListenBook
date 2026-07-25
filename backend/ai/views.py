from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from episodes.models import Episode
from membership.models import get_user_features
from .models import AIExplanation
from .serializers import AIExplanationSerializer
from .explainer import generate_explanation


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def explain_view(request):
    # Membership gate
    features = get_user_features(request.user)
    if 'ai_explain' not in features:
        return Response({
            'detail': 'AI 智能讲解为会员功能，请开通会员后使用。',
            'code': 'MEMBERSHIP_REQUIRED',
            'feature': 'ai_explain',
        }, status=status.HTTP_403_FORBIDDEN)

    episode_id = request.data.get('episode')
    sentence = (request.data.get('sentence') or '').strip()
    sentence_index = int(request.data.get('sentence_index', 0) or 0)
    context = request.data.get('context', '')

    if not sentence:
        return Response({'detail': 'sentence 不能为空'}, status=status.HTTP_400_BAD_REQUEST)

    episode = None
    if episode_id:
        episode = Episode.objects.filter(id=episode_id).first()

    # Return cached explanation if present
    if episode:
        cached = AIExplanation.objects.filter(episode=episode, sentence_index=sentence_index).first()
        if cached:
            return Response({
                'episode': episode.id,
                'sentence_index': sentence_index,
                'sentence': cached.sentence,
                'explanation_en': cached.explanation_en,
                'explanation_zh': cached.explanation_zh,
                'cached': True,
            })

    en, zh = generate_explanation(sentence, context)

    if episode:
        obj, _ = AIExplanation.objects.update_or_create(
            episode=episode, sentence_index=sentence_index,
            defaults={'sentence': sentence, 'explanation_en': en, 'explanation_zh': zh},
        )
        pk = obj.id
    else:
        pk = None

    return Response({
        'id': pk,
        'episode': episode.id if episode else None,
        'sentence_index': sentence_index,
        'sentence': sentence,
        'explanation_en': en,
        'explanation_zh': zh,
        'cached': False,
    })


class AIExplanationAdminViewSet(viewsets.ModelViewSet):
    queryset = AIExplanation.objects.all().select_related('episode')
    serializer_class = AIExplanationSerializer
    permission_classes = [IsAdminUser]
