var t = TrelloPowerUp.iframe();
const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function formatTime(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);
    var h = (hours < 10 ? '0' : '') + hours + ':';
    var m = (minutes < 10 ? '0' : '') + minutes + ':';
    var s = (seconds < 10 ? '0' : '') + seconds;
    return h + m + s;
}

function formatIsoDateToTime(isoDateString) {
    if (!isoDateString) return '-';
    var date = new Date(isoDateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseStrictTime(input) {
    if (!input) return null;
    var regex = /^\d{2}:\d{2}:\d{2}$/;
    if (!regex.test(input)) return null;
    var parts = input.split(':').map(Number);
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

var cardId = getUrlParameter('cardId');


if (cardId.includes('object')) {
    document.body.innerHTML = '<h3 style="color:red; padding:20px;">Erro de Cache detectado!<br>Por favor, feche esta janela e dê um Refresh (F5) na página do Trello.</h3>';
    throw new Error("ID Inválido detectado");
}

function editLog(logId, currentDuration) {
    var currentFormatted = formatTime(currentDuration);
    var newTimeStr = prompt(`Editar tempo (Obrigatório formato HH:MM:SS):`, currentFormatted);
    
    if (newTimeStr === null) return; 

    var newSeconds = parseStrictTime(newTimeStr);
    
    if (newSeconds === null) {
        alert("Formato inválido! Você DEVE usar o formato HH:MM:SS (Exemplo: 01:30:00).");
        return;
    }

    fetch(`${NODE_API_BASE_URL}/timer/logs/${logId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ duration: newSeconds })
    })
    .then(res => res.json())
    .then(() => {
        loadDashboardData(); 
        return t.set('board', 'shared', 'refresh', Math.random());
    })
    .then(() => {
        t.alert({ message: 'Tempo atualizado!', duration: 3, display: 'success' });
    })
    .catch(err => {
        console.error(err);
        alert("Erro ao salvar edição.");
    });
}

function deleteLog(logId) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;

    fetch(`${NODE_API_BASE_URL}/timer/logs/${logId}`, {
        method: 'DELETE',
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    })
    .then(res => res.json())
    .then(() => {
        loadDashboardData();
        return t.set('board', 'shared', 'refresh', Math.random());
    })
    .then(() => {
        t.alert({ message: 'Registro excluído!', duration: 3, display: 'info' });
    })
    .catch(err => {
        console.error(err);
        alert("Erro ao excluir.");
    });
}

function loadDashboardData() {
    fetch(`${NODE_API_BASE_URL}/timer/logs/${cardId}?_t=${Date.now()}`, {
        method: 'GET',
        headers: { 
            'ngrok-skip-browser-warning': 'true' 
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.timeLimit) {
            document.getElementById('timeLimit').value = data.timeLimit;
        }

        var tableBody = document.getElementById('logsTableBody');
        tableBody.innerHTML = '';

        if (!data.logs || data.logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registro hoje.</td></tr>';
            return;
        }

        data.logs.forEach(log => {
            var row = document.createElement('tr');
            var actionsHtml = '';
            
            if (log.id) {
                actionsHtml = `
                    <button class="btn-edit" id="btn-edit-${log.id}">Editar</button>
                    <button class="btn-delete" id="btn-delete-${log.id}">Excluir</button>
                `;
            } else {
                actionsHtml = `<span style="color:#ccc; font-size:10px;">(Sem ID)</span>`;
            }

            row.innerHTML = `
                <td>${log.memberName || 'Usuário'}</td>
                <td>${formatIsoDateToTime(log.date)}</td>
                <td>${formatTime(log.duration)}</td>
                <td>${actionsHtml}</td>
            `;
            tableBody.appendChild(row);

            if (log.id) {
                document.getElementById(`btn-edit-${log.id}`).addEventListener('click', function() {
                    editLog(log.id, log.duration);
                });
                document.getElementById(`btn-delete-${log.id}`).addEventListener('click', function() {
                    deleteLog(log.id);
                });
            }
        });
    })
    .catch(err => console.error(err));
}

function saveSettings() {
    var timeLimitValue = document.getElementById('timeLimit').value;

    fetch(`${NODE_API_BASE_URL}/timer/settings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
            cardId: cardId,
            timeLimit: timeLimitValue
        })
    })
    .then(res => res.json())
    .then(data => {
        t.alert({
            message: 'Configuração salva com sucesso!',
            duration: 3,
            display: 'success'
        });
    })
    .catch(err => {
        t.alert({
            message: 'Erro ao salvar!',
            duration: 3,
            display: 'error'
        });
        console.error(err);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (cardId && !cardId.includes('object')) {
        loadDashboardData();
    }
    document.getElementById('btnSaveConfig').addEventListener('click', saveSettings);
});