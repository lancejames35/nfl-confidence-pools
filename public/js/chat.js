// League Chat JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeChat();
    initializeThreadReplies();
    initializePollVoting();
    initializeThreadView();
});

function initializeChat() {
    // Handle thread type switching with event delegation
    const newThreadModal = document.getElementById('newThreadModal');
    if (newThreadModal) {
        newThreadModal.addEventListener('change', function(e) {
            if (e.target.name === 'threadType') {
                const generalFields = document.getElementById('generalThreadFields');
                const pollFields = document.getElementById('pollThreadFields');
                const postBtnText = document.getElementById('postThreadBtnText');
                
                if (e.target.value === 'general') {
                    if (generalFields) generalFields.style.display = 'block';
                    if (pollFields) pollFields.style.display = 'none';
                    if (postBtnText) postBtnText.textContent = 'Post Thread';
                } else if (e.target.value === 'poll') {
                    if (generalFields) generalFields.style.display = 'none';
                    if (pollFields) pollFields.style.display = 'block';
                    if (postBtnText) postBtnText.textContent = 'Create Poll';
                }
            }
        });
    }
    
    // Post new thread
    const postThreadBtn = document.getElementById('postThreadBtn');
    const threadMessage = document.getElementById('threadMessage');
    const threadTitle = document.getElementById('threadTitle');
    const newThreadForm = document.getElementById('newThreadForm');
    
    if (postThreadBtn) {
        postThreadBtn.addEventListener('click', async function() {
            const selectedType = document.querySelector('input[name="threadType"]:checked')?.value || 'general';
            
            if (selectedType === 'general') {
                const message = threadMessage.value.trim();
                const title = threadTitle.value.trim();
                if (!message) {
                    showToast('Please enter a message', 'error');
                    return;
                }
                
                await postGeneralThread(message, title);
            } else if (selectedType === 'poll') {
                await postPollThread();
            }
        });
    }
        
    // Auto-resize textarea for general threads
    if (threadMessage) {
        threadMessage.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }
    
    // Initialize add poll option functionality
    const addOptionBtn = document.getElementById('addPollOption');
    const pollOptionsContainer = document.getElementById('pollOptions');
    
    if (addOptionBtn && pollOptionsContainer) {
        addOptionBtn.addEventListener('click', function() {
            const optionCount = pollOptionsContainer.querySelectorAll('.poll-option-input').length;
            if (optionCount < 4) {
                const newOption = document.createElement('div');
                newOption.className = 'poll-option-input mb-2';
                newOption.innerHTML = `
                    <div class="input-group">
                        <input type="text" class="form-control poll-option" placeholder="Option ${optionCount + 1}" maxlength="100">
                        <button type="button" class="btn btn-outline-danger btn-sm remove-option">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                pollOptionsContainer.appendChild(newOption);
                
                // Add remove functionality
                newOption.querySelector('.remove-option').addEventListener('click', function() {
                    newOption.remove();
                    // Show add button again when option is removed
                    if (pollOptionsContainer.querySelectorAll('.poll-option-input').length < 4) {
                        addOptionBtn.style.display = 'inline-block';
                    }
                });
                
                // Hide add button if we've reached the limit
                if (pollOptionsContainer.querySelectorAll('.poll-option-input').length >= 4) {
                    addOptionBtn.style.display = 'none';
                }
            } else {
                showToast('Maximum 4 options allowed', 'warning');
            }
        });
    }
}

// Helper function to post general thread
async function postGeneralThread(message, title) {
    const postThreadBtn = document.getElementById('postThreadBtn');
    const newThreadForm = document.getElementById('newThreadForm');
    
    try {
        postThreadBtn.disabled = true;
        postThreadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Posting...';
        
        const response = await fetch(`/leagues/${window.leagueId}/chat/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                thread_title: title,
                message_type: 'chat'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Thread posted successfully!', 'success');
            
            // Close modal and refresh
            const modal = bootstrap.Modal.getInstance(document.getElementById('newThreadModal'));
            modal.hide();
            newThreadForm.reset();
            setTimeout(() => location.reload(), 500);
        } else {
            throw new Error(result.message || 'Failed to post thread');
        }
    } catch (error) {
        console.error('Error posting thread:', error);
        showToast('Failed to post thread: ' + error.message, 'error');
    } finally {
        postThreadBtn.disabled = false;
        postThreadBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i><span id="postThreadBtnText">Post Thread</span>';
    }
}

// Helper function to post poll thread
async function postPollThread() {
    const postThreadBtn = document.getElementById('postThreadBtn');
    const newThreadForm = document.getElementById('newThreadForm');
    const pollQuestion = document.getElementById('pollQuestion');
    const pollOptions = document.querySelectorAll('.poll-option');
    const pollType = document.getElementById('pollType');
    const pollExpires = document.getElementById('pollExpires');
    
    // Validation
    if (!pollQuestion.value.trim()) {
        showToast('Please enter a poll question', 'error');
        return;
    }
    
    const options = Array.from(pollOptions)
        .map(opt => opt.value.trim())
        .filter(opt => opt.length > 0);
    
    if (options.length < 2) {
        showToast('Please provide at least 2 poll options', 'error');
        return;
    }
    
    try {
        postThreadBtn.disabled = true;
        postThreadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating...';
        
        const response = await fetch(`/leagues/${window.leagueId}/chat/poll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                poll_question: pollQuestion.value.trim(),
                poll_type: pollType.value,
                options: options,
                expires_hours: pollExpires.value ? parseInt(pollExpires.value) : null,
                allow_add_options: false,
                anonymous_voting: false
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Poll created successfully!', 'success');
            
            // Close modal and refresh
            const modal = bootstrap.Modal.getInstance(document.getElementById('newThreadModal'));
            modal.hide();
            newThreadForm.reset();
            
            // Reset form to general thread view
            document.getElementById('generalThreadFields').style.display = 'block';
            document.getElementById('pollThreadFields').style.display = 'none';
            document.querySelector('input[name="threadType"][value="general"]').checked = true;
            
            setTimeout(() => location.reload(), 500);
        } else {
            throw new Error(result.message || 'Failed to create poll');
        }
    } catch (error) {
        console.error('Error creating poll:', error);
        showToast('Failed to create poll: ' + error.message, 'error');
    } finally {
        postThreadBtn.disabled = false;
        postThreadBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i><span id="postThreadBtnText">Create Poll</span>';
    }
}


function initializeThreadReplies() {
    // Show/hide reply forms
    const replyButtons = document.querySelectorAll('.reply-btn');
    const cancelReplyButtons = document.querySelectorAll('.cancel-reply-btn');
    const sendReplyButtons = document.querySelectorAll('.send-reply-btn');
    
    replyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const threadId = this.getAttribute('data-thread-id');
            const quickReply = document.querySelector(`.quick-reply[data-thread-id="${threadId}"]`);
            
            if (quickReply) {
                // Hide all other reply forms
                document.querySelectorAll('.quick-reply').forEach(form => {
                    if (form !== quickReply) {
                        form.style.display = 'none';
                    }
                });
                
                // Show this reply form
                quickReply.style.display = 'block';
                const input = quickReply.querySelector('.reply-input');
                input.focus();
            }
        });
    });
    
    cancelReplyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const quickReply = this.closest('.quick-reply');
            quickReply.style.display = 'none';
            quickReply.querySelector('.reply-input').value = '';
        });
    });
    
    sendReplyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const threadId = this.getAttribute('data-thread-id');
            sendReply(threadId);
        });
    });
    
    // Send reply on Enter key
    document.querySelectorAll('.reply-input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const threadId = this.closest('.quick-reply').getAttribute('data-thread-id');
                sendReply(threadId);
            }
        });
    });
    
    async function sendReply(threadId) {
        const quickReply = document.querySelector(`.quick-reply[data-thread-id="${threadId}"]`);
        const input = quickReply.querySelector('.reply-input');
        const sendBtn = quickReply.querySelector('.send-reply-btn');
        const message = input.value.trim();
        
        if (!message) {
            showToast('Please enter a reply', 'error');
            return;
        }
        
        try {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            const response = await fetch(`/leagues/${window.leagueId}/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    message_type: 'chat',
                    parent_message_id: parseInt(threadId)
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showToast('Reply posted!', 'success');
                
                // Hide reply form and clear input
                quickReply.style.display = 'none';
                input.value = '';
                
                // Refresh page to show new reply
                setTimeout(() => location.reload(), 500);
            } else {
                throw new Error(result.message || 'Failed to post reply');
            }
        } catch (error) {
            console.error('Error posting reply:', error);
            showToast('Failed to post reply: ' + error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
}

function initializePollVoting() {
    const voteButtons = document.querySelectorAll('.poll-vote-btn');
    
    voteButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            if (this.disabled) return;
            
            const pollId = this.getAttribute('data-poll-id');
            const optionId = this.getAttribute('data-option-id');
            
            try {
                this.disabled = true;
                const originalContent = this.innerHTML;
                this.innerHTML = '<div class="option-text">Voting...</div>';
                
                const response = await fetch(`/leagues/${window.leagueId}/chat/poll/${pollId}/vote`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        option_id: parseInt(optionId)
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Show appropriate message based on action
                    if (result.action === 'removed') {
                        showToast('Vote removed', 'info');
                    } else if (result.action === 'changed') {
                        showToast('Vote changed successfully', 'success');
                    } else {
                        showToast('Vote recorded successfully', 'success');
                    }
                    
                    // Update UI immediately
                    this.classList.add('voted');
                    
                    // Refresh to show updated vote counts and results
                    setTimeout(() => location.reload(), 800);
                } else {
                    throw new Error(result.message || 'Failed to vote');
                }
            } catch (error) {
                console.error('Error voting:', error);
                showToast('Failed to vote: ' + error.message, 'error');
                this.innerHTML = originalContent;
                this.disabled = false;
            }
        });
    });
}

