// =========================================================
// СМОЛЕНСКИЙ ПОКЕР — ЛОГИКА СТРАНИЦЫ ВХОДА
// =========================================================

document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");
    const login = document.getElementById("login");
    const showPassword = document.getElementById("showPassword");
    const password = document.getElementById("password");
    const forgotButton = document.getElementById("forgotButton");
    const registerButton = document.getElementById("registerButton");
    const backButton = document.getElementById("backButton");

    // Убираем нарисованный на фоне текст поля, когда пользователь начинает вводить.
    function updateInputState(input) {
        if (!input || !input.parentElement) return;
        input.parentElement.classList.toggle("has-value", input.value.length > 0);
    }

    [login, password].forEach(function (input) {
        if (!input) return;
        input.addEventListener("input", function () {
            updateInputState(input);
        });
        input.addEventListener("change", function () {
            updateInputState(input);
        });
        updateInputState(input);
    });

    // Показать / скрыть пароль
    if (showPassword && password) {
        showPassword.addEventListener("click", function () {
            if (password.type === "password") {
                password.type = "text";
                showPassword.textContent = "◉";
                showPassword.setAttribute("aria-label", "Скрыть пароль");
            } else {
                password.type = "password";
                showPassword.textContent = "◉";
                showPassword.setAttribute("aria-label", "Показать пароль");
            }
        });
    }

    // Вход — пока демонстрационный режим
    if (loginForm) {
        loginForm.addEventListener("submit", function (event) {
            event.preventDefault();

            const loginValue = login.value.trim();
            const passwordValue = password.value.trim();

            if (!loginValue || !passwordValue) {
                alert("Введите электронную почту / телефон и пароль.");
                return;
            }

            alert("Авторизация будет подключена следующим этапом.");
        });
    }

    // Забыли пароль
    if (forgotButton) {
        forgotButton.addEventListener("click", function () {
            alert("Восстановление пароля будет подключено следующим этапом.");
        });
    }

    // Регистрация
    if (registerButton) {
        registerButton.addEventListener("click", function () {
            window.location.href = "register.html";
        });
    }

    // Назад на главную
    if (backButton) {
        backButton.addEventListener("click", function () {
            window.location.href = "index.html";
        });
    }

});
