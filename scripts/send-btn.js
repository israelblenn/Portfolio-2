(function () {
    var form = document.querySelector('form');
    var btn = document.getElementById('send-btn');
    var textEl = btn && btn.querySelector('.btn-text');
    if (!form || !btn || !textEl) return;

    var sentTriggerTime = 604.5; // Halfway through second slide
    var sentDuration = 5000;
    var greenDuration = 800; // Green background duration

    function resetButton() {
        // Fade out "sent" text
        textEl.classList.add('fade-out');
        
        setTimeout(function () {
            // Change text and fade in "send"
            textEl.textContent = 'send';
            textEl.classList.remove('fade-out');
            
            btn.classList.add('resetting');
            btn.classList.remove('sent');
            btn.classList.remove('sent-fade');
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    btn.classList.remove('resetting');
                });
            });
        }, 500); // Wait for fade out to complete
    }

    function startSlidingAnimation() {
        // Start the animation
        btn.classList.add('animating');

        // Add sent state at the right time (midway through animation)
        setTimeout(function () {
            btn.classList.add('sent');
            textEl.textContent = 'sent';
        }, sentTriggerTime);

        // Remove sending and animating classes after animation completes (1000ms total)
        setTimeout(function () {
            btn.classList.remove('sending');
            btn.classList.remove('animating');

            // Remove green background after 1 second
            setTimeout(function () {
                btn.classList.add('sent-fade');
            }, greenDuration);

            // Remove sent state after full duration
            setTimeout(function () {
                resetButton();
            }, sentDuration);
        }, 1000);
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        
        if (btn.classList.contains('sending') || btn.classList.contains('sent')) return;

        // Make button black (sending state) but don't start animation yet
        btn.classList.add('sending');

        // Collect form data
        var formData = new FormData(form);
        
        // Submit form to Web3Forms
        fetch(form.action, {
            method: 'POST',
            body: formData
        })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            // Only start animation if submission was successful
            if (data.success) {
                // Start the sliding animation
                startSlidingAnimation();
                
                // Reset form
                form.reset();
            } else {
                // Submission failed - reset button
                btn.classList.remove('sending');
                alert('Failed to send message. Please try again.');
            }
        })
        .catch(function (error) {
            // Error occurred - reset button
            btn.classList.remove('sending');
            alert('An error occurred. Please try again.');
            console.error('Form submission error:', error);
        });
    });
})();
