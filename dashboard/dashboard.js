var t = TrelloPowerUp.iframe();

const NODE_API_BASE_URL = 'https://pseudomythically-aeroscopic-darwin.ngrok-free.dev';

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
    var h = hours > 0 ? hours + ':' : '';
    var m = (minutes < 10 ? '0' : '') + minutes;
    var s = (seconds < 10 ? '0' : '') + seconds;
    return h + m + ':' + s;
}

function formatIsoDateToTime(isoDateString) {
    if (!isoDateString) return '-';
    var date = new Date(isoDateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

var cardId = getUrlParameter('cardId');

function loadDashboardData() {
    fetch(`${NODE_API_BASE_URL}/timer/logs/${cardId}`, {
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
            row.innerHTML = `
                <td>${log.memberName || 'Usuário'}</td>
                <td>${formatIsoDateToTime(log.date)}</td>
                <td>${formatTime(log.duration)}</td>
                <td><button class="btn-edit" disabled>Editar</button></td>
            `;
            tableBody.appendChild(row);
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
    .then(response => response.json())
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
    if (cardId) {
        loadDashboardData();
    }
    document.getElementById('btnSaveConfig').addEventListener('click', saveSettings);
});