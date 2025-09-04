// Dashboard JavaScript functionality
document.addEventListener('DOMContentLoaded', function() {
    // Enhanced League Selector Handler with better persistence
    initializeLeagueSelector();
    
    // Initialize chat functionality
    initializeChat();
    
    // Initialize NFL kickoff countdown
    initializeKickoffCountdown();
    
    // Initialize invite modal copy button
    const copyMessageBtn = document.getElementById('copyMessageBtn');
    if (copyMessageBtn) {
        copyMessageBtn.addEventListener('click', copyInviteMessage);
    }
});

function initializeLeagueSelector() {
    const leagueSelector = document.getElementById('leagueSelector');
    if (!leagueSelector) {
        // No league selector means no leagues - disable league-specific links
        const picksLink = document.getElementById('picks-link');
        const resultsLink = document.getElementById('results-link');
        const standingsLink = document.getElementById('standings-link');
        
        if (picksLink) picksLink.href = '/picks';
        if (resultsLink) resultsLink.href = '/results';
        if (standingsLink) standingsLink.href = '/standings';
        return;
    }
    
    // Get current league ID from URL or default
    const urlParams = new URLSearchParams(window.location.search);
    const urlLeagueId = urlParams.get('league_id');
    
    // Set the selector to match URL parameter if provided, or use stored preference
    if (urlLeagueId) {
        const option = leagueSelector.querySelector(`option[value="${urlLeagueId}"]`);
        if (option) {
            leagueSelector.value = urlLeagueId;
            // Store this as the user's preference
            sessionStorage.setItem('selectedLeagueId', urlLeagueId);
            const entryId = option.dataset.entryId || '';
            if (entryId) {
                sessionStorage.setItem('selectedEntryId', entryId);
            }
        }
    } else {
        // No URL parameter, check if we should redirect to maintain user's league selection
        const storedLeagueId = sessionStorage.getItem('selectedLeagueId');
        if (storedLeagueId) {
            const option = leagueSelector.querySelector(`option[value="${storedLeagueId}"]`);
            if (option && leagueSelector.value !== storedLeagueId) {
                // Redirect to maintain the league selection in URL
                const url = new URL(window.location);
                url.searchParams.set('league_id', storedLeagueId);
                window.location.replace(url.toString());
                return;
            }
        }
    }
    
    leagueSelector.addEventListener('change', function() {
        const selectedLeagueId = this.value;
        const selectedOption = this.options[this.selectedIndex];
        const entryId = selectedOption.dataset.entryId || '';
        
        // Store in sessionStorage for persistence
        sessionStorage.setItem('selectedLeagueId', selectedLeagueId);
        if (entryId) {
            sessionStorage.setItem('selectedEntryId', entryId);
        }
        
        // Update navigation links immediately
        updateNavigationLinks(selectedLeagueId, entryId);
        
        // Update commissioner button visibility
        updateCommissionerButton();
        
        // Update invite modal data if it exists
        updateInviteModalData();
        
        // Reload dashboard with selected league
        const url = new URL(window.location);
        url.searchParams.set('league_id', selectedLeagueId);
        window.location.href = url.toString();
    });
    
    // Set initial links based on current selection
    const currentLeagueId = leagueSelector.value;
    const currentOption = leagueSelector.options[leagueSelector.selectedIndex];
    const currentEntryId = currentOption ? (currentOption.dataset.entryId || '') : '';
    
    // Always update navigation links with current selection
    updateNavigationLinks(currentLeagueId, currentEntryId);
    
    // Update commissioner button visibility
    updateCommissionerButton();
    
    // Update invite modal data if available
    updateInviteModalData();
    
    // Store current selection for future reference
    if (currentLeagueId) {
        sessionStorage.setItem('selectedLeagueId', currentLeagueId);
        if (currentEntryId) {
            sessionStorage.setItem('selectedEntryId', currentEntryId);
        }
    }
}

function updateNavigationLinks(leagueId, entryId) {
    const picksLink = document.getElementById('picks-link');
    const resultsLink = document.getElementById('results-link');
    const standingsLink = document.getElementById('standings-link');
    
    if (picksLink) {
        picksLink.href = entryId ? `/picks/${leagueId}/${entryId}` : `/picks/${leagueId}/new`;
    }
    if (resultsLink) resultsLink.href = `/results?league_id=${leagueId}`;
    if (standingsLink) standingsLink.href = `/standings?league_id=${leagueId}`;
}

