from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import requests
import math

app = FastAPI()

N8N_WEBHOOK_URL = 'http://localhost:5678/webhook-test/bfc8317c-a794-4364-81e2-2ca172cfb558'

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


active_timers = []  
time_logs = []    

class StartTimerSchema(BaseModel):
    memberId: str
    cardId: str
    memberName: str

class StopTimerSchema(BaseModel):
    memberId: str
    cardId: str


def calculate_duration(start_time_iso):
    start = datetime.fromisoformat(start_time_iso.replace('Z', '+00:00'))
    end = datetime.now()
    diff = (end - start.replace(tzinfo=None)).total_seconds()
    return int(diff) if diff > 0 else 0

def send_log_to_n8n(log_data):
    print(f"Enviando log para n8n: {log_data}")
    try:
        requests.post(N8N_WEBHOOK_URL, json=log_data)
    except Exception as e:
        print(f"Erro ao enviar para n8n: {e}")


@app.get("/timer/status/{member_id}/{card_id}")
def get_timer_status(member_id: str, card_id: str):

    active_timer = next((t for t in active_timers if str(t["memberId"]) == str(member_id)), None)

    is_running_here = False
    is_other_timer_running = False

    if active_timer:
        if str(active_timer["cardId"]) == str(card_id):
            is_running_here = True
        else:
            is_other_timer_running = True

    card_logs = [log for log in time_logs if str(log["cardId"]) == str(card_id)]
    

    total_past_seconds = sum(log["duration"] for log in card_logs)

    return {
        "isRunningHere": is_running_here,
        "isOtherTimerRunning": is_other_timer_running,
        "activeTimerData": active_timer,
        "totalPastSeconds": total_past_seconds
    }

@app.post("/timer/start")
def start_timer(body: StartTimerSchema):
    now = datetime.now()
    stopped_previous = False

    existing_index = next((i for i, t in enumerate(active_timers) if str(t["memberId"]) == str(body.memberId)), -1)

    if existing_index != -1:
        previous_timer = active_timers.pop(existing_index) 
        duration_prev = calculate_duration(previous_timer["startTime"])
        
        previous_log = {
            "cardId": previous_timer["cardId"],
            "duration": duration_prev,
            "date": now.isoformat(),
            "memberId": body.memberId,
            "memberName": previous_timer["memberName"],
            "action": "auto_stop_by_new_timer"
        }
        
        time_logs.append(previous_log)
        send_log_to_n8n(previous_log)
        stopped_previous = True

    new_timer = {
        "cardId": body.cardId,
        "memberId": body.memberId,
        "memberName": body.memberName,
        "startTime": now.isoformat()
    }
    
    active_timers.append(new_timer)
    
    print(f"Timer INICIADO para {body.memberName} no card {body.cardId}")

    return {
        "message": "Timer iniciado!",
        "startTime": new_timer["startTime"],
        "stoppedPrevious": stopped_previous
    }

@app.post("/timer/stop")
def stop_timer(body: StopTimerSchema):
    index = next((i for i, t in enumerate(active_timers) 
                  if str(t["memberId"]) == str(body.memberId) and str(t["cardId"]) == str(body.cardId)), -1)
    
    if index == -1:
        raise HTTPException(status_code=400, detail="Timer não encontrado ou já parado.")
    
    stopped_timer = active_timers.pop(index) 
    duration_seconds = calculate_duration(stopped_timer["startTime"])
    
    new_log = {
        "cardId": body.cardId,
        "duration": duration_seconds,
        "date": datetime.now().isoformat(),
        "memberId": body.memberId,
        "memberName": stopped_timer["memberName"],
        "action": "manual_stop"
    }

    time_logs.append(new_log)
    send_log_to_n8n(new_log)
    
    print(f"Timer PARADO. Duração: {duration_seconds}s")

    return {
        "message": "Timer parado!",
        "newTotalSeconds": duration_seconds
    }

