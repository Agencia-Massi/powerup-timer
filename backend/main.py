from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import uuid
import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartTimer(BaseModel):
    memberId: str
    cardId: str
    memberName: str

class StopTimer(BaseModel):
    memberId: str
    cardId: str

class UpdateLog(BaseModel):
    duration: int

class Settings(BaseModel):
    cardId: str
    timeLimit: str

def calculate_duration(start_iso):
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    now = datetime.now(start.tzinfo)
    diff = (now - start).total_seconds()
    return int(diff) if diff > 0 else 0

def send_to_n8n(payload):
    if not N8N_WEBHOOK_URL:
        return
    try:
        requests.post(N8N_WEBHOOK_URL, json=payload, timeout=2)
    except:
        pass

@app.get("/timer/status/bulk")
def bulk_status(memberId: str, cardIds: str):
    ids = cardIds.split(",")

    active = supabase.table("active_timers").select("*").in_("card_id", ids).execute().data
    logs = supabase.table("time_logs").select("card_id,duration").in_("card_id", ids).execute().data
    user_timer = supabase.table("active_timers").select("*").eq("member_id", memberId).execute().data

    active_map = {a["card_id"]: a for a in active}
    past = {}

    for log in logs:
        past[log["card_id"]] = past.get(log["card_id"], 0) + log["duration"]

    current_user_timer = user_timer[0] if user_timer else None

    response = {}

    for cid in ids:
        running_here = False
        running_other = False

        if current_user_timer:
            if current_user_timer["card_id"] == cid:
                running_here = True
            else:
                running_other = True

        timer = active_map.get(cid)

        response[cid] = {
            "isRunningHere": running_here,
            "isOtherTimerRunning": running_other,
            "activeTimerData": {
                "memberId": timer["member_id"],
                "memberName": timer["member_name"],
                "startTime": timer["start_time"]
            } if timer else None,
            "totalPastSeconds": past.get(cid, 0)
        }

    return response

@app.get("/timer/status/{member_id}/{card_id}")
def deprecated_status(member_id: str, card_id: str):
    return {}

@app.post("/timer/start")
def start_timer(body: StartTimer):
    now = datetime.now().isoformat()
    previous = supabase.table("active_timers").select("*").eq("member_id", body.memberId).execute().data

    if previous:
        prev = previous[0]
        duration = calculate_duration(prev["start_time"])
        log = {
            "id": str(uuid.uuid4()),
            "card_id": prev["card_id"],
            "member_id": prev["member_id"],
            "member_name": prev["member_name"],
            "duration": duration,
            "date": now,
            "action": "auto_stop"
        }
        supabase.table("time_logs").insert(log).execute()
        supabase.table("active_timers").delete().eq("member_id", body.memberId).execute()
        send_to_n8n(log)

    supabase.table("active_timers").insert({
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": body.memberName,
        "start_time": now
    }).execute()

    return {"ok": True}

@app.post("/timer/stop")
def stop_timer(body: StopTimer):
    active = supabase.table("active_timers").select("*").eq("card_id", body.cardId).eq("member_id", body.memberId).execute().data
    if not active:
        raise HTTPException(status_code=400)

    timer = active[0]
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
    send_to_n8n(log)

    return {"newTotalSeconds": duration}

@app.get("/timer/logs/{card_id}")
def logs(card_id: str):
    logs = supabase.table("time_logs").select("*").eq("card_id", card_id).execute().data
    settings = supabase.table("card_settings").select("*").eq("card_id", card_id).execute().data

    return {
        "logs": logs,
        "timeLimit": settings[0]["time_limit"] if settings else ""
    }

@app.put("/timer/logs/{log_id}")
def update_log(log_id: str, body: UpdateLog):
    supabase.table("time_logs").update({"duration": body.duration}).eq("id", log_id).execute()
    return {"ok": True}

@app.delete("/timer/logs/{log_id}")
def delete_log(log_id: str):
    supabase.table("time_logs").delete().eq("id", log_id).execute()
    return {"ok": True}

@app.post("/timer/settings")
def save_settings(body: Settings):
    supabase.table("card_settings").upsert({
        "card_id": body.cardId,
        "time_limit": body.timeLimit
    }).execute()
    return {"ok": True}