// Utility function for toast notifications
function showToast(message, type = 'info') {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} position-fixed`;
    toast.style.cssText = `
        top: 20px; 
        right: 20px; 
        z-index: 1060; 
        max-width: 350px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border: none;
        border-radius: 8px;
    `;
    
    const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
    const iconColor = type === 'error' ? 'text-danger' : type === 'success' ? 'text-success' : 'text-info';
    
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${icon} ${iconColor} me-2"></i>
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close btn-close-sm ms-2" aria-label="Close"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 4 seconds
    const autoRemove = setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
    
    // Allow manual close
    toast.querySelector('.btn-close').addEventListener('click', () => {
        clearTimeout(autoRemove);
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    });
    
    // Add entrance animation
    toast.style.animation = 'slideIn 0.3s ease-out';
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Auto-scroll to bottom when page loads
window.addEventListener('load', function() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// Real-time updates (future enhancement)
// This is a placeholder for WebSocket implementation
function initializeRealTimeUpdates() {
    // TODO: Implement WebSocket connection for real-time chat updates
    // const ws = new WebSocket(`ws://localhost:3000/chat/${window.leagueId}`);
    // ws.onmessage = function(event) {
    //     const data = JSON.parse(event.data);
    //     // Handle new messages, votes, etc.
    // };
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to post thread when modal is open
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const newThreadModal = document.getElementById('newThreadModal');
        const createPollModal = document.getElementById('createPollModal');
        
        if (newThreadModal && newThreadModal.classList.contains('show')) {
            const postBtn = document.getElementById('postThreadBtn');
            if (postBtn && !postBtn.disabled) {
                postBtn.click();
            }
        } else if (createPollModal && createPollModal.classList.contains('show')) {
            const createBtn = document.getElementById('createPollBtn');
            if (createBtn && !createBtn.disabled) {
                createBtn.click();
            }
        }
    }
    
    // Escape to close reply forms
    if (e.key === 'Escape') {
        document.querySelectorAll('.quick-reply').forEach(form => {
            if (form.style.display !== 'none') {
                form.style.display = 'none';
                form.querySelector('.reply-input').value = '';
            }
        });
    }
});

