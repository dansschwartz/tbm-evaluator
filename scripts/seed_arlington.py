#!/usr/bin/env python3
"""
Seed Arlington Soccer Association via the quick-setup onboarding endpoint.
Adds players, evaluators, an event with scores, and match results.
Demonstrates multi-tenant operation alongside DC Soccer Club.

Usage:
    python3 scripts/seed_arlington.py --api-url https://tbm-evaluator-production.up.railway.app --admin-key YOUR_KEY
"""
import argparse
import random

import httpx

PLAYERS = [
    {"first_name": "Jayden", "last_name": "Carter", "age_group": "U10", "position": "Midfielder"},
    {"first_name": "Lily", "last_name": "Nguyen", "age_group": "U10", "position": "Forward"},
    {"first_name": "Caleb", "last_name": "Washington", "age_group": "U10", "position": "Defender"},
    {"first_name": "Chloe", "last_name": "Park", "age_group": "U10", "position": "Midfielder"},
    {"first_name": "Dylan", "last_name": "Rivera", "age_group": "U10", "position": "Goalkeeper"},
    {"first_name": "Zoe", "last_name": "Mitchell", "age_group": "U12", "position": "Forward"},
    {"first_name": "Owen", "last_name": "Gonzalez", "age_group": "U12", "position": "Midfielder"},
    {"first_name": "Grace", "last_name": "Kim", "age_group": "U12", "position": "Defender"},
    {"first_name": "Eli", "last_name": "Foster", "age_group": "U12", "position": "Forward"},
    {"first_name": "Nora", "last_name": "Brooks", "age_group": "U12", "position": "Midfielder"},
    {"first_name": "Leo", "last_name": "Ramirez", "age_group": "U12", "position": "Defender"},
    {"first_name": "Mila", "last_name": "Cooper", "age_group": "U12", "position": "Forward"},
    {"first_name": "Asher", "last_name": "Barnes", "age_group": "U10", "position": "Midfielder"},
    {"first_name": "Aria", "last_name": "Reed", "age_group": "U10", "position": "Defender"},
    {"first_name": "Mateo", "last_name": "Hughes", "age_group": "U10", "position": "Forward"},
]

EVALUATORS = [
    {"name": "Coach Lisa Moreno", "email": "lisa.moreno@arlingtonsoccer.org"},
    {"name": "Coach David Park", "email": "david.park@arlingtonsoccer.org"},
]

SKILLS = [
    "Ball Control / First Touch",
    "Dribbling",
    "Passing Accuracy",
    "Shooting / Finishing",
    "Heading",
    "Tackling / Defending",
    "Positioning / Movement",
    "Game Intelligence",
    "Speed / Acceleration",
    "Stamina / Work Rate",
    "Coachability",
    "Attitude / Effort",
]

MATCH_RESULTS = [
    {"home_team": "Arlington U12 Blue", "away_team": "Falls Church FC", "home_score": 3, "away_score": 1, "league": "NCSL Division 2", "match_date": "2026-04-05"},
    {"home_team": "Arlington U12 Blue", "away_team": "Reston SC", "home_score": 2, "away_score": 2, "league": "NCSL Division 2", "match_date": "2026-04-12"},
    {"home_team": "McLean Youth", "away_team": "Arlington U12 Blue", "home_score": 0, "away_score": 4, "league": "NCSL Division 2", "match_date": "2026-04-19"},
    {"home_team": "Arlington U10 Red", "away_team": "Fairfax Stars", "home_score": 2, "away_score": 0, "league": "NCSL Division 3", "match_date": "2026-04-06"},
    {"home_team": "Arlington U10 Red", "away_team": "Herndon FC", "home_score": 1, "away_score": 3, "league": "NCSL Division 3", "match_date": "2026-04-13"},
]


