import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, onChildAdded, remove, serverTimestamp, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { CONFIG, STATE } from './config.js';

let db, storage;

export function initFirebase(onMessage, onStreamStart, onStreamChunk) {
    try {
        const app = initializeApp(CONFIG.firebase);
        db = getDatabase(app);
        storage = getStorage(app);
        
        // Listeners
        startChatListener(onMessage);
        startStreamListener(onStreamStart, onStreamChunk);
        
        return true;
    } catch (e) {
        console.error("Firebase Error:", e);
        return false;
    }
}

function startChatListener(callback) {
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

        // Validar si es reciente (menos de 30seg)
        const isRecent = (Date.now() - (session.timestamp || 0)) < 30000;

        if (session.userId !== STATE.user.id && isRecent) {
            // Notificar UI que alguien transmite
            onStart(session.userName);

            // Escuchar chunks de ESTA sesión específica
            const chunksRef = ref(db, `stream/${streamKey}/chunks`);
            onChildAdded(chunksRef, (chunkSnap) => {
                onChunk(chunkSnap.val());
            });
        }
    });
}

// --- ACCIONES ---

export async function sendText(text) {
    if (!text) return;
    await set(push(ref(db, 'messages')), {
        type: 'text',
        userId: STATE.user.id,
        userName: STATE.user.name,
        content: text,
        timestamp: serverTimestamp()
    });
}

export async function sendLiveChunkData(streamId, base64) {
    // 1. Crear sesión si es el primer chunk
    const sessionRef = ref(db, `stream/${streamId}`);
    // Usamos update para no sobrescribir si ya existe, pero set en chunks
    // Nota: Para optimizar, asumimos que los metadatos se mandan una vez
    
    // 2. Enviar chunk
    await set(push(ref(db, `stream/${streamId}/chunks`)), base64);
    
    // 3. Mantener metadatos vivos
    await set(ref(db, `stream/${streamId}/userId`), STATE.user.id);
    await set(ref(db, `stream/${streamId}/userName`), STATE.user.name);
    await set(ref(db, `stream/${streamId}/timestamp`), Date.now());
}

export async function uploadFinalAudio(blob, streamId, transcript = "") {
    const filename = `audios/${Date.now()}_${STATE.user.id}.webm`;
    const storageRef = sRef(storage, filename);
    
    try {
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);

        await set(push(ref(db, 'messages')), {
            type: 'audio',
            userId: STATE.user.id,
            userName: STATE.user.name,
            content: url,
            transcript: transcript,
            timestamp: serverTimestamp()
        });

        // Limpiar stream de la DB después de un rato
        setTimeout(() => remove(ref(db, `stream/${streamId}`)), 5000);
    } catch (e) {
        console.error("Error subiendo audio final:", e);
    }
}

export async function uploadImage(file) {
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
}
