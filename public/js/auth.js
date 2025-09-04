// Authentication specific JavaScript

$(document).ready(function() {
    // Password strength indicator
    function checkPasswordStrength(password) {
        let strength = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            numbers: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        
        strength = Object.values(checks).filter(Boolean).length;
        
        return { strength, checks };
    }
    
    // Password strength visual indicator
    $('#password').on('input', function() {
        const password = $(this).val();
        const { strength, checks } = checkPasswordStrength(password);
        
        let strengthText = '';
        let strengthClass = '';
        
        switch(strength) {
            case 0:
            case 1:
                strengthText = 'Very Weak';
                strengthClass = 'text-danger';
                break;
            case 2:
                strengthText = 'Weak';
                strengthClass = 'text-warning';
                break;
            case 3:
                strengthText = 'Fair';
                strengthClass = 'text-info';
                break;
            case 4:
                strengthText = 'Good';
                strengthClass = 'text-primary';
                break;
            case 5:
                strengthText = 'Strong';
                strengthClass = 'text-success';
                break;
        }
        
        // Remove existing strength indicator
        $('.password-strength').remove();
        
        if (password.length > 0) {
            const indicator = $(`
                <div class="password-strength mt-1">
                    <small class="${strengthClass}">Password Strength: ${strengthText}</small>
                    <div class="progress mt-1" style="height: 4px;">
                        <div class="progress-bar bg-${strengthClass.replace('text-', '')}" 
                             style="width: ${(strength / 5) * 100}%"></div>
                    </div>
                </div>
            `);
            
            $(this).parent().after(indicator);
        }
    });
    
    // Real-time password confirmation
    $('#confirmPassword').on('input', function() {
        const password = $('#password').val();
        const confirmPassword = $(this).val();
        const feedback = $(this).siblings('.invalid-feedback');
        
        if (confirmPassword.length > 0) {
            if (password === confirmPassword) {
                $(this).removeClass('is-invalid').addClass('is-valid');
                feedback.text('Passwords match');
            } else {
                $(this).removeClass('is-valid').addClass('is-invalid');
                feedback.text('Passwords do not match');
            }
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });
    
    // Username availability check with debounce
    let usernameTimeout;
    $('#username').on('input', function() {
        const username = $(this).val().trim();
        const input = $(this);
        const feedback = input.siblings('.invalid-feedback');
        
        clearTimeout(usernameTimeout);
        
        if (username.length >= 3) {
            usernameTimeout = setTimeout(async function() {
                try {
                    input.removeClass('is-valid is-invalid');
                    
                    const response = await fetch('/auth/api/check-username', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ username })
                    });
                    
                    const data = await response.json();
                    
                    if (data.available) {
                        input.addClass('is-valid');
                        feedback.removeClass('invalid-feedback').addClass('valid-feedback');
                        feedback.text('Username available');
                    } else {
                        input.addClass('is-invalid');
                        feedback.removeClass('valid-feedback').addClass('invalid-feedback');
                        feedback.text(data.message || 'Username not available');
                    }
                } catch (error) {
                    // Username check error
                }
            }, 500);
        } else if (username.length > 0) {
            input.addClass('is-invalid');
            feedback.text('Username must be at least 3 characters');
        } else {
            input.removeClass('is-valid is-invalid');
        }
    });
    
    // Email availability check
    let emailTimeout;
    $('#email').on('blur', function() {
        const email = $(this).val().trim();
        const input = $(this);
        const feedback = input.siblings('.invalid-feedback');
        
        clearTimeout(emailTimeout);
        
        if (email.includes('@') && email.includes('.')) {
            emailTimeout = setTimeout(async function() {
                try {
                    const response = await fetch('/auth/api/check-email', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ email })
                    });
                    
                    const data = await response.json();
                    
                    if (data.available) {
                        input.addClass('is-valid');
                        feedback.removeClass('invalid-feedback').addClass('valid-feedback');
                        feedback.text('Email available');
                    } else {
                        input.addClass('is-invalid');
                        feedback.removeClass('valid-feedback').addClass('invalid-feedback');
                        feedback.text(data.message || 'Email already registered');
                    }
                } catch (error) {
                    // Email check error
                }
            }, 300);
        }
    });
    
    // Form validation before submit
    $('#registerForm').on('submit', function(e) {
        const form = $(this);
        let isValid = true;
        
        // Check required fields
        form.find('input[required]').each(function() {
            const input = $(this);
            if (!input.val().trim()) {
                input.addClass('is-invalid');
                isValid = false;
            }
        });
        
        // Check password match
        const password = $('#password').val();
        const confirmPassword = $('#confirmPassword').val();
        
        if (password !== confirmPassword) {
            $('#confirmPassword').addClass('is-invalid');
            $('#confirmPassword').siblings('.invalid-feedback').text('Passwords do not match');
            isValid = false;
        }
        
        // Check password strength
        const { strength } = checkPasswordStrength(password);
        if (strength < 3) {
            $('#password').addClass('is-invalid');
            $('#password').siblings('.invalid-feedback').text('Password is too weak');
            isValid = false;
        }
        
        if (!isValid) {
            e.preventDefault();
            window.PoolsApp.showToast('Please fix the errors in the form', 'danger');
        }
    });
    
    // Auto-focus first input
    $('input:visible:first').focus();
    
    // Remember me tooltip
    $('[data-bs-toggle="tooltip"]').tooltip();
    
    // Caps lock detection
    $('input[type="password"]').on('keypress', function(e) {
        const capsLockOn = e.originalEvent.getModifierState && e.originalEvent.getModifierState('CapsLock');
        const warning = $(this).siblings('.caps-lock-warning');
        
        if (capsLockOn) {
            if (!warning.length) {
                $('<small class="caps-lock-warning text-warning d-block">Caps Lock is on</small>')
                    .insertAfter($(this).parent());
            }
        } else {
            warning.remove();
        }
    });
    
    // Show/hide password toggle
    window.togglePasswordVisibility = function(fieldId) {
        const field = document.getElementById(fieldId);
        const buttonIcon = field.parentElement.querySelector('button i');
        
        if (field && buttonIcon) {
            if (field.type === 'password') {
                field.type = 'text';
                buttonIcon.className = 'fas fa-eye-slash';
            } else {
                field.type = 'password';
                buttonIcon.className = 'fas fa-eye';
            }
            
            // Refocus the field to maintain cursor position
            field.focus();
            
            // Set cursor to end of input
            const val = field.value;
            field.value = '';
            field.value = val;
        }
    };
    
    // Auto-timezone detection
    if ($('#timezone').length && !$('#timezone').val()) {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const mapping = {
                'America/New_York': 'America/New_York',
                'America/Detroit': 'America/New_York',
                'America/Chicago': 'America/Chicago',
                'America/Denver': 'America/Denver',
                'America/Phoenix': 'America/Phoenix',
                'America/Los_Angeles': 'America/Los_Angeles'
            };
            
            if (mapping[timezone]) {
                $('#timezone').val(mapping[timezone]);
            }
        } catch (error) {
            // Could not detect timezone
        }
    }
});

// Prevent form submission on Enter key in username/email fields during availability check
$('#username, #email').on('keypress', function(e) {
    if (e.which === 13) { // Enter key
        e.preventDefault();
        $(this).blur(); // Trigger availability check
    }
});