function updateCommissionerButton() {
    const leagueSelector = document.getElementById('leagueSelector');
    const manageButton = document.getElementById('manageLeagueBtn');
    
    if (!leagueSelector || !manageButton) return;
    
    const selectedOption = leagueSelector.options[leagueSelector.selectedIndex];
    const isCommissioner = selectedOption.dataset.isCommissioner === 'true';
    const leagueId = selectedOption.value;
    
    if (isCommissioner) {
        manageButton.style.display = 'inline-block';
        manageButton.href = `/leagues/${leagueId}`;
    } else {
        manageButton.style.display = 'none';
    }
}

function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatMessages = document.getElementById('chatMessages');
    
    if (!chatInput || !sendChatBtn) return;
    
    // Send message on button click
    sendChatBtn.addEventListener('click', sendMessage);
    
    // Send message on Enter key press
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize input and handle Shift+Enter for new lines
    chatInput.addEventListener('input', function() {
        const isEmpty = this.value.trim().length === 0;
        sendChatBtn.disabled = isEmpty;
        
        // Auto-resize input based on content
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    
    // Auto-scroll chat to bottom on page load
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Initial button state
    sendChatBtn.disabled = chatInput.value.trim().length === 0;
    
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        const leagueId = document.getElementById('leagueSelector')?.value;
        if (!leagueId) return;
        
        // Disable input while sending
        chatInput.disabled = true;
        sendChatBtn.disabled = true;
        
        try {
            const response = await fetch('/api/league-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    league_id: leagueId,
                    message: message
                })
            });
            
            if (response.ok) {
                // Clear input
                chatInput.value = '';
                chatInput.style.height = 'auto';
                
                // Add message to chat (optimistic update)
                addMessageToChat({
                    author_name: window.currentUser?.username || 'You',
                    message: message,
                    formatted_time: 'just now',
                    is_commissioner: window.isCommissioner || false
                });
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            // Error sending message
            showToast('Failed to send message. Please try again.', 'error');
        } finally {
            // Re-enable input
            chatInput.disabled = false;
            sendChatBtn.disabled = false;
            chatInput.focus();
        }
    }
    
    function addMessageToChat(messageData) {
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <div class="chat-header">
                <div class="chat-author">
                    <i class="fas fa-user-circle text-primary me-1"></i>
                    <strong>${messageData.author_name}</strong>
                    ${messageData.is_commissioner ? '<i class="fas fa-crown text-warning ms-1" title="Commissioner"></i>' : ''}
                </div>
                <div class="chat-time">
                    ${messageData.formatted_time}
                </div>
            </div>
            <div class="chat-content">
                ${messageData.message}
            </div>
        `;
        
        // Remove "no messages" placeholder if it exists
        const noMessages = chatMessages.querySelector('.no-chat-messages');
        if (noMessages) {
            noMessages.remove();
        }
        
        // Add new message
        chatMessages.appendChild(messageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function initializeKickoffCountdown() {
    // Get first game kickoff timestamp from server (ISO format)
    const firstGameKickoffTimestamp = window.firstGameKickoffTimestamp;
    
    if (!firstGameKickoffTimestamp) {
        // No game data available, hide countdown
        const countdownEl = document.getElementById('kickoff-countdown');
        if (countdownEl) {
            countdownEl.style.display = 'none';
        }
        return;
    }
    
    // Parse timestamp directly - same logic as picks page
    const kickoffDate = new Date(firstGameKickoffTimestamp);
    
    // Display the time in user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formattedTime = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    }).format(kickoffDate);
    
    // Update the display
    const kickoffTimeEl = document.getElementById('kickoff-time');
    if (kickoffTimeEl) {
        kickoffTimeEl.textContent = formattedTime;
    }
    
    function updateCountdown() {
        const now = new Date().getTime();
        const kickoffTime = kickoffDate.getTime();
        const timeRemaining = kickoffTime - now;
        
        if (timeRemaining > 0) {
            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            // Update countdown display
            const daysEl = document.getElementById('countdown-days');
            const hoursEl = document.getElementById('countdown-hours');
            const minutesEl = document.getElementById('countdown-minutes');
            const secondsEl = document.getElementById('countdown-seconds');
            
            if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
            if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
            if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
            if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
        } else {
            // Game has started or passed
            const countdownEl = document.getElementById('kickoff-countdown');
            if (countdownEl) {
                countdownEl.innerHTML = '<div class="game-started">The 2025 NFL Season has begun!</div>';
                clearInterval(countdownInterval);
            }
        }
    }
    
    // Update countdown immediately
    updateCountdown();
    
    // Update countdown every second
    const countdownInterval = setInterval(updateCountdown, 1000);
}

// Utility function for toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; max-width: 300px;';
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto"></button>
        </div>
    `;
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
    
    // Allow manual close
    toast.querySelector('.btn-close').addEventListener('click', () => {
        toast.remove();
    });
}

