/* global TrelloPowerUp */
var Promise = TrelloPowerUp.Promise;

/* ==============================
   CONFIGURAÇÕES
================================ */
const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';
const GITHUB_PAGES_BASE = 'https://agencia-massi.github.io/powerup-timer';

/* ==============================
   CACHE GLOBAL E VARIÁVEIS
================================ */
const STATUS_CACHE = {};
let LAST_SYNC = 0;
const POLL_INTERVAL = 5000; // Sincroniza a cada 5 segundos no máximo

let CURRENT_MEMBER = null;
let CURRENT_CARDS = [];

/* ==============================
   FUNÇÕES AUXILIARES (Resgatadas)
================================ */
function getSafeId(obj) {
  if (typeof obj === 'object' && obj !== null) return obj.id || JSON.stringify(obj);
  return obj;
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

// Função para chamar o backend (essencial para os botões funcionarem)
function callBackend(endpoint, method, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    let url = `${NODE_API_BASE_URL}/${endpoint}`;
    
    return fetch(url, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : null
    }).then(response => {
        if (!response.ok) {
            return response.json().catch(() => ({})).then(err => {
                throw new Error(err.error || `Erro HTTP: ${response.status}`);
            });
        }
        return response.json();
    });
}

function forceGlobalRefresh(t) {
    // Força atualização dos dados do cache imediatamente
    LAST_SYNC = 0; 
    return syncStatus().then(() => {
        return Promise.all([
            t.set('board', 'shared', 'refresh', Math.random()),
            t.set('card', 'shared', 'refresh', Math.random())
        ]);
    });
}

/* ==============================
   SINCRONIZAÇÃO EM LOTE (O Segredo da Performance)
================================ */
function syncStatus() {
  const now = Date.now();

  // Se já sincronizou há menos de 5 segundos, usa o cache (não chama o servidor)
  if (now - LAST_SYNC < POLL_INTERVAL) {
    return Promise.resolve();
  }

  if (!CURRENT_MEMBER || CURRENT_CARDS.length === 0) {
    return Promise.resolve();
  }

  LAST_SYNC = now;

  // Chama a rota OTIMIZADA que pega tudo de uma vez
  const url = `${NODE_API_BASE_URL}/timer/status/bulk` +
    `?memberId=${CURRENT_MEMBER}` +
    `&cardIds=${CURRENT_CARDS.join(',')}`;

  return fetch(url)
    .then(r => r.json())
    .then(data => {
      Object.assign(STATUS_CACHE, data); // Atualiza o cache global
    })
    .catch(() => {});
}

/* ==============================
   INICIALIZAÇÃO DO POWER-UP
================================ */
TrelloPowerUp.initialize({

  /* --------------------------
     BOTÕES DO CARTÃO (Lógica Restaurada)
  --------------------------- */
  'card-buttons': function (t) {
    return Promise.all([
        t.card('id'),
        t.member('all'),
        t.getContext()
    ]).then(([cardObj, memberObj, context]) => {
      const cardId = getSafeId(cardObj.id);
      const memberId = getSafeId(context.member);
      const memberName = getSafeName(memberObj);

      // Registra para o cache
      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) { CURRENT_CARDS.push(cardId); }

      // Garante que temos dados atualizados antes de desenhar os botões
      return syncStatus().then(() => {
          const statusData = STATUS_CACHE[cardId] || {};
          const buttons = [];

          // 1. Botão de Timer (Iniciar ou Pausar)
          if (statusData && statusData.isRunningHere) {
              // SE ESTÁ RODANDO -> MOSTRA PAUSAR
              buttons.push({
                  icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                  text: 'Pausar Timer',
                  callback: function(t) {
                      return callBackend('timer/stop', 'POST', {
                          memberId: memberId,
                          cardId: cardId 
                      })
                      .then(data => {
                          return forceGlobalRefresh(t).then(() => {
                              t.alert({ 
                                  message: `Pausado! Tempo: ${formatTime(data.newTotalSeconds)}`, 
                                  duration: 3, 
                                  display: 'success' 
                              });
                          });
                      });
                  } 
              });
          } else {
              // SE ESTÁ PARADO -> MOSTRA INICIAR
              var btnText = (statusData && statusData.isOtherTimerRunning) ? 'Iniciar (Pausará Outro)' : 'Iniciar Timer';
              buttons.push({
                  icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                  text: btnText,
                  callback: function(t){
                      return callBackend('timer/start', 'POST', {
                          memberId: memberId,
                          cardId: cardId, 
                          memberName: memberName
                      })
                      .then(() => {
                          return forceGlobalRefresh(t).then(() => {
                              t.alert({ 
                                  message: 'Timer iniciado!', 
                                  duration: 2,
                                  display: 'info'
                              });
                          });
                      });
                  }
              });
          }

          // 2. Botão de Configurações
          buttons.push({
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
          });

          return buttons;
      });
    });
  },

  /* --------------------------
     CAPA DO CARTÃO (Otimizado)
  --------------------------- */
  'card-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) { CURRENT_CARDS.push(cardId); }

      return syncStatus().then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status) return [];

        // Badge Verde (Em andamento)
        if (status.activeTimerData) {
          // Cálculo local do tempo para mostrar "X min"
          var now = new Date();
          var startStr = status.activeTimerData.startTime;
          if (!startStr.endsWith("Z")) startStr += "Z";
          var start = new Date(startStr);
          var currentSession = Math.floor((now - start) / 1000);
          var totalSeconds = currentSession + (status.totalPastSeconds || 0);
          var totalMinutes = Math.floor(totalSeconds / 60);

          var label = '⏱️ ';
          if (!status.isRunningHere) label = '👤 ' + status.activeTimerData.memberName + ': ';

          return [{
            text: label + totalMinutes + ' min', // Volta a mostrar os minutos!
            color: 'green',
            refresh: 60 // Atualiza a cada 1 min
          }];
        }

        // Badge Pausado
        if (status.totalPastSeconds > 0) {
          return [{
            text: `⏸️ ${Math.floor(status.totalPastSeconds / 60)} min`,
            refresh: 60
          }];
        }

        return [];
      });
    });
  },

  /* --------------------------
     DETALHE DO CARTÃO
  --------------------------- */
  'card-detail-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) { CURRENT_CARDS.push(cardId); }

      return syncStatus().then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status || !status.activeTimerData) return [];

        // Cálculo local para detalhe
        var now = new Date();
        var startStr = status.activeTimerData.startTime;
        if (!startStr.endsWith("Z")) startStr += "Z";
        var start = new Date(startStr);
        var currentSession = Math.floor((now - start) / 1000);
        var totalSeconds = currentSession + (status.totalPastSeconds || 0);
        var totalMinutes = Math.floor(totalSeconds / 60);

        return [{
          title: 'Tempo Total' + (status.isRunningHere ? "" : ` (${status.activeTimerData.memberName})`),
          text: totalMinutes + ' min', // Mostra minutos (safe mode)
          color: 'green',
          refresh: 60
        }];
      });
    });
  }

});