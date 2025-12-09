from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from contextlib import asynccontextmanager 
import requests
import asyncio

async def check_timers_periodically():
    print("Vigia iniciado: Monitorando limites de tempo...")
    while True:
        try:
            now_str = datetime.now().strftime("%H:%M")
            current_timers = active_timers.copy()

            for timer in current_timers:
                card_id = timer["cardId"]
                
                limit = card_settings.get(card_id)
                
                if limit:
                    if now_str >= limit:
                        print(f" LIMITE ATINGIDO! Parando timer do card {card_id}")
                        
                        duration = calculate_duration(timer["startTime"])
                        
                        new_log = {
                            "cardId": card_id,
                            "duration": duration,
                            "date": datetime.now().isoformat(),
                            "memberId": timer["memberId"],
                            "memberName": timer["memberName"],
                            "action": "auto_stop_limit_reached"
                        }
                        
                        time_logs.append(new_log)
                        send_log_to_n8n(new_log)
                        
                    
                        if timer in active_timers:
                            active_timers.remove(timer)

            
            await asyncio.sleep(60)
            
        except Exception as e:
            print(f"Erro no Vigia: {e}")
            await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(check_timers_periodically())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

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
card_settings = {} 


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
    return {"message": "Timer iniciado!", "stoppedPrevious": stopped_previous}


@app.post("/timer/stop")
def stop_timer(body: StopTimerSchema):
    index = next((i for i, t in enumerate(active_timers) 
                  if str(t["memberId"]) == str(body.memberId) and str(t["cardId"]) == str(body.cardId)), -1)
    
    if index == -1:
        raise HTTPException(status_code=400, detail="Timer não encontrado")
    
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
    
    return {"message": "Timer parado!", "newTotalSeconds": duration_seconds}



@app.post("/timer/settings")
def save_settings(settings: SettingsSchema):
    card_settings[settings.cardId] = settings.timeLimit
    print(f"Configuração salva para o card {settings.cardId}: {settings.timeLimit}")
    return {"message": "Configuração salva com sucesso!"}



@app.get("/timer/logs/{card_id}")
def get_card_logs(card_id: str):
    logs = [log for log in time_logs if str(log["cardId"]) == str(card_id)]
    saved_limit = card_settings.get(card_id, "")
    return {
        "logs": logs,
        "timeLimit": saved_limit
    }