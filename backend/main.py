from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from contextlib import asynccontextmanager
import requests
import asyncio
import uuid
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Chaves do Supabase não encontradas no .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

N8N_WEBHOOK_URL = 'http://localhost:5678/webhook-test/bfc8317c-a794-4364-81e2-2ca172cfb558'

last_auto_stopped_card = None

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

def calculate_duration(start_time_iso):
    try:
        start = datetime.fromisoformat(start_time_iso.replace('Z', '+00:00'))
        end = datetime.now()
        if start.tzinfo:
            end = end.replace(tzinfo=start.tzinfo)
        diff = (end - start).total_seconds()
        return int(diff) if diff > 0 else 0
    except Exception:
        return 0

def send_log_to_n8n(log_data):
    try:
        requests.post(N8N_WEBHOOK_URL, json=log_data)
    except Exception:
        pass

async def check_timers_periodically():
    while True:
        try:
            response = supabase.table("active_timers").select("*").execute()
            active_timers = response.data

            now_str = datetime.now().strftime("%H:%M")

            for timer in active_timers:
                card_id = timer["card_id"]
                
                settings_res = supabase.table("card_settings").select("time_limit").eq("card_id", card_id).execute()
                
                limit = None
                if settings_res.data and len(settings_res.data) > 0:
                    limit = settings_res.data[0]["time_limit"]
                
                if limit:
                    if now_str >= limit:
                        duration = calculate_duration(timer["start_time"])
                        
                        new_log = {
                            "id": str(uuid.uuid4()),
                            "card_id": card_id,
                            "member_id": timer["member_id"],
                            "member_name": timer["member_name"],
                            "duration": duration,
                            "date": datetime.now().isoformat(),
                            "action": "auto_stop_limit_reached"
                        }
                        
                        supabase.table("time_logs").insert(new_log).execute()
                        supabase.table("active_timers").delete().eq("card_id", card_id).eq("member_id", timer["member_id"]).execute()
                        
                        log_for_n8n = {
                            "id": new_log["id"],
                            "cardId": new_log["card_id"],
                            "memberId": new_log["member_id"],
                            "memberName": new_log["member_name"],
                            "duration": duration,
                            "date": new_log["date"],
                            "action": new_log["action"]
                        }
                        send_log_to_n8n(log_for_n8n)

                        global last_auto_stopped_card
                        last_auto_stopped_card = card_id

            await asyncio.sleep(60)
            
        except Exception:
            await asyncio.sleep(60)

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

@app.post("/timer/clear_refresh_flag/{card_id}")
def clear_refresh_flag(card_id: str):
    global last_auto_stopped_card
    if last_auto_stopped_card == card_id:
        last_auto_stopped_card = None
        return {"message": "Refresh flag cleared."}
    return {"message": "No action needed."}