def main():
    parser = argparse.ArgumentParser(description="Seed Arlington Soccer Association demo data")
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--admin-key", required=True)
    args = parser.parse_args()

    h = {"X-Admin-Key": args.admin_key, "Content-Type": "application/json"}
    client = httpx.Client(base_url=args.api_url, headers=h, timeout=120)
    random.seed(99)

    # 1. Quick-setup creates org + template + season + programs + teams + fields
    print("🏢 Creating Arlington Soccer Association via quick-setup...")
    resp = client.post("/api/onboarding/quick-setup", json={
        "club_name": "Arlington Soccer Association",
        "club_slug": "arlington-sa",
        "sport": "soccer",
        "contact_email": "admin@arlingtonsoccer.org",
        "primary_color": "#1a5e1a",
        "secondary_color": "#f5f5dc",
        "programs": ["recreational", "travel"],
        "age_groups": ["U8", "U10", "U12"],
        "num_fields": 3,
        "estimated_players": 300,
    })
    if resp.status_code not in (200, 201):
        print(f"  ❌ Quick-setup failed: {resp.status_code} {resp.text[:200]}")
        return
    setup = resp.json()
    org_id = setup["organization"]["id"]
    print(f"  ✅ Org created: {setup['organization']['name']} ({org_id})")

    # 2. Import 15 players
    print(f"\n👥 Importing {len(PLAYERS)} players...")
    player_ids = []
    for p in PLAYERS:
        resp = client.post(f"/api/organizations/{org_id}/players", json={
            **p,
            "parent_name": f"Parent of {p['first_name']}",
            "parent_email": f"{p['first_name'].lower()}.{p['last_name'].lower()}@example.com",
            "date_of_birth": f"201{random.randint(4,6)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        })
        if resp.status_code in (200, 201):
            player_ids.append(resp.json()["id"])
    print(f"  ✅ {len(player_ids)} players imported")

    # 3. Create evaluators
    print(f"\n🧑‍🏫 Creating {len(EVALUATORS)} evaluators...")
    evaluator_ids = []
    for ev in EVALUATORS:
        resp = client.post(f"/api/organizations/{org_id}/evaluators", json=ev)
        if resp.status_code in (200, 201):
            data = resp.json()
            evaluator_ids.append(data["id"])
            print(f"  ✅ {data['name']} — Access Code: {data['access_code']}")

    # 4. Create tryout event
    print("\n📅 Creating tryout event...")
    template_id = setup.get("template", {}).get("id")
    resp = client.post(f"/api/organizations/{org_id}/events", json={
        "name": "Spring 2026 U12 Travel Tryouts",
        "template_id": template_id,
        "event_type": "tryout",
        "event_date": "2026-05-03",
        "location": "Gunston Park — Field 2",
        "season": "Spring 2026",
    })
    if resp.status_code not in (200, 201):
        print(f"  ❌ Event creation failed: {resp.status_code} {resp.text[:200]}")
        return
    event = resp.json()
    event_id = event["id"]
    print(f"  ✅ Event: {event['name']}")

    # 5. Add players to event
    resp = client.post(f"/api/events/{event_id}/players", json={"player_ids": player_ids})
    print(f"  ✅ {len(player_ids)} players added to event")

    # 6. Submit scores
    print(f"\n⚽ Submitting scores from {len(evaluator_ids)} evaluators...")
    archetypes = ["star"] * 3 + ["strong"] * 5 + ["average"] * 4 + ["developing"] * 3
    random.shuffle(archetypes)
    bases = {"star": 4.2, "strong": 3.5, "average": 3.0, "developing": 2.3}

    for eval_idx, evaluator_id in enumerate(evaluator_ids):
        scores_batch = []
        for p_idx, player_id in enumerate(player_ids):
            arch = archetypes[p_idx] if p_idx < len(archetypes) else "average"
            base = bases[arch]
            for skill in SKILLS:
                score = round(min(5, max(1, base + random.uniform(-0.7, 0.7))), 1)
                scores_batch.append({
                    "player_id": player_id,
                    "skill_name": skill,
                    "score_value": score,
                    "comment": "",
                })

        resp = client.post("/api/scoring/scores", json={
            "event_id": event_id,
            "evaluator_id": evaluator_id,
            "scores": scores_batch,
        })
        status = "✅" if resp.status_code in (200, 201) else "❌"
        print(f"  {status} {EVALUATORS[eval_idx]['name']}: {len(scores_batch)} scores")

    # 7. Add match results
    print(f"\n🏆 Adding {len(MATCH_RESULTS)} match results...")
    for m in MATCH_RESULTS:
        resp = client.post(f"/api/organizations/{org_id}/competition/results", json=m)
        status = "✅" if resp.status_code in (200, 201) else "❌"
        print(f"  {status} {m['home_team']} {m['home_score']}-{m['away_score']} {m['away_team']}")

    # Summary
    print("\n" + "=" * 60)
    print("🎉 ARLINGTON SOCCER ASSOCIATION SEEDED!")
    print(f"  Organization: Arlington Soccer Association")
    print(f"  Players: {len(player_ids)}")
    print(f"  Evaluators: {len(evaluator_ids)}")
    print(f"  Event: Spring 2026 U12 Travel Tryouts")
    print(f"  Match Results: {len(MATCH_RESULTS)}")
    print(f"\n🔗 Admin: {args.api_url}/admin")
    print(f"🔗 Scoring: {args.api_url}/score")


if __name__ == "__main__":
    main()
