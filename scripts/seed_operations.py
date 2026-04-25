#!/usr/bin/env python3
"""
Seed TBM Evaluator with comprehensive DC Soccer Club operations data.
Seeds fields, seasons, programs, teams, schedules, attendance, messages,
coach certifications, and documents.

Usage:
    python3 scripts/seed_operations.py --api-url https://tbm-evaluator-production.up.railway.app --admin-key tbm-eval-2026-secure
"""
import argparse
import json
import random
import base64
from datetime import datetime, date, timedelta

import httpx

ORG_ID = "7f872a72-b657-4a15-9cef-7eef29daf974"

FIELDS = [
    {
        "name": "Mann Elementary School",
        "location_address": "4430 Newark St NW, Washington, DC 20016",
        "surface_type": "turf",
        "size": "full",
        "has_lights": True,
        "notes": "Primary home field — NW DC. Permit: Mon-Fri 4-8pm, Sat 8am-6pm.",
    },
    {
        "name": "Jelleff Rec Center",
        "location_address": "3265 S St NW, Washington, DC 20007",
        "surface_type": "turf",
        "size": "full",
        "has_lights": False,
        "notes": "NW DC — Georgetown area. No lights, daylight games only.",
    },
    {
        "name": "Palisades Rec Center",
        "location_address": "5200 Sherier Pl NW, Washington, DC 20016",
        "surface_type": "grass",
        "size": "small",
        "has_lights": False,
        "notes": "Small grass field — NW DC. Good for younger age groups and small-sided games.",
    },
    {
        "name": "Fort Stevens Rec Center",
        "location_address": "1327 Van Buren St NW, Washington, DC 20012",
        "surface_type": "turf",
        "size": "3_4",
        "has_lights": True,
        "notes": "NW DC — 3/4 size turf with lights. Great for weeknight practices.",
    },
    {
        "name": "Hardy Middle School",
        "location_address": "1819 35th St NW, Washington, DC 20007",
        "surface_type": "turf",
        "size": "full",
        "has_lights": True,
        "notes": "Full-size turf with lights — NW DC Georgetown.",
    },
    {
        "name": "Catholic University Cardinal Stadium",
        "location_address": "620 Michigan Ave NE, Washington, DC 20064",
        "surface_type": "turf",
        "size": "full",
        "has_lights": True,
        "notes": "Full-size turf with lights — NE DC. Tournament venue.",
    },
]

