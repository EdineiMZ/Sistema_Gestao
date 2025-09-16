(function () {
    const loader = document.getElementById('appLoader');
    const THEME_STORAGE_KEY = 'app-theme';
    const themeRoot = document.getElementById('appShell');
    const themeToggle = document.getElementById('themeToggle');
    const themeToggleIcon = document.getElementById('themeToggleIcon');
    const themeToggleLabel = document.querySelector('[data-theme-label]');
    const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const safeStorage = {
        get(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (error) {
                return null;
            }
        },
        set(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (error) {
                /* Ignorar indisponibilidade do armazenamento, comum em modos privados */
            }
        }
    };

    const applyTheme = (theme) => {
        const normalized = theme === 'dark' ? 'dark' : 'light';

        if (themeRoot) {
            themeRoot.classList.remove('theme-dark', 'theme-light');
            themeRoot.classList.add(`theme-${normalized}`);
            themeRoot.setAttribute('data-theme', normalized);
        }

        if (document.body) {
            document.body.classList.remove('theme-dark', 'theme-light');
            document.body.classList.add(`theme-${normalized}`);
            document.body.setAttribute('data-theme', normalized);
        }

        document.documentElement.setAttribute('data-theme', normalized);

        if (themeToggle) {
            themeToggle.setAttribute('aria-pressed', normalized === 'dark');
            themeToggle.setAttribute(
                'aria-label',
                normalized === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'
            );
            themeToggle.dataset.theme = normalized;
        }

        if (themeToggleIcon) {
            themeToggleIcon.classList.remove('bi-sun', 'bi-sun-fill', 'bi-moon', 'bi-moon-stars', 'bi-moon-stars-fill');
            themeToggleIcon.classList.add(normalized === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars');
        }

        if (themeToggleLabel) {
            themeToggleLabel.textContent = normalized === 'dark' ? 'Modo claro' : 'Modo escuro';
        }

        return normalized;
    };

    const resolvePreferredTheme = () => {
        const stored = safeStorage.get(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') {
            return stored;
        }
        if (prefersDark && typeof prefersDark.matches === 'boolean') {
            return prefersDark.matches ? 'dark' : 'light';
        }
        return 'light';
    };

    let activeTheme = applyTheme(resolvePreferredTheme());

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            activeTheme = activeTheme === 'dark' ? 'light' : 'dark';
            safeStorage.set(THEME_STORAGE_KEY, activeTheme);
            activeTheme = applyTheme(activeTheme);
        });
    }

    const handleSystemPreference = (event) => {
        const stored = safeStorage.get(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') {
            return;
        }
        activeTheme = applyTheme(event.matches ? 'dark' : 'light');
    };

    if (prefersDark) {
        if (typeof prefersDark.addEventListener === 'function') {
            prefersDark.addEventListener('change', handleSystemPreference);
        } else if (typeof prefersDark.addListener === 'function') {
            prefersDark.addListener(handleSystemPreference);
        }
    }

    window.addEventListener('load', () => {
        setTimeout(() => {
            if (loader) {
                loader.classList.add('is-hidden');
            }
        }, 280);
    });

    document.addEventListener('DOMContentLoaded', () => {
        const alertElements = document.querySelectorAll('[data-auto-dismiss]');
        alertElements.forEach((alert) => {
            const timeout = Number(alert.getAttribute('data-auto-dismiss')) || 5000;
            setTimeout(() => {
                const instance = bootstrap.Alert.getOrCreateInstance(alert);
                instance.close();
            }, timeout);
        });

        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.forEach((tooltipTriggerEl) => {
            new bootstrap.Tooltip(tooltipTriggerEl);
        });

        const needsValidation = document.querySelectorAll('.needs-validation');
        needsValidation.forEach((form) => {
            form.addEventListener('submit', (event) => {
                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            });
        });

        const schedulePreview = document.querySelector('[data-schedule-preview]');
        if (schedulePreview) {
            const triggerInput = document.querySelector('[name="triggerDate"]');
            if (triggerInput) {
                triggerInput.addEventListener('input', () => {
                    const value = triggerInput.value;
                    schedulePreview.textContent = value
                        ? new Date(value).toLocaleString('pt-BR')
                        : 'Disparo imediato após salvar';
                });
            }
        }
    });
})();
