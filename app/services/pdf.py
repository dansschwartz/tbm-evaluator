import logging

logger = logging.getLogger(__name__)


def generate_report_html(
    player_name: str,
    age_group: str,
    event_name: str,
    event_date: str,
    org_name: str,
    org_logo: str,
    primary_color: str,
    overall_score: float,
    rank: int,
    total_players: int,
    skill_scores: dict,
    ai_summary: str,
    ai_strengths: list,
    ai_improvements: list,
    ai_recommendation: str,
) -> str:
    skill_bars = ""
    for skill_name, score in skill_scores.items():
        pct = (score / 5.0) * 100
        skill_bars += f"""
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-size:14px;color:#333;">{skill_name}</span>
                <span style="font-size:14px;font-weight:bold;color:{primary_color};">{score:.1f}</span>
            </div>
            <div style="background:#e9ecef;border-radius:4px;height:8px;overflow:hidden;">
                <div style="background:{primary_color};height:100%;width:{pct}%;border-radius:4px;"></div>
            </div>
        </div>"""

    strengths_html = "".join(f'<li style="margin-bottom:6px;color:#333;">{s}</li>' for s in ai_strengths)
    improvements_html = "".join(f'<li style="margin-bottom:6px;color:#333;">{s}</li>' for s in ai_improvements)

    logo_html = f'<img src="{org_logo}" alt="{org_name}" style="height:50px;margin-bottom:10px;">' if org_logo else ""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Player Report - {player_name}</title>
<style>
    @media print {{ body {{ margin: 0; }} .no-print {{ display: none; }} }}
    body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #333; }}
</style>
</head>
<body>
<div style="max-width:700px;margin:0 auto;background:white;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <div style="background:{primary_color};color:white;padding:30px;text-align:center;">
        {logo_html}
        <h1 style="margin:0;font-size:22px;">{org_name}</h1>
        <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Player Evaluation Report</p>
    </div>

    <div style="padding:30px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <div>
                <h2 style="margin:0;color:#333;font-size:24px;">{player_name}</h2>
                <p style="margin:4px 0 0;color:#666;">{age_group or ''} &bull; {event_name} &bull; {event_date or ''}</p>
            </div>
            <div style="text-align:center;background:#f8f9fa;border-radius:12px;padding:16px 24px;">
                <div style="font-size:36px;font-weight:bold;color:{primary_color};">{overall_score:.1f}</div>
                <div style="font-size:12px;color:#666;">Overall Score</div>
                <div style="font-size:12px;color:#999;">Ranked {rank} of {total_players}</div>
            </div>
        </div>

        <div style="margin-bottom:30px;">
            <h3 style="color:{primary_color};border-bottom:2px solid {primary_color};padding-bottom:8px;">Skill Scores</h3>
            {skill_bars}
        </div>

        <div style="margin-bottom:30px;">
            <h3 style="color:{primary_color};border-bottom:2px solid {primary_color};padding-bottom:8px;">Evaluation Summary</h3>
            <p style="line-height:1.6;color:#555;">{ai_summary}</p>
        </div>

        <div style="display:flex;gap:20px;margin-bottom:30px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <h3 style="color:#28a745;margin-bottom:12px;">&#9733; Strengths</h3>
                <ul style="padding-left:20px;margin:0;">{strengths_html}</ul>
            </div>
            <div style="flex:1;min-width:200px;">
                <h3 style="color:#ffc107;margin-bottom:12px;">&#9998; Areas for Growth</h3>
                <ul style="padding-left:20px;margin:0;">{improvements_html}</ul>
            </div>
        </div>

        <div style="background:#f0f7f7;border-left:4px solid {primary_color};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;">
            <h4 style="margin:0 0 8px;color:{primary_color};">Coach Recommendation</h4>
            <p style="margin:0;color:#555;line-height:1.5;">{ai_recommendation}</p>
        </div>
    </div>

    <div style="background:#f8f9fa;padding:16px;text-align:center;color:#999;font-size:11px;">
        Powered by TBM Evaluator &bull; Generated on {event_date or 'N/A'}
    </div>
</div>
</body>
</html>"""
