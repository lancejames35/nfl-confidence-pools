// League Show Page JavaScript

function copyJoinCode(elementId = 'joinCode') {
    const element = document.getElementById(elementId);
    const text = element.tagName === 'INPUT' ? element.value : element.textContent;
    
    navigator.clipboard.writeText(text).then(function() {
        showToast('Join code copied to clipboard!', 'success');
    }).catch(function(err) {
        showToast('Failed to copy join code', 'error');
    });
}

function regenerateJoinCode() {
    if (!confirm('Generate a new join code? The old code will stop working immediately.')) {
        return;
    }
    
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}/regenerate-code`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('joinCode').textContent = data.joinCode;
            const inviteCode = document.getElementById('inviteJoinCode');
            const inviteLink = document.getElementById('inviteLink');
            if (inviteCode) inviteCode.value = data.joinCode;
            if (inviteLink) {
                inviteLink.value = inviteLink.value.replace(/code=[A-Z0-9]+/, `code=${data.joinCode}`);
            }
            showToast('New join code generated successfully!', 'success');
        } else {
            showToast(data.message || 'Failed to generate new join code', 'error');
        }
    })
    .catch(error => {
        showToast('Error generating new join code', 'error');
    });
}

function removeMember(userId, username) {
    if (!confirm(`Remove ${username} from the league?`)) {
        return;
    }
    
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}/members/${userId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`${username} has been removed from the league`, 'success');
            location.reload();
        } else {
            showToast(data.message || 'Failed to remove member', 'error');
        }
    })
    .catch(error => {
        showToast('Error removing member', 'error');
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 1050; max-width: 300px;';
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto toast-close-btn"></button>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function deleteLeague() {
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('League deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        } else {
            showToast(data.message || 'Failed to delete league', 'error');
        }
    })
    .catch(error => {
        showToast('Error deleting league', 'error');
    });
}

function toggleMultiTierSettings() {
    const entryFeeSection = document.getElementById('entry-fee-section');
    const enableMultiTier = document.getElementById('enable_multi_tier');
    const multiTierSettings = document.getElementById('multi-tier-settings');
    const entryFee = document.getElementById('entry_fee');
    
    if (enableMultiTier && multiTierSettings) {
        if (enableMultiTier.checked) {
            multiTierSettings.style.display = 'block';
            if (entryFeeSection) {
                entryFeeSection.style.display = 'none';
            }
            const existingTierInputs = document.querySelectorAll('input[name="tier_name[]"]');
            const hasExistingData = Array.from(existingTierInputs).some(input => input.value.trim() !== '');
            if (!hasExistingData) {
                if (originalTierData.length > 0) {
                    restoreOriginalTierData();
                } else {
                    resetTiersToDefault();
                }
            }
        } else {
            multiTierSettings.style.display = 'none';
            if (entryFeeSection) {
                entryFeeSection.style.display = 'block';
            }
        }
    }
}

function resetTiersToDefault() {
    const tiersContainer = document.getElementById('tiers-container');
    const entryFee = document.getElementById('entry_fee');
    const baseFee = parseFloat(entryFee?.value || 0);
    
    if (tiersContainer) {
        tierCounter = 2;
        
        tiersContainer.innerHTML = `
            <div class="tier-row" data-tier="1">
                <div class="row mb-3">
                    <div class="col-md-4">
                        <label class="form-label">Tier Name <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="tier_name[]" value="" placeholder="e.g., Standard" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Entry Fee ($) <span class="text-danger">*</span></label>
                        <input type="number" class="form-control" name="tier_fee[]" value="${baseFee}" min="0" step="0.01" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Description <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="tier_description[]" value="" placeholder="Describe what this tier includes" required>
                    </div>
                    <div class="col-md-1">
                        <label class="form-label">&nbsp;</label>
                        <button type="button" class="btn btn-sm btn-outline-danger d-block remove-tier-btn" title="Remove tier" disabled>
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="tier-row" data-tier="2">
                <div class="row mb-3">
                    <div class="col-md-4">
                        <label class="form-label">Tier Name <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="tier_name[]" value="" placeholder="e.g., Premium" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Entry Fee ($) <span class="text-danger">*</span></label>
                        <input type="number" class="form-control" name="tier_fee[]" value="${baseFee * 2}" min="0" step="0.01" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Description <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="tier_description[]" value="" placeholder="Describe what this tier includes" required>
                    </div>
                    <div class="col-md-1">
                        <label class="form-label">&nbsp;</label>
                        <button type="button" class="btn btn-sm btn-outline-danger d-block remove-tier-btn" title="Remove tier">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

// Global variables
let tierCounter = 2;
let currentEditingUserId = null;
let commissionerMessages = [];
let originalTierData = [];
let originalLeagueData = {};
let originalPayoutData = {
    payout_calculations_enabled: false,
    expense_amount: 0,
    expense_description: '',
    manual_payout_message: '',
    weekly_pool_enabled: false,
    weekly_positions: 3,
    weekly_pool_type: 'percentage',
    weekly_pool_percentage: 70,
    season_pool_enabled: false,
    season_positions: 3,
    season_pool_type: 'percentage',
    season_pool_percentage: 30
};

