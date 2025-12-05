const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fetch =  require('node-fetch');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

let activeTimers = [];
let timeLogs = [];

cron.schedule('* * * * *', () => {

});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Use ngrok para expor a URL para o Trello.');
})

app.get('timer/status/:memberId/:cardId', (req, res) => {
    const {memberId, cardId} = req.params;
    const activeTimer = activeTimers.find(t => t.memberId === memberId);

    let isRunningHere = false;
    let isOtherTimerRunning = false;

    if(activeTimer){
        if(activeTimer.cardId === cardId){
            isRunningHere = true;
        }
        else{
            isOtherTimerRunning = true;
        }
    }

    res.json({
        isRunningHere,
        isOtherTimerRunning,
        activeTimerData: activeTimer
    });
});


app.post('/timer/start', (req, res) => {
    res.json({ message: 'Rota de START recebida, mas ainda não implementada.' });
});

app.post('/timer/stop', (req, res) => {
    res.json({ message: 'Rota de STOP recebida, mas ainda não implementada.' });
})
