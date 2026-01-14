import { STATE } from './config.js';

export class AudioEngine {
    constructor() {
        this.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new this.AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = STATE.volume;
        this.masterGain.connect(this.ctx.destination);
        
        this.mediaRecorder = null;
        this.stream = null;
        this.streamId = null;
        this.fullAudioChunks = []; // Para el archivo final
        this.chunkInterval = null;
        this.nextPlayTime = 0;
    }

    setVolume(value) {
        STATE.volume = value;
        if(this.masterGain) this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }

    resumeContext() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    playBeep(freq = 440) {
        this.resumeContext();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    async startRecording(onChunk, onStop) {
        if (STATE.isRecording) return;
        
        this.resumeContext();
        this.playBeep(600); // Beep inicio

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.streamId = `stream_${Date.now()}_${STATE.user.id}`;
            this.fullAudioChunks = []; // Limpiar buffer global
            
            // Códecs optimizados para voz
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                ? 'audio/webm;codecs=opus' 
                : 'audio/webm';
            
            // --- ESTRATEGIA DE SLICING (Fragmentación) ---
            // Creamos instancias cortas para asegurar headers válidos en cada chunk
            const startSlice = () => {
                if (!STATE.isRecording) return;

                const recorder = new MediaRecorder(this.stream, { mimeType });
                
                recorder.ondataavailable = async (e) => {
                    if (e.data.size > 0) {
                        // 1. Guardar para el archivo histórico final
                        this.fullAudioChunks.push(e.data);
                        
                        // 2. Enviar para streaming en vivo
                        const reader = new FileReader();
                        reader.readAsDataURL(e.data);
                        reader.onloadend = () => {
                            const base64data = reader.result.split(',')[1];
                            onChunk(this.streamId, base64data);
                        };
                    }
                };

                recorder.start();
                
                // Detener este fragmento en 800ms
                setTimeout(() => {
                    if (recorder.state === 'recording') recorder.stop();
                }, 800);
            };

            STATE.isRecording = true;

            // Iniciar ciclo de grabación
            startSlice(); 
            this.chunkInterval = setInterval(startSlice, 850); // Pequeño solapamiento

        } catch (err) {
            console.error("Error Micrófono:", err);
            alert("No se pudo acceder al micrófono.");
            STATE.isRecording = false;
        }
    }

    stopRecording(onFinalize) {
        if (!STATE.isRecording) return;
        
        STATE.isRecording = false;
        clearInterval(this.chunkInterval);
        this.playBeep(400); // Beep fin

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        // Compilar archivo final para historial
        const fullBlob = new Blob(this.fullAudioChunks, { type: 'audio/webm' });
        if(onFinalize) onFinalize(fullBlob, this.streamId);
    }

    async playStreamChunk(base64data) {
        this.resumeContext();
        try {
            const binaryString = window.atob(base64data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
            
            // Decodificar fragmento de audio
            const audioBuffer = await this.ctx.decodeAudioData(bytes.buffer);
            
            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.masterGain);

            // Jitter Buffer simple para suavizar reproducción
            const now = this.ctx.currentTime;
            const startAt = Math.max(now, this.nextPlayTime);
            
            source.start(startAt);
            this.nextPlayTime = startAt + audioBuffer.duration;

        } catch (e) {
            console.warn("Frame de audio perdido o corrupto:", e);
        }
    }
}
