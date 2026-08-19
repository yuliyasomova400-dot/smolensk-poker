// =====================================================
// СМОЛЕНСКИЙ ПОКЕР — ЗВУКИ И КНОПКИ
// =====================================================

const clickSound = new Audio("./sounds/click.mp3");
clickSound.preload = "auto";
clickSound.volume = 0.55;

let audioContext = null;

function fallbackClick() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(620, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
            420,
            audioContext.currentTime + 0.06
        );

        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.12,
            audioContext.currentTime + 0.005
        );
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + 0.07
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.08);
    } catch (error) {
        console.log("Звук недоступен:", error);
    }
}

function playClick() {
    clickSound.currentTime = 0;

    const promise = clickSound.play();

    if (promise !== undefined) {
        promise.catch(() => {
            fallbackClick();
        });
    }
}


document.addEventListener("DOMContentLoaded", () => {

    const buttons = document.querySelectorAll("button");

    buttons.forEach(button => {
        button.addEventListener("click", playClick);
    });

    // Кнопка ИГРАТЬ
    const playButton = document.getElementById("playButton");

    if (playButton) {
        playButton.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "table.html";
            }, 180);
        });
    }

    // Остальные кнопки
    const ratingButton = document.getElementById("ratingButton");
    if (ratingButton) {
        ratingButton.addEventListener("click", () => {
            alert("Рейтинг — скоро");
        });
    }

    const profileButton = document.getElementById("profileButton");
    if (profileButton) {
        profileButton.addEventListener("click", () => {
            alert("Профиль — скоро");
        });
    }

    const avatarButton = document.getElementById("avatarButton");
    if (avatarButton) {
        avatarButton.addEventListener("click", () => {
            alert("Аватар — скоро");
        });
    }

    const settingsButton = document.getElementById("settingsButton");
    if (settingsButton) {
        settingsButton.addEventListener("click", () => {
            alert("Настройки — скоро");
        });
    }

    const rulesButton = document.getElementById("rulesButton");
    if (rulesButton) {
        rulesButton.addEventListener("click", () => {
            alert("Правила — скоро");
        });
    }

    const newsButton = document.getElementById("newsButton");
    if (newsButton) {
        newsButton.addEventListener("click", () => {
            alert("Новости — скоро");
        });
    }
});