PROGRAMS = [
    {
        "name": "Rec League",
        "program_type": "recreational",
        "age_groups": ["K", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"],
        "gender": "coed",
        "registration_fee": 145.0,
        "financial_aid_eligible": True,
        "max_players_per_team": 15,
        "max_teams": 20,
        "description": "Fun, inclusive recreational soccer for all skill levels. Everyone plays!",
    },
    {
        "name": "Travel Program",
        "program_type": "travel",
        "age_groups": ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"],
        "gender": "coed",
        "registration_fee": 2500.0,
        "financial_aid_eligible": False,
        "max_players_per_team": 18,
        "max_teams": 16,
        "description": "Competitive travel soccer with tryouts. Teams compete in regional leagues.",
    },
    {
        "name": "Academy",
        "program_type": "academy",
        "age_groups": ["U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"],
        "gender": "coed",
        "registration_fee": 3500.0,
        "financial_aid_eligible": False,
        "max_players_per_team": 20,
        "max_teams": 8,
        "description": "Elite development program with advanced coaching and college prep pathway.",
    },
    {
        "name": "Pre-Travel Academy",
        "program_type": "recreational",
        "age_groups": ["K", "1st", "2nd"],
        "gender": "coed",
        "registration_fee": 395.0,
        "financial_aid_eligible": True,
        "max_players_per_team": 12,
        "max_teams": 6,
        "description": "Bridge program preparing young players for travel soccer. Skills-focused.",
    },
    {
        "name": "Summer Camp",
        "program_type": "camp",
        "age_groups": ["K", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"],
        "gender": "coed",
        "registration_fee": 350.0,
        "financial_aid_eligible": True,
        "max_players_per_team": 20,
        "max_teams": 10,
        "description": "Week-long summer soccer camps with skills training, scrimmages, and fun.",
    },
]

# Teams across programs: (team_name, program_index, level, practice_day, practice_time)
TEAMS = [
    # Rec League (5 teams)
    ("U10 Coed Team A", 0, "Recreational", "Tuesday", "17:00-18:30"),
    ("U10 Coed Team B", 0, "Recreational", "Thursday", "17:00-18:30"),
    ("U10 Girls Team A", 0, "Recreational", "Tuesday", "18:30-20:00"),
    ("U12 Coed Team A", 0, "Recreational", "Wednesday", "17:00-18:30"),
    ("U12 Coed Team B", 0, "Recreational", "Wednesday", "18:30-20:00"),
    # Travel (4 teams)
    ("U12 Blue", 1, "Blue", "Tuesday", "18:00-19:30"),
    ("U12 Red", 1, "Red", "Thursday", "18:00-19:30"),
    ("U12 White", 1, "White", "Tuesday", "16:30-18:00"),
    ("U12 Select", 1, "Select", "Thursday", "16:30-18:00"),
    # Academy (1 team)
    ("U12 Academy", 2, "Academy", "Monday", "17:00-19:00"),
    # Pre-Travel (3 teams)
    ("Pre-Travel K-1 A", 3, "Pre-Travel", "Saturday", "09:00-10:00"),
    ("Pre-Travel K-1 B", 3, "Pre-Travel", "Saturday", "10:00-11:00"),
    ("Pre-Travel 2nd", 3, "Pre-Travel", "Saturday", "11:00-12:00"),
    # Summer Camp (2 teams)
    ("Camp Group A (K-3)", 4, "Camp", "Monday", "09:00-12:00"),
    ("Camp Group B (4-8)", 4, "Camp", "Monday", "13:00-16:00"),
]

MESSAGES = [
    {
        "subject": "Spring Season Kickoff — Welcome to DC Soccer Club!",
        "body": "Dear DC Soccer Club Families,\n\nWe are thrilled to welcome you to the Spring 2026 season! Whether you're returning or joining us for the first time, we have an exciting season ahead.\n\nHere are the key dates:\n- First practices begin: April 21, 2026\n- First games: April 26, 2026\n- Season ends: June 14, 2026\n\nPlease ensure all registration paperwork and waivers are submitted before your child's first practice.\n\nLooking forward to a great season!\n\nDC Soccer Club Administration",
        "audience_type": "all",
        "channel": "email",
        "status": "sent",
        "days_ago": 14,
    },
    {
        "subject": "Tryout Results Published — U12 Travel Teams",
        "body": "Dear U12 Families,\n\nThank you for your patience during the tryout process. We are pleased to announce that team assignments for our U12 Travel program have been finalized.\n\nPlease check your player portal for your child's team assignment. Team placements were made based on evaluations from our coaching staff, considering skill level, positional balance, and player development goals.\n\nIf you have questions about placements, please reach out to your team's head coach.\n\nBest regards,\nDC Soccer Club Coaching Staff",
        "audience_type": "program",
        "channel": "email",
        "status": "sent",
        "days_ago": 7,
    },
    {
        "subject": "Weather Cancellation — Tuesday Practice (April 22)",
        "body": "Dear U12 Blue Families,\n\nDue to severe thunderstorm warnings in the DC area, all outdoor practices for Tuesday, April 22 have been cancelled. Player safety is our top priority.\n\nWe will make up the session during the week of April 28. Details to follow.\n\nPlease confirm receipt of this message by replying.\n\nStay safe,\nCoach Matt Arrington",
        "audience_type": "team",
        "channel": "email",
        "status": "sent",
        "days_ago": 1,
    },
]

COACH_CERTS = {
    "Coach Matt Arrington": {
        "certifications": [
            {"name": "SafeSport", "expiry": "2026-12-15", "status": "active"},
            {"name": "USSF D License", "expiry": "2028-03-01", "status": "active"},
            {"name": "Background Check", "expiry": "2027-06-01", "status": "active"},
        ],
        "background_check_status": "cleared",
        "phone": "202-555-0101",
    },
    "Coach Kenny Owens": {
        "certifications": [
            {"name": "SafeSport", "expiry": "2027-03-20", "status": "active"},
            {"name": "USSF E License", "expiry": "2027-09-01", "status": "active"},
        ],
        "background_check_status": "cleared",
        "phone": "202-555-0102",
    },
    "Coach Mo Gueye": {
        "certifications": [
            {"name": "SafeSport", "expiry": "2026-05-10", "status": "active"},
            {"name": "USSF D License", "expiry": "2028-01-15", "status": "active"},
        ],
        "background_check_status": "cleared",
        "phone": "202-555-0103",
    },
}


def main():
    parser = argparse.ArgumentParser(description="Seed DC Soccer Club operations data")
    parser.add_argument("--api-url", required=True, help="Base URL of the API")
    parser.add_argument("--admin-key", required=True, help="Admin API key")
    args = parser.parse_args()

    h = {"X-Admin-Key": args.admin_key, "Content-Type": "application/json"}
    client = httpx.Client(base_url=args.api_url, headers=h, timeout=120)

    random.seed(42)
    ORG_ID = "7f872a72-b657-4a15-9cef-7eef29daf974"

    # Verify org exists
    print("Verifying organization...")
    org_id = ORG_ID
    resp = client.get(f"/api/organizations/{org_id}")
    if resp.status_code != 200:
        print(f"  ERROR: Org {org_id} not found ({resp.status_code}). Run seed_demo.py first.")
    org = resp.json()
    print(f"  OK: {org['name']}")

    # Get existing players
    print("\nFetching existing players...")
    resp = client.get(f"/api/organizations/{org_id}/players")
    players = resp.json()
    player_ids = [p["id"] for p in players]
    print(f"  Found {len(player_ids)} players")

    # Get existing evaluators/coaches
    print("\nFetching existing evaluators/coaches...")
    resp = client.get(f"/api/organizations/{org_id}/evaluators")
    evaluators = resp.json()
    evaluator_map = {e["name"]: e for e in evaluators}
    print(f"  Found {len(evaluators)} evaluators")

    # ========== FIELDS ==========
    print("\n--- SEEDING FIELDS ---")
    field_ids = []
    for f in FIELDS:
        resp = client.post(f"/api/organizations/{org_id}/fields", json=f)
        if resp.status_code in (200, 201):
            data = resp.json()
            field_ids.append(data["id"])
            print(f"  + {data['name']} ({data['surface_type']}, {data['size']}, lights={'yes' if data['has_lights'] else 'no'})")
        else:
            print(f"  ERROR creating {f['name']}: {resp.status_code} {resp.text[:100]}")
    print(f"  Total: {len(field_ids)} fields")

    # ========== SEASON ==========
    print("\n--- SEEDING SEASON ---")
    resp = client.post(f"/api/organizations/{org_id}/seasons", json={
        "name": "Spring 2026",
        "start_date": "2026-04-18",
        "end_date": "2026-06-14",
        "registration_open_date": "2026-03-01",
        "registration_close_date": "2026-04-15",
        "status": "active",
    })
    if resp.status_code in (200, 201):
        season = resp.json()
        season_id = season["id"]
        print(f"  + Season: {season['name']} ({season['start_date']} to {season['end_date']}) — status: {season['status']}")
    else:
        print(f"  ERROR: {resp.status_code} {resp.text[:200]}")

    # ========== PROGRAMS ==========
    print("\n--- SEEDING PROGRAMS ---")
    program_ids = []
    for prog in PROGRAMS:
        data = {**prog, "season_id": season_id}
        resp = client.post(f"/api/organizations/{org_id}/programs", json=data)
        if resp.status_code in (200, 201):
            p = resp.json()
            program_ids.append(p["id"])
            print(f"  + {p['name']} ({p['program_type']}, ${p['registration_fee']}, aid={'yes' if p.get('financial_aid_eligible') else 'no'})")
        else:
            print(f"  ERROR creating {prog['name']}: {resp.status_code} {resp.text[:100]}")
    print(f"  Total: {len(program_ids)} programs")

    # ========== TEAMS ==========
    print("\n--- SEEDING TEAMS ---")
    team_ids = []
    team_data_list = []
    for team_name, prog_idx, level, pday, ptime in TEAMS:
        field_idx = random.randint(0, len(field_ids) - 1) if field_ids else None
        data = {
            "name": team_name,
            "program_id": program_ids[prog_idx] if prog_idx < len(program_ids) else None,
            "season_id": season_id,
            "team_level": level,
            "practice_day": pday,
            "practice_time": ptime,
            "max_roster_size": 18,
            "practice_field_id": field_ids[field_idx] if field_idx is not None else None,
        }
        resp = client.post(f"/api/organizations/{org_id}/teams", json=data)
        if resp.status_code in (200, 201):
            t = resp.json()
            team_ids.append(t["id"])
            team_data_list.append(t)
            print(f"  + {t['name']} (level: {level}, {pday} {ptime})")
        else:
            print(f"  ERROR creating {team_name}: {resp.status_code} {resp.text[:100]}")
    print(f"  Total: {len(team_ids)} teams")

    # ========== ASSIGN COACHES TO TEAMS ==========
    print("\n--- ASSIGNING COACHES ---")
    eval_ids = [e["id"] for e in evaluators]
    # Assign coaches to travel + academy teams
    coach_assignments = [
        (5, 0),  # U12 Blue -> Matt Arrington
        (6, 1),  # U12 Red -> Kenny Owens
        (7, 2),  # U12 White -> Mo Gueye
        (9, 0),  # U12 Academy -> Matt Arrington
    ]
    for team_idx, coach_idx in coach_assignments:
        if team_idx < len(team_ids) and coach_idx < len(eval_ids):
            resp = client.patch(f"/api/organizations/{org_id}/teams/{team_ids[team_idx]}", json={
                "head_coach_id": eval_ids[coach_idx],
            })
            if resp.status_code in (200, 201):
                coach_name = evaluators[coach_idx]["name"]
                team_name = TEAMS[team_idx][0]
                print(f"  + {coach_name} -> {team_name}")

    # ========== ASSIGN PLAYERS TO TEAMS ==========
    print("\n--- ASSIGNING PLAYERS TO ROSTERS ---")
    # Distribute 25 players across teams (2-3 per team, focus on travel + rec)
    shuffled_players = list(player_ids)
    random.shuffle(shuffled_players)

    # Teams 0-4 are Rec, 5-8 are Travel, 9 is Academy
    assignments = [
        (0, shuffled_players[0:2]),   # U10 Coed A: 2 players
        (1, shuffled_players[2:4]),   # U10 Coed B: 2 players
        (2, shuffled_players[4:6]),   # U10 Girls A: 2 players
        (3, shuffled_players[6:8]),   # U12 Coed A: 2 players
        (4, shuffled_players[8:10]),  # U12 Coed B: 2 players
        (5, shuffled_players[10:13]), # U12 Blue: 3 players
        (6, shuffled_players[13:16]), # U12 Red: 3 players
        (7, shuffled_players[16:18]), # U12 White: 2 players
        (8, shuffled_players[18:20]), # U12 Select: 2 players
        (9, shuffled_players[20:23]), # U12 Academy: 3 players
    ]

    roster_count = 0
    for team_idx, p_ids in assignments:
        if team_idx >= len(team_ids):
            continue
        for pid in p_ids:
            resp = client.post(f"/api/teams/{team_ids[team_idx]}/roster", json={
                "player_id": pid,
                "jersey_number": random.randint(1, 99),
                "role": "player",
            })
            if resp.status_code in (200, 201):
                roster_count += 1
    print(f"  Assigned {roster_count} players across {len(assignments)} teams")

    # ========== SCHEDULE ==========
    print("\n--- SEEDING SCHEDULE ---")
    schedule_ids = []

    # Generate practices — Tuesdays and Thursdays for travel teams
    practice_teams = [
        (5, "Tuesday", field_ids[0] if field_ids else None),     # U12 Blue @ Mann
        (5, "Thursday", field_ids[3] if len(field_ids) > 3 else None),  # U12 Blue @ Fort Stevens
        (6, "Tuesday", field_ids[1] if len(field_ids) > 1 else None),   # U12 Red @ Jelleff
        (6, "Thursday", field_ids[4] if len(field_ids) > 4 else None),  # U12 Red @ Hardy
        (7, "Tuesday", field_ids[3] if len(field_ids) > 3 else None),   # U12 White @ Fort Stevens
        (7, "Thursday", field_ids[0] if field_ids else None),   # U12 White @ Mann
        (8, "Thursday", field_ids[1] if len(field_ids) > 1 else None),  # U12 Select @ Jelleff
        (9, "Monday", field_ids[4] if len(field_ids) > 4 else None),    # Academy @ Hardy
    ]

    # Generate 3 weeks of practices (April 21 - May 9)
    base_date = date(2026, 4, 20)  # Monday
    day_offsets = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5}
    practice_count = 0

    for week in range(3):
        week_start = base_date + timedelta(weeks=week)
        for team_idx, day_name, fid in practice_teams:
            if team_idx >= len(team_ids):
                continue
            offset = day_offsets.get(day_name, 1)
            practice_date = week_start + timedelta(days=offset)
            team_name = TEAMS[team_idx][0]

            # Past practices are completed, future are scheduled
            is_past = practice_date < date(2026, 4, 25)
            status = "completed" if is_past else "scheduled"

            start_dt = datetime.combine(practice_date, datetime.strptime("18:00", "%H:%M").time())
            end_dt = start_dt + timedelta(minutes=90)

            resp = client.post(f"/api/organizations/{org_id}/schedules", json={
                "season_id": season_id,
                "entry_type": "practice",
                "team_id": team_ids[team_idx],
                "field_id": fid,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "title": f"{team_name} Practice",
                "status": status,
            })
            if resp.status_code in (200, 201):
                entry = resp.json()
                schedule_ids.append({"id": entry["id"], "team_idx": team_idx, "status": status, "type": "practice"})
                practice_count += 1

    print(f"  + {practice_count} practices scheduled")

    # Generate 5 games (Saturdays)
    game_matchups = [
        (5, 6, date(2026, 4, 25), "09:00", field_ids[0] if field_ids else None, "scheduled"),
        (7, 8, date(2026, 4, 25), "10:30", field_ids[0] if field_ids else None, "scheduled"),
        (5, 7, date(2026, 5, 2), "09:00", field_ids[4] if len(field_ids) > 4 else None, "scheduled"),
        (6, 8, date(2026, 5, 2), "10:30", field_ids[4] if len(field_ids) > 4 else None, "scheduled"),
        # Cancelled game
        (5, 8, date(2026, 4, 19), "09:00", field_ids[1] if len(field_ids) > 1 else None, "cancelled"),
    ]

    game_count = 0
    for home_idx, away_idx, game_date, time_str, fid, status in game_matchups:
        if home_idx >= len(team_ids) or away_idx >= len(team_ids):
            continue
        home_name = TEAMS[home_idx][0]
        away_name = TEAMS[away_idx][0]
        start_dt = datetime.combine(game_date, datetime.strptime(time_str, "%H:%M").time())
        end_dt = start_dt + timedelta(minutes=90)

        entry_data = {
            "season_id": season_id,
            "entry_type": "game",
            "team_id": team_ids[home_idx],
            "opponent_team_id": team_ids[away_idx],
            "field_id": fid,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "title": f"{home_name} vs {away_name}",
            "status": status,
        }
        if status == "cancelled":
            entry_data["weather_status"] = "cancelled"
            entry_data["notes"] = "Cancelled due to severe weather warning"

        resp = client.post(f"/api/organizations/{org_id}/schedules", json=entry_data)
        if resp.status_code in (200, 201):
            entry = resp.json()
            schedule_ids.append({"id": entry["id"], "team_idx": home_idx, "status": status, "type": "game"})
            game_count += 1
            label = f"  + {home_name} vs {away_name} — {game_date} {time_str}"
            if status == "cancelled":
                label += " [CANCELLED - weather]"
            print(label)

    print(f"  Total: {practice_count} practices + {game_count} games = {practice_count + game_count} entries")

    # ========== ATTENDANCE ==========
    print("\n--- SEEDING ATTENDANCE ---")
    att_count = 0
    completed_entries = [s for s in schedule_ids if s["status"] == "completed"]

    for entry_info in completed_entries:
        team_idx = entry_info["team_idx"]
        entry_id = entry_info["id"]

        # Get the players assigned to this team
        team_assignment = None
        for t_idx, p_ids in assignments:
            if t_idx == team_idx:
                team_assignment = p_ids
                break

        if not team_assignment:
            continue

        records = []
        for pid in team_assignment:
            # 85% present, 10% absent, 5% late
            roll = random.random()
            if roll < 0.85:
                status = "present"
            elif roll < 0.95:
                status = "absent"
            else:
                status = "late"
            records.append({"player_id": pid, "status": status})

        if records:
            resp = client.post(f"/api/schedules/{entry_id}/attendance", json={"records": records})
            if resp.status_code in (200, 201):
                att_count += len(records)

    print(f"  Recorded {att_count} attendance entries for {len(completed_entries)} completed sessions")

    # ========== MESSAGES ==========
    print("\n--- SEEDING MESSAGES ---")
    # Find U12 Blue team id for targeted message
    u12_blue_id = team_ids[5] if len(team_ids) > 5 else None

    for msg_info in MESSAGES:
        now = datetime.utcnow()
        sent_at = (now - timedelta(days=msg_info["days_ago"])).isoformat()

        msg_data = {
            "subject": msg_info["subject"],
            "body": msg_info["body"],
            "audience_type": msg_info["audience_type"],
            "channel": msg_info["channel"],
        }

        if msg_info["audience_type"] == "team" and u12_blue_id:
            msg_data["audience_filter"] = {"team_id": u12_blue_id}

        resp = client.post(f"/api/organizations/{org_id}/messages", json=msg_data)
        if resp.status_code in (200, 201):
            msg = resp.json()
            msg_id = msg["id"]

            # Mark as sent
            if msg_info["status"] == "sent":
                resp2 = client.post(f"/api/organizations/{org_id}/messages/{msg_id}/send")
                if resp2.status_code in (200, 201):
                    result = resp2.json()
                    print(f"  + \"{msg_info['subject'][:50]}...\" — sent to {result.get('recipient_count', 0)} recipients")
                else:
                    print(f"  + \"{msg_info['subject'][:50]}...\" — saved as draft (send returned {resp2.status_code})")
            else:
                print(f"  + \"{msg_info['subject'][:50]}...\" — draft")
        else:
            print(f"  ERROR: {resp.status_code} {resp.text[:100]}")

    # ========== COACH CERTIFICATIONS ==========
    print("\n--- UPDATING COACH CERTIFICATIONS ---")
    for coach_name, cert_info in COACH_CERTS.items():
        evaluator = evaluator_map.get(coach_name)
        if not evaluator:
            print(f"  SKIP: {coach_name} not found in evaluators")
            continue

        eval_id = evaluator["id"]

        # Update certifications
        resp = client.patch(f"/api/evaluators/{eval_id}/certifications", json={
            "certifications": cert_info["certifications"],
        })
        if resp.status_code in (200, 201):
            cert_names = [c["name"] for c in cert_info["certifications"]]
            expiring = [c for c in cert_info["certifications"]
                       if datetime.fromisoformat(c["expiry"]) < datetime.now() + timedelta(days=30)]
            status = ""
            if expiring:
                status = f" ** EXPIRING: {', '.join(c['name'] + ' on ' + c['expiry'] for c in expiring)} **"
            print(f"  + {coach_name}: {', '.join(cert_names)}{status}")

        # Update availability
        resp = client.patch(f"/api/evaluators/{eval_id}/availability", json={
            "availability": {
                "mon": ["16:00-20:00"],
                "tue": ["16:00-20:00"],
                "wed": ["16:00-20:00"],
                "thu": ["16:00-20:00"],
                "fri": ["16:00-19:00"],
                "sat": ["08:00-16:00"],
            },
        })

    # ========== DOCUMENTS ==========
    print("\n--- SEEDING DOCUMENTS ---")
    # Find Marcus Johnson and Sofia Rodriguez
    marcus = next((p for p in players if p["first_name"] == "Marcus" and p["last_name"] == "Johnson"), None)
    sofia = next((p for p in players if p["first_name"] == "Sofia" and p["last_name"] == "Rodriguez"), None)

    if marcus:
        # Waiver for Marcus
        waiver_content = base64.b64encode(b"WAIVER AND RELEASE OF LIABILITY\n\nParticipant: Marcus Johnson\nParent/Guardian: Sarah Johnson\nSigned: 2026-04-10\n\nI hereby release DC Soccer Club from liability...").decode()
        resp = client.post(f"/api/players/{marcus['id']}/documents", json={
            "document_type": "waiver",
            "file_name": "waiver_marcus_johnson.pdf",
            "file_data": waiver_content,
            "mime_type": "application/pdf",
            "uploaded_by": "Sarah Johnson",
            "expires_at": "2027-04-10T00:00:00",
        })
        if resp.status_code in (200, 201):
            doc = resp.json()
            # Verify it
            client.patch(f"/api/players/{marcus['id']}/documents/{doc['id']}/verify")
            print(f"  + Waiver for Marcus Johnson (verified)")

    if sofia:
        # Medical form for Sofia
        medical_content = base64.b64encode(b"MEDICAL RELEASE FORM\n\nPlayer: Sofia Rodriguez\nAllergies: None\nMedications: None\nEmergency Contact: Maria Rodriguez 202-555-0200\nPhysician: Dr. Smith\nDate: 2026-04-08").decode()
        resp = client.post(f"/api/players/{sofia['id']}/documents", json={
            "document_type": "medical",
            "file_name": "medical_sofia_rodriguez.pdf",
            "file_data": medical_content,
            "mime_type": "application/pdf",
            "uploaded_by": "Maria Rodriguez",
            "expires_at": "2027-04-08T00:00:00",
        })
        if resp.status_code in (200, 201):
            print(f"  + Medical form for Sofia Rodriguez")

    # Note about missing waivers
    players_with_docs = set()
    if marcus:
        players_with_docs.add(marcus["id"])
    missing_count = len(player_ids) - len(players_with_docs)
    print(f"  Note: {missing_count} of {len(player_ids)} players are MISSING waivers")

    # ========== SUMMARY ==========
    print("\n" + "=" * 60)
    print("OPERATIONS DATA SEEDED!")
    print(f"  Organization: {org['name']}")
    print(f"  Fields: {len(field_ids)}")
    print(f"  Season: Spring 2026 (active)")
    print(f"  Programs: {len(program_ids)}")
    print(f"  Teams: {len(team_ids)}")
    print(f"  Players rostered: {roster_count}")
    print(f"  Schedule entries: {practice_count + game_count} ({practice_count} practices, {game_count} games)")
    print(f"  Attendance records: {att_count}")
    print(f"  Messages: {len(MESSAGES)}")
    print(f"  Coach certs updated: {len(COACH_CERTS)}")
    print(f"  Documents: 2 uploaded, {missing_count} missing waivers")
    print(f"\n  Admin: {args.api_url}/admin")
    print("=" * 60)


if __name__ == "__main__":
    main()
