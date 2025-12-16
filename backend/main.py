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

# Schemas
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

# Helpers
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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================================
#  NOVA ROTA OTIMIZADA (BULK) 🚀
# ======================================
@app.get("/timer/status/bulk")
def get_bulk_status(memberId: str, cardIds: str):
    if not cardIds:
        return {}
        
    card_ids = cardIds.split(",")

    # 1. Pega timers ativos desses cartões
    res_cards = supabase.table("active_timers").select("*").in_("card_id", card_ids).execute()
    active_by_card = {t["card_id"]: t for t in res_cards.data}

    # 2. Vê se o usuário atual está rodando algo
    res_user = supabase.table("active_timers").select("*").eq("member_id", memberId).execute()
    user_timer = res_user.data[0] if res_user.data else None

    # 3. Soma o tempo passado (histórico)
    res_logs = supabase.table("time_logs").select("card_id,duration").in_("card_id", card_ids).execute()
    past_seconds = {}
    for log in res_logs.data:
        c_id = log["card_id"]
        past_seconds[c_id] = past_seconds.get(c_id, 0) + log["duration"]

    response = {}

    for card_id in card_ids:
        card_timer = active_by_card.get(card_id)

        is_running_here = False
        is_other_timer_running = False

        if user_timer:
            if str(user_timer["card_id"]) == str(card_id):
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

# ======================================
#  ROTAS ANTIGAS (MANTIDAS)
# ======================================

@app.post("/timer/clear_refresh_flag/{card_id}")
def clear_refresh_flag(card_id: str):
    return {"message": "No action needed (Optimized Version)."}

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

# Mantive a rota individual para compatibilidade, caso precise
@app.get("/timer/status/{member_id}/{card_id}")
def get_timer_status(member_id: str, card_id: str):
    # Reutiliza a lógica do bulk para um só, ou mantém a antiga
    # Vou manter simplificado chamando a lógica nova se quiser, 
    # mas para garantir, deixamos o código antigo aqui se o front novo falhar.
    return get_bulk_status(member_id, card_id).get(card_id, {})

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