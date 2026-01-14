import { STATE } from './config.js';
import { AudioEngine } from './audio.js';
import * as FB from './firebase.js';

// --- INICIALIZACIÓN ---
const audio = new AudioEngine();

// Elementos DOM
const els = {
    setupModal: document.getElementById('setupModal'),
    setupName: document.getElementById('setupName'),
    saveSetupBtn: document.getElementById('saveSetupBtn'),
    volumeSlider: document.getElementById('volumeSliderModal'),
    chatArea: document.getElementById('chatArea'),
    msgInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),
    liveIndicator: document.getElementById('liveIndicator'),
    receivingBanner: document.getElementById('receivingBanner'),
    receivingText: document.getElementById('receivingText'),
    userAvatar: document.getElementById('userAvatar'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    imgInput: document.getElementById('imageInput'),
    settingsBtn: document.getElementById('settingsBtn')
};

// 1. Cargar Usuario
const savedName = localStorage.getItem('vs_name');
if (savedName) els.setupName.value = savedName;
if (!savedName) els.setupModal.classList.remove('hidden');

// Identidad
const localConfig = JSON.parse(localStorage.getItem('vs_config') || '{}');
if (localConfig.user) STATE.user = localConfig.user;
else STATE.user.id = crypto.randomUUID();

// 2. Listeners de UI
els.saveSetupBtn.addEventListener('click', () => {
    const name = els.setupName.value || 'Anon';
    STATE.user.name = name;
    localStorage.setItem('vs_name', name);
    localStorage.setItem('vs_config', JSON.stringify({ user: STATE.user }));
    
    els.userAvatar.innerText = name.substring(0, 2).toUpperCase();
    els.setupModal.classList.add('hidden');
    startApp();
});

els.settingsBtn.addEventListener('click', () => els.setupModal.classList.remove('hidden'));

els.volumeSlider.addEventListener('input', (e) => {
    audio.setVolume(parseFloat(e.target.value));
});

els.msgInput.addEventListener('input', (e) => {
    els.sendBtn.classList.toggle('hidden', e.target.value.trim() === '');
});

els.sendBtn.addEventListener('click', () => {
    FB.sendText(els.msgInput.value.trim());
    els.msgInput.value = '';
    els.sendBtn.classList.add('hidden');
});

els.imgInput.addEventListener('change', (e) => {
    if(e.target.files[0]) FB.uploadImage(e.target.files[0]);
});

// 3. Lógica del Botón de Micrófono
const startAction = (e) => {
    e.preventDefault();
    if (STATE.isRecording) return;
    
    audio.startRecording(
        (streamId, chunk) => FB.sendLiveChunkData(streamId, chunk), // On Chunk
        (blob, streamId) => {} // On Stop (handled in stopAction finalizer)
    );
    updateMicUI(true);
};

const stopAction = (e) => {
    if (STATE.isRecording) {
        audio.stopRecording((blob, streamId) => {
            FB.uploadFinalAudio(blob, streamId);
        });
        updateMicUI(false);
    }
};

els.micBtn.addEventListener('mousedown', startAction);
els.micBtn.addEventListener('touchstart', startAction);
window.addEventListener('mouseup', stopAction);
window.addEventListener('touchend', stopAction);

// Desbloqueo de Audio Context
document.body.addEventListener('click', () => audio.resumeContext(), { once: true });


// --- FUNCIONES CORE ---

function startApp() {
    els.statusText.innerText = "Conectando...";
    els.statusText.classList.add('text-yellow-400');
    
    const connected = FB.initFirebase(
        renderMessage,          // onMessage
        onStreamStart,          // onStreamStart
        (chunk) => audio.playStreamChunk(chunk) // onStreamChunk
    );

    if(connected) {
        els.statusText.innerText = "En línea";
        els.statusText.classList.remove('text-yellow-400');
        els.statusDot.classList.remove('bg-red-500');
        els.statusDot.classList.add('bg-emerald-500', 'animate-pulse');
        
        // Cargar avatar si ya estaba listo
        if(STATE.user.name !== 'Anon') {
            els.userAvatar.innerText = STATE.user.name.substring(0,2).toUpperCase();
        }
    } else {
        els.statusText.innerText = "Error Conexión";
        els.statusDot.classList.add('bg-red-500');
    }
}

function onStreamStart(userName) {
    els.receivingText.innerText = `${userName} está hablando...`;
    els.receivingBanner.classList.remove('hidden');
    
    clearTimeout(window.talkTimeout);
    window.talkTimeout = setTimeout(() => {
        els.receivingBanner.classList.add('hidden');
    }, 2000);
}

function updateMicUI(isRecording) {
    if (isRecording) {
        els.micBtn.classList.add('bg-red-600', 'recording-pulse');
        els.micBtn.classList.remove('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600');
        els.liveIndicator.classList.remove('hidden');
    } else {
        els.micBtn.classList.remove('bg-red-600', 'recording-pulse');
        els.micBtn.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600');
        els.liveIndicator.classList.add('hidden');
    }
}

function renderMessage(msg) {
    if (!msg) return;
    const isMe = msg.userId === STATE.user.id;
    const div = document.createElement('div');
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300`;
    
    let content = '';
    if (msg.type === 'text') content = `<p class="text-sm">${escapeHtml(msg.content)}</p>`;
    else if (msg.type === 'image') content = `<img src="${msg.content}" class="max-w-[200px] rounded-lg border border-gray-600">`;
    else if (msg.type === 'audio') content = `
        <div class="flex items-center gap-2 min-w-[200px]">
            <button onclick="this.nextElementSibling.play()" class="p-2 bg-gray-700 rounded-full hover:bg-gray-600"><i data-lucide="play" class="w-4 h-4"></i></button>
            <audio src="${msg.content}" class="hidden" onplay="document.body.click()"></audio>
            <div class="flex-1">
                <div class="h-1 bg-gray-700 rounded w-full overflow-hidden"><div class="h-full bg-cyan-500 w-1/2"></div></div>
                <p class="text-[10px] text-gray-400 mt-1 italic">Mensaje de voz</p>
            </div>
        </div>`;

    div.innerHTML = `
        <span class="text-[10px] text-gray-500 mb-1 px-1">${msg.userName}</span>
        <div class="${isMe ? 'bg-emerald-700 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'} p-3 rounded-2xl shadow-md max-w-[85%] break-words">
            ${content}
        </div>`;
    els.chatArea.appendChild(div);
    els.chatArea.scrollTop = els.chatArea.scrollHeight;
    lucide.createIcons();
}

function escapeHtml(text) { 
    if(!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
}

// Auto-start si ya tenemos nombre
if (savedName) startApp();