let currentPayoutData = {
    totalPurse: 0,
    expenseAmount: 0,
    netPurse: 0,
    weeklyPool: 0,
    seasonPool: 0,
    unallocated: 0
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set up league ID for other functions to use
    const leagueIdElement = document.querySelector('[data-league-id]');
    if (leagueIdElement) {
        document.body.setAttribute('data-league-id', leagueIdElement.getAttribute('data-league-id'));
    }
    
    // Initialize page functionality
    initializeEventListeners();
    initializePageData();
});

function initializeEventListeners() {
    // Join code functionality
    const copyJoinCodeBtn = document.getElementById('copyJoinCodeBtn');
    if (copyJoinCodeBtn) {
        copyJoinCodeBtn.addEventListener('click', () => copyJoinCode());
    }
    
    const regenerateJoinCodeBtn = document.getElementById('regenerateJoinCodeBtn');
    if (regenerateJoinCodeBtn) {
        regenerateJoinCodeBtn.addEventListener('click', regenerateJoinCode);
    }
    
    // Live Scores toggle button event listener
    const liveScoresToggleBtn = document.getElementById('liveScoresToggleBtn');
    const liveScoresPanel = document.getElementById('liveScoresMonitoring');
    if (liveScoresToggleBtn && liveScoresPanel) {
        liveScoresToggleBtn.addEventListener('click', function() {
            const bsCollapse = new bootstrap.Collapse(liveScoresPanel, { toggle: true });
            
            // Load live scores status when panel opens
            if (!liveScoresPanel.classList.contains('show')) {
                setTimeout(loadLiveScoresStatus, 500); // Wait for panel to open
            }
        });
    }
    
    // Live scores refresh button
    const refreshStatusBtn = document.getElementById('refreshStatusBtn');
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', loadLiveScoresStatus);
    }
    
    
    // Delete league confirmation
    const confirmLeagueNameInput = document.getElementById('confirmLeagueName');
    if (confirmLeagueNameInput) {
        confirmLeagueNameInput.addEventListener('input', function() {
            const expectedName = this.getAttribute('data-league-name');
            const enteredName = this.value;
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            
            if (deleteBtn) {
                if (enteredName === expectedName) {
                    deleteBtn.disabled = false;
                    deleteBtn.classList.remove('btn-secondary');
                    deleteBtn.classList.add('btn-danger');
                } else {
                    deleteBtn.disabled = true;
                    deleteBtn.classList.add('btn-secondary');
                    deleteBtn.classList.remove('btn-danger');
                }
            }
        });
    }
    
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteLeague);
    }
    
    // Event delegation for dynamic elements
    document.addEventListener('click', function(e) {
        if (e.target.closest('.copy-join-code-btn')) {
            const target = e.target.closest('.copy-join-code-btn').getAttribute('data-target');
            copyJoinCode(target);
        }
        
        if (e.target.closest('.toast-close-btn')) {
            e.target.closest('.alert').remove();
        }
    });
}

function initializePageData() {
    // Load any initial data needed for the page
    loadCommissionerMessages();
}

// Live Scores Functions
async function loadLiveScoresStatus() {
    const statusDiv = document.getElementById('liveScoresStatus');
    
    try {
        statusDiv.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-info" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2 text-muted">Loading live scores status...</p>
            </div>`;

        const [schedulerResponse, rateLimitResponse] = await Promise.all([
            fetch('/api/live-scores/scheduler/status'),
            fetch('/api/live-scores/rate-limit')
        ]);

        if (!schedulerResponse.ok || !rateLimitResponse.ok) {
            throw new Error('Failed to fetch live scores status');
        }

        const schedulerData = await schedulerResponse.json();
        const rateLimitData = await rateLimitResponse.json();

        displayLiveScoresStatus(schedulerData, rateLimitData);
        
    } catch (error) {
        statusDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Failed to load live scores status: ${error.message}
            </div>`;
    }
}

