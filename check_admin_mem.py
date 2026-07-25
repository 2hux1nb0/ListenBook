# -*- coding: utf-8 -*-
import sys
import os
sys.path.insert(0, '/mnt/d/ShiZhe/ListenBook/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from accounts.models import User
from membership.models import UserMembership, MembershipTier

# Check admin user
try:
    admin = User.objects.get(username='admin')
    print(f"Admin user: {admin.username} (id={admin.id})")
    
    # Check membership
    membership = UserMembership.objects.filter(user=admin).first()
    if membership:
        print(f"Membership found:")
        print(f"  tier: {membership.tier}")
        print(f"  status: {membership.status}")
        print(f"  is_active (property): {membership.is_active}")
        print(f"  expires_at: {membership.expires_at}")
        if membership.tier:
            print(f"  tier name: {membership.tier.name}")
            print(f"  tier slug: {membership.tier.slug}")
    else:
        print("No membership record found for admin")
        
    # Check all tiers
    print("\nAll tiers:")
    for t in MembershipTier.objects.all():
        print(f"  {t.slug}: {t.name} (active={t.is_active})")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
