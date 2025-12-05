var Promise = TrelloPowerUp.Promise;

var N8N_WEBHOOK_URL = 'https://pseudomythically-aeroscopic-darwin.ngrok-free.dev/webhook-test/bfc8317c-a794-4364-81e2-2ca172cfb558'; 
const GITHUB_PAGES_BASE = 'https://miguelnsimoes.github.io/meu-trello-timer';

function sendToN8n(logData) {
    return fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: JSON.stringify(logData),
        headers: { 'Content-Type': 'application/json' }
    }).catch(function(err) {
        console.error("Erro para enviar ao n8n", err);
    });
}

function formatTime(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);

    var h = hours > 0 ? hours + ':' : '';
    var m = (minutes < 10 ? '0' : '') + minutes;
    var s = (seconds < 10 ? '0' : '') + seconds;

    return h + m + ':' + s;
}

TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
        var context = t.getContext()
        var currentCardId = context.card

        return t.get('member', 'private', 'activeTimer').then(function(activeTimer) { 
            
            if(activeTimer && activeTimer.cardId === currentCardId){
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar',
                    callback: function(t) {
                        var endTime = new Date()
                        var start = new Date(activeTimer.startTime) 
                        var durationMs = endTime - start
                        var durationSeconds = Math.round(durationMs / 1000)

                        var newLog = {
                            cardId: currentCardId,
                            duration: durationSeconds,
                            date: new Date().toISOString(),
                            memberId: context.member,
                            action: "manual_stop"
                        }

                        sendToN8n(newLog)
                        
                        return Promise.all([
                            t.get('card', 'shared', 'timeLogs', []),
                            t.get('card', 'shared', 'accumulatedTime', 0)
                        ]).then(function(values){
                            var timeLogs = values[0];
                            var currentTotal = values[1];

                            timeLogs.push(newLog);
                            var newTotal = currentTotal + durationSeconds;

                            return t.set('card', 'shared', 'timeLogs', timeLogs)
                            .then(() => t.set('card', 'shared', 'accumulatedTime', newTotal))
                            .then(() => t.set('member', 'private', 'activeTimer', null))
                            .then(() => {
                                // 4. ALERTA APENAS DEPOIS QUE TUDO SALVOU
                                return t.alert({
                                    message: `Pausado! Total acumulado: ${formatTime(newTotal)}`,
                                    duration: 5,
                                    display: 'success'
                                })
                            })
                        })
                    } 
                }]
            }
            
            else{
                var btnText = 'Iniciar'

                return[{
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        var now = new Date()
     
                        if(activeTimer){
                            var startPrev = new Date(activeTimer.startTime)
                            var durationPrevMs = now - startPrev
                            var durationPrevSeconds = Math.round(durationPrevMs / 1000)
                            
                            var previousLog = {
                                cardId: activeTimer.cardId,
                                duration: durationPrevSeconds,
                                date: now.toISOString(),
                                memberId: activeTimer.memberId,
                                action: "auto_stop_by_new_timer"
                            }
                            sendToN8n(previousLog)
                            t.alert({
                                message: `Timer anterior (${durationPrevSeconds}s) enviado ao n8n`,
                                duration: 2
                            })
                        }
                        return t.set('member', 'private', 'activeTimer',{ 
                            cardId: currentCardId,
                            startTime: now.toISOString(),
                            memberId: context.member
                        }).then(function(){
                            return t.alert({
                                message: 'Timer iniciado!',
                                duration: 3
                            })
                        })
                    }
                }]
            }
        }
    )},

    'card-badges': function(t, options){
        return Promise.all([
            t.get('member', 'private', 'activeTimer'),
            t.get('card', 'shared', 'accumulatedTime', 0)
        ]).then(function(values){
            var activeTimer = values[0];
            var accumulated = values[1];
            
            var isRunningHere = (activeTimer && activeTimer.cardId === t.getContext().card);
            
            if (accumulated > 0 || isRunningHere) {
                return [{
                    dynamic: function(){
                        var displayTime = accumulated;

                        if (isRunningHere) {
                            var now = new Date();
                            var start = new Date(activeTimer.startTime);
                            var currentSession = Math.floor((now - start) / 1000);
                            displayTime += currentSession;
                        }

                        return {
                            text: '⏱️ ' + formatTime(displayTime),
                            color: isRunningHere ? 'green' : null, 
                            refresh: isRunningHere ? 1 : 60
                        }
                    }
                }];
            } else {
                return [];
            }
    })
 },


    'card-detail-badges': function(t, options) {
        return Promise.all([
            t.get('member', 'private', 'activeTimer'),
            t.get('card', 'shared', 'accumulatedTime', 0)
        ]).then(function(values){
            var activeTimer = values[0];
            var accumulated = values[1];
            
            var isRunningHere = (activeTimer && activeTimer.cardId === t.getContext().card && activeTimer.memberId === t.getContext().member);

            if (accumulated > 0 || isRunningHere) {
                return [{
                    dynamic: function() {
                        var displayTime = accumulated;

                        if (isRunningHere) {
                            var now = new Date();
                            var start = new Date(activeTimer.startTime);
                            var currentSession = Math.floor((now - start) / 1000);
                            displayTime += currentSession;
                        }

                        return {
                            title: isRunningHere ? "Tempo Ativo" : "Total Acumulado",   
                            text: formatTime(displayTime),
                            color: isRunningHere ? "green" : null,
                            refresh: isRunningHere ? 1 : 60,
                            callback: function(t) {
                                var msg = isRunningHere ? "Timer rodando! Pause para salvar." : "Timer pausado. Clique em Iniciar para continuar.";
                                return t.alert({ message: msg });
                            }
                        }
                    }
                }];
            } else {
                return []; 
            }
        });
    }
});