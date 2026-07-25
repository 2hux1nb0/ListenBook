from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from .models import MembershipTier, UserMembership
from .serializers import (
    MembershipTierSerializer, UserMembershipSerializer, SubscribeSerializer,
)


class MembershipTierViewSet(viewsets.ReadOnlyModelViewSet):
    """Public list of available membership tiers."""
    queryset = MembershipTier.objects.filter(is_active=True).order_by('sort_order')
    serializer_class = MembershipTierSerializer
    permission_classes = [AllowAny]


class UserMembershipView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def status(self, request):
        membership, _ = UserMembership.objects.get_or_create(user=request.user)
        return Response(UserMembershipSerializer(membership).data)

    @action(detail=False, methods=['post'])
    def subscribe(self, request):
        serializer = SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            tier = MembershipTier.objects.get(slug=data['tier_slug'], is_active=True)
        except MembershipTier.DoesNotExist:
            return Response({'detail': '会员套餐不存在'}, status=status.HTTP_400_BAD_REQUEST)

        membership, _ = UserMembership.objects.get_or_create(user=request.user)

        plan = data['plan']
        months = 12 if plan == 'yearly' else 1
        now = timezone.now()
        expires_at = now + timedelta(days=months * 30)

        membership.tier = tier
        membership.status = 'active'
        membership.started_at = now
        membership.expires_at = expires_at
        membership.auto_renew = (plan == 'yearly')
        membership.payment_method = data['payment_method']
        membership.order_id = f"MOCK-{request.user.id}-{int(now.timestamp())}"
        membership.save()

        return Response({
            'detail': '会员开通成功',
            'membership': UserMembershipSerializer(membership).data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def cancel(self, request):
        membership, _ = UserMembership.objects.get_or_create(user=request.user)
        membership.status = 'canceled'
        membership.auto_renew = False
        membership.save()
        return Response({
            'detail': '已取消自动续费',
            'membership': UserMembershipSerializer(membership).data,
        })
