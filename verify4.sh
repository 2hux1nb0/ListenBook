BASE=http://127.0.0.1:8000
echo "=== Studio page ==="
curl -s -o /dev/null -w "%{http_code}" $BASE/studio/
echo ""

TOK=$(curl -s -X POST $BASE/api/auth/login/ -H "Content-Type: application/json" -d '{"username":"testuser","password":"test123"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('tokens',{}).get('access',''))")
echo "=== History API ==="
curl -s "$BASE/api/playback/history/" -H "Authorization: Bearer $TOK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d.get('results',d)
if len(items) > 0:
    print(json.dumps(items[0], indent=2))
else:
    print('empty')
"
echo ""
echo "=== AI Explain (expect 403 Pro needed or 200 if Pro has history) ==="
curl -s "$BASE/api/ai/explain/" -H "Authorization: Bearer $TOK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d, dict) and d.get('detail',''):
    print(d['detail'])
else:
    items=d.get('results',d)
    print(f'{len(items)} results')
    if len(items) > 0:
        print(json.dumps(items[0], indent=2))
"
