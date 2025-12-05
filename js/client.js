var Promise = TrelloPowerUp.Promise;

const NODE_API_BASE_URL = 'https://pseudomythically-aeroscopic-darwin.ngrok-free.dev';
const GITHUB_PAGES_BASE = 'https://miguelnsimoes.github.io/meu-trello-timer';

function callBackend(endpoint, method, body = null) {
    return fetch(`${NODE_API_BASE_URL}/${endpoint}`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => { throw new Error(error.error || `Erro de rede/servidor: ${response.status}`); });
        }
        return response.json();
    });
}

TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
        var context = t.getContext();
        var currentCardId = context.card;

        return callBackend(`timer/status/${context.member}/${currentCardId}`, 'GET')
        .then(function(statusData) {
            if(statusData.isRunningHere){
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar',
                    callback: function(t) {
                        return callBackend('timer/stop', 'POST', {
                            memberId: context.member,
                            cardId: currentCardId
                        })
                        .then(data => {
                            return t.alert({
                                message: data.message || `Pausado! Total: ${data.newTotalFormatted}`,
                                duration: 5,
                                display: 'success'
                            });
                        });
                    } 
                }]
            }
            
            else{
                var btnText = statusData.isOtherTimerRunning ? 
                              'Iniciar (Pausará Anterior)' : 'Iniciar';
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        return callBackend('timer/start', 'POST', {
                            memberId: context.member,
                            cardId: currentCardId,
                            memberName: context.member 
                        })
                        .then(data => {
                            if (data.stoppedPrevious) {
                                t.alert({ message: data.stoppedMessage, duration: 3 });
                            }
                            return t.alert({ message: 'Timer iniciado!', duration: 3 });
                        });
                    }
                }]
            }
        })
        .catch(err => {
             console.error("ERRO DE BACKEND:", err);
             return []; 
        });
    },


});