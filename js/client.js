/* global TrelloPowerUp */
var Promise = TrelloPowerUp.Promise;

/* ==============================
   CONFIGURAÇÕES
================================ */
const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';
const GITHUB_PAGES_BASE = 'https://agencia-massi.github.io/powerup-timer';

/* ==============================
   ESTADO GLOBAL & CACHE
================================ */
// Armazena o status de cada cartão: { 'cardId': { ...data... } }
const STATUS_CACHE = {};

// Controle de tempo para evitar chamadas excessivas
let LAST_FETCH_TIME = 0;
const CACHE_TTL = 15000; // 15 segundos de vida útil do cache

// Variáveis para o Debounce (O segredo da performance)
let debounceTimer = null;
let pendingResolveFunctions = []; // Quem está esperando a resposta
let collectedCardIds = new Set(); // IDs coletados para buscar
let currentMemberId = null;

/* ==============================
   FUNÇÕES AUXILIARES
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

// Chamada direta para ações (Start/Stop) - não usa cache
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

// Força atualização visual
function forceGlobalRefresh(t) {
    LAST_FETCH_TIME = 0; // Invalida o cache para forçar busca nova
    return Promise.all([
        t.set('board', 'shared', 'refresh', Math.random()),
        t.set('card', 'shared', 'refresh', Math.random())
    ]);
}

/* ==============================
   MOTOR DE BUSCA OTIMIZADO (BATCH + DEBOUNCE)
================================ */
function getBatchStatus(cardId, memberId) {
    currentMemberId = memberId;
    collectedCardIds.add(cardId);

    // Se já temos dados frescos no cache, retorna imediatamente (sem ir ao servidor)
    const now = Date.now();
    if (STATUS_CACHE[cardId] && (now - LAST_FETCH_TIME < CACHE_TTL)) {
        return Promise.resolve(STATUS_CACHE[cardId]);
    }

    // Se não tem cache, agendamos uma busca
    return new Promise((resolve) => {
        pendingResolveFunctions.push(resolve);

        // Se já tem um timer rodando, cancela ele (reinicia a contagem de espera)
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Define novo timer: espera 150ms para ver se chegam mais cartões
        debounceTimer = setTimeout(() => {
            executeFetch();
        }, 150);
    });
}

function executeFetch() {
    if (collectedCardIds.size === 0) return;

    const idsToFetch = Array.from(collectedCardIds);
    const memberToFetch = currentMemberId;
    
    // Limpa a fila para a próxima rodada
    const resolversToNotify = [...pendingResolveFunctions];
    pendingResolveFunctions = [];
    collectedCardIds.clear();
    debounceTimer = null;

    // Constrói a URL Bulk
    const url = `${NODE_API_BASE_URL}/timer/status/bulk` +
                `?memberId=${memberToFetch}` +
                `&cardIds=${idsToFetch.join(',')}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            LAST_FETCH_TIME = Date.now();
            Object.assign(STATUS_CACHE, data); // Atualiza cache global
            
            // Avisa todo mundo que estava esperando
            resolversToNotify.forEach(resolve => resolve(data)); 
        })
        .catch(err => {
            console.error("Erro no fetch bulk:", err);
            // Em caso de erro, libera as promises para não travar o Trello
            resolversToNotify.forEach(resolve => resolve({}));
        });
}

/* ==============================
   INICIALIZAÇÃO DO POWER-UP
================================ */
TrelloPowerUp.initialize({

  /* --------------------------
     BOTÕES DO CARTÃO
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

      // Usa o sistema otimizado para pegar os dados
      return getBatchStatus(cardId, memberId).then(() => {
          // Lê do cache, pois o getBatchStatus garantiu que ele está atualizado
          const statusData = STATUS_CACHE[cardId] || {};
          const buttons = [];

          if (statusData && statusData.isRunningHere) {
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
     CAPA DO CARTÃO (Board View)
  --------------------------- */
  'card-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      return getBatchStatus(cardId, memberId).then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status) return [];

        if (status.activeTimerData) {
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
            text: label + totalMinutes + ' min',
            color: 'green',
            refresh: 60 // Atualiza a visualização a cada 1 min
          }];
        }

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

      return getBatchStatus(cardId, memberId).then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status || !status.activeTimerData) return [];

        var now = new Date();
        var startStr = status.activeTimerData.startTime;
        if (!startStr.endsWith("Z")) startStr += "Z";
        var start = new Date(startStr);
        var currentSession = Math.floor((now - start) / 1000);
        var totalSeconds = currentSession + (status.totalPastSeconds || 0);
        var totalMinutes = Math.floor(totalSeconds / 60);

        return [{
          title: 'Tempo Total' + (status.isRunningHere ? "" : ` (${status.activeTimerData.memberName})`),
          text: totalMinutes + ' min',
          color: 'green',
          refresh: 60
        }];
      });
    });
  }

});