// Commissioner Functions (if needed)
function saveLeagueSettings() {
    const form = document.getElementById('leagueSettingsForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Add league ID from current selection
    const leagueSelector = document.getElementById('leagueSelector');
    if (!leagueSelector) {
        showToast('No league selected', 'error');
        return;
    }
    
    const leagueId = leagueSelector.value;
    
    fetch(`/leagues/${leagueId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showToast('League settings updated successfully!', 'success');
            const modal = document.getElementById('leagueSettingsModal');
            if (modal && window.bootstrap) {
                bootstrap.Modal.getInstance(modal).hide();
            }
            setTimeout(() => location.reload(), 1000);
        } else {
            showToast('Error updating settings: ' + result.message, 'error');
        }
    })
    .catch(error => {
        // Error occurred
        showToast('Error updating league settings', 'error');
    });
}

function inviteMember() {
    const email = document.getElementById('inviteEmail')?.value;
    if (!email) {
        showToast('Please enter an email address', 'error');
        return;
    }
    
    const leagueSelector = document.getElementById('leagueSelector');
    if (!leagueSelector) return;
    
    fetch('/api/league/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            league_id: leagueSelector.value,
            email: email
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showToast('Invite sent successfully!', 'success');
            const emailInput = document.getElementById('inviteEmail');
            if (emailInput) emailInput.value = '';
        } else {
            showToast('Error sending invite: ' + result.message, 'error');
        }
    })
    .catch(error => {
        // Error occurred
        showToast('Error sending invite', 'error');
    });
}

function copyInviteLink() {
    const linkInput = document.getElementById('inviteLink');
    if (!linkInput) return;
    
    linkInput.select();
    document.execCommand('copy');
    
    const button = linkInput.nextElementSibling;
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            button.innerHTML = originalHTML;
        }, 1000);
    }
    
    showToast('Invite link copied to clipboard!', 'success');
}

function postCommissionerMessage() {
    const form = document.getElementById('commissionerMessageForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const message = formData.get('message');
    const isImportant = formData.get('is_important') === 'on';
    
    if (!message?.trim()) {
        showToast('Please enter a message', 'error');
        return;
    }
    
    const leagueSelector = document.getElementById('leagueSelector');
    if (!leagueSelector) return;
    
    fetch('/api/commissioner/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            league_id: leagueSelector.value,
            message: message,
            is_important: isImportant
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showToast('Message posted successfully!', 'success');
            const modal = document.getElementById('postMessageModal');
            if (modal && window.bootstrap) {
                bootstrap.Modal.getInstance(modal).hide();
            }
            setTimeout(() => location.reload(), 1000);
        } else {
            showToast('Error posting message: ' + result.message, 'error');
        }
    })
    .catch(error => {
        // Error occurred
        showToast('Error posting message', 'error');
    });
}

// Invite Users Modal Functions
function copyToClipboard(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    navigator.clipboard.writeText(input.value).then(() => {
        // Visual feedback
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        button.classList.add('btn-success');
        button.classList.remove('btn-outline-primary');
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('btn-success');
            button.classList.add('btn-outline-primary');
        }, 1500);
        
        showToast('Copied to clipboard!', 'success');
    }).catch(err => {
        // Failed to copy
        // Fallback method
        input.select();
        document.execCommand('copy');
        showToast('Copied to clipboard!', 'success');
    });
}

function updateInviteModalData() {
    const leagueSelector = document.getElementById('leagueSelector');
    if (!leagueSelector) return;
    
    const selectedOption = leagueSelector.options[leagueSelector.selectedIndex];
    const joinCode = selectedOption ? selectedOption.dataset.joinCode : '';
    
    // Use current window location for dynamic base URL (works with any domain/subdomain)
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}/invite/${joinCode}`;
    
    // Update the dynamic link span
    const linkSpan = document.getElementById('dynamicInviteLink');
    if (linkSpan) {
        linkSpan.textContent = inviteLink;
    }
}

function copyInviteMessage() {
    const inviteMessageDiv = document.getElementById('inviteMessage');
    const copyBtn = document.getElementById('copyMessageBtn');
    
    if (!inviteMessageDiv) return;
    
    // Get the full message including the dynamic link
    const message = inviteMessageDiv.textContent.trim();
    
    navigator.clipboard.writeText(message).then(() => {
        // Visual feedback
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check me-2"></i>Copied!';
        copyBtn.classList.add('btn-success');
        copyBtn.classList.remove('btn-primary');
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('btn-success');
            copyBtn.classList.add('btn-primary');
        }, 2000);
        
        showToast('Message copied to clipboard!', 'success');
    }).catch(err => {
        // Failed to copy
        // Fallback method
        const textArea = document.createElement('textarea');
        textArea.value = message;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Message copied to clipboard!', 'success');
    });
}