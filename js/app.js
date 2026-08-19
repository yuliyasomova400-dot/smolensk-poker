// =====================================================
// СМОЛЕНСКИЙ ПОКЕР — ЗВУКИ КНОПОК
// =====================================================

const clickSound = new Audio("sounds/click.mp3");

clickSound.volume = 0.35;

function playClick() {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});
}


// Все кнопки сайта
document.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", playClick);
});


// Кнопка «ИГРАТЬ»
const playButton = document.getElementById("playButton");

if (playButton) {
    playButton.addEventListener("click", function () {
        setTimeout(() => {
            window.location.href = "table.html";
        }, 100);
    });
}


// Остальные кнопки
const ratingButton = document.getElementById("ratingButton");
if (ratingButton) {
    ratingButton.addEventListener("click", function () {
        alert("Рейтинг — скоро");
    });
}

const profileButton = document.getElementById("profileButton");
if (profileButton) {
    profileButton.addEventListener("click", function () {
        alert("Профиль — скоро");
    });
}

const avatarButton = document.getElementById("avatarButton");
if (avatarButton) {
    avatarButton.addEventListener("click", function () {
        alert("Аватар — скоро");
    });
}

const settingsButton = document.getElementById("settingsButton");
if (settingsButton) {
    settingsButton.addEventListener("click", function () {
        alert("Настройки — скоро");
    });
}

const rulesButton = document.getElementById("rulesButton");
if (rulesButton) {
    rulesButton.addEventListener("click", function () {
        alert("Правила — скоро");
    });
}

const newsButton = document.getElementById("newsButton");
if (newsButton) {
    newsButton.addEventListener("click", function () {
        alert("Новости — скоро");
    });
}
