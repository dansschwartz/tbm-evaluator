"""Chatbot Intelligence — proxy + enrichment layer for the TBM Chatbot API."""

import logging
import os
import re
from datetime import datetime, timedelta
from collections import Counter
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from app.routers.auth import verify_admin_key
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/organizations/{org_id}/chatbot", tags=["Chatbot Intelligence"])

CHATBOT_API_URL = os.environ.get("CHATBOT_API_URL", "https://tbm-chatbot-production.up.railway.app")
CHATBOT_ADMIN_KEY = os.environ.get("CHATBOT_ADMIN_KEY", "tbm-admin-dS2026-xK9mPqR7")
TENANT_SLUG = "dcsc"

if not os.environ.get("CHATBOT_API_URL") or not os.environ.get("CHATBOT_ADMIN_KEY"):
    logger.warning("CHATBOT_API_URL / CHATBOT_ADMIN_KEY not set — using hardcoded defaults. Set env vars for production.")

# ── topic detection keywords ──────────────────────────────────────────
TOPIC_KEYWORDS = {
    "registration": ["register", "sign up", "signup", "enroll", "enrollment", "registration"],
    "schedule": ["schedule", "calendar", "practice", "game time", "when is"],
    "fees": ["fee", "cost", "price", "payment", "pay", "tuition", "dues"],
    "uniforms": ["uniform", "jersey", "kit", "gear", "equipment"],
    "tryouts": ["tryout", "try out", "evaluation", "placement", "assessment"],
    "coaching": ["coach", "coaching", "trainer", "training staff"],
    "fields": ["field", "location", "facility", "venue", "address", "directions"],
    "age groups": ["age group", "u6", "u8", "u10", "u12", "u14", "u16", "u18", "u19", "division"],
    "weather": ["weather", "rain", "cancel", "postpone", "reschedule"],
    "volunteer": ["volunteer", "volunteering", "help out", "parent duty"],
    "contact": ["contact", "email", "phone", "reach", "talk to"],
    "refund": ["refund", "money back", "cancel registration"],
}

FALLBACK_PHRASES = [
    "i'm not sure", "i don't have", "i couldn't find", "i apologize",
    "i'm unable to", "unfortunately, i don't", "i don't know",
    "i wasn't able", "please contact", "reach out to",
]


def _detect_topics(text: str) -> list[str]:
    lower = text.lower()
    found = []
    for topic, keywords in TOPIC_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            found.append(topic)
    return found or ["general"]


def _is_fallback(text: str) -> bool:
    lower = text.lower()
    return any(phrase in lower for phrase in FALLBACK_PHRASES)


async def _chatbot_get(path: str, params: dict | None = None) -> dict | list:
    headers = {"X-Admin-Key": CHATBOT_ADMIN_KEY}
    url = f"{CHATBOT_API_URL}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            logger.error("Chatbot API %s returned %s: %s", url, resp.status_code, resp.text[:200])
            raise HTTPException(status_code=502, detail="Chatbot API not configured. Set CHATBOT_API_URL and CHATBOT_ADMIN_KEY in environment variables.")
        return resp.json()