// Thread view functionality
function initializeThreadView() {
    const postReplyBtn = document.getElementById('postReplyBtn');
    const replyMessage = document.getElementById('replyMessage');
    
    if (postReplyBtn && replyMessage) {
        postReplyBtn.addEventListener('click', async function() {
            const message = replyMessage.value.trim();
            if (!message) {
                showToast('Please enter a reply', 'error');
                return;
            }
            
            try {
                postReplyBtn.disabled = true;
                postReplyBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Posting...';
                
                const response = await fetch(`/leagues/${window.leagueId}/chat/message`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        parent_message_id: window.threadId,
                        message_type: 'chat'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showToast('Reply posted successfully!', 'success');
                    replyMessage.value = '';
                    
                    // Refresh page to show new reply
                    setTimeout(() => location.reload(), 500);
                } else {
                    throw new Error(result.message || 'Failed to post reply');
                }
            } catch (error) {
                console.error('Error posting reply:', error);
                showToast('Failed to post reply: ' + error.message, 'error');
            } finally {
                postReplyBtn.disabled = false;
                postReplyBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Post Reply';
            }
        });
        
        // Auto-resize textarea
        replyMessage.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }
    
    // Scroll to bottom of messages on page load
    const messagesContainer = document.getElementById('threadMessages');
    if (messagesContainer) {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }
}