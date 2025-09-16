(function () {
    const loader = document.getElementById('appLoader');

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