function displayLiveScoresStatus(schedulerData, rateLimitData) {
    const statusDiv = document.getElementById('liveScoresStatus');
    const scheduler = schedulerData.scheduler;
    const rateLimit = rateLimitData.rateLimit;
    const recentCalls = rateLimitData.recentCalls || [];
    
    let nextGameInfo = '';
    if (schedulerData.nextGame) {
        const gameTime = new Date(schedulerData.nextGame.kickoff);
        nextGameInfo = `
            <div class="col-md-6">
                <h6><i class="fas fa-clock me-2"></i>Next Game</h6>
                <p class="mb-1"><strong>${schedulerData.nextGame.teams}</strong></p>
                <p class="text-muted small">${gameTime.toLocaleString()}</p>
            </div>`;
    } else {
        nextGameInfo = `
            <div class="col-md-6">
                <h6><i class="fas fa-clock me-2"></i>Next Game</h6>
                <p class="text-muted">No upcoming games found</p>
            </div>`;
    }
    
    const statusIndicator = scheduler.isRunning 
        ? '<span class="badge bg-success"><i class="fas fa-play me-1"></i>Active</span>'
        : '<span class="badge bg-secondary"><i class="fas fa-pause me-1"></i>Inactive</span>';
    
    const rateLimitColor = rateLimit.remainingCalls > 50 ? 'success' : 
                          rateLimit.remainingCalls > 20 ? 'warning' : 'danger';
    
    const cacheAge = rateLimit.cacheAge ? Math.round(rateLimit.cacheAge / 1000 / 60) : 'N/A';
    
    statusDiv.innerHTML = `
        <div class="row g-3">
            <div class="col-md-6">
                <h6><i class="fas fa-robot me-2"></i>Scheduler Status</h6>
                <p class="mb-1">${statusIndicator}</p>
                <small class="text-muted">
                    Live games: ${schedulerData.liveGamesCount}<br>
                    Has active task: ${scheduler.hasActiveTask ? 'Yes' : 'No'}
                </small>
            </div>
            ${nextGameInfo}
            <div class="col-md-6">
                <h6><i class="fas fa-tachometer-alt me-2"></i>API Usage (Last Hour)</h6>
                <p class="mb-1">
                    <span class="badge bg-${rateLimitColor}">${rateLimit.callsInLastHour} / ${rateLimit.maxCallsPerHour}</span>
                </p>
                <small class="text-muted">
                    Remaining: ${rateLimit.remainingCalls} calls<br>
                    Cache age: ${cacheAge} minutes
                </small>
            </div>
            <div class="col-md-6">
                <h6><i class="fas fa-sync-alt me-2"></i>Last Update</h6>
                <p class="text-muted small">
                    ${rateLimit.cacheAge ? 
                        `${Math.round(rateLimit.cacheAge / 1000)} seconds ago` : 
                        'No recent updates'
                    }
                </p>
            </div>
        </div>
        
        <div class="mt-3">
            <h6><i class="fas fa-info-circle me-2"></i>System Status</h6>
            <div class="progress mb-2" style="height: 8px;">
                <div class="progress-bar bg-${rateLimitColor}" role="progressbar" 
                     style="width: ${(rateLimit.remainingCalls / rateLimit.maxCallsPerHour) * 100}%">
                </div>
            </div>
            <small class="text-muted">
                ${scheduler.isRunning ? 
                    'Live score updates are running. Updates occur every 5 minutes during games.' :
                    'Live score updates are inactive. Will start automatically 30 minutes before next game.'
                }
            </small>
        </div>
        
        ${recentCalls.length > 0 ? `
        <div class="mt-4">
            <h6><i class="fas fa-list me-2"></i>Recent API Calls</h6>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentCalls.map(call => {
                            const callTime = new Date(call.called_at);
                            const timeAgo = Math.round((Date.now() - callTime.getTime()) / 60000);
                            const typeIcon = call.response_cached ? 
                                '<i class="fas fa-database text-info" title="Cached"></i>' : 
                                '<i class="fas fa-globe text-warning" title="API Call"></i>';
                            const statusIcon = call.success ? 
                                '<i class="fas fa-check-circle text-success"></i>' : 
                                '<i class="fas fa-times-circle text-danger"></i>';
                            
                            return `
                                <tr>
                                    <td>${timeAgo} min ago</td>
                                    <td>${typeIcon} ${call.response_cached ? 'Cache' : 'API'}</td>
                                    <td>${statusIcon} ${call.success ? 'Success' : 'Failed'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}`;
}

// Commissioner Messages Functions
function loadCommissionerMessages() {
    const leagueId = document.body.getAttribute('data-league-id');
    if (!leagueId) return;
    
    fetch(`/leagues/${leagueId}/messages`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            commissionerMessages = data.messages || [];
            displayCommissionerMessages();
        }
    })
    .catch(error => {
        displayCommissionerMessages(); // Show empty state if error
    });
}

function displayCommissionerMessages() {
    const messagesContainer = document.getElementById('commissionerMessages');
    if (!messagesContainer) return;
    
    if (commissionerMessages.length > 0) {
        messagesContainer.innerHTML = commissionerMessages.map(message => `
            <div class="border-bottom pb-2 mb-2 ${message.important ? 'border-warning-subtle bg-warning-subtle' : ''}" data-message-id="${message.message_id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div class="flex-grow-1">
                        <strong class="text-dark">${message.important ? '⚠️ ' : ''}${message.title}</strong>
                    </div>
                    <small class="text-muted">${new Date(message.created_at).toLocaleDateString()}</small>
                </div>
                <div class="text-dark mb-1">${message.content}</div>
                <div class="small text-muted">
                    <i class="fas fa-crown me-1"></i>Posted by ${message.posted_by || 'Commissioner'}
                </div>
            </div>
        `).join('');
    } else {
        messagesContainer.innerHTML = `
            <div class="text-muted text-center py-3">
                <i class="fas fa-message me-2"></i>
                No messages posted yet
            </div>
        `;
    }
}