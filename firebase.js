import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, onChildAdded, remove, serverTimestamp, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { CONFIG, STATE } from './config.js';

let db, storage, auth;

export async function initFirebase(onMessage, onStreamStart, onStreamChunk) {
    try {
        const app = initializeApp(CONFIG.firebase);
        db = getDatabase(app);
        storage = getStorage(app);
        auth = getAuth(app);

        // 1. Autenticación Anónima (Vital para evitar bloqueos de reglas de seguridad)
        await signInAnonymously(auth);
        console.log("🔥 Firebase: Autenticado como anónimo");
        
        // Listeners
        startChatListener(onMessage);
        startStreamListener(onStreamStart, onStreamChunk);
        
        return true;
    } catch (e) {
        console.error("Firebase Error (Init):", e);
        return false;
    }
}

function startChatListener(callback) {
    // Solo traer los últimos 50 mensajes
    const chatRef = query(ref(db, 'messages'), limitToLast(50));
    onChildAdded(chatRef, (snapshot) => {
        callback(snapshot.val());
    });
}

function startStreamListener(onStart, onChunk) {
    const streamRef = ref(db, 'stream');
    
    // Escuchar nuevas sesiones de streaming
    onChildAdded(streamRef, (snapshot) => {
        const session = snapshot.val();
        const streamKey = snapshot.key;

        // Validar si es reciente (menos de 60seg de holgura)
        const isRecent = (Date.now() - (session.timestamp || 0)) < 60000;

        // IMPORTANTE: Bloqueamos eco, PERO asegúrate de probar con usuarios distintos
        if (session.userId !== STATE.user.id && isRecent) {
            console.log(`🎤 Detectada transmisión de: ${session.userName}`);
            
            // Notificar UI que alguien transmite
            onStart(session.userName);

            // Escuchar chunks de ESTA sesión específica
            // OPTIMIZACIÓN: limitToLast(3) para evitar descargar todo el historial del audio
            // Solo queremos lo que está pasando AHORA (live)
            const chunksRef = query(ref(db, `stream/${streamKey}/chunks`), limitToLast(3));
            
            onChildAdded(chunksRef, (chunkSnap) => {
                onChunk(chunkSnap.val());
            });
        } else {
            if(!isRecent) console.log("Stream ignorado por antiguo");
            if(session.userId === STATE.user.id) console.log("Stream ignorado (soy yo mismo)");
        }
    });
}

// --- ACCIONES ---

export async function sendText(text) {
    if (!text) return;
    try {
        await set(push(ref(db, 'messages')), {
            type: 'text',
            userId: STATE.user.id,
            userName: STATE.user.name,
            content: text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error enviando texto:", e);
    }
}

export async function sendLiveChunkData(streamId, base64) {
    try {
        // Actualizamos timestamp para mantener la sesión "viva"
        // Promise.all para que sea más rápido y paralelo
        await Promise.all([
            set(push(ref(db, `stream/${streamId}/chunks`)), base64),
            set(ref(db, `stream/${streamId}/timestamp`), Date.now()),
            // Setear datos de usuario solo si es necesario (optimización opcional)
            set(ref(db, `stream/${streamId}/userId`), STATE.user.id),
            set(ref(db, `stream/${streamId}/userName`), STATE.user.name)
        ]);
    } catch (e) {
        console.error("Error enviando chunk:", e);
    }
}

export async function uploadFinalAudio(blob, streamId, transcript = "") {
    const filename = `audios/${Date.now()}_${STATE.user.id}.webm`;
    const storageRef = sRef(storage, filename);
    
    try {
        const snap = await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);

        await set(push(ref(db, 'messages')), {
            type: 'audio',
            userId: STATE.user.id,
            userName: STATE.user.name,
            content: url,
            transcript: transcript,
            timestamp: serverTimestamp()
        });

        // Limpiar stream de la DB después de 5 segundos
        setTimeout(() => {
            remove(ref(db, `stream/${streamId}`)).catch(err => console.log("Error borrando stream viejo", err));
        }, 5000);
    } catch (e) {
        console.error("Error subiendo audio final:", e);
    }
}

export async function uploadImage(file) {
    try {
        const storageRef = sRef(storage, `images/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        
        await set(push(ref(db, 'messages')), {
            type: 'image',
            userId: STATE.user.id,
            userName: STATE.user.name,
            content: url,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error subiendo imagen:", e);
    }
}
