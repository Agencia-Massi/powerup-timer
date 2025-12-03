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
                            memberId: context.member
                        }

                        sendToN8n(newLog)

                        return t.get('card', 'shared', 'timeLogs', []).then(function(timeLogs){
                            timeLogs.push(newLog)

                            return t.set('card', 'shared', 'timeLogs', timeLogs).then(function(){ 

                                return t.set('member', 'private', 'activeTimer', null).then(function(){
                                    return t.alert({
                                        message: `Log salvo! Enviado ao n8n.`,
                                        duration: 5,
                                        display: 'success'
                                    })
                                })
                            })
                        })
                    } 
                }]
            }
            
            else{
                var btnText = '▶Iniciar'
                if(activeTimer){
                    btnText = 'Iniciar (Pausará Timer Anterior)'
                }
                
                return[{
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        var now = new Date().toISOString()

                        return t.set('member', 'private', 'activeTimer',{ 
                            cardId: currentCardId,
                            startTime: now,
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

    'card-detail-badges': function(t, options) {
        return t.get('member', 'private', 'activeTimer')
        .then(function(activeTimer) {
            if (activeTimer && activeTimer.memberId === t.getContext().member) {
                return [{
                    dynamic: function() {
                        return {
                            title: "Tempo Ativo", 
                            text: `RODANDO`,
                            color: "green",
                            callback: function(t) {
                                return t.alert({ message: "Timer ativo! Clique no botão na aba Power-Ups para PAUSAR." });
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