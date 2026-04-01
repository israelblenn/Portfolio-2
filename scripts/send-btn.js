(function () {
    function createAnimatedFormSubmitController(options) {
        if (!options || !options.form || !options.button || !options.textEl) return null;

        var form = options.form;
        var button = options.button;
        var textEl = options.textEl;
        var whiteTextEl = options.whiteTextEl || null;
        var classNames = options.classNames || {};
        var labels = options.labels || {};
        var timings = options.timings || {};

        var sendingClass = classNames.sending || 'sending';
        var animatingClass = classNames.animating || 'animating';
        var sentClass = classNames.sent || 'sent';
        var sentFadeClass = classNames.sentFade || 'sent-fade';
        var resettingClass = classNames.resetting || 'resetting';

        var idleLabel = labels.idle || 'send';
        var sentLabel = labels.sent || 'sent';
        var sentTriggerTime = typeof timings.sentTriggerTime === 'number' ? timings.sentTriggerTime : 604.5;
        var sentDuration = typeof timings.sentDuration === 'number' ? timings.sentDuration : 5000;
        var greenDuration = typeof timings.greenDuration === 'number' ? timings.greenDuration : 800;
        var sending = false;
        var sent = false;

        function resolveIdleLabel() {
            if (typeof options.getIdleLabel === 'function') return options.getIdleLabel();
            return idleLabel;
        }

        function setLabel(value) {
            textEl.textContent = value;
            if (whiteTextEl) whiteTextEl.textContent = value;
        }

        function notifyStateChange() {
            if (typeof options.onStateChange === 'function') {
                options.onStateChange({ sending: sending, sent: sent });
            }
        }

        function resetButton() {
            textEl.classList.add('fade-out');
            setTimeout(function() {
                setLabel(resolveIdleLabel());
                textEl.classList.remove('fade-out');
                button.classList.add(resettingClass);
                button.classList.remove(sentClass);
                button.classList.remove(sentFadeClass);
                sent = false;
                notifyStateChange();
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        button.classList.remove(resettingClass);
                    });
                });
            }, 500);
        }

        function startSlidingAnimation() {
            button.classList.add(animatingClass);

            setTimeout(function() {
                button.classList.add(sentClass);
                setLabel(sentLabel);
                sent = true;
                notifyStateChange();
            }, sentTriggerTime);

            setTimeout(function() {
                button.classList.remove(sendingClass);
                button.classList.remove(animatingClass);
                sending = false;
                notifyStateChange();

                setTimeout(function() {
                    button.classList.add(sentFadeClass);
                }, greenDuration);

                setTimeout(function() {
                    resetButton();
                }, sentDuration);
            }, 1000);
        }

        function handleError(message, error) {
            button.classList.remove(sendingClass);
            sending = false;
            notifyStateChange();
            if (typeof options.onError === 'function') {
                options.onError(message, error);
            } else {
                alert(message);
                if (error) console.error('Form submission error:', error);
            }
        }

        function submit(event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (sending || sent) return Promise.resolve(false);
            if (!form.checkValidity()) {
                form.reportValidity();
                return Promise.resolve(false);
            }

            button.classList.add(sendingClass);
            sending = true;
            notifyStateChange();

            var formData = new FormData(form);
            return fetch(form.action, {
                method: 'POST',
                body: formData
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data && data.success) {
                    startSlidingAnimation();
                    form.reset();
                    if (typeof options.onSuccess === 'function') options.onSuccess(data);
                    return true;
                }
                handleError('Failed to send message. Please try again.');
                return false;
            })
            .catch(function(error) {
                handleError('An error occurred. Please try again.', error);
                return false;
            });
        }

        return {
            submit: submit,
            setLabel: setLabel,
            isSending: function() { return sending; },
            isSent: function() { return sent; }
        };
    }

    window.createAnimatedFormSubmitController = createAnimatedFormSubmitController;

    var form = document.querySelector('form');
    var btn = document.getElementById('send-btn');
    var textEl = btn && btn.querySelector('.btn-text');
    var whiteTextEl = btn && btn.querySelector('.btn-text-white');
    if (!form || !btn || !textEl) return;

    var mobileController = createAnimatedFormSubmitController({
        form: form,
        button: btn,
        textEl: textEl,
        whiteTextEl: whiteTextEl,
        classNames: {
            sending: 'sending',
            animating: 'animating',
            sent: 'sent',
            sentFade: 'sent-fade',
            resetting: 'resetting'
        },
        labels: {
            idle: 'send',
            sent: 'sent'
        },
        timings: {
            sentTriggerTime: 604.5,
            sentDuration: 5000,
            greenDuration: 800
        }
    });

    form.addEventListener('submit', function(event) {
        mobileController.submit(event);
    });
})();
