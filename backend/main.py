from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import requests
import uuid
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase credentials")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartTimerSchema(BaseModel):
    memberId: str
    cardId: str
    memberName: str

class StopTimerSchema(BaseModel):
    memberId: str
    cardId: str

class SettingsSchema(BaseModel):
    cardId: str
    timeLimit: str

class UpdateLogSchema(BaseModel):
    duration: int

def calculate_duration(start_time_iso: str) -> int:
    try:
        start = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        end = datetime.now(start.tzinfo)
        diff = (end - start).total_seconds()
        return max(int(diff), 0)
    except Exception:
        return 0

def send_log_to_n8n(payload: dict):
    if not N8N_WEBHOOK_URL:
        return
    try:
        requests.post(N8N_WEBHOOK_URL, json=payload, timeout=3)
    except Exception:
        pass

@app.get("/timer/status/bulk")
def get_bulk_status(memberId: str, cardIds: str, _t: str = None):
    if not cardIds:
        return {}

    card_ids = list(set(cardIds.split(",")))

    res_active = supabase.table("active_timers").select("*").in_("card_id", card_ids).execute()
    active_by_card = {t["card_id"]: t for t in res_active.data}

    res_user = supabase.table("active_timers").select("*").eq("member_id", memberId).execute()
    user_timer = res_user.data[0] if res_user.data else None

    past_seconds = {}
    for i in range(0, len(card_ids), 20):
        chunk = card_ids[i:i + 20]
        res_logs = supabase.table("time_logs").select("card_id,duration").in_("card_id", chunk).execute()
        for log in res_logs.data:
            cid = log["card_id"]
            past_seconds[cid] = past_seconds.get(cid, 0) + log["duration"]

    response = {}

    for card_id in card_ids:
        card_timer = active_by_card.get(card_id)
        is_running_here = False
        is_other_timer_running = False

        if user_timer:
            if user_timer["card_id"] == card_id:
                is_running_here = True
            else:
                is_other_timer_running = True

        response[card_id] = {
            "isRunningHere": is_running_here,
            "isOtherTimerRunning": is_other_timer_running,
            "activeTimerData": {
                "memberId": card_timer["member_id"],
                "memberName": card_timer["member_name"],
                "startTime": card_timer["start_time"]
            } if card_timer else None,
            "totalPastSeconds": past_seconds.get(card_id, 0)
        }

    return response

@app.get("/timer/status/{member_id}/{card_id}")
def deprecated_status():
    raise HTTPException(status_code=410)

@app.post("/timer/start")
def start_timer(body: StartTimerSchema):
    now = datetime.now()

    res_user = supabase.table("active_timers").select("*").eq("member_id", body.memberId).execute()

    if res_user.data:
        previous = res_user.data[0]
        duration = calculate_duration(previous["start_time"])

        log = {
            "id": str(uuid.uuid4()),
            "card_id": previous["card_id"],
            "member_id": body.memberId,
            "member_name": previous["member_name"],
            "duration": duration,
            "date": now.isoformat(),
            "action": "auto_stop_by_new_timer"
        }

        supabase.table("time_logs").insert(log).execute()
        supabase.table("active_timers").delete().eq("member_id", body.memberId).execute()

        send_log_to_n8n({
            "id": log["id"],
            "cardId": log["card_id"],
            "duration": duration,
            "memberName": log["member_name"]
        })

    supabase.table("active_timers").insert({
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": body.memberName,
        "start_time": now.isoformat()
    }).execute()

    return {"message": "Timer iniciado"}

@app.post("/timer/stop")
def stop_timer(body: StopTimerSchema):
    res = supabase.table("active_timers").select("*").eq("card_id", body.cardId).eq("member_id", body.memberId).execute()

    if not res.data:
        raise HTTPException(status_code=400)

    timer = res.data[0]
    duration = calculate_duration(timer["start_time"])

    log = {
        "id": str(uuid.uuid4()),
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": timer["member_name"],
        "duration": duration,
        "date": datetime.now().isoformat(),
        "action": "manual_stop"
    }

    supabase.table("time_logs").insert(log).execute()
    supabase.table("active_timers").delete().eq("card_id", body.cardId).eq("member_id", body.memberId).execute()

    send_log_to_n8n({
        "id": log["id"],
        "cardId": log["card_id"],
        "duration": duration,
        "memberName": log["member_name"]
    })

    return {"message": "Timer parado", "newTotalSeconds": duration}

@app.post("/timer/settings")
def save_settings(settings: SettingsSchema):
    supabase.table("card_settings").upsert({
        "card_id": settings.cardId,
        "time_limit": settings.timeLimit
    }).execute()

    return {"message": "Configuração salva"}

@app.get("/timer/logs/{card_id}")
def get_logs(card_id: str):
    logs = supabase.table("time_logs").select("*").eq("card_id", card_id).execute().data
    settings = supabase.table("card_settings").select("*").eq("card_id", card_id).execute().data

    return {
        "logs": logs,
        "timeLimit": settings[0]["time_limit"] if settings else ""
    }
