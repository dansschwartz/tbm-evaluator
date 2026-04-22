import json
import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

client = httpx.AsyncClient(timeout=60.0)

HEADERS = {
    "Authorization": f"Bearer {settings.openai_api_key}",
    "Content-Type": "application/json",
}


async def call_openai(messages: list[dict], max_tokens: int = 1000, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=HEADERS,
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"OpenAI API error (attempt {attempt + 1}/{retries}): {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise


async def generate_player_summary(
    player_name: str,
    age_group: str,
    event_name: str,
    sport: str,
    skill_scores: dict,
    overall_score: float,
    rank: int,
    total_players: int,
    template_skills: list[dict],
) -> dict:
    skill_details = []
    for skill in template_skills:
        name = skill["name"]
        score = skill_scores.get(name)
        if score is not None:
            scoring_type = skill.get("scoring_type", "scale_1_5")
            max_val = 5 if "1_5" in scoring_type else 10 if "1_10" in scoring_type else 5
            skill_details.append(f"- {name} ({skill.get('category', 'General')}): {score:.1f}/{max_val}")

    skills_text = "\n".join(skill_details) if skill_details else "No scores available"

    prompt = f"""You are an expert youth {sport} evaluator. Generate an evaluation report for a player.

Player: {player_name}
Age Group: {age_group}
Event: {event_name}
Overall Score: {overall_score:.2f}
Rank: {rank} out of {total_players} players

Skill Scores:
{skills_text}

Respond in this exact JSON format:
{{
    "summary": "2-3 sentence narrative summary of the player's performance",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "improvements": ["area 1", "area 2", "area 3"],
    "recommendation": "One sentence recommendation about the player's readiness level"
}}

Be specific to their scores. Be encouraging but honest. Use youth-appropriate language."""

    response_text = await call_openai([{"role": "user", "content": prompt}])

    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response_text[start:end])
    except json.JSONDecodeError:
        pass

    return {
        "summary": f"{player_name} participated in {event_name} and scored {overall_score:.1f} overall, ranking {rank} of {total_players} players.",
        "strengths": ["Participation", "Effort", "Enthusiasm"],
        "improvements": ["Continue developing all skills"],
        "recommendation": "Continue training and development.",
    }


async def close_client():
    await client.aclose()
