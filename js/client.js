var Promise = TrelloPowerUp.Promise;

const NODE_API_BASE_URL = 'https://pseudomythically-aeroscopic-darwin.ngrok-free.dev';
const GITHUB_PAGES_BASE = 'https://miguelnsimoes.github.io/meu-trello-timer';

function formatTime(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);
    var h = hours > 0 ? hours + ':' : '';
    var m = (minutes < 10 ? '0' : '') + minutes;
    var s = (seconds < 10 ? '0' : '') + seconds;
    return h + m + ':' + s;
}

function callBackend(endpoint, method, body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    };
    return fetch(`${NODE_API_BASE_URL}/${endpoint}`, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : null
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => { throw new Error(error.error || `Erro: ${response.status}`); });
        }
        return response.json();
    });
}

TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
        var context = t.getContext();
        return Promise.all([
            callBackend(`timer/status/${context.member}/${context.card}`, 'GET'),
            t.member('fullName')
        ])
        .then(function([statusData, memberData]) {
            if(statusData.isRunningHere){
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar',
                    callback: function(t) {
                        return callBackend('timer/stop', 'POST', {
                            memberId: context.member,
                            cardId: context.card
                        })
                        .then(data => t.alert({ message: `Pausado! Duração: ${formatTime(data.newTotalSeconds)}`, duration: 5, display: 'success' }));
                    } 
                }];
            } else {
                var btnText = statusData.isOtherTimerRunning ? 'Iniciar (Pausará Outro)' : 'Iniciar';
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        return callBackend('timer/start', 'POST', {
                            memberId: context.member,
                            cardId: context.card,
                            memberName: memberData.fullName
                        })
                        .then(data => t.alert({ message: 'Timer iniciado!', duration: 3 }));
                    }
                }];
            }
        })
        .catch(err => { console.error(err); return []; });
    },

    'card-badges': function(t, options){
        var context = t.getContext();
        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
        .then(function(statusData) {
            if (statusData.activeTimerData && statusData.isRunningHere) {
                return [{
                    dynamic: function() {
                        var now = new Date();
                        var start = new Date(statusData.activeTimerData.startTime);
                        var diff = Math.floor((now - start) / 1000);
                        return {
                            text: '⏱️ ' + formatTime(diff),
                            color: 'green',
                            refresh: 1 
                        };
                    }
                }];
            }

            return [];
        })
        .catch(() => []);
    },

    'card-detail-badges': function(t, options) {
        var context = t.getContext();
        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
        .then(function(statusData) {
            if (statusData.activeTimerData && statusData.isRunningHere) {
                return [{
                    dynamic: function() {
                        var now = new Date();
                        var start = new Date(statusData.activeTimerData.startTime);
                        var diff = Math.floor((now - start) / 1000);
                        return {
                            title: "Tempo Ativo",
                            text: formatTime(diff),
                            color: "green",
                            refresh: 1,
                            callback: function(t) { return t.alert({ message: "Vá em Power-Ups para pausar." }); }
                        };
                    }
                }];
            }
            return [];
        })
        .catch(() => []);
    }
});