def _enrich_conversation(conv: dict, messages: list | None = None, feedback: list | None = None) -> dict:
    """Add resolved, sentiment, topic_tags, message_count, duration fields."""
    msgs = messages or conv.get("messages", [])
    msg_count = len(msgs)

    # Collect all text
    all_text = " ".join(m.get("content", "") or "" for m in msgs)
    topic_tags = _detect_topics(all_text)

    # Fallback detection
    bot_msgs = [m for m in msgs if m.get("role") in ("assistant", "bot")]
    has_fallback = any(_is_fallback(m.get("content", "")) for m in bot_msgs)
    resolved = not has_fallback

    # Sentiment
    conv_id = conv.get("id", "")
    has_thumbs_up = False
    has_thumbs_down = False
    if feedback:
        for fb in feedback:
            if fb.get("conversation_id") == conv_id:
                if fb.get("rating") == "positive" or fb.get("thumbs_up"):
                    has_thumbs_up = True
                if fb.get("rating") == "negative" or fb.get("thumbs_down"):
                    has_thumbs_down = True

    has_escalation = "contact" in topic_tags and has_fallback
    if has_thumbs_up and not has_thumbs_down:
        sentiment = "positive"
    elif has_thumbs_down or has_escalation:
        sentiment = "negative"
    else:
        sentiment = "neutral"

    # Duration
    timestamps = []
    for m in msgs:
        ts = m.get("created_at") or m.get("timestamp")
        if ts:
            try:
                timestamps.append(datetime.fromisoformat(str(ts).replace("Z", "+00:00")))
            except Exception:
                pass
    duration_seconds = 0
    if len(timestamps) >= 2:
        duration_seconds = int((max(timestamps) - min(timestamps)).total_seconds())

    return {
        **conv,
        "resolved": resolved,
        "sentiment": sentiment,
        "topic_tags": topic_tags,
        "message_count": msg_count,
        "duration_seconds": duration_seconds,
        "visitor_name": conv.get("visitor_name") or conv.get("user_name") or conv.get("name") or "Anonymous",
        "visitor_email": conv.get("visitor_email") or conv.get("user_email") or conv.get("email") or "",
        "has_fallback": has_fallback,
        "messages": msgs,
    }


# ── GET /conversations ────────────────────────────────────────────────
@router.get("/conversations")
async def get_conversations(
    org_id: str,
    days: int = Query(30, ge=1, le=365),
    sentiment: Optional[str] = Query(None),
    resolved: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    _key: str = Depends(verify_admin_key),
):
    try:
        convos = await _chatbot_get(f"/api/admin/tenants/{TENANT_SLUG}/conversations")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to reach chatbot API: %s", e)
        raise HTTPException(status_code=502, detail="Chatbot API not configured. Set CHATBOT_API_URL and CHATBOT_ADMIN_KEY in environment variables.")

    if not isinstance(convos, list):
        convos = convos.get("conversations", []) if isinstance(convos, dict) else []

    # Fetch feedback for sentiment
    try:
        feedback = await _chatbot_get("/api/admin/feedback", params={"tenant_id": TENANT_SLUG})
        if isinstance(feedback, dict):
            feedback = feedback.get("feedback", [])
    except Exception:
        feedback = []

    # Fetch messages for each conversation and enrich
    enriched = []
    async with httpx.AsyncClient(timeout=15) as client:
        for conv in convos:
            conv_id = conv.get("id", "")
            try:
                resp = await client.get(
                    f"{CHATBOT_API_URL}/api/admin/conversations/{conv_id}/messages",
                    headers={"X-Admin-Key": CHATBOT_ADMIN_KEY},
                )
                msgs = resp.json() if resp.status_code == 200 else []
                if isinstance(msgs, dict):
                    msgs = msgs.get("messages", [])
            except Exception:
                msgs = []
            enriched.append(_enrich_conversation(conv, msgs, feedback))

    # Filters
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = []
    for c in enriched:
        # Date filter
        created = c.get("created_at") or c.get("timestamp") or ""
        if created:
            try:
                dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                if dt.replace(tzinfo=None) < cutoff:
                    continue
            except Exception:
                pass

        if sentiment and c["sentiment"] != sentiment:
            continue
        if resolved == "yes" and not c["resolved"]:
            continue
        if resolved == "no" and c["resolved"]:
            continue
        if search:
            search_lower = search.lower()
            all_text = " ".join(m.get("content", "") for m in c.get("messages", []))
            if search_lower not in all_text.lower() and search_lower not in c.get("visitor_name", "").lower():
                continue
        result.append(c)

    return {"conversations": result, "total": len(result)}


