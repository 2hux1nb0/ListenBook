# -*- coding: utf-8 -*-
import requests, json, sys

try:
    resp = requests.post('http://127.0.0.1:8000/api/auth/login/', json={
        'username': 'admin',
        'password': 'admin123456'
    }, timeout=10)
    print('Login status:', resp.status_code)
    sys.stdout.flush()

    if resp.status_code == 200:
        data = resp.json()
        token = data.get('access') or data.get('token')
        if token:
            headers = {'Authorization': f'Bearer {token}'}
            mem = requests.get('http://127.0.0.1:8000/api/membership/status/', headers=headers, timeout=10)
            print('Membership status:', mem.status_code)
            sys.stdout.flush()
            print('Membership JSON:')
            print(json.dumps(mem.json(), indent=2, ensure_ascii=False))
            sys.stdout.flush()
except Exception as e:
    print('ERROR:', str(e))
    sys.stdout.flush()
