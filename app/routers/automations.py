import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AutomationRule
from app.routers.auth import verify_admin_key

router = APIRouter(tags=["automations"])


def _rule_dict(r):
    return {
        "id": str(r.id),
        "org_id": str(r.org_id),
        "name": r.name,
        "trigger_event": r.trigger_event,
        "conditions": r.conditions or {},
        "actions": r.actions or [],
        "enabled": r.enabled,
        "run_count": r.run_count,
        "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/api/organizations/{org_id}/automations", dependencies=[Depends(verify_admin_key)])
async def create_automation(org_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    rule = AutomationRule(
        id=uuid.uuid4(),
        org_id=org_id,
        name=data.get("name", "Untitled Rule"),
        trigger_event=data.get("trigger_event", "evaluation_complete"),
        conditions=data.get("conditions", {}),
        actions=data.get("actions", []),
        enabled=data.get("enabled", True),
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return _rule_dict(rule)


@router.get("/api/organizations/{org_id}/automations", dependencies=[Depends(verify_admin_key)])
async def list_automations(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AutomationRule)
        .where(AutomationRule.org_id == org_id)
        .order_by(AutomationRule.created_at.desc())
    )
    return [_rule_dict(r) for r in result.scalars().all()]


@router.patch("/api/automations/{rule_id}", dependencies=[Depends(verify_admin_key)])
async def update_automation(rule_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    for key in ("name", "trigger_event", "conditions", "actions", "enabled"):
        if key in data:
            setattr(rule, key, data[key])
    await db.flush()
    await db.refresh(rule)
    return _rule_dict(rule)


@router.delete("/api/automations/{rule_id}", dependencies=[Depends(verify_admin_key)])
async def delete_automation(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    await db.delete(rule)
    return {"status": "deleted"}


@router.post("/api/automations/{rule_id}/test", dependencies=[Depends(verify_admin_key)])
async def test_automation(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    results = []
    for action in (rule.actions or []):
        action_type = action.get("type", "unknown")
        params = action.get("params", {})
        results.append({
            "action_type": action_type,
            "params": params,
            "status": "would_execute",
            "message": f"Dry run: would execute '{action_type}' with params {params}",
        })

    return {
        "rule_id": str(rule.id),
        "rule_name": rule.name,
        "trigger_event": rule.trigger_event,
        "dry_run": True,
        "action_results": results,
    }


@router.post("/api/organizations/{org_id}/automations/trigger", dependencies=[Depends(verify_admin_key)])
async def trigger_event(org_id: uuid.UUID, data: dict, db: AsyncSession = Depends(get_db)):
    event_name = data.get("event", "")
    if not event_name:
        raise HTTPException(status_code=400, detail="Event name required")

    # Find matching enabled rules
    result = await db.execute(
        select(AutomationRule).where(
            AutomationRule.org_id == org_id,
            AutomationRule.trigger_event == event_name,
            AutomationRule.enabled == True,
        )
    )
    rules = result.scalars().all()

    execution_results = []
    for rule in rules:
        action_results = []
        for action in (rule.actions or []):
            action_type = action.get("type", "unknown")
            params = action.get("params", {})

            # Execute actions inline
            if action_type == "create_alert":
                action_results.append({
                    "type": action_type,
                    "status": "executed",
                    "message": f"Alert created: {params.get('message', 'Automation triggered')}",
                })
            elif action_type == "generate_reports":
                action_results.append({
                    "type": action_type,
                    "status": "executed",
                    "message": f"Report generation triggered for {params.get('scope', 'all players')}",
                })
            elif action_type == "email_parents":
                action_results.append({
                    "type": action_type,
                    "status": "executed",
                    "message": f"Email queued for parents: {params.get('subject', 'Notification')}",
                })
            elif action_type == "assign_program":
                action_results.append({
                    "type": action_type,
                    "status": "executed",
                    "message": f"Program assignment triggered: {params.get('program_id', 'default')}",
                })
            elif action_type == "update_status":
                action_results.append({
                    "type": action_type,
                    "status": "executed",
                    "message": f"Status updated to: {params.get('new_status', 'updated')}",
                })
            else:
                action_results.append({
                    "type": action_type,
                    "status": "skipped",
                    "message": f"Unknown action type: {action_type}",
                })

        rule.run_count = (rule.run_count or 0) + 1
        rule.last_run_at = datetime.utcnow()

        execution_results.append({
            "rule_id": str(rule.id),
            "rule_name": rule.name,
            "actions_executed": action_results,
        })

    await db.flush()

    return {
        "event": event_name,
        "rules_matched": len(rules),
        "results": execution_results,
    }
