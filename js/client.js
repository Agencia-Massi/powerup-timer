var Promise = TrelloPowerUp.Promise;


const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';
const GITHUB_PAGES_BASE = 'https://agencia-massi.github.io/powerup-timer/'; 

function getSafeId(incomingId) {
    if (typeof incomingId === 'object' && incomingId !== null) {
        return incomingId.id || JSON.stringify(incomingId); 
    }
    return incomingId;
}

function getSafeName(memberObj) {
    if (!memberObj) return 'Usuário Trello';
    if (typeof memberObj === 'string') return memberObj;
    return memberObj.fullName || memberObj.username || 'Usuário Trello';
}

function formatTime(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;

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
        'Content-Type': 'application/json'
    };

    let url = `${NODE_API_BASE_URL}/${endpoint}`;
    if (method === 'GET') {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}_t=${Date.now()}`; 
    }

    return fetch(url, {
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

function forceGlobalRefresh(t) {
    return Promise.all([
        t.set('board', 'shared', 'refresh', Math.random()),
        t.set('card', 'shared', 'refresh', Math.random())
    ]);
}

TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
        return Promise.all([
            t.card('id'), 
            t.member('all'),
            t.getContext()
        ])
        .then(function([rawCardId, memberObj, context]) {
            
            var cardId = getSafeId(rawCardId);
            var memberId = getSafeId(context.member);
            var memberName = getSafeName(memberObj);

            return callBackend(`timer/status/${memberId}/${cardId}`, 'GET')
            .then(function(statusData) {
                var timerButton = null;

                if (statusData && statusData.isRunningHere) {
                    timerButton = {
                        icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                        text: 'Pausar Timer',
                        callback: function(t) {
                            return callBackend('timer/stop', 'POST', {
                                memberId: memberId,
                                cardId: cardId 
                            })
                            .then(data => {
                                return forceGlobalRefresh(t)
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
                                memberId: memberId,
                                cardId: cardId, 
                                memberName: memberName
                            })
                            .then(() => {
                                return forceGlobalRefresh(t)
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
                            url: `${GITHUB_PAGES_BASE}/dashboard/dashboard.html?cardId=${cardId}`, 
                            accentColor: '#0079BF', 
                            height: 500, 
                            fullscreen: false
                        });
                    }
                };

                return [timerButton, settingsButton];
            });
        })
        .catch(err => { 
            return []; 
        });
    },

    'card-badges': function(t, options){
        return t.card('id')
        .then(function(rawCardId) {
            
            var cardId = getSafeId(rawCardId);
            var context = t.getContext();
            var memberId = getSafeId(context.member);

            return callBackend(`timer/status/${memberId}/${cardId}`, 'GET')
            .then(function(statusData) {
                
                if (statusData && statusData.forceRefresh) {
                     fetch(`${NODE_API_BASE_URL}/timer/clear_refresh_flag/${cardId}`, {
                        method: 'POST'
                     }).catch(err => {});
                }

                if (statusData && statusData.activeTimerData) {
                    return [{
                        dynamic: function() {
                            return callBackend(`timer/status/${memberId}/${cardId}`, 'GET')
                            .then(newStatus => {
                                if (!newStatus.activeTimerData) {
                                    return { text: 'Parado', color: 'red', refresh: 10 };
                                }

                                var now = new Date();
                                var startTimeStr = newStatus.activeTimerData.startTime;
                                if (!startTimeStr.endsWith("Z")) startTimeStr += "Z";
                                var start = new Date(startTimeStr);

                                var currentSession = Math.floor((now - start) / 1000);
                                var totalSeconds = currentSession + (newStatus.totalPastSeconds || 0);
                                
                                var totalMinutes = Math.floor(totalSeconds / 60);

                                var label = '🟢 ';
                                if (!newStatus.isRunningHere) label = '👤 ' + newStatus.activeTimerData.memberName + ': ';

                                return {
                                    text: label + totalMinutes + ' min',
                                    color: 'green',
                                    refresh: 60 
                                };
                            });
                        }
                    }];
                }
                
                if (statusData && statusData.totalPastSeconds > 0) {
                    var totalMinutesPast = Math.floor(statusData.totalPastSeconds / 60);
                    return [{
                        text: '⏸️ ' + totalMinutesPast + ' min',
                        refresh: 60 
                    }];
                }

                return [];
            });
        })
        .catch(() => []);
    },

    'card-detail-badges': function(t, options) {
        return t.card('id')
        .then(function(rawCardId) {
            
            var cardId = getSafeId(rawCardId);
            var context = t.getContext();
            var memberId = getSafeId(context.member);

            return callBackend(`timer/status/${memberId}/${cardId}`, 'GET')
            .then(function(statusData) {
                
                if (statusData && statusData.activeTimerData) {
                    return [{
                        dynamic: function() {
                            return callBackend(`timer/status/${memberId}/${cardId}`, 'GET')
                            .then(newStatus => {
                                if (!newStatus.activeTimerData) {
                                    forceGlobalRefresh(t);
                                    return { title: "Tempo Total", text: 'Parando...', color: 'red', refresh: 10 };
                                }

                                var now = new Date();

                                var startTimeStr = newStatus.activeTimerData.startTime;
                                if (!startTimeStr.endsWith("Z")) {
                                    startTimeStr += "Z";
                                }
                                var start = new Date(startTimeStr);

                                var currentSession = Math.floor((now - start) / 1000);
                                var totalSeconds = currentSession + (newStatus.totalPastSeconds || 0);
                                
                                var totalMinutes = Math.floor(totalSeconds / 60);
                            
                                var stopCallback = function(t) {
                                    return callBackend('timer/stop', 'POST', {
                                        memberId: memberId, 
                                        cardId: cardId 
                                    })
                                    .then(data => {
                                         return forceGlobalRefresh(t)
                                         .then(() => t.alert({ message: "Timer Parado!" }));
                                    });
                                };

                                if (!newStatus.isRunningHere) {
                                    stopCallback = null;
                                }

                                return {
                                    title: "Tempo Total" + (newStatus.isRunningHere ? "" : ` (${newStatus.activeTimerData.memberName})`),
                                    text: totalMinutes + ' min', 
                                    color: "green",
                                    refresh: 60, 
                                    callback: stopCallback
                                };
                            });
                        }
                    }];
                }
                return [];
            });
        })
        .catch(() => []);
    }
});