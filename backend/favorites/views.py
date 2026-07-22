from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Favorite
from .serializers import FavoriteSerializer


class FavoriteListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        favorites = Favorite.objects.filter(user=request.user).select_related('podcast__category')
        serializer = FavoriteSerializer(favorites, many=True)
        return Response(serializer.data)

    def post(self, request):
        podcast_id = request.data.get('podcast')
        favorite, created = Favorite.objects.get_or_create(
            user=request.user, podcast_id=podcast_id
        )
        if created:
            return Response(FavoriteSerializer(favorite).data, status=status.HTTP_201_CREATED)
        return Response({'detail': '已经收藏过了'}, status=status.HTTP_200_OK)

    def delete(self, request):
        podcast_id = request.query_params.get('podcast')
        deleted, _ = Favorite.objects.filter(user=request.user, podcast_id=podcast_id).delete()
        if deleted:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response({'detail': '未找到收藏'}, status=status.HTTP_404_NOT_FOUND)