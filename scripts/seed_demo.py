#!/usr/bin/env python3
"""
Seed TBM Evaluator with realistic DC Soccer Club tryout demo data.
Creates org, players, evaluators, event, scores, and generates reports.

Usage:
    python3 scripts/seed_demo.py --api-url https://tbm-evaluator-production.up.railway.app --admin-key YOUR_KEY
"""
import argparse
import json
import random
import time

import httpx

# Realistic U12 Boys player data for DC Soccer Club
PLAYERS = [
    {"first_name": "Marcus", "last_name": "Johnson", "age_group": "U12", "position": "Midfielder", "parent_name": "Sarah Johnson", "parent_email": "sarah.johnson@example.com"},
    {"first_name": "Sofia", "last_name": "Rodriguez", "age_group": "U12", "position": "Forward", "parent_name": "Maria Rodriguez", "parent_email": "maria.rodriguez@example.com"},
    {"first_name": "Ethan", "last_name": "Williams", "age_group": "U12", "position": "Defender", "parent_name": "James Williams", "parent_email": "james.williams@example.com"},
    {"first_name": "Olivia", "last_name": "Chen", "age_group": "U12", "position": "Midfielder", "parent_name": "Wei Chen", "parent_email": "wei.chen@example.com"},
    {"first_name": "Noah", "last_name": "Patel", "age_group": "U12", "position": "Goalkeeper", "parent_name": "Priya Patel", "parent_email": "priya.patel@example.com"},
    {"first_name": "Ava", "last_name": "Thompson", "age_group": "U12", "position": "Forward", "parent_name": "Michael Thompson", "parent_email": "m.thompson@example.com"},
    {"first_name": "Liam", "last_name": "Garcia", "age_group": "U12", "position": "Midfielder", "parent_name": "Carlos Garcia", "parent_email": "carlos.garcia@example.com"},
    {"first_name": "Emma", "last_name": "Davis", "age_group": "U12", "position": "Defender", "parent_name": "Jennifer Davis", "parent_email": "jen.davis@example.com"},
    {"first_name": "Jackson", "last_name": "Brown", "age_group": "U12", "position": "Forward", "parent_name": "Robert Brown", "parent_email": "rob.brown@example.com"},
    {"first_name": "Isabella", "last_name": "Martinez", "age_group": "U12", "position": "Midfielder", "parent_name": "Ana Martinez", "parent_email": "ana.martinez@example.com"},
    {"first_name": "Aiden", "last_name": "Lee", "age_group": "U12", "position": "Defender", "parent_name": "David Lee", "parent_email": "david.lee@example.com"},
    {"first_name": "Mia", "last_name": "Wilson", "age_group": "U12", "position": "Forward", "parent_name": "Karen Wilson", "parent_email": "karen.wilson@example.com"},
    {"first_name": "Lucas", "last_name": "Anderson", "age_group": "U12", "position": "Midfielder", "parent_name": "Chris Anderson", "parent_email": "chris.anderson@example.com"},
    {"first_name": "Charlotte", "last_name": "Taylor", "age_group": "U12", "position": "Defender", "parent_name": "Lisa Taylor", "parent_email": "lisa.taylor@example.com"},
    {"first_name": "Mason", "last_name": "Thomas", "age_group": "U12", "position": "Forward", "parent_name": "Daniel Thomas", "parent_email": "dan.thomas@example.com"},
    {"first_name": "Amelia", "last_name": "Jackson", "age_group": "U12", "position": "Goalkeeper", "parent_name": "Patricia Jackson", "parent_email": "pat.jackson@example.com"},
    {"first_name": "Oliver", "last_name": "White", "age_group": "U12", "position": "Midfielder", "parent_name": "Susan White", "parent_email": "susan.white@example.com"},
    {"first_name": "Harper", "last_name": "Harris", "age_group": "U12", "position": "Forward", "parent_name": "Mark Harris", "parent_email": "mark.harris@example.com"},
    {"first_name": "Elijah", "last_name": "Clark", "age_group": "U12", "position": "Defender", "parent_name": "Nancy Clark", "parent_email": "nancy.clark@example.com"},
    {"first_name": "Evelyn", "last_name": "Lewis", "age_group": "U12", "position": "Midfielder", "parent_name": "Tom Lewis", "parent_email": "tom.lewis@example.com"},
    {"first_name": "Benjamin", "last_name": "Robinson", "age_group": "U12", "position": "Forward", "parent_name": "Angela Robinson", "parent_email": "angela.r@example.com"},
    {"first_name": "Abigail", "last_name": "Walker", "age_group": "U12", "position": "Defender", "parent_name": "Steven Walker", "parent_email": "steve.walker@example.com"},
    {"first_name": "Henry", "last_name": "Young", "age_group": "U12", "position": "Midfielder", "parent_name": "Michelle Young", "parent_email": "michelle.young@example.com"},
    {"first_name": "Ella", "last_name": "King", "age_group": "U12", "position": "Forward", "parent_name": "Brian King", "parent_email": "brian.king@example.com"},
    {"first_name": "Sebastian", "last_name": "Scott", "age_group": "U12", "position": "Defender", "parent_name": "Laura Scott", "parent_email": "laura.scott@example.com"},
]

