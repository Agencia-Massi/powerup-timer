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
            var timerButton = null;

            if (statusData && statusData.isRunningHere) {
                timerButton = {
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar Timer',
                    callback: function(t) {
                        return callBackend('timer/stop', 'POST', {
                            memberId: context.member,
                            cardId: context.card
                        })
                        .then(data => {
                            return t.set('board', 'shared', 'refresh', Math.random())
                            .then(() => {
                                t.alert({ 
                                    message: `Pausado! Tempo: ${formatTime(data.newTotalSeconds)}`, 
                                    duration: 3, 
                                    display: 'success' 
                                });
                            });
                        });
                    } 
                };
            } else {
                var btnText = (statusData && statusData.isOtherTimerRunning) ? 'Iniciar (Pausará Outro)' : 'Iniciar Timer';
                timerButton = {
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: btnText,
                    callback: function(t){
                        return callBackend('timer/start', 'POST', {
                            memberId: context.member,
                            cardId: context.card,
                            memberName: memberData.fullName
                        })
                        .then(() => {
                            return t.set('board', 'shared', 'refresh', Math.random())
                            .then(() => {
                                t.alert({ 
                                    message: 'Timer iniciado!', 
                                    duration: 2,
                                    display: 'info'
                                });
                            });
                        });
                    }
                };
            }

            var settingsButton = {
                icon: `${GITHUB_PAGES_BASE}/img/settings.svg`, 
                text: 'Configurar Limite',
                callback: function(t) {
                    return t.modal({
                        title: 'Gestão deste Cartão',
                        url: `${GITHUB_PAGES_BASE}/dashboard/dashboard.html?cardId=${context.card}`, 
                        accentColor: '#0079BF', 
                        height: 500, 
                        fullscreen: false
                    });
                }
            };

            return [timerButton, settingsButton];
        })
        .catch(err => { 
            return []; 
        });
    },

    'card-badges': function(t, options){
        var context = t.getContext();
        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
        .then(function(statusData) {
            
            if (statusData && statusData.forceRefresh) {
                 t.set('board', 'shared', 'refresh', Math.random());
                 fetch(`${NODE_API_BASE_URL}/timer/clear_refresh_flag/${context.card}`, {
                    method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true' }
                 }).catch(err => {});
            }

            if (statusData && statusData.isRunningHere && statusData.activeTimerData) {
                return [{
                    dynamic: function() {
                        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
                        .then(newStatus => {
                            if (!newStatus.isRunningHere) {
                                t.set('board', 'shared', 'refresh', Math.random());
                                return { text: 'Parando...', color: 'red', refresh: 1 };
                            }

                            var now = new Date();
                            var start = new Date(newStatus.activeTimerData.startTime);
                            if (isNaN(start.getTime())) return { text: 'Erro', color: 'red' };

                            var currentSession = Math.floor((now - start) / 1000);
                            var total = currentSession + (newStatus.totalPastSeconds || 0);

                            return {
                                text: '⏱️ ' + formatTime(total),
                                color: 'green',
                                refresh: 1 
                            };
                        });
                    }
                }];
            }
            
            if (statusData && statusData.totalPastSeconds > 0) {
                return [{
                    text: '⏸️ ' + formatTime(statusData.totalPastSeconds),
                    refresh: 5 
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
                        return callBackend(`timer/status/${context.member}/${context.card}`, 'GET')
                        .then(newStatus => {
                            if (!newStatus.isRunningHere) {
                                t.set('board', 'shared', 'refresh', Math.random());
                                return { title: "Sessão Atual", text: 'Parando...', color: 'red', refresh: 1 };
                            }

                            var now = new Date();
                            var start = new Date(newStatus.activeTimerData.startTime);
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
                                    .then(data => {
                                         return t.set('board', 'shared', 'refresh', Math.random())
                                         .then(() => t.alert({ message: "Timer Parado!" }));
                                    });
                                }
                            };
                        });
                    }
                }];
            }
            return [];
        })
        .catch(() => []);
    }
});