# ── GET /stats ────────────────────────────────────────────────────────
@router.get("/stats")
async def get_stats(
    org_id: str,
    _key: str = Depends(verify_admin_key),
):
    try:
        analytics = await _chatbot_get("/api/admin/analytics", params={"tenant_id": TENANT_SLUG, "days": 30})
    except Exception:
        analytics = {}

    try:
        unanswered = await _chatbot_get("/api/admin/unanswered", params={"tenant_id": TENANT_SLUG})
        if isinstance(unanswered, dict):
            unanswered_list = unanswered.get("questions", unanswered.get("unanswered", []))
        else:
            unanswered_list = unanswered if isinstance(unanswered, list) else []
    except Exception:
        unanswered_list = []

    # Get conversations for computed stats
    try:
        convos_resp = await _chatbot_get(f"/api/admin/tenants/{TENANT_SLUG}/conversations")
        convos = convos_resp if isinstance(convos_resp, list) else convos_resp.get("conversations", [])
    except Exception:
        convos = []

    total = len(convos) if convos else analytics.get("total_conversations", 0)

    # Quick topic count from analytics or compute
    top_topics = analytics.get("top_topics", [])

    return {
        "total_conversations": total,
        "resolution_rate": analytics.get("resolution_rate", 0),
        "avg_sentiment": analytics.get("avg_sentiment", "neutral"),
        "unanswered_count": len(unanswered_list),
        "top_topics": top_topics,
        "period_days": 30,
    }


