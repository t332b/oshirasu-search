#!/usr/bin/env python3
"""Scraper for shirasu.io/c/someru via GraphQL API."""

import json
import re
import urllib.request
from datetime import datetime, timezone

GRAPHQL_ENDPOINT = "https://itvvnowbibekdj7la2nlxgkuva.appsync-api.ap-northeast-1.amazonaws.com/graphql"
API_KEY = "da2-d24szmfwejaztjqbviuj6r3oyy"
CHANNEL_ID = "someru"
OUTPUT_FILE = "docs/data.json"

QUERY = """
query GetChannelPrograms($id: ID!, $nextToken: String) {
  channel(id: $id) {
    programs: programs2(nextToken: $nextToken) {
      items {
        id
        title
        broadcastAt
        tenantId
        channelId
        totalPlayTime
        viewerPlanType
        releaseState
      }
      nextToken
    }
  }
}
"""

# 番組タイプ分類キーワード
TYPE_PATTERNS = [
    ("批評編", ["批評編"]),
    ("理論編", ["理論編"]),
    ("おたよりコーナー", ["おたよりコーナー", "おたよりを無限に", "おたよりを配信"]),
    ("突然雑談", ["突然雑談"]),
]

# ジャンル分類 (括弧内テキストからマッチ)
GENRE_NORMALIZE = {
    "漫画": "マンガ",
    "演劇": "演劇・舞台",
    "舞台": "演劇・舞台",
    "歌舞伎": "演劇・舞台",
    "小説": "小説・本",
}

GENRE_PATTERN = re.compile(
    r"[（(](映画|テレビ|マンガ|漫画|アニメ|音楽|ゲーム|演劇|舞台|歌舞伎|アート|小説|ガジェット|スポーツ|ノウハウ|食べ物)"
)

SERIES_PATTERN = re.compile(r"[#＃](\d+)")


def graphql_request(variables: dict) -> dict:
    payload = json.dumps({"query": QUERY, "variables": variables}).encode()
    req = urllib.request.Request(
        GRAPHQL_ENDPOINT,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_all_programs() -> list:
    programs = []
    next_token = None

    while True:
        variables = {"id": CHANNEL_ID}
        if next_token:
            variables["nextToken"] = next_token

        data = graphql_request(variables)
        result = data["data"]["channel"]["programs"]
        programs.extend(result["items"])
        next_token = result["nextToken"]
        print(f"  {len(programs)} 件取得済み...")

        if not next_token:
            break

    return programs


def make_url(item: dict) -> str:
    tenant_id = item["tenantId"]
    channel_id = item["channelId"]
    slug = item["id"][len(f"{tenant_id}-{channel_id}-"):]
    return f"https://shirasu.io/t/{tenant_id}/c/{channel_id}/p/{slug}"


def make_thumbnail_url(program_id: str) -> str:
    return f"https://asset.shirasu.io/public/programs/{program_id}/thumbnail"


def classify(title: str) -> tuple:
    prog_type = "その他"
    for type_name, keywords in TYPE_PATTERNS:
        if any(k in title for k in keywords):
            prog_type = type_name
            break

    genre = None
    m = GENRE_PATTERN.search(title)
    if m:
        g = m.group(1)
        genre = GENRE_NORMALIZE.get(g, g)

    series_num = None
    nm = SERIES_PATTERN.search(title)
    if nm:
        series_num = int(nm.group(1))

    return prog_type, genre, series_num


def format_duration(seconds: int) -> str:
    if not seconds:
        return ""
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def process_program(item: dict) -> dict:
    prog_type, genre, series_num = classify(item["title"])
    return {
        "id": item["id"],
        "title": item["title"],
        "url": make_url(item),
        "thumbnail": make_thumbnail_url(item["id"]),
        "broadcastAt": item["broadcastAt"],
        "duration": format_duration(item.get("totalPlayTime") or 0),
        "totalPlayTime": item.get("totalPlayTime"),
        "viewerPlanType": item.get("viewerPlanType"),
        "releaseState": item.get("releaseState"),
        "type": prog_type,
        "genre": genre,
        "seriesNum": series_num,
    }


def main():
    print(f"shirasu.io/c/{CHANNEL_ID} の動画情報を取得中...")
    raw_programs = fetch_all_programs()
    print(f"合計 {len(raw_programs)} 件")

    programs = [process_program(p) for p in raw_programs]
    programs.sort(key=lambda x: x["broadcastAt"] or "", reverse=True)

    # 分類統計
    from collections import Counter
    types = Counter(p["type"] for p in programs)
    genres = Counter(p["genre"] for p in programs if p["genre"])
    print("番組タイプ:", dict(types))
    print("ジャンル:", dict(genres))

    output = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "channel": CHANNEL_ID,
        "programs": programs,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"{OUTPUT_FILE} に保存しました")


if __name__ == "__main__":
    main()
