// NFL Confidence Pools Platform - Main JavaScript (Vanilla JS)

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips and popovers if Bootstrap is available
    if (typeof bootstrap !== 'undefined') {
        // Initialize tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
        
        // Initialize popovers
        const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
        const popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
            return new bootstrap.Popover(popoverTriggerEl);
        });
    }
    
    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-danger)');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            if (alert && alert.parentNode) {
                alert.style.transition = 'opacity 0.5s ease';
                alert.style.opacity = '0';
                setTimeout(function() {
                    if (alert.parentNode) {
                        alert.parentNode.removeChild(alert);
                    }
                }, 500);
            }
        }, 5000);
    });
    
    // Form validation helper
    function validateForm(formSelector) {
        const form = document.querySelector(formSelector);
        if (!form) return false;
        
        const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;
        
        inputs.forEach(function(input) {
            const value = input.value.trim();
            
            if (!value) {
                input.classList.add('is-invalid');
                input.classList.remove('is-valid');
                isValid = false;
            } else {
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
            }
        });
        
        return isValid;
    }
    
    // Real-time form validation
    const formElements = document.querySelectorAll('input, select, textarea');
    formElements.forEach(function(element) {
        element.addEventListener('blur', function() {
            const value = this.value.trim();
            
            if (this.hasAttribute('required')) {
                if (!value) {
                    this.classList.add('is-invalid');
                    this.classList.remove('is-valid');
                } else {
                    this.classList.remove('is-invalid');
                    this.classList.add('is-valid');
                }
            }
        });
    });
    
    // Loading button helper
    function setButtonLoading(button, loading = true) {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || button.innerHTML;
        }
    }
    
    // Form submission with loading states
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            const submitBtn = form.querySelector('button[type="submit"]');
            
            // Add loading state
            if (submitBtn) {
                setButtonLoading(submitBtn, true);
                
                // Remove loading state after form processes (fallback)
                setTimeout(function() {
                    setButtonLoading(submitBtn, false);
                }, 10000);
            }
        });
    });
    
    // Smooth scrolling for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);
            
            if (target) {
                const offsetTop = target.offsetTop - 70;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Mobile menu improvements
    const navbarToggler = document.querySelector('.navbar-toggler');
    if (navbarToggler) {
        navbarToggler.addEventListener('click', function() {
            setTimeout(function() {
                const navbarCollapse = document.querySelector('.navbar-collapse');
                if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                    document.body.classList.add('menu-open');
                } else {
                    document.body.classList.remove('menu-open');
                }
            }, 350);
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.navbar')) {
            const navbarCollapse = document.querySelector('.navbar-collapse.show');
            if (navbarCollapse && typeof bootstrap !== 'undefined') {
                const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
                if (bsCollapse) {
                    bsCollapse.hide();
                }
            }
            document.body.classList.remove('menu-open');
        }
    });
    
    // Copy to clipboard helper
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('Copied to clipboard!', 'success');
            }).catch(function(err) {
                console.error('Failed to copy: ', err);
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    }
    
    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showToast('Copied to clipboard!', 'success');
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        
        document.body.removeChild(textArea);
    }
    
    // Toast notification helper
    function showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }
        
        const toastHtml = `
            <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        
        const toastElement = document.createElement('div');
        toastElement.innerHTML = toastHtml;
        const toast = toastElement.firstElementChild;
        
        container.appendChild(toast);
        
        // Show toast if Bootstrap is available
        if (typeof bootstrap !== 'undefined') {
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
            
            // Remove from DOM after hiding
            toast.addEventListener('hidden.bs.toast', function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            });
        } else {
            // Fallback without Bootstrap
            toast.style.display = 'block';
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 5000);
        }
    }
    
    // Prevent form double-submission
    const submitForms = document.querySelectorAll('form');
    submitForms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
            if (form.dataset.submitted === 'true') {
                e.preventDefault();
                return false;
            }
            
            form.dataset.submitted = 'true';
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
            }
            
            // Re-enable after timeout (fallback)
            setTimeout(function() {
                form.dataset.submitted = 'false';
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            }, 5000);
        });
    });
    
    // Expose utilities globally
    window.PoolsApp = {
        validateForm: validateForm,
        setButtonLoading: setButtonLoading,
        copyToClipboard: copyToClipboard,
        showToast: showToast,
        getUrlParameter: getUrlParameter
    };
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator && window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        }).then(function(registration) {
            console.log('SW registered: ', registration);
            
            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available
                        if (window.PoolsApp && window.PoolsApp.showToast) {
                            window.PoolsApp.showToast('App updated! Refresh to get the latest version.', 'info');
                        }
                    }
                });
            });
        }).catch(function(registrationError) {
            console.log('SW registration failed: ', registrationError);
            // Don't show error to user - service worker is optional
        });
    });
}

// Network status indicator
window.addEventListener('online', function() {
    if (window.PoolsApp) {
        window.PoolsApp.showToast('Connection restored', 'success');
    }
});

window.addEventListener('offline', function() {
    if (window.PoolsApp) {
        window.PoolsApp.showToast('Connection lost', 'warning');
    }
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    // Don't show toast for every error in production
    if (window.location.hostname === 'localhost' && window.PoolsApp) {
        window.PoolsApp.showToast('An error occurred', 'danger');
    }
});

// URL parameter helper
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Performance monitoring
if (typeof performance !== 'undefined') {
    window.addEventListener('load', function() {
        setTimeout(function() {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            console.log('Page load time:', loadTime + 'ms');
        }, 0);
    });
}

// Connection status indicator
function updateConnectionStatus() {
    const indicator = document.getElementById('connection-status');
    if (indicator) {
        const isOnline = navigator.onLine;
        indicator.className = isOnline ? 'connected' : 'disconnected';
        indicator.title = isOnline ? 'Online' : 'Offline';
    }
}

// Update connection status on page load and network changes
document.addEventListener('DOMContentLoaded', updateConnectionStatus);
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);