# Soccer skills from the preset template
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

EVALUATORS = [
    {"name": "Coach Matt Arrington", "email": "mattarrington@dcsoccerclub.org"},
    {"name": "Coach Kenny Owens", "email": "kennyowens@dcsoccerclub.org"},
    {"name": "Coach Mo Gueye", "email": "mogueye@dcsoccerclub.org"},
]

# Player archetypes for realistic scoring
ARCHETYPES = {
    "star": {"base": 4.2, "variance": 0.5},       # Top performers
    "strong": {"base": 3.5, "variance": 0.6},      # Solid players
    "average": {"base": 3.0, "variance": 0.7},     # Mid-tier
    "developing": {"base": 2.3, "variance": 0.6},  # Need work
}

def generate_scores(archetype, position):
    """Generate realistic scores based on archetype and position."""
    base = ARCHETYPES[archetype]["base"]
    var = ARCHETYPES[archetype]["variance"]
    
    scores = {}
    for skill in SKILLS:
        # Position-based bonuses
        bonus = 0
        if position == "Forward" and skill in ["Shooting / Finishing", "Speed / Acceleration"]:
            bonus = 0.4
        elif position == "Midfielder" and skill in ["Passing Accuracy", "Game Intelligence"]:
            bonus = 0.3
        elif position == "Defender" and skill in ["Tackling / Defending", "Positioning / Movement"]:
            bonus = 0.4
        elif position == "Goalkeeper" and skill in ["Positioning / Movement", "Game Intelligence"]:
            bonus = 0.3
        
        score = round(min(5, max(1, base + bonus + random.uniform(-var, var))), 1)
        scores[skill] = score
    
    return scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--admin-key", required=True)
    args = parser.parse_args()

    h = {"X-Admin-Key": args.admin_key, "Content-Type": "application/json"}
    client = httpx.Client(base_url=args.api_url, headers=h, timeout=120)

    random.seed(42)  # Reproducible data

    # 1. Create Organization
    print("🏢 Creating DC Soccer Club org...")
    resp = client.post("/api/organizations", json={
        "name": "DC Soccer Club",
        "slug": "dcsc",
        "sport": "soccer",
        "contact_email": "info@dcsoccerclub.org",
        "primary_color": "#c41e3a",
        "secondary_color": "#0f0f23",
    })
    if resp.status_code not in (200, 201):
        print(f"  Error: {resp.status_code} {resp.text[:200]}")
        return
    org = resp.json()
    org_id = org["id"]
    print(f"  ✅ Org: {org['name']} ({org_id})")

    # 2. Get soccer template
    print("\n📋 Getting soccer template...")
    resp = client.get("/api/templates/presets/soccer")
    template_data = resp.json()
    
    # Create a template for this org
    resp = client.post(f"/api/organizations/{org_id}/templates", json={
        "name": "Spring 2026 Tryout Template",
        "sport": "soccer",
        "skills": template_data["skills"],
        "categories": template_data["categories"],
    })
    template = resp.json()
    template_id = template["id"]
    print(f"  ✅ Template: {template['name']} ({len(template_data['skills'])} skills)")

    # 3. Import Players
    print(f"\n👥 Importing {len(PLAYERS)} players...")
    player_ids = []
    for p in PLAYERS:
        resp = client.post(f"/api/organizations/{org_id}/players", json={
            **p, "date_of_birth": f"2014-{random.randint(1,12):02d}-{random.randint(1,28):02d}"
        })
        if resp.status_code in (200, 201):
            player_ids.append(resp.json()["id"])
    print(f"  ✅ {len(player_ids)} players imported")

    # 4. Create Evaluators
    print(f"\n🧑‍🏫 Creating {len(EVALUATORS)} evaluators...")
    evaluator_ids = []
    for ev in EVALUATORS:
        resp = client.post(f"/api/organizations/{org_id}/evaluators", json=ev)
        if resp.status_code in (200, 201):
            data = resp.json()
            evaluator_ids.append(data["id"])
            print(f"  ✅ {data['name']} — Access Code: {data['access_code']}")

    # 5. Create Event
    print("\n📅 Creating tryout event...")
    resp = client.post(f"/api/organizations/{org_id}/events", json={
        "name": "Spring 2026 U12 Coed Tryouts",
        "template_id": template_id,
        "event_type": "tryout",
        "event_date": "2026-04-27",
        "location": "Mann Elementary School — Turf Field",
        "season": "Spring 2026",
    })
    event = resp.json()
    event_id = event["id"]
    print(f"  ✅ Event: {event['name']}")

    # 6. Add players to event
    print("\n📝 Adding players to event...")
    resp = client.post(f"/api/events/{event_id}/players", json={
        "player_ids": player_ids
    })
    print(f"  ✅ {len(player_ids)} players added")

    # 7. Submit scores from each evaluator
    print(f"\n⚽ Submitting scores from {len(evaluator_ids)} evaluators...")
    
    # Assign archetypes to players
    archetypes = (
        ["star"] * 4 +        # 4 star players
        ["strong"] * 8 +      # 8 strong players
        ["average"] * 8 +     # 8 average players
        ["developing"] * 5    # 5 developing players
    )
    random.shuffle(archetypes)

    for eval_idx, evaluator_id in enumerate(evaluator_ids):
        scores_batch = []
        for p_idx, player_id in enumerate(player_ids):
            arch = archetypes[p_idx] if p_idx < len(archetypes) else "average"
            position = PLAYERS[p_idx]["position"]
            player_scores = generate_scores(arch, position)
            
            # Add slight evaluator bias (realistic)
            eval_bias = [0, 0.2, -0.1][eval_idx]
            
            for skill_name, score_val in player_scores.items():
                adjusted = round(min(5, max(1, score_val + eval_bias + random.uniform(-0.3, 0.3))), 1)
                comment = ""
                if adjusted >= 4.5:
                    comment = random.choice(["Excellent", "Outstanding", "Very impressive", "Top talent"])
                elif adjusted <= 2.0:
                    comment = random.choice(["Needs work", "Keep developing", "Room for growth", "Focus area"])
                
                scores_batch.append({
                    "player_id": player_id,
                    "skill_name": skill_name,
                    "score_value": adjusted,
                    "comment": comment,
                })
        
        resp = client.post("/api/scoring/scores", json={
            "event_id": event_id,
            "evaluator_id": evaluator_id,
            "scores": scores_batch,
        })
        if resp.status_code in (200, 201):
            print(f"  ✅ {EVALUATORS[eval_idx]['name']}: {len(scores_batch)} scores submitted")
        else:
            print(f"  ❌ {EVALUATORS[eval_idx]['name']}: {resp.status_code} {resp.text[:100]}")

    # 8. Generate reports
    print("\n📊 Generating AI reports (this may take a minute)...")
    resp = client.post(f"/api/events/{event_id}/generate-reports", timeout=300)
    if resp.status_code in (200, 201):
        result = resp.json()
        print(f"  ✅ {result.get('reports_generated', '?')} reports generated with AI summaries")
    else:
        print(f"  ⚠️ Report generation: {resp.status_code} {resp.text[:200]}")

    # 9. Create draft teams
    print("\n🏆 Creating draft teams...")
    resp = client.post(f"/api/events/{event_id}/draft/teams", json={
        "teams": [
            {"team_name": "Blue", "team_color": "#0066cc"},
            {"team_name": "Red", "team_color": "#cc0000"},
            {"team_name": "White", "team_color": "#888888"},
        ]
    })
    if resp.status_code in (200, 201):
        print("  ✅ 3 teams created: Blue, Red, White")

    # 10. Auto-balance teams
    print("\n⚖️ AI auto-balancing teams...")
    resp = client.post(f"/api/events/{event_id}/draft/auto-balance", timeout=60)
    if resp.status_code in (200, 201):
        print("  ✅ Teams auto-balanced by AI")
    else:
        print(f"  ⚠️ Auto-balance: {resp.status_code} {resp.text[:200]}")

    # Summary
    print("\n" + "=" * 60)
    print("🎉 DEMO DATA SEEDED!")
    print(f"  Organization: DC Soccer Club")
    print(f"  Players: {len(player_ids)}")
    print(f"  Evaluators: {len(evaluator_ids)}")
    print(f"  Event: Spring 2026 U12 Coed Tryouts")
    print(f"  Scores: {len(player_ids) * len(SKILLS) * len(evaluator_ids)}")
    print(f"\n🔗 Admin: {args.api_url}/admin")
    print(f"🔗 Scoring: {args.api_url}/score")
    print(f"🔗 Parent Portal: {args.api_url}/parent")
    print(f"\n📱 Evaluator Access Codes (for scoring app):")
    for ev in EVALUATORS:
        print(f"   {ev['name']}")


if __name__ == "__main__":
    main()
