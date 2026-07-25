from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from episodes.models import Episode
from membership.models import get_user_features
from .models import ShadowRecord
from .serializers import ShadowRecordSerializer, score_recording


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def shadow_record_view(request):
    features = get_user_features(request.user)
    if 'shadowing' not in features:
        return Response({
            'detail': 'AI 跟读评分为会员功能，请开通会员后使用。',
            'code': 'MEMBERSHIP_REQUIRED',
            'feature': 'shadowing',
        }, status=status.HTTP_403_FORBIDDEN)

    episode_id = request.data.get('episode')
    sentence_index = int(request.data.get('sentence_index', 0) or 0)
    sentence_text = request.data.get('sentence_text', '')
    target_duration = float(request.data.get('target_duration', 0) or 0)
    audio = request.FILES.get('audio')

    if not audio:
        return Response({'detail': '缺少录音文件 audio'}, status=status.HTTP_400_BAD_REQUEST)

    episode = Episode.objects.filter(id=episode_id).first() if episode_id else None

    recorded_duration = float(request.data.get('recorded_duration', 0) or 0)
    if recorded_duration <= 0 and audio:
        # best-effort: use file size as a proxy (mp3 ~16KB/s). Front-end should send real duration.
        recorded_duration = max(0.0, audio.size / 16000.0)

    record = ShadowRecord(
        user=request.user,
        episode=episode,
        sentence_index=sentence_index,
        sentence_text=sentence_text,
        audio_file=audio,
        recorded_duration=recorded_duration,
        target_duration=target_duration,
    )
    record.score = score_recording(recorded_duration, target_duration)
    record.save()

    return Response(ShadowRecordSerializer(record, context={'request': request}).data,
                    status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def shadow_history_view(request):
    qs = ShadowRecord.objects.filter(user=request.user).select_related('episode')
    episode_id = request.query_params.get('episode')
    if episode_id:
        qs = qs.filter(episode_id=episode_id)
    qs = qs[:50]
    return Response(ShadowRecordSerializer(qs, many=True, context={'request': request}).data)


class ShadowRecordAdminViewSet(viewsets.ModelViewSet):
    queryset = ShadowRecord.objects.all().select_related('user', 'episode')
    serializer_class = ShadowRecordSerializer
    permission_classes = [IsAdminUser]
