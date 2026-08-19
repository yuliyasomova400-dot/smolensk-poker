// =====================================================
// СМОЛЕНСКИЙ ПОКЕР — ЛОГИКА ГЛАВНОЙ СТРАНИЦЫ
// =====================================================

let audioContext = null;

function playClick() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(720, now);
        oscillator.frequency.exponentialRampToValueAtTime(360, now + 0.055);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(now);
        oscillator.stop(now + 0.07);
    } catch (error) {
        console.error("Не удалось воспроизвести звук:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", playClick);
    });

    // ИГРАТЬ → покерный стол
    const playButton = document.getElementById("playButton");
    if (playButton) {
        playButton.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "table.html";
            }, 150);
        });
    }

    // ВОЙТИ → страница авторизации
    const loginButton = document.getElementById("loginButton");
    if (loginButton) {
        loginButton.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "login.html";
            }, 150);
        });
    }

    const messages = {
        ratingButton: "Рейтинг — скоро",
        profileButton: "Профиль — скоро",
        avatarButton: "Аватар — скоро",
        settingsButton: "Настройки — скоро",
        rulesButton: "Правила — скоро",
        newsButton: "Новости — скоро"
    };

    Object.entries(messages).forEach(([id, message]) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener("click", () => alert(message));
        }
    });
});
