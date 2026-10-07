#!/usr/bin/env bash
# Pre-deploy smoke test: validates content JSON, starts the server locally,
# hits every page/API, checks that referenced files exist, then stops the server.
# Usage: bash scripts/smoke-test.sh   (exit code 0 = all passed)
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-5055}"  # not 5000, so it never clashes with your own dev server
BASE="http://localhost:$PORT"
PY=".venv/bin/python"
FAIL=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAIL=1; }

if [ ! -x "$PY" ]; then
  echo "No .venv found. Create it with:"
  echo "  /opt/homebrew/bin/python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 2
fi

echo "== Content files"
"$PY" - <<'EOF' || FAIL=1
import json, sys
ok = True
files = {}
for f in ["data/content.json", "data/content-ar.json", "data/system-prompt.json"]:
    try:
        files[f] = json.load(open(f, encoding="utf-8"))
        print(f"  PASS  {f} is valid JSON")
    except Exception as e:
        print(f"  FAIL  {f}: {e}"); ok = False

def diff(a, b, p=""):
    out = []
    if type(a) != type(b):
        return [f"{p}: {type(a).__name__} vs {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{p}.{k} only in {'EN' if k in a else 'AR'}")
            else:
                out += diff(a[k], b[k], f"{p}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{p}: {len(a)} items in EN vs {len(b)} in AR")
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{p}[{i}]")
    return out

en, ar = files.get("data/content.json"), files.get("data/content-ar.json")
if en is not None and ar is not None:
    d = diff(en, ar)
    if d:
        print("  FAIL  EN and AR content differ in structure:")
        for line in d: print("          " + line)
        ok = False
    else:
        print("  PASS  EN and AR content have the same structure")
sys.exit(0 if ok else 1)
EOF

echo "== Local file references"
"$PY" - <<'EOF' || FAIL=1
import json, os, re, sys
missing = set()
def check(ref, src):
    ref = ref.split("?")[0].split("#")[0].lstrip("/")
    if not ref or " " in ref or re.match(r"^(https?:|mailto:|tel:|data:|javascript:|//)", ref): return
    if not re.search(r"\.(png|jpe?g|svg|gif|webp|ico|pdf|css|js|json|mp4|webm)$", ref, re.I): return
    if not os.path.exists(ref): missing.add(f"{ref}  (from {src})")
for html in ["index.html", "voice-agent.html", "dashboard.html"]:
    for m in re.finditer(r'(?:src|href)="([^"]+)"', open(html, encoding="utf-8").read()):
        check(m.group(1), html)
def walk(x, src):
    if isinstance(x, dict): [walk(v, src) for v in x.values()]
    elif isinstance(x, list): [walk(v, src) for v in x]
    elif isinstance(x, str): check(x, src)
for f in ["data/content.json", "data/content-ar.json"]:
    walk(json.load(open(f, encoding="utf-8")), f)
if missing:
    print("  FAIL  missing files:"); [print("          " + m) for m in sorted(missing)]
    sys.exit(1)
print("  PASS  all referenced local files exist")
EOF

echo "== Python syntax"
"$PY" -m py_compile main.py && pass "main.py compiles" || fail "main.py has syntax errors"

echo "== Server"
if curl -s -o /dev/null "$BASE/"; then
  echo "  Port $PORT is already in use; stop that server first (or run with PORT=...)."
  exit 2
fi
LOG="$(mktemp)"
PORT="$PORT" "$PY" -c "import uvicorn; uvicorn.run('main:app', host='127.0.0.1', port=$PORT)" >"$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/" && break; sleep 0.5; done

expect() { # expect <code> <method> <path> [curl args...]
  local want="$1" method="$2" path="$3"; shift 3
  local got; got="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$@" "$BASE$path")"
  [ "$got" = "$want" ] && pass "$method $path -> $got" || fail "$method $path -> $got (expected $want)"
}
expect 200 GET /
expect 200 GET /voice-agent.html
expect 200 GET /dashboard
expect 200 GET /data/content.json
expect 200 GET /data/content-ar.json
expect 200 GET /data/system-prompt.json
expect 404 GET /data/analytics.db
expect 404 GET /data/../main.py
expect 200 GET /js/voice-agent.js
expect 200 GET /js/content-loader.js
expect 200 GET /css/style.css
expect 401 GET /api/analytics
expect 401 GET /api/sessions
expect 200 POST /api/track -H 'Content-Type: application/json' -d '{"path":"/smoke-test"}'

if grep -qE 'Traceback|Error' "$LOG"; then
  fail "server log has errors:"; grep -E -B2 -A5 'Traceback|Error' "$LOG" | head -40
else
  pass "server log has no errors"
fi
rm -f "$LOG"

echo
[ "$FAIL" = 0 ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit "$FAIL"
