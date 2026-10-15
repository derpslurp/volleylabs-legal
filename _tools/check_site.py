"""Checks the launch site against its spec (ServeSense
docs/superpowers/specs/2026-10-15-launch-website-design.md).

Run from anywhere: python -I _tools/check_site.py [site dir]
Lives in _tools/ because GitHub Pages (Jekyll) does not publish _-folders.
"""
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

SITE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
HERO = ("takeoff", "contact", "follow", "landing")
JOINT_COUNT = 13  # backend app/pipeline/thumbnail_pose.py JOINTS
MAX_HERO_BYTES = 150_000
errors: list[str] = []


def check(ok: bool, msg: str) -> None:
    if not ok:
        errors.append(msg)


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []
        self.ids: set[str] = set()
        self.scripts: list[str] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        for key in ("href", "src", "poster"):
            if a.get(key):
                self.refs.append(a[key])
        if a.get("srcset"):
            self.refs += [part.strip().split()[0] for part in a["srcset"].split(",")]
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        self._in_title = tag == "title"

    def handle_endtag(self, tag):
        self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def read(rel: str) -> str:
    path = SITE / rel
    return path.read_text(encoding="utf-8") if path.exists() else ""


html = read("index.html")
css = read("assets/site.css")
js = read("assets/site.js")
page = Page()
page.feed(html)
text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))

# Identity and Apple's support-URL needs.
check("VolleyLabs" in page.title, "title must name VolleyLabs")
check("support" in page.ids, 'needs a section with id="support"')
support = html[html.find('id="support"'):] if 'id="support"' in html else ""
support = support[: support.find("</section>")]
check("mailto:volleylabsapp@gmail.com" in support, "support section needs the mailto link")
check("reveal" not in support, "support must be visible on arrival: no reveal classes inside it")
for legal in ("privacy.html", "terms.html"):
    check(f'href="{legal}"' in html, f"needs a link to {legal}")

# Links work under /volleylabs-legal/ and at a domain root.
for ref in page.refs:
    if ref.startswith(("http://", "https://", "mailto:", "#", "data:")):
        continue
    check(not ref.startswith("/"), f"root-absolute link breaks under a subpath: {ref}")
    local = ref.split("#")[0].split("?")[0]
    if local:
        check((SITE / local).exists(), f"missing file: {ref}")
for src in page.scripts:
    check(not src.startswith(("http:", "https:", "//")), f"external script: {src}")

# Copy rules.
for phrase in ("Coming soon to the App Store", "$4.99", "$9.99", "$99.99", "13 and over",
               "Spike", "Serve", "Block", "Set", "Dig", "Coming soon", "not medical advice"):
    check(phrase in text, f"missing text: {phrase}")
for pattern in (r"jump height", r"\b\d+\s?cm\b", r"\biPad\b", r"\bAndroid\b",
                r"Download on the App Store"):
    check(not re.search(pattern, text, re.I), f"forbidden text: {pattern}")

# Visible without JavaScript: site.js sets the class, and only .js rules hide.
check("classList.add('js')" not in html, "the js class must come from site.js, not inline")
check("classList.add('js')" in js, "site.js must add the js class")
for selector in re.findall(r"([^{}]+)\{[^}]*opacity:\s*0\s*[;}]", css):
    sel = selector.strip()
    if sel in ("from", "to") or sel.endswith("%"):
        continue  # keyframes
    check(".js" in sel, f"hidden without JS: {sel}")

# Hero assets.
for name in HERO:
    for ext in ("webp", "jpg"):
        path = SITE / "assets" / f"hero-{name}.{ext}"
        check(path.exists(), f"missing {path.name}")
        if path.exists():
            check(path.stat().st_size < MAX_HERO_BYTES, f"{path.name} is over 150 KB")
poses_js = read("assets/hero-poses.js")
try:
    poses = json.loads(poses_js.split("=", 1)[1].strip().rstrip(";"))
    for name in HERO:
        pose = poses[name]
        check(len(pose) == JOINT_COUNT, f"{name}: {len(pose)} joints, want {JOINT_COUNT}")
        check(all(len(p) == 3 and all(isinstance(v, (int, float)) for v in p) for p in pose),
              f"{name}: each joint must be [x, y, visibility]")
except (IndexError, KeyError, ValueError) as e:
    check(False, f"hero-poses.js unreadable: {e!r}")

# Legal pages untouched.
diff = subprocess.run(["git", "-C", str(SITE), "diff", "--quiet", "HEAD", "--",
                       "privacy.html", "terms.html"])
check(diff.returncode == 0, "privacy.html or terms.html changed")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("OK")
