from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import uuid
import os
import asyncio
from contextlib import asynccontextmanager
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Supabase credentials not found.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def now_utc():
    return datetime.now(timezone.utc)

def now_brazil():
    return datetime.now(timezone.utc) - timedelta(hours=3)

def calculate_duration(start_iso):
    try:
        if start_iso.endswith('Z'):
            start_iso = start_iso.replace('Z', '+00:00')
        start = datetime.fromisoformat(start_iso)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        now = now_utc()
        diff = (now - start).total_seconds()
        return int(diff) if diff > 0 else 0
    except Exception:
        return 0

async def check_timers_periodically():
    while True:
        try:
            current_time_br = now_brazil().strftime("%H:%M")
            
            active_response = supabase.table("active_timers").select("*").execute()
            active_timers = active_response.data

            if active_timers:
                active_card_ids = [t["card_id"] for t in active_timers]
                
                settings_response = supabase.table("card_settings").select("*").in_("card_id", active_card_ids).execute()
                settings_map = {s["card_id"]: s["time_limit"] for s in settings_response.data}

                for timer in active_timers:
                    card_id = timer["card_id"]
                    limit_time_str = settings_map.get(card_id)
                    
                    if limit_time_str:
                        if current_time_br >= limit_time_str:
                            duration = calculate_duration(timer["start_time"])

                            supabase.table("time_logs").insert({
                                "id": str(uuid.uuid4()),
                                "card_id": card_id,
                                "member_id": timer["member_id"],
                                "member_name": timer["member_name"],
                                "duration": duration,
                                "date": now_utc().isoformat(),
                                "action": "auto_stop_deadline"
                            }).execute()

                            supabase.table("active_timers").delete().eq("card_id", card_id).execute()
                            
                            supabase.table("card_settings").delete().eq("card_id", card_id).execute()

        except Exception as e:
            print(f"Error in background task: {e}")

        await asyncio.sleep(10)

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(check_timers_periodically())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

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

@app.get("/")
def read_root():
    return {"status": "Server running", "brazil_time": now_brazil().isoformat()}

@app.get("/timer/status/bulk")
def bulk_status(memberId: str, cardIds: str):
    ids = cardIds.split(",")
    active = supabase.table("active_timers").select("*").in_("card_id", ids).execute().data
    logs = supabase.table("time_logs").select("card_id,duration").in_("card_id", ids).execute().data
    settings = supabase.table("card_settings").select("*").in_("card_id", ids).execute().data
    user_timer = supabase.table("active_timers").select("*").eq("member_id", memberId).execute().data

    active_map = {a["card_id"]: a for a in active}
    past = {}

    for log in logs:
        past[log["card_id"]] = past.get(log["card_id"], 0) + log["duration"]

    current_user_timer = user_timer[0] if user_timer else None
    response = {}

    for cid in ids:
        timer = active_map.get(cid)
        running_here = current_user_timer and current_user_timer["card_id"] == cid
        running_other = current_user_timer and current_user_timer["card_id"] != cid
        response[cid] = {
            "isRunningHere": bool(running_here),
            "isOtherTimerRunning": bool(running_other),
            "activeTimerData": {
                "memberId": timer["member_id"],
                "memberName": timer["member_name"],
                "startTime": timer["start_time"]
            } if timer else None,
            "totalPastSeconds": past.get(cid, 0)
        }
    return response

@app.post("/timer/start")
def start_timer(body: StartTimer):
    now = now_utc().isoformat()
    previous = supabase.table("active_timers").select("*").eq("member_id", body.memberId).execute().data
    if previous:
        prev = previous[0]
        duration = calculate_duration(prev["start_time"])
        supabase.table("time_logs").insert({
            "id": str(uuid.uuid4()),
            "card_id": prev["card_id"],
            "member_id": prev["member_id"],
            "member_name": prev["member_name"],
            "duration": duration,
            "date": now,
            "action": "auto_stop_switch"
        }).execute()
        supabase.table("active_timers").delete().eq("member_id", body.memberId).execute()

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
    if not active: raise HTTPException(status_code=400)
    timer = active[0]
    duration = calculate_duration(timer["start_time"])
    supabase.table("time_logs").insert({
        "id": str(uuid.uuid4()),
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": timer["member_name"],
        "duration": duration,
        "date": now_utc().isoformat(),
        "action": "manual_stop"
    }).execute()
    supabase.table("active_timers").delete().eq("card_id", body.cardId).eq("member_id", body.memberId).execute()
    return {"ok": True}

@app.get("/timer/logs/{card_id}")
def get_logs(card_id: str):
    logs = supabase.table("time_logs").select("*").eq("card_id", card_id).order("date").execute().data
    settings = supabase.table("card_settings").select("*").eq("card_id", card_id).execute().data
    return {"logs": logs, "timeLimit": settings[0]["time_limit"] if settings else ""}

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
    supabase.table("card_settings").upsert({"card_id": body.cardId, "time_limit": body.timeLimit}).execute()
    return {"ok": True}