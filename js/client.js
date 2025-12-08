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
            return response.json().catch(() => ({})).then(err => {
                throw new Error(err.error || `Erro HTTP: ${response.status}`);
            });
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
            if (!statusData) return [];

            if(statusData.isRunningHere){
                return [{
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar Timer',
                    callback: function(t) {
                        return callBackend('timer/stop', 'POST', {
                            memberId: context.member,
                            cardId: context.card
                        })
                        .then(data => t.alert({ 
                            message: `Pausado! Tempo total: ${formatTime(data.newTotalSeconds)}`, 
                            duration: 5, 
                            display: 'success' 
                        }));
                    } 
                }];
            } else {
                var btnText = statusData.isOtherTimerRunning ? 'Iniciar (Pausará Outro)' : 'Iniciar Timer';
                return [{
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        return callBackend('timer/start', 'POST', {
                            memberId: context.member,
                            cardId: context.card,
                            memberName: memberData.fullName
                        })
                        .then(() => t.alert({ 
                            message: 'Timer iniciado!', 
                            duration: 2,
                            display: 'info'
                        }));
                    }
                }];
            }
        })
        .catch(err => { 
            return []; 
        });
    },

    'card-badges': function(t, options){
        var context = t.getContext();
        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
        .then(function(statusData) {
            if (statusData && statusData.isRunningHere && statusData.activeTimerData) {
                return [{
                    dynamic: function() {
                        var now = new Date();
                        var start = new Date(statusData.activeTimerData.startTime);
                        if (isNaN(start.getTime())) return { text: 'Erro', color: 'red' };

                        var currentSession = Math.floor((now - start) / 1000);
                        var total = currentSession + (statusData.totalPastSeconds || 0);

                        return {
                            text: '⏱️ ' + formatTime(total),
                            color: 'green',
                            refresh: 10
                        };
                    }
                }];
            }
            
            if (statusData && statusData.totalPastSeconds > 0) {
                return [{
                    text: '⏸️ ' + formatTime(statusData.totalPastSeconds),
                    refresh: 10
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
            if (statusData && statusData.isRunningHere && statusData.activeTimerData) {
                return [{
                    dynamic: function() {
                        var now = new Date();
                        var start = new Date(statusData.activeTimerData.startTime);
                        var diff = Math.floor((now - start) / 1000);
                        return {
                            title: "Sessão Atual",
                            text: formatTime(diff),
                            color: "green",
                            refresh: 1,
                            callback: function(t) {
                                return callBackend('timer/stop', 'POST', {
                                    memberId: context.member,
                                    cardId: context.card
                                })
                                .then(data => t.alert({ message: "Timer Parado!" }));
                            }
                        };
                    }
                }];
            }
            return [];
        })
        .catch(() => []);
    }, 

'board-buttons': function(t, options) {
        return [{ 
            icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
            text: 'Relatório de Tempo',
            callback: function(t) {
                return t.modal({
                    title: 'Painel de Gestão',
                    url: `${GITHUB_PAGES_BASE}/dashboard.html`,
                    accentColor: '#0079BF', 
                    height: 500, 
                    fullscreen: false
                });
            }
        }]; 
    }
});