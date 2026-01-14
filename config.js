export const CONFIG = {
    firebase: {
        apiKey: "AIzaSyASWpIx5lvoYHHcyQzv3A2sJfU-TtNwIO8",
        authDomain: "a-ver-charlen.firebaseapp.com",
        databaseURL: "https://a-ver-charlen-default-rtdb.firebaseio.com", 
        projectId: "a-ver-charlen",
        storageBucket: "a-ver-charlen.firebasestorage.app",
        messagingSenderId: "414933228498",
        appId: "1:414933228498:web:fae4c31dfa855addd7c60b"
    },
    // Dejar en null si no se usa
    openai: null
};

export const STATE = {
    user: { id: null, name: 'Anon' },
    volume: 1.0,
    isRecording: false
};
