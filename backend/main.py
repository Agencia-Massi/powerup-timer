from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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

def now_utc():
    return datetime.now(timezone.utc)

def calculate_duration(start_iso):
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    now = now_utc()
    diff = (now - start).total_seconds()
    return int(diff) if diff > 0 else 0

@app.get("/timer/status/bulk")
def bulk_status(memberId: str, cardIds: str):
    ids = cardIds.split(",")

    active = supabase.table("active_timers").select("*").in_("card_id", ids).execute().data
    logs = supabase.table("time_logs").select("card_id,duration").in_("card_id", ids).execute().data
    settings = supabase.table("card_settings").select("*").in_("card_id", ids).execute().data
    user_timer = supabase.table("active_timers").select("*").eq("member_id", memberId).execute().data

    active_map = {a["card_id"]: a for a in active}
    settings_map = {s["card_id"]: s["time_limit"] for s in settings}
    past = {}

    for log in logs:
        past[log["card_id"]] = past.get(log["card_id"], 0) + log["duration"]

    current_user_timer = user_timer[0] if user_timer else None
    response = {}

    for cid in ids:
        timer = active_map.get(cid)
        running_here = current_user_timer and current_user_timer["card_id"] == cid
        running_other = current_user_timer and current_user_timer["card_id"] != cid

        # --- A CORREÇÃO ESTÁ NESTE BLOCO ---
        if timer and settings_map.get(cid):
            try:
                # Divide pelo : e converte para lista de inteiros
                time_parts = list(map(int, settings_map[cid].split(":")))
                
                # Se tiver 3 partes (H:M:S), usa as 3. Se tiver 2 (H:M), assume 0 segundos.
                if len(time_parts) == 3:
                    h, m, s = time_parts
                elif len(time_parts) == 2:
                    h, m = time_parts
                    s = 0
                else:
                    h, m, s = 0, 0, 0 # Fallback de segurança

                limit_seconds = h * 3600 + m * 60 + s
                elapsed = calculate_duration(timer["start_time"])
                total = past.get(cid, 0) + elapsed

                if total >= limit_seconds:
                    # Registra o log final
                    supabase.table("time_logs").insert({
                        "id": str(uuid.uuid4()),
                        "card_id": cid,
                        "member_id": timer["member_id"],
                        "member_name": timer["member_name"],
                        "duration": elapsed,
                        "date": now_utc().isoformat(),
                        "action": "limit_stop"
                    }).execute()

                    # Deleta o timer ativo
                    supabase.table("active_timers").delete().eq("card_id", cid).execute()
                    
                    # Importante: Anula a variável timer para o Frontend saber que parou AGORA
                    timer = None 
            except Exception as e:
                print(f"Erro ao verificar limite para o card {cid}: {e}")
        # -----------------------------------

        response[cid] = {
            "isRunningHere": bool(running_here) and (timer is not None), # Garante que se deletou acima, retorna falso
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
            "action": "auto_stop"
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
    if not active:
        raise HTTPException(status_code=400)

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