@app.put("/timer/logs/{log_id}")
def update_log(log_id: str, body: UpdateLogSchema):
    res = supabase.table("time_logs").update({"duration": body.duration}).eq("id", log_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Log não encontrado")
    return {"message": "Log atualizado!", "log": res.data[0]}

@app.delete("/timer/logs/{log_id}")
def delete_log(log_id: str):
    supabase.table("time_logs").delete().eq("id", log_id).execute()
    return {"message": "Log excluído com sucesso!"}

@app.get("/timer/status/{member_id}/{card_id}")
def get_timer_status(member_id: str, card_id: str):
    res_card = supabase.table("active_timers").select("*").eq("card_id", card_id).execute()
    card_timer = res_card.data[0] if res_card.data else None

    res_user = supabase.table("active_timers").select("*").eq("member_id", member_id).execute()
    user_timer = res_user.data[0] if res_user.data else None
    
    is_running_here = False
    is_other_timer_running = False

    if user_timer:
        if str(user_timer["card_id"]) == str(card_id):
            is_running_here = True 
        else:
            is_other_timer_running = True

    res_logs = supabase.table("time_logs").select("duration").eq("card_id", card_id).execute()
    total_past_seconds = sum(log["duration"] for log in res_logs.data)

    active_timer_data = None
    if card_timer:
        active_timer_data = {
            "cardId": card_timer["card_id"],
            "memberId": card_timer["member_id"],
            "memberName": card_timer["member_name"],
            "startTime": card_timer["start_time"]
        }

    global last_auto_stopped_card
    should_refresh = False
    if last_auto_stopped_card == card_id:
        should_refresh = True

    return {
        "isRunningHere": is_running_here,         
        "isOtherTimerRunning": is_other_timer_running,
        "activeTimerData": active_timer_data,          
        "totalPastSeconds": total_past_seconds,
        "forceRefresh": should_refresh
    }

@app.post("/timer/start")
def start_timer(body: StartTimerSchema):
    now = datetime.now()
    stopped_previous = False
    
    res_user = supabase.table("active_timers").select("*").eq("member_id", body.memberId).execute()
    
    if res_user.data:
        previous_timer = res_user.data[0]
        duration_prev = calculate_duration(previous_timer["start_time"])
        
        prev_log = {
            "id": str(uuid.uuid4()),
            "card_id": previous_timer["card_id"],
            "member_id": body.memberId,
            "member_name": previous_timer["member_name"],
            "duration": duration_prev,
            "date": now.isoformat(),
            "action": "auto_stop_by_new_timer"
        }
        supabase.table("time_logs").insert(prev_log).execute()
        supabase.table("active_timers").delete().eq("card_id", previous_timer["card_id"]).eq("member_id", body.memberId).execute()
        
        send_log_to_n8n({
            "id": prev_log["id"],
            "cardId": prev_log["card_id"],
            "duration": duration_prev,
            "memberName": prev_log["member_name"]
        })
        stopped_previous = True

    new_timer = {
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": body.memberName,
        "start_time": now.isoformat()
    }
    supabase.table("active_timers").insert(new_timer).execute()
    
    return {"message": "Timer iniciado!", "stoppedPrevious": stopped_previous}

@app.post("/timer/stop")
def stop_timer(body: StopTimerSchema):
    res = supabase.table("active_timers").select("*").eq("card_id", body.cardId).eq("member_id", body.memberId).execute()
    
    if not res.data:
        raise HTTPException(status_code=400, detail="Timer não encontrado")
    
    stopped_timer = res.data[0]
    duration_seconds = calculate_duration(stopped_timer["start_time"])
    
    new_log = {
        "id": str(uuid.uuid4()),
        "card_id": body.cardId,
        "member_id": body.memberId,
        "member_name": stopped_timer["member_name"],
        "duration": duration_seconds,
        "date": datetime.now().isoformat(),
        "action": "manual_stop"
    }
    
    supabase.table("time_logs").insert(new_log).execute()
    supabase.table("active_timers").delete().eq("card_id", body.cardId).eq("member_id", body.memberId).execute()

    send_log_to_n8n({
        "id": new_log["id"],
        "cardId": new_log["card_id"],
        "duration": duration_seconds,
        "memberName": new_log["member_name"]
    })
    
    return {"message": "Timer parado!", "newTotalSeconds": duration_seconds}

@app.post("/timer/settings")
def save_settings(settings: SettingsSchema):
    data = {
        "card_id": settings.cardId,
        "time_limit": settings.timeLimit
    }
    supabase.table("card_settings").upsert(data).execute()
    return {"message": "Configuração salva com sucesso!"}

@app.get("/timer/logs/{card_id}")
def get_card_logs(card_id: str):
    res_logs = supabase.table("time_logs").select("*").eq("card_id", card_id).execute()
    logs_db = res_logs.data

    res_settings = supabase.table("card_settings").select("*").eq("card_id", card_id).execute()
    saved_limit = res_settings.data[0]["time_limit"] if res_settings.data else ""

    formatted_logs = []
    for log in logs_db:
        formatted_logs.append({
            "id": log["id"],
            "cardId": log["card_id"],
            "memberId": log["member_id"],
            "memberName": log["member_name"],
            "duration": log["duration"],
            "date": log["date"],
            "action": log["action"]
        })

    return {
        "logs": formatted_logs,
        "timeLimit": saved_limit
    }