"""Feature 17: Webhook notifications - fire-and-forget."""
import json
import logging

import httpx

logger = logging.getLogger(__name__)

_client = httpx.AsyncClient(timeout=10.0)


async def fire_webhook(webhook_url: str, event_type: str, payload: dict):
    """Fire a webhook notification. Non-blocking, best-effort."""
    if not webhook_url:
        return
    try:
        data = {"event": event_type, "data": payload}
        await _client.post(
            webhook_url,
            json=data,
            headers={"Content-Type": "application/json", "User-Agent": "TBM-Evaluator/1.0"},
        )
        logger.info(f"Webhook fired: {event_type} -> {webhook_url}")
    except Exception as e:
        logger.warning(f"Webhook failed ({event_type} -> {webhook_url}): {e}")


async def close_webhook_client():
    await _client.aclose()
