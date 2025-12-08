const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook-test/bfc8317c-a794-4364-81e2-2ca172cfb558';

app.use(cors()); 
app.use(bodyParser.json()); 

let activeTimers = []; 
let timeLogs = [];     

function calculateDuration(startTime) {
    const start = new Date(startTime);
    const endTime = new Date();
    const diff = Math.round((endTime - start) / 1000);
    return diff > 0 ? diff : 0;
}

function sendLogToN8N(logData) {
    if (typeof fetch !== 'undefined') {
        fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify(logData),
            headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error(err));
    }
}

app.get('/timer/status/:memberId/:cardId', (req, res) => {
    const { memberId, cardId } = req.params;
    
    const activeTimer = activeTimers.find(t => String(t.memberId) === String(memberId));

    let isRunningHere = false;
    let isOtherTimerRunning = false;

    if (activeTimer) {
        if (String(activeTimer.cardId) === String(cardId)) {
            isRunningHere = true;
        } else {
            isOtherTimerRunning = true; 
        }
    }

    res.json({
        isRunningHere,
        isOtherTimerRunning,
        activeTimerData: activeTimer || null
    });
});

app.post('/timer/start', (req, res) => {
    const { memberId, cardId, memberName } = req.body;
    const now = new Date();
    
    let stoppedPrevious = false;
    
    const index = activeTimers.findIndex(t => String(t.memberId) === String(memberId));
    
    if (index !== -1) {
        const previousTimer = activeTimers[index];
        const durationPrev = calculateDuration(previousTimer.startTime);

        activeTimers.splice(index, 1); 

        const previousLog = {
            cardId: previousTimer.cardId,
            duration: durationPrev,
            date: now.toISOString(),
            memberId: memberId,
            memberName: previousTimer.memberName,
            action: "auto_stop_by_new_timer"
        };
        
        timeLogs.push(previousLog);
        sendLogToN8N(previousLog);
        stoppedPrevious = true;
    }

    const newTimer = {
        cardId: cardId,
        memberId: memberId,
        memberName: memberName,
        startTime: now.toISOString(),
    };
    
    activeTimers.push(newTimer);
    
    res.json({ 
        message: 'Timer iniciado!',
        startTime: newTimer.startTime,
        stoppedPrevious
    });
});

app.post('/timer/stop', (req, res) => {
    const { memberId, cardId } = req.body;
    
    const index = activeTimers.findIndex(t => String(t.memberId) === String(memberId) && String(t.cardId) === String(cardId));
    
    if (index === -1) {
        return res.status(400).json({ error: 'Timer não encontrado ou já parado.' });
    }
    
    const stoppedTimer = activeTimers[index];
    const durationSeconds = calculateDuration(stoppedTimer.startTime);
    
    activeTimers.splice(index, 1); 
    
    const newLog = {
        cardId: cardId,
        duration: durationSeconds,
        date: new Date().toISOString(),
        memberId: memberId,
        memberName: stoppedTimer.memberName,
        action: "manual_stop"
    };

    timeLogs.push(newLog);
    sendLogToN8N(newLog); 
    
    res.json({ 
        message: 'Timer parado!',
        newTotalSeconds: durationSeconds 
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});