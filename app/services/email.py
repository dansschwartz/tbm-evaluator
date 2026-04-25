import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    if not settings.smtp_host:
        logger.warning(f"SMTP not configured — dry run. Would send to {to_email}: {subject}")
        return True  # Dry-run mode: log and report success so messages get marked sent

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def build_report_email(
    player_name: str,
    event_name: str,
    org_name: str,
    report_url: str,
    overall_score: float,
    rank: int,
    total_players: int,
    ai_summary: str,
    primary_color: str = "#09A1A1",
) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:{primary_color};color:white;padding:30px;text-align:center;">
        <h1 style="margin:0;font-size:24px;">{org_name}</h1>
        <p style="margin:8px 0 0;opacity:0.9;">Player Evaluation Report Card</p>
    </div>
    <div style="padding:30px;">
        <h2 style="color:#333;margin-top:0;">Hi! Here's the report for {player_name}</h2>
        <p style="color:#666;line-height:1.6;"><strong>Event:</strong> {event_name}</p>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
            <div style="font-size:36px;font-weight:bold;color:{primary_color};">{overall_score:.1f}</div>
            <div style="color:#666;margin-top:4px;">Overall Score</div>
            <div style="color:#999;margin-top:4px;">Ranked {rank} of {total_players} players</div>
        </div>
        <p style="color:#666;line-height:1.6;">{ai_summary}</p>
        <div style="text-align:center;margin:30px 0;">
            <a href="{report_url}" style="background:{primary_color};color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Full Report Card</a>
        </div>
    </div>
    <div style="background:#f8f9fa;padding:20px;text-align:center;color:#999;font-size:12px;">
        Powered by TBM Evaluator
    </div>
</div>
</body>
</html>"""
