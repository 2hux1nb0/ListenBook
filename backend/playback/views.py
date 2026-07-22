from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import PlayHistory
from .serializers import PlayHistorySerializer


class PlayHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        histories = PlayHistory.objects.filter(user=request.user).select_related('episode__podcast')[:50]
        serializer = PlayHistorySerializer(histories, many=True)
        return Response(serializer.data)

    def post(self, request):
        episode_id = request.data.get('episode')
        data = {
            'user': request.user.id,
            'episode': episode_id,
            'current_position': request.data.get('current_position', 0),
            'duration': request.data.get('duration', 0),
            'is_completed': request.data.get('is_completed', False),
        }
        
        history, created = PlayHistory.objects.update_or_create(
            user=request.user,
            episode_id=episode_id,
            defaults={
                'current_position': data['current_position'],
                'duration': data['duration'],
                'is_completed': data['is_completed'],
            }
        )
        return Response(PlayHistorySerializer(history).data, 
                       status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class LearningStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounts.models import LearningStats
        stats, _ = LearningStats.objects.get_or_create(user=request.user)
        
        total_played = PlayHistory.objects.filter(user=request.user, is_completed=True).count()
        
        return Response({
            'total_listen_minutes': stats.total_listen_minutes,
            'total_episodes_played': total_played,
            'streak_days': stats.streak_days,
            'weekly_goal_minutes': stats.weekly_goal_minutes,
        })