# ── GET /digest ───────────────────────────────────────────────────────
@router.get("/digest")
async def get_digest(
    org_id: str,
    _key: str = Depends(verify_admin_key),
):
    # Gather data
    try:
        analytics = await _chatbot_get("/api/admin/analytics", params={"tenant_id": TENANT_SLUG, "days": 7})
    except Exception:
        analytics = {}

    try:
        unanswered_resp = await _chatbot_get("/api/admin/unanswered", params={"tenant_id": TENANT_SLUG})
        if isinstance(unanswered_resp, dict):
            unanswered = unanswered_resp.get("questions", unanswered_resp.get("unanswered", []))
        else:
            unanswered = unanswered_resp if isinstance(unanswered_resp, list) else []
    except Exception:
        unanswered = []

    try:
        feedback_resp = await _chatbot_get("/api/admin/feedback", params={"tenant_id": TENANT_SLUG})
        if isinstance(feedback_resp, dict):
            feedback = feedback_resp.get("feedback", [])
        else:
            feedback = feedback_resp if isinstance(feedback_resp, list) else []
    except Exception:
        feedback = []

    try:
        convos_resp = await _chatbot_get(f"/api/admin/tenants/{TENANT_SLUG}/conversations")
        convos = convos_resp if isinstance(convos_resp, list) else convos_resp.get("conversations", [])
    except Exception:
        convos = []

    # Build context for AI digest
    unanswered_text = "\n".join(
        f"- {q.get('question', q.get('content', str(q)))}" for q in unanswered[:30]
    ) or "None"

    pos_count = sum(1 for f in feedback if f.get("rating") == "positive" or f.get("thumbs_up"))
    neg_count = sum(1 for f in feedback if f.get("rating") == "negative" or f.get("thumbs_down"))
    total_fb = pos_count + neg_count
    pos_pct = round(pos_count / total_fb * 100) if total_fb else 0
    neg_pct = round(neg_count / total_fb * 100) if total_fb else 0
    neutral_pct = 100 - pos_pct - neg_pct

    # Gather conversation topics
    all_topics = []
    sample_quotes = []
    fallback_topics = Counter()
    async with httpx.AsyncClient(timeout=15) as client:
        for conv in convos[:50]:  # cap for performance
            conv_id = conv.get("id", "")
            try:
                resp = await client.get(
                    f"{CHATBOT_API_URL}/api/admin/conversations/{conv_id}/messages",
                    headers={"X-Admin-Key": CHATBOT_ADMIN_KEY},
                )
                msgs = resp.json() if resp.status_code == 200 else []
                if isinstance(msgs, dict):
                    msgs = msgs.get("messages", [])
            except Exception:
                msgs = []

            all_text = " ".join(m.get("content", "") for m in msgs)
            topics = _detect_topics(all_text)
            all_topics.extend(topics)

            # Track fallback topics
            bot_msgs = [m for m in msgs if m.get("role") in ("assistant", "bot")]
            if any(_is_fallback(m.get("content", "")) for m in bot_msgs):
                for t in topics:
                    fallback_topics[t] += 1

            # Collect user quotes
            user_msgs = [m for m in msgs if m.get("role") in ("user", "human")]
            for m in user_msgs[:2]:
                content = m.get("content", "")
                if len(content) > 15 and len(sample_quotes) < 10:
                    sample_quotes.append(content)

    topic_counts = Counter(all_topics)
    top_topics_list = topic_counts.most_common(8)

    # Build AI prompt
    prompt = f"""You are a club operations analyst. Generate a weekly chatbot digest.

DATA:
- Total conversations (7 days): {len(convos)}
- Analytics summary: {analytics}
- Unanswered questions:\n{unanswered_text}
- Feedback: {pos_count} positive, {neg_count} negative out of {total_fb} total
- Top topics: {top_topics_list}
- Fallback topic counts: {dict(fallback_topics)}
- Sample user quotes: {sample_quotes[:8]}

Generate a JSON response with this EXACT structure (no markdown, just JSON):
{{
  "top_topics": [
    {{"topic": "string", "count": number, "trend": "up|down|stable", "delta_pct": number}}
  ],
  "content_gaps": [
    {{"topic": "string", "unanswered_count": number, "suggested_content": "string"}}
  ],
  "sentiment_summary": {{
    "positive_pct": {pos_pct},
    "neutral_pct": {neutral_pct},
    "negative_pct": {neg_pct},
    "trend": "improving|declining|stable"
  }},
  "notable_quotes": [
    {{"quote": "string", "sentiment": "positive|neutral|negative", "topic": "string"}}
  ],
  "director_brief": [
    "TRENDING: <highest volume topic insight>",
    "BROKEN: <highest fallback rate topic and what to fix>",
    "PRAISED: <positive sentiment highlights>",
    "ATTENTION: <new/emerging topics or escalations>"
  ]
}}"""

    # Call OpenAI
    try:
        import openai
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        import json
        raw = resp.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        digest = json.loads(raw)
    except Exception as e:
        logger.error("AI digest generation failed: %s", e)
        # Fallback digest
        digest = {
            "top_topics": [{"topic": t, "count": c, "trend": "stable", "delta_pct": 0} for t, c in top_topics_list[:5]],
            "content_gaps": [{"topic": q.get("question", str(q))[:60], "unanswered_count": 1, "suggested_content": "Add FAQ entry"} for q in unanswered[:5]],
            "sentiment_summary": {"positive_pct": pos_pct, "neutral_pct": neutral_pct, "negative_pct": neg_pct, "trend": "stable"},
            "notable_quotes": [{"quote": q[:100], "sentiment": "neutral", "topic": "general"} for q in sample_quotes[:3]],
            "director_brief": [
                f"TRENDING: {top_topics_list[0][0] if top_topics_list else 'general'} is the top topic",
                f"BROKEN: {fallback_topics.most_common(1)[0][0] if fallback_topics else 'none'} has highest fallback rate",
                f"PRAISED: {pos_count} positive ratings received",
                f"ATTENTION: {len(unanswered)} unanswered questions need content",
            ],
        }

    return {
        "digest": digest,
        "generated_at": datetime.utcnow().isoformat(),
        "period": "7 days",
        "conversation_count": len(convos),
    }


# ── GET /unanswered ──────────────────────────────────────────────────
@router.get("/unanswered")
async def get_unanswered(
    org_id: str,
    _key: str = Depends(verify_admin_key),
):
    try:
        resp = await _chatbot_get("/api/admin/unanswered", params={"tenant_id": TENANT_SLUG})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Chatbot API not configured. Set CHATBOT_API_URL and CHATBOT_ADMIN_KEY in environment variables.")

    questions = resp if isinstance(resp, list) else resp.get("questions", resp.get("unanswered", []))

    # Cluster by topic
    clusters = {}
    for q in questions:
        text = q.get("question", q.get("content", str(q)))
        topics = _detect_topics(text)
        topic = topics[0] if topics else "general"
        if topic not in clusters:
            clusters[topic] = {"topic": topic, "count": 0, "questions": []}
        clusters[topic]["count"] += 1
        if len(clusters[topic]["questions"]) < 5:
            clusters[topic]["questions"].append(text)

    return {"clusters": list(clusters.values()), "total": len(questions)}
