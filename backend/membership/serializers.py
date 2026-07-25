from rest_framework import serializers
from .models import MembershipTier, UserMembership, FEATURE_LABELS


class MembershipTierSerializer(serializers.ModelSerializer):
    feature_labels = serializers.SerializerMethodField()

    class Meta:
        model = MembershipTier
        fields = [
            'id', 'slug', 'name', 'name_en', 'price_monthly', 'price_yearly',
            'description', 'features', 'feature_labels', 'badge_color',
            'is_active', 'sort_order',
        ]

    def get_feature_labels(self, obj):
        return [FEATURE_LABELS.get(f, f) for f in (obj.features or [])]


class UserMembershipSerializer(serializers.ModelSerializer):
    tier_detail = MembershipTierSerializer(source='tier', read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    features = serializers.SerializerMethodField()

    class Meta:
        model = UserMembership
        fields = [
            'id', 'tier', 'tier_detail', 'status', 'is_active', 'started_at',
            'expires_at', 'auto_renew', 'payment_method', 'order_id', 'features',
        ]
        read_only_fields = ['id', 'status', 'started_at', 'expires_at']

    def get_features(self, obj):
        return obj.enabled_features()


class SubscribeSerializer(serializers.Serializer):
    tier_slug = serializers.SlugField()
    plan = serializers.ChoiceField(choices=['monthly', 'yearly'], default='monthly')
    payment_method = serializers.CharField(max_length=20, default='mock_card')
