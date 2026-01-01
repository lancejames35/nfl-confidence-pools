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
    
    // Manual ESPN update button
    const manualEspnUpdateBtn = document.getElementById('manualEspnUpdateBtn');
    if (manualEspnUpdateBtn) {
        manualEspnUpdateBtn.addEventListener('click', triggerManualEspnUpdate);
    }
    
    // Settings toggle button
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const settingsPanel = document.getElementById('leagueSettings');
    if (settingsToggleBtn && settingsPanel) {
        settingsToggleBtn.addEventListener('click', function() {
            const bsCollapse = new bootstrap.Collapse(settingsPanel, { toggle: true });
        });
    }
    
    // Post message button
    const postMessageBtn = document.getElementById('postMessageBtn');
    if (postMessageBtn) {
        postMessageBtn.addEventListener('click', postCommissionerMessage);
    }
    
    // Save member changes button
    const saveMemberChangesBtn = document.getElementById('saveMemberChangesBtn');
    if (saveMemberChangesBtn) {
        saveMemberChangesBtn.addEventListener('click', saveMemberChanges);
    }
    
    // Regenerate join code modal button
    const regenerateJoinCodeModalBtn = document.getElementById('regenerateJoinCodeModalBtn');
    if (regenerateJoinCodeModalBtn) {
        regenerateJoinCodeModalBtn.addEventListener('click', regenerateJoinCode);
    }
    
    // Make commissioner button
    const makeCommissionerBtn = document.getElementById('makeCommissionerBtn');
    if (makeCommissionerBtn) {
        makeCommissionerBtn.addEventListener('click', toggleCommissionerStatus);
    }
    
    // Remove member button
    const removeMemberBtn = document.getElementById('removeMemberBtn');
    if (removeMemberBtn) {
        removeMemberBtn.addEventListener('click', function() {
            if (currentEditingUserId) {
                const username = document.getElementById('editUsername').value;
                removeMember(currentEditingUserId, username);
            }
        });
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
        
        // Edit member button
        if (e.target.closest('.edit-member-btn')) {
            const btn = e.target.closest('.edit-member-btn');
            openEditMemberModal(btn);
        }
        
        // Remove tier buttons
        if (e.target.closest('.remove-tier-btn')) {
            const tierRow = e.target.closest('.tier-row');
            removeTier(tierRow);
        }
        
        // Add tier button
        if (e.target.closest('#addTierBtn')) {
            addTier();
        }
        
        // Position adjustment buttons
        if (e.target.closest('[data-action]')) {
            const action = e.target.closest('[data-action]').getAttribute('data-action');
            adjustPositions(action);
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

async function triggerManualEspnUpdate() {
    const btn = document.getElementById('manualEspnUpdateBtn');
    const originalHtml = btn.innerHTML;
    
    try {
        // Show loading state
        btn.disabled = true;
        btn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            Running Update...
        `;
        
        const response = await fetch('/api/live-scores/manual-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`ESPN Update Complete: ${data.gamesProcessed} games processed, ${data.gamesUpdated} updated`, 'success');
            
            // Refresh the live scores status
            setTimeout(() => {
                loadLiveScoresStatus();
            }, 1000);
        } else {
            showToast(`ESPN Update Failed: ${data.error}`, 'error');
        }
        
    } catch (error) {
        showToast(`ESPN Update Error: ${error.message}`, 'error');
    } finally {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalHtml;
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

// Edit Member Modal Functions
function openEditMemberModal(btn) {
    const modal = document.getElementById('editMemberModal');
    if (!modal) return;
    
    // Extract data from button
    currentEditingUserId = btn.dataset.userId;
    const userData = {
        username: btn.dataset.username,
        firstName: btn.dataset.firstName || '',
        lastName: btn.dataset.lastName || '',
        email: btn.dataset.email,
        tier: btn.dataset.tier || 'Standard',
        tierId: btn.dataset.tierId || '',
        paymentStatus: btn.dataset.paymentStatus || 'unpaid',
        amountOwed: parseFloat(btn.dataset.amountOwed) || 0,
        amountPaid: parseFloat(btn.dataset.amountPaid) || 0,
        entryCount: parseInt(btn.dataset.entryCount) || 1,
        role: btn.dataset.role || 'participant'
    };
    
    // Populate modal fields
    document.getElementById('editMemberName').textContent = userData.username;
    document.getElementById('editUsername').value = userData.username;
    document.getElementById('editFirstName').value = userData.firstName;
    document.getElementById('editLastName').value = userData.lastName;
    document.getElementById('editEmail').value = userData.email;
    document.getElementById('editPassword').value = '';
    document.getElementById('editEntryCount').value = userData.entryCount;
    document.getElementById('editEntryCountDisplay').textContent = userData.entryCount;
    document.getElementById('editAmountOwed').value = userData.amountOwed.toFixed(2);
    document.getElementById('editAmountPaid').value = userData.amountPaid.toFixed(2);
    
    // Update role display
    updateRoleDisplay(userData.role);
    
    
    // Populate tier dropdown if multi-tier is enabled
    if (leagueData.enable_multi_tier) {
        populateTierDropdown(userData.tierId);
    }
    
    // Update payment status
    updatePaymentStatusDisplay(userData.amountPaid, userData.amountOwed);
    
    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

function updateRoleDisplay(role) {
    const roleIcon = document.getElementById('editRoleIcon');
    const roleDisplay = document.getElementById('editRoleDisplay');
    const makeCommissionerBtn = document.getElementById('makeCommissionerBtn');
    
    if (role === 'commissioner') {
        roleIcon.textContent = '👑';
        roleDisplay.value = 'Main Commissioner';
        if (makeCommissionerBtn) makeCommissionerBtn.style.display = 'none';
    } else if (role === 'co_commissioner') {
        roleIcon.textContent = '🤝';
        roleDisplay.value = 'Co-Commissioner';
        if (makeCommissionerBtn) {
            makeCommissionerBtn.textContent = 'Remove Commissioner Status';
            makeCommissionerBtn.className = 'btn btn-outline-warning w-100';
        }
    } else {
        roleIcon.textContent = '👤';
        roleDisplay.value = 'Participant';
        if (makeCommissionerBtn) {
            makeCommissionerBtn.textContent = 'Make Co-Commissioner';
            makeCommissionerBtn.className = 'btn btn-warning w-100';
        }
    }
}

function updatePaymentStatusDisplay(amountPaid, amountOwed) {
    const statusIcon = document.getElementById('paymentStatusIcon');
    const statusDisplay = document.getElementById('editPaymentStatus');
    const tolerance = 0.01;
    
    if (amountOwed === 0) {
        statusIcon.textContent = '🆓';
        statusDisplay.value = 'Free';
    } else if (Math.abs(amountPaid - amountOwed) < tolerance) {
        statusIcon.textContent = '✅';
        statusDisplay.value = 'Paid';
    } else if (amountPaid > amountOwed + tolerance) {
        statusIcon.textContent = '💰';
        statusDisplay.value = 'Overpaid';
    } else if (amountPaid > tolerance) {
        statusIcon.textContent = '⚠️';
        statusDisplay.value = 'Partial Payment';
    } else {
        statusIcon.textContent = '❌';
        statusDisplay.value = 'Unpaid';
    }
}

function populateTierDropdown(selectedTierId) {
    const tierSelect = document.getElementById('editTier');
    if (!tierSelect) return;
    
    // Clear existing options
    tierSelect.innerHTML = '';
    
    // Fetch tiers for this league
    fetch(`/leagues/${leagueData.league_id}/tiers`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.tiers) {
                data.tiers.forEach((tier, index) => {
                    const option = document.createElement('option');
                    option.value = tier.tier_id;
                    option.textContent = `${tier.tier_name} - $${parseFloat(tier.entry_fee).toFixed(2)}`;
                    option.dataset.fee = tier.entry_fee;
                    
                    if (selectedTierId && selectedTierId == tier.tier_id) {
                        option.selected = true;
                    } else if (!selectedTierId && index === 0) {
                        // Select first tier by default if no tier is assigned
                        option.selected = true;
                    }
                    
                    tierSelect.appendChild(option);
                });
                
                // Add change event listener
                tierSelect.addEventListener('change', updateAmountOwedBasedOnTier);
            }
        })
        .catch(error => {
            console.error('Error fetching tiers:', error);
        });
}

function updateAmountOwedBasedOnTier() {
    const tierSelect = document.getElementById('editTier');
    const amountOwedInput = document.getElementById('editAmountOwed');
    const entryCountDisplay = document.getElementById('editEntryCountDisplay');
    
    if (!tierSelect || !amountOwedInput || !entryCountDisplay) return;
    
    const selectedOption = tierSelect.options[tierSelect.selectedIndex];
    if (selectedOption && selectedOption.dataset.fee) {
        const tierFee = parseFloat(selectedOption.dataset.fee);
        const entryCount = parseInt(entryCountDisplay.textContent) || 1;
        const totalOwed = tierFee * entryCount;
        
        amountOwedInput.value = totalOwed.toFixed(2);
        
        // Update payment status
        const amountPaid = parseFloat(document.getElementById('editAmountPaid').value) || 0;
        updatePaymentStatusDisplay(amountPaid, totalOwed);
    }
}

// Tier management functions
function addTier() {
    const tiersContainer = document.getElementById('tiers-container');
    if (!tiersContainer) return;
    
    tierCounter++;
    const newTier = document.createElement('div');
    newTier.className = 'tier-row';
    newTier.setAttribute('data-tier', tierCounter);
    
    newTier.innerHTML = `
        <div class="row mb-3">
            <div class="col-md-4">
                <label class="form-label">Tier Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" name="tier_name[]" value="" placeholder="e.g., VIP" required>
            </div>
            <div class="col-md-3">
                <label class="form-label">Entry Fee ($) <span class="text-danger">*</span></label>
                <input type="number" class="form-control" name="tier_fee[]" value="0" min="0" step="0.01" required>
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
    `;
    
    tiersContainer.appendChild(newTier);
}

function removeTier(tierRow) {
    const tiersContainer = document.getElementById('tiers-container');
    const tierRows = tiersContainer.querySelectorAll('.tier-row');
    
    // Don't allow removing if only one tier remains
    if (tierRows.length <= 1) {
        showToast('You must have at least one tier', 'error');
        return;
    }
    
    tierRow.remove();
    
    // Update the first tier's remove button (disable if it's the only one left)
    const remainingRows = tiersContainer.querySelectorAll('.tier-row');
    if (remainingRows.length === 1) {
        const firstRemoveBtn = remainingRows[0].querySelector('.remove-tier-btn');
        if (firstRemoveBtn) firstRemoveBtn.disabled = true;
    }
}

function adjustPositions(action) {
    const [type, direction] = action.split('-');
    const positionsInput = document.getElementById(`${type}_positions`);
    const positionsLabel = document.getElementById(`${type}PositionsLabel`);
    
    if (!positionsInput || !positionsLabel) return;
    
    let currentValue = parseInt(positionsInput.value);
    const min = parseInt(positionsInput.min) || 1;
    const max = parseInt(positionsInput.max) || 10;
    
    if (direction === 'increase' && currentValue < max) {
        currentValue++;
    } else if (direction === 'decrease' && currentValue > min) {
        currentValue--;
    }
    
    positionsInput.value = currentValue;
    positionsLabel.textContent = currentValue;
    
    // Update position breakdown
    updatePositionBreakdown(type);
}

function updatePositionBreakdown(type) {
    // This function would update the position breakdown display
    // Implementation depends on the specific requirements
}

// Commissioner message functions
function postCommissionerMessage() {
    const title = document.getElementById('messageTitle').value.trim();
    const content = document.getElementById('messageContent').value.trim();
    const important = document.getElementById('messageImportant').checked;
    
    if (!title || !content) {
        showToast('Please fill in both title and message', 'error');
        return;
    }
    
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}/post-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: title,
            content: content,
            important: important
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Message posted successfully!', 'success');
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('postMessageModal'));
            if (modal) modal.hide();
            // Clear form
            document.getElementById('messageTitle').value = '';
            document.getElementById('messageContent').value = '';
            document.getElementById('messageImportant').checked = false;
            // Reload messages
            loadCommissionerMessages();
        } else {
            showToast(data.message || 'Failed to post message', 'error');
        }
    })
    .catch(error => {
        showToast('Error posting message', 'error');
    });
}

// Member management functions
function saveMemberChanges() {
    if (!currentEditingUserId) return;
    
    const memberData = {
        username: document.getElementById('editUsername').value.trim(),
        firstName: document.getElementById('editFirstName').value.trim(),
        lastName: document.getElementById('editLastName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        password: document.getElementById('editPassword').value,
        amountPaid: parseFloat(document.getElementById('editAmountPaid').value) || 0,
        amountOwed: parseFloat(document.getElementById('editAmountOwed').value) || 0,
        paymentMethod: document.getElementById('editPaymentMethod').value
    };
    
    // Include tier information if multi-tier is enabled
    const tierSelect = document.getElementById('editTier');
    if (tierSelect && tierSelect.value && leagueData.enable_multi_tier) {
        memberData.tierId = parseInt(tierSelect.value);
    }
    
    if (!memberData.username || !memberData.email) {
        showToast('Username and email are required', 'error');
        return;
    }
    
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}/members/${currentEditingUserId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(memberData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Member updated successfully!', 'success');
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editMemberModal'));
            if (modal) modal.hide();
            // Reload page to show changes
            location.reload();
        } else {
            showToast(data.message || 'Failed to update member', 'error');
        }
    })
    .catch(error => {
        showToast('Error updating member', 'error');
    });
}

function toggleCommissionerStatus() {
    if (!currentEditingUserId) return;
    
    const username = document.getElementById('editUsername').value;
    const currentRole = document.getElementById('editRoleDisplay').value;
    
    let action, newRole;
    if (currentRole === 'Co-Commissioner') {
        action = 'remove';
        newRole = 'participant';
    } else {
        action = 'promote';
        newRole = 'co_commissioner';
    }
    
    const confirmMessage = action === 'promote' 
        ? `Make ${username} a co-commissioner? They will have full access to league settings.`
        : `Remove ${username}'s commissioner status? They will become a regular participant.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const leagueId = document.body.getAttribute('data-league-id');
    
    fetch(`/leagues/${leagueId}/members/${currentEditingUserId}/role`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`${username} role updated successfully!`, 'success');
            updateRoleDisplay(newRole);
        } else {
            showToast(data.message || 'Failed to update member role', 'error');
        }
    })
    .catch(error => {
        showToast('Error updating member role', 'error');
    });
}

// ===== MISSING PICKS MANAGEMENT =====

// Global variables for missing picks management
let currentMissingPicksWeek = null;
let currentEntryBeingManaged = null;
let currentEntryPickState = null;

/**
 * Check for missing picks and update alert
 */
async function checkForMissingPicks() {
    if (!leagueData.isCommissioner) return;

    try {
        // Get current week (you may need to implement getCurrentWeek function)
        const currentWeek = await getCurrentWeekForMissingPicks();

        const response = await fetch(`/leagues/${leagueData.league_id}/missing-picks/${currentWeek}`);
        const data = await response.json();

        if (data.success) {
            const missingPicksCount = data.data.usersWithMissingPicks.length;
            const alertElement = document.getElementById('missingPicksAlert');
            const countElement = document.getElementById('missingPicksCount');
            const textElement = document.getElementById('missingPicksText');

            if (missingPicksCount > 0) {
                if (countElement) countElement.textContent = missingPicksCount;
                if (textElement) textElement.textContent = missingPicksCount === 1 ? 'user has missing picks' : 'users have missing picks';
                if (alertElement) alertElement.classList.remove('d-none');
            } else {
                if (alertElement) alertElement.classList.add('d-none');
            }
        }
    } catch (error) {
        console.error('Error checking for missing picks:', error);
    }
}

/**
 * Get current NFL week (simple implementation for missing picks)
 */
async function getCurrentWeekForMissingPicks() {
    try {
        // Simple implementation - calculate based on current date
        // NFL season typically starts first Thursday after Labor Day
        const now = new Date();
        const month = now.getMonth(); // 0-11
        let year = now.getFullYear();

        // NFL season year: Jan-July = previous year's season, Aug-Dec = current year's season
        if (month <= 6) {
            year = year - 1;
        }

        const seasonStart = new Date(year, 8, 5); // September 5th as approximation

        const diffTime = now - seasonStart;
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

        // Ensure week is between 1 and 18
        const week = Math.max(1, Math.min(18, diffWeeks + 1));
        return week;
    } catch (error) {
        console.error('Error calculating current week:', error);
        return 4; // Default to 4 for testing
    }
}

/**
 * Open the missing picks management modal
 */
async function openMissingPicksManager() {
    console.log('openMissingPicksManager called');
    try {
        const currentWeek = await getCurrentWeekForMissingPicks();
        console.log('Current week:', currentWeek);
        currentMissingPicksWeek = currentWeek;

        // Populate week selector
        populateWeekSelector(currentWeek);

        // Update modal title
        document.getElementById('modalCurrentWeek').textContent = currentWeek;

        // Load missing picks data
        await loadMissingPicksData(currentWeek);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('missingPicksModal'));
        modal.show();

    } catch (error) {
        console.error('Error opening missing picks manager:', error);
        showToast('Error loading missing picks data', 'error');
    }
}

/**
 * Populate the week selector dropdown
 */
function populateWeekSelector(currentWeek) {
    const weekSelector = document.getElementById('weekSelector');
    weekSelector.innerHTML = '';

    // Add weeks 1-18 (NFL season)
    for (let week = 1; week <= 18; week++) {
        const option = document.createElement('option');
        option.value = week;
        option.textContent = `Week ${week}`;
        if (week === currentWeek) {
            option.selected = true;
        }
        weekSelector.appendChild(option);
    }

    // Add event listener for week changes
    weekSelector.addEventListener('change', async (e) => {
        const selectedWeek = parseInt(e.target.value);
        currentMissingPicksWeek = selectedWeek;
        document.getElementById('modalCurrentWeek').textContent = selectedWeek;
        await loadMissingPicksData(selectedWeek);
    });
}

/**
 * Load missing picks data for a specific week
 */
async function loadMissingPicksData(week) {
    try {
        // Show loading state
        const loadingElement = document.getElementById('missingPicksLoading');
        const noPicksElement = document.getElementById('noMissingPicks');
        const listElement = document.getElementById('missingPicksList');

        if (loadingElement) loadingElement.classList.remove('d-none');
        if (noPicksElement) noPicksElement.classList.add('d-none');
        if (listElement) listElement.classList.add('d-none');

        const response = await fetch(`/leagues/${leagueData.league_id}/missing-picks/${week}`);
        const data = await response.json();

        // Hide loading state
        if (loadingElement) loadingElement.classList.add('d-none');

        if (data.success) {
            const usersWithMissingPicks = data.data.usersWithMissingPicks;

            if (usersWithMissingPicks.length === 0) {
                if (noPicksElement) noPicksElement.classList.remove('d-none');
            } else {
                renderMissingPicksList(usersWithMissingPicks);
                if (listElement) listElement.classList.remove('d-none');
            }
        } else {
            showToast(data.message || 'Error loading missing picks data', 'error');
        }

    } catch (error) {
        console.error('Error loading missing picks data:', error);
        const loadingElement = document.getElementById('missingPicksLoading');
        if (loadingElement) loadingElement.classList.add('d-none');
        showToast('Error loading missing picks data', 'error');
    }
}

/**
 * Render the list of users with missing picks
 */
function renderMissingPicksList(usersWithMissingPicks) {
    const listContainer = document.getElementById('missingPicksList');

    let html = '<div class="row">';

    usersWithMissingPicks.forEach(user => {
        html += `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">
                            <i class="fas fa-user me-2"></i>
                            ${user.username}
                        </h6>
                        <p class="card-text">
                            <span class="badge bg-warning text-dark">
                                ${user.missing_picks_count} missing pick${user.missing_picks_count !== 1 ? 's' : ''}
                            </span>
                        </p>
                        <button class="btn btn-primary btn-sm manage-picks-btn" data-entry-id="${user.entry_id}" data-username="${user.username}">
                            <i class="fas fa-edit me-1"></i>
                            Manage Picks
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    listContainer.innerHTML = html;

    // Add event listeners for the manage picks buttons
    listContainer.addEventListener('click', function(e) {
        if (e.target.closest('.manage-picks-btn')) {
            const btn = e.target.closest('.manage-picks-btn');
            const entryId = parseInt(btn.dataset.entryId);
            const username = btn.dataset.username;
            openPickManager(entryId, username, currentMissingPicksWeek);
        }
    });
}

/**
 * Open the pick management modal for a specific user
 */
async function openPickManager(entryId, username, week) {
    try {
        currentEntryBeingManaged = entryId;

        // Update modal title
        document.getElementById('pickModalUserName').textContent = username;
        document.getElementById('pickModalWeek').textContent = week;

        // Load pick state data
        const response = await fetch(`/leagues/${leagueData.league_id}/entry/${entryId}/picks/${week}`);
        const data = await response.json();

        if (data.success) {
            currentEntryPickState = data.data;
            renderPickManagementInterface(data.data);

            // Show pick management modal
            const modal = new bootstrap.Modal(document.getElementById('pickManagementModal'));
            modal.show();
        } else {
            showToast(data.message || 'Error loading pick data', 'error');
        }

    } catch (error) {
        console.error('Error opening pick manager:', error);
        showToast('Error loading pick data', 'error');
    }
}

/**
 * Render the pick management interface
 */
function renderPickManagementInterface(pickState) {
    const interfaceContainer = document.getElementById('pickManagementInterface');
    const pointsContainer = document.getElementById('confidencePointsVisualization');
    const totalGamesElement = document.getElementById('totalGamesCount');

    totalGamesElement.textContent = pickState.totalGames;

    // Render games grid
    let gamesHtml = '<div class="games-grid">';

    pickState.games.forEach(game => {
        const gameDateTime = new Date(game.kickoff_timestamp);
        const formattedTime = gameDateTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        gamesHtml += `
            <div class="game-row mb-3" data-game-id="${game.game_id}">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <div class="game-info">
                            <strong>${game.away_team} @ ${game.home_team}</strong><br>
                            <small class="text-muted">${formattedTime}</small>
                            <span class="badge ${game.game_is_locked ? 'bg-danger' : 'bg-success'} ms-2">
                                ${game.game_is_locked ? 'LOCKED' : 'UNLOCKED'}
                            </span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        ${renderConfidencePointsSelector(game)}
                    </div>
                    <div class="col-md-2">
                        ${renderPickStatus(game)}
                    </div>
                </div>
            </div>
        `;
    });

    gamesHtml += '</div>';
    interfaceContainer.innerHTML = gamesHtml;

    // Add event delegation for confidence point validation
    addConfidencePointValidation();

    // Render confidence points visualization
    renderConfidencePointsVisualization(pickState);
}

/**
 * Add validation for confidence point selections
 */
function addConfidencePointValidation() {
    const interfaceContainer = document.getElementById('pickManagementInterface');

    // Use event delegation to handle changes on confidence selectors
    interfaceContainer.addEventListener('change', function(e) {
        if (e.target.classList.contains('confidence-select')) {
            validateConfidencePointSelection(e.target);
            // Update visualization to reflect current state
            renderConfidencePointsVisualization(currentEntryPickState);
        }
    });
}

/**
 * Validate all confidence point selections and highlight conflicts
 */
function validateAllConfidencePointSelections() {
    // Clear all existing validation styling
    const allSelectors = document.querySelectorAll('.confidence-select');
    allSelectors.forEach(selector => {
        selector.classList.remove('is-invalid', 'border-danger');
        const gameRow = selector.closest('.game-row');
        gameRow.classList.remove('bg-danger-subtle');

        const existingError = gameRow.querySelector('.confidence-error');
        if (existingError) {
            existingError.remove();
        }
    });

    // Find all duplicates
    const duplicates = findDuplicateValues();

    // Highlight all selectors with duplicate values
    allSelectors.forEach(selector => {
        const value = parseInt(selector.value);
        if (duplicates.includes(value)) {
            highlightDuplicateSelector(selector);
        }
    });
}

/**
 * Validate a confidence point selection and highlight conflicts
 */
function validateConfidencePointSelection(selectElement) {
    // Run full validation to catch all duplicates
    validateAllConfidencePointSelections();
}

/**
 * Highlight a selector with duplicate value
 */
function highlightDuplicateSelector(selectElement) {
    const gameRow = selectElement.closest('.game-row');
    const selectedValue = parseInt(selectElement.value);

    selectElement.classList.add('is-invalid', 'border-danger');
    gameRow.classList.add('bg-danger-subtle');

    // Add error message with available suggestions
    const availableNumbers = getAvailableConfidenceNumbers();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'confidence-error alert alert-danger mt-2 py-2';

    let availableSuggestion = '';
    if (availableNumbers.length > 0) {
        availableSuggestion = ` Available: ${availableNumbers.slice(0, 5).join(', ')}`;
        if (availableNumbers.length > 5) {
            availableSuggestion += `, +${availableNumbers.length - 5} more`;
        }
    }

    errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Duplicate Points:</strong> ${selectedValue} points is assigned to multiple games.${availableSuggestion}`;

    gameRow.appendChild(errorDiv);
}

/**
 * Get available confidence point numbers
 */
function getAvailableConfidenceNumbers() {
    const totalGames = currentEntryPickState ? currentEntryPickState.totalGames : 16;
    const usedNumbers = new Set();

    // Get all currently assigned numbers (excluding duplicates for this calculation)
    const selectors = document.querySelectorAll('.confidence-select');
    selectors.forEach(selector => {
        const value = parseInt(selector.value);
        if (value && value > 0) {
            usedNumbers.add(value);
        }
    });

    // Find available numbers
    const available = [];
    for (let i = 1; i <= totalGames; i++) {
        if (!usedNumbers.has(i)) {
            available.push(i);
        }
    }

    return available.sort((a, b) => a - b);
}

/**
 * Find if a confidence point value conflicts with another unlocked game
 */
function findConflictingConfidencePoint(value, currentSelector) {
    const allSelectors = document.querySelectorAll('.confidence-select');

    for (const selector of allSelectors) {
        if (selector === currentSelector) continue;

        const selectorValue = parseInt(selector.value);
        if (selectorValue === value) {
            // Check if this is from an unlocked game (can be changed)
            const gameRow = selector.closest('.game-row');
            const lockBadge = gameRow.querySelector('.badge');
            const isLocked = lockBadge && lockBadge.textContent.includes('LOCKED');

            // Only return conflict if the other game is also unlocked or is a missing pick
            if (!isLocked || selector.dataset.type === 'missing') {
                return selector;
            }
        }
    }

    return null;
}

/**
 * Render confidence points selector for a game
 */
function renderConfidencePointsSelector(game) {
    const editable = game.commissioner_editable;

    if (editable === 'missing_locked') {
        // Missing pick on locked game - can assign points
        let html = '<select class="form-select confidence-select" data-game-id="' + game.game_id + '" data-type="missing">';
        html += '<option value="">No Points Assigned</option>';

        // Show all possible confidence point values - commissioner can assign any value
        for (let i = 1; i <= currentEntryPickState.totalGames; i++) {
            html += `<option value="${i}">${i} points</option>`;
        }

        html += '</select>';
        return html;

    } else if (editable === 'editable') {
        // All existing picks are now editable (whether locked or unlocked originally)
        let html = '<select class="form-select confidence-select" data-pick-id="' + game.pick_id + '" data-type="update">';

        // Add current selection
        html += `<option value="${game.confidence_points}" selected>${game.confidence_points} points</option>`;

        // Add all other possible confidence point values - commissioner can assign any value
        for (let i = 1; i <= currentEntryPickState.totalGames; i++) {
            if (i !== game.confidence_points) {
                html += `<option value="${i}">${i} points</option>`;
            }
        }

        html += '</select>';
        return html;

    } else if (editable === 'locked') {
        // This should only occur when user has no missing picks and game is locked
        return `
            <select class="form-select" disabled>
                <option value="${game.confidence_points}" selected>${game.confidence_points} points</option>
            </select>
        `;

    } else {
        // User hasn't picked yet - not commissioner's job
        return `
            <select class="form-select" disabled>
                <option value="">User hasn't picked yet</option>
            </select>
        `;
    }
}

/**
 * Render pick status badge
 */
function renderPickStatus(game) {
    const editable = game.commissioner_editable;

    if (editable === 'missing_locked') {
        return '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle"></i> MISSING</span>';
    } else if (editable === 'editable') {
        // Show different badge based on whether game was originally locked
        if (game.game_is_locked) {
            return '<span class="badge bg-warning text-dark"><i class="fas fa-edit"></i> EDITABLE (WAS LOCKED)</span>';
        } else {
            return '<span class="badge bg-primary"><i class="fas fa-edit"></i> EDITABLE</span>';
        }
    } else if (editable === 'locked') {
        return '<span class="badge bg-secondary"><i class="fas fa-lock"></i> LOCKED</span>';
    } else {
        return '<span class="badge bg-light text-dark"><i class="fas fa-clock"></i> NOT PICKED</span>';
    }
}

/**
 * Render confidence points visualization
 */
function renderConfidencePointsVisualization(pickState) {
    const container = document.getElementById('confidencePointsVisualization');
    let html = '';

    // Get current state from selectors to reflect real-time changes
    const currentPointAssignments = getCurrentPointAssignments();
    const duplicateValues = findDuplicateValues();

    for (let i = 1; i <= pickState.totalGames; i++) {
        let className = 'point-badge available';
        let title = 'Available';

        const assignment = currentPointAssignments[i];
        if (assignment) {
            // Check for duplicates first
            if (duplicateValues.includes(i)) {
                className = 'point-badge duplicate';
                title = 'Duplicate - Fix Required!';
            }
            // Determine if this is locked or editable
            else if (assignment.isLocked) {
                className = 'point-badge used-locked';
                title = 'Used (Locked)';
            } else {
                className = 'point-badge used-editable';
                title = 'Used (Editable)';
            }
        }

        html += `<span class="${className}" title="${title}">${i}</span>`;
    }

    container.innerHTML = html;
}

/**
 * Get current point assignments from the interface selectors
 */
function getCurrentPointAssignments() {
    const assignments = {};

    // If user has missing picks, all points are editable
    // Otherwise, use the locked points from the backend
    const userHasMissingPicks = currentEntryPickState && currentEntryPickState.hasMissingPicks;

    // Get points from locked games (original state) - only if user has no missing picks
    if (currentEntryPickState && !userHasMissingPicks) {
        currentEntryPickState.games.forEach(game => {
            if (game.confidence_points && game.game_is_locked && game.pick_id) {
                assignments[game.confidence_points] = {
                    gameId: game.game_id,
                    isLocked: true,
                    source: 'locked'
                };
            }
        });
    }

    // Get points from current selector values (may override locked for display)
    const selectors = document.querySelectorAll('.confidence-select');
    selectors.forEach(selector => {
        const points = parseInt(selector.value);
        if (points && points > 0) {
            const gameRow = selector.closest('.game-row');

            // Check if this is a locked game by looking at the selector's disabled state
            // or if it's a missing pick (commissioner editable)
            const isDisabled = selector.disabled;
            const isMissingPick = selector.dataset.type === 'missing';
            const isUpdateable = selector.dataset.type === 'update';

            // If user has missing picks, nothing is truly locked from commissioner perspective
            // If it's disabled, it's locked. If it's missing or updateable, it's editable
            const isLocked = !userHasMissingPicks && isDisabled && !isMissingPick;

            assignments[points] = {
                gameId: selector.dataset.gameId || selector.dataset.pickId,
                isLocked: isLocked,
                source: 'current'
            };
        }
    });

    return assignments;
}

/**
 * Find duplicate confidence point values in current selectors
 */
function findDuplicateValues() {
    const valueCount = {};
    const duplicates = [];

    // Count occurrences of each confidence point value
    const selectors = document.querySelectorAll('.confidence-select');
    selectors.forEach(selector => {
        const value = parseInt(selector.value);
        if (value && value > 0) {
            valueCount[value] = (valueCount[value] || 0) + 1;
        }
    });

    // Find values that appear more than once
    Object.keys(valueCount).forEach(value => {
        if (valueCount[value] > 1) {
            duplicates.push(parseInt(value));
        }
    });

    return duplicates;
}

/**
 * Save pick changes
 */
async function savePickChanges() {
    try {
        const saveButton = document.getElementById('savePickChanges');
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';

        // Check for validation errors before proceeding
        // Commissioner can save with duplicates - the backend will handle resolution
        const hasConflicts = document.querySelectorAll('.confidence-error').length > 0;
        if (hasConflicts) {
            console.log('Duplicates detected, but proceeding with commissioner save - backend will resolve');
        }

        const changes = collectPickChanges();

        if (changes.length === 0) {
            showToast('No changes to save', 'info');
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';
            return;
        }

        // Process each change
        for (const change of changes) {
            if (change.type === 'missing') {
                await assignMissingPick(change);
            } else if (change.type === 'update') {
                await updatePickPoints(change);
            }
        }

        showToast('Pick changes saved successfully!', 'success');

        // Refresh the pick management interface to show updated state
        const username = document.getElementById('pickModalUserName').textContent;
        await openPickManager(currentEntryBeingManaged, username, currentMissingPicksWeek);

        // Also refresh missing picks data and main alert
        await loadMissingPicksData(currentMissingPicksWeek);
        await checkForMissingPicks(); // Update the main alert

    } catch (error) {
        console.error('Error saving pick changes:', error);
        showToast('Error saving changes', 'error');
    } finally {
        const saveButton = document.getElementById('savePickChanges');
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';
    }
}

/**
 * Collect all pick changes from the interface
 */
function collectPickChanges() {
    const changes = [];
    const selects = document.querySelectorAll('.confidence-select');

    selects.forEach(select => {
        const newValue = parseInt(select.value);
        if (newValue && newValue > 0) {
            const gameId = select.dataset.gameId;
            const pickId = select.dataset.pickId;
            const type = select.dataset.type;

            if (type === 'missing') {
                changes.push({
                    type: 'missing',
                    gameId: parseInt(gameId),
                    confidencePoints: newValue,
                    entryId: currentEntryBeingManaged,
                    week: currentMissingPicksWeek
                });
            } else if (type === 'update') {
                // Check if value actually changed
                const currentGame = currentEntryPickState.games.find(g => g.pick_id == pickId);
                if (currentGame && currentGame.confidence_points !== newValue) {
                    changes.push({
                        type: 'update',
                        pickId: parseInt(pickId),
                        newConfidencePoints: newValue
                    });
                }
            }
        }
    });

    return changes;
}

/**
 * Assign points to a missing pick
 */
async function assignMissingPick(change) {
    const response = await fetch(`/leagues/${leagueData.league_id}/assign-missing-pick`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            entryId: change.entryId,
            gameId: change.gameId,
            week: change.week,
            confidencePoints: change.confidencePoints,
            reason: 'Commissioner manual assignment'
        })
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Failed to assign missing pick');
    }
}

/**
 * Update confidence points for existing pick
 */
async function updatePickPoints(change) {
    const response = await fetch(`/leagues/${leagueData.league_id}/update-pick-points`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pickId: change.pickId,
            newConfidencePoints: change.newConfidencePoints,
            reason: 'Commissioner points adjustment'
        })
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Failed to update pick points');
    }
}

// ===== PICK AUDIT VIEWER =====

// Global variables for audit viewer
let currentAuditData = [];

/**
 * Open the pick audit viewer
 */
async function openPickAuditViewer() {
    console.log('========== openPickAuditViewer called ==========');
    console.log('Current URL:', window.location.href);
    console.log('leagueData available:', !!leagueData);
    if (leagueData) {
        console.log('League ID:', leagueData.league_id);
        console.log('Is Commissioner:', leagueData.isCommissioner);
    }

    try {
        // Check if audit modal exists (requires commissioner permissions)
        const auditModal = document.getElementById('pickAuditModal');
        console.log('pickAuditModal found:', !!auditModal);

        if (!auditModal) {
            console.error('Pick audit modal not found. User may not have commissioner permissions.');
            console.log('Available modal elements:',
                Array.from(document.querySelectorAll('[id*="modal"]')).map(el => el.id)
            );
            showToast('You need commissioner permissions to view the audit trail', 'error');
            return;
        }

        console.log('Calling populateAuditWeekFilter...');
        // Populate week filter
        populateAuditWeekFilter();

        console.log('Calling loadAuditData...');
        // Load initial audit data
        await loadAuditData();

        console.log('Creating and showing Bootstrap modal...');
        // Show modal
        const modal = new bootstrap.Modal(auditModal);
        modal.show();
        console.log('Modal.show() called successfully');

    } catch (error) {
        console.error('========== Error in openPickAuditViewer ==========');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        showToast('Error loading audit data: ' + error.message, 'error');
    }
}

/**
 * Populate the week filter dropdown
 */
function populateAuditWeekFilter() {
    console.log('========== populateAuditWeekFilter called ==========');
    const weekFilter = document.getElementById('auditWeekFilter');
    console.log('auditWeekFilter element found:', !!weekFilter);

    if (!weekFilter) {
        console.error('auditWeekFilter element not found');
        return;
    }

    weekFilter.innerHTML = '<option value="">All Weeks</option>';

    // Add weeks 1-18
    for (let week = 1; week <= 18; week++) {
        const option = document.createElement('option');
        option.value = week;
        option.textContent = `Week ${week}`;
        weekFilter.appendChild(option);
    }
    console.log('Populated week filter with 18 weeks');
}

/**
 * Load audit data from the server
 */
async function loadAuditData(week = null) {
    console.log('========== loadAuditData called ==========');
    console.log('Week parameter:', week);
    console.log('leagueData:', leagueData);

    try {
        // Check if elements exist before accessing them
        const auditLoading = document.getElementById('auditLoading');
        const auditTable = document.getElementById('auditTable');
        const noAuditData = document.getElementById('noAuditData');

        console.log('Audit element check:', {
            auditLoading: !!auditLoading,
            auditTable: !!auditTable,
            noAuditData: !!noAuditData,
            pickAuditModal: !!document.getElementById('pickAuditModal')
        });

        if (!auditLoading || !auditTable || !noAuditData) {
            console.error('Some audit modal elements missing:', {
                auditLoading: !!auditLoading,
                auditTable: !!auditTable,
                noAuditData: !!noAuditData
            });
            console.log('All elements with "audit" in ID:',
                Array.from(document.querySelectorAll('[id*="audit"]')).map(el => el.id)
            );
            showToast('Audit interface elements missing', 'error');
            return;
        }

        console.log('Setting loading state...');
        // Show loading state
        auditLoading.classList.remove('d-none');
        auditTable.classList.add('d-none');
        noAuditData.classList.add('d-none');

        const url = week
            ? `/leagues/${leagueData.league_id}/pick-audit/${week}`
            : `/leagues/${leagueData.league_id}/pick-audit`;

        console.log('Fetching audit data from URL:', url);
        const response = await fetch(url);
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        const data = await response.json();
        console.log('Audit API response:', data);

        // Hide loading state
        auditLoading.classList.add('d-none');

        if (data.success) {
            currentAuditData = data.data.auditTrail;
            renderAuditTable(currentAuditData);

            if (currentAuditData.length === 0) {
                noAuditData.classList.remove('d-none');
            } else {
                auditTable.classList.remove('d-none');
            }
        } else {
            showToast(data.message || 'Error loading audit data', 'error');
            noAuditData.classList.remove('d-none');
        }

    } catch (error) {
        console.error('Error loading audit data:', error);
        // Re-check if elements still exist before using them
        const auditLoading = document.getElementById('auditLoading');
        const noAuditData = document.getElementById('noAuditData');
        if (auditLoading) auditLoading.classList.add('d-none');
        if (noAuditData) noAuditData.classList.remove('d-none');
        showToast('Error loading audit data', 'error');
    }
}

/**
 * Render the audit trail table
 */
function renderAuditTable(auditData) {
    const tableBody = document.getElementById('auditTableBody');
    let html = '';

    auditData.forEach(entry => {
        const date = new Date(entry.created_at);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        const actionBadge = getActionBadge(entry.action_type);
        const gameInfo = (entry.away_team && entry.home_team)
            ? `${entry.away_team} @ ${entry.home_team}`
            : 'N/A';

        const changes = formatChanges(entry.old_values, entry.new_values, entry.action_type);

        html += `
            <tr>
                <td>${formattedDate}</td>
                <td>${entry.entry_username || 'Unknown'}</td>
                <td>${actionBadge}</td>
                <td><small>${gameInfo}</small></td>
                <td>${changes}</td>
                <td>${entry.changed_by_username || 'System'}</td>
                <td><small>${entry.change_reason || 'N/A'}</small></td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

/**
 * Get action badge HTML
 */
function getActionBadge(actionType) {
    const badges = {
        'create': '<span class="badge bg-success">Created</span>',
        'update': '<span class="badge bg-primary">Updated</span>',
        'manual_assign': '<span class="badge bg-warning text-dark">Commissioner</span>',
        'auto_lock': '<span class="badge bg-secondary">Auto Lock</span>',
        'delete': '<span class="badge bg-danger">Deleted</span>'
    };

    return badges[actionType] || `<span class="badge bg-light text-dark">${actionType}</span>`;
}

/**
 * Format changes for display
 */
function formatChanges(oldValues, newValues, actionType) {
    if (!newValues) return 'N/A';

    try {
        // Handle both string and object formats
        const old = oldValues && typeof oldValues === 'object' ? oldValues :
                   oldValues ? JSON.parse(oldValues) : null;
        const newVals = typeof newValues === 'object' ? newValues :
                       JSON.parse(newValues);

        if (actionType === 'create' || actionType === 'manual_assign') {
            return `
                <small>
                    Team: <strong>${newVals.selected_team || 'N/A'}</strong><br>
                    Points: <strong>${newVals.confidence_points || 'N/A'}</strong>
                </small>
            `;
        } else if (actionType === 'update') {
            let changes = [];

            if (old && old.selected_team !== newVals.selected_team) {
                changes.push(`Team: ${old.selected_team} → ${newVals.selected_team}`);
            }

            if (old && old.confidence_points !== newVals.confidence_points) {
                changes.push(`Points: ${old.confidence_points} → ${newVals.confidence_points}`);
            }

            return changes.length > 0
                ? `<small>${changes.join('<br>')}</small>`
                : '<small>No changes detected</small>';
        }

        return '<small>See details</small>';

    } catch (error) {
        return '<small>Invalid data</small>';
    }
}

/**
 * Refresh audit data with current filters
 */
async function refreshAuditData() {
    const weekFilter = document.getElementById('auditWeekFilter').value;
    const actionFilter = document.getElementById('auditActionFilter').value;
    const userSearch = document.getElementById('auditUserSearch').value.toLowerCase();

    // Load fresh data from server
    await loadAuditData(weekFilter || null);

    // Apply client-side filters
    let filteredData = currentAuditData;

    if (actionFilter) {
        filteredData = filteredData.filter(entry => entry.action_type === actionFilter);
    }

    if (userSearch) {
        filteredData = filteredData.filter(entry =>
            (entry.entry_username && entry.entry_username.toLowerCase().includes(userSearch)) ||
            (entry.changed_by_username && entry.changed_by_username.toLowerCase().includes(userSearch))
        );
    }

    renderAuditTable(filteredData);

    if (filteredData.length === 0) {
        document.getElementById('auditTable').classList.add('d-none');
        document.getElementById('noAuditData').classList.remove('d-none');
    } else {
        document.getElementById('auditTable').classList.remove('d-none');
        document.getElementById('noAuditData').classList.add('d-none');
    }
}

/**
 * Export audit data to CSV
 */
function exportAuditData() {
    if (currentAuditData.length === 0) {
        showToast('No data to export', 'info');
        return;
    }

    const headers = ['Date/Time', 'User', 'Action', 'Game', 'Old Values', 'New Values', 'Changed By', 'Reason'];

    let csvContent = headers.join(',') + '\n';

    currentAuditData.forEach(entry => {
        const row = [
            new Date(entry.created_at).toISOString(),
            entry.entry_username || 'Unknown',
            entry.action_type,
            entry.game_matchup || 'N/A',
            entry.old_values || '',
            entry.new_values || '',
            entry.changed_by_username || 'System',
            entry.change_reason || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);

        csvContent += row.join(',') + '\n';
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pick-audit-${leagueData.league_name}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast('Audit data exported successfully!', 'success');
}

// Initialize missing picks checking when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (leagueData.isCommissioner) {
        checkForMissingPicks();

        // Check every 5 minutes for new missing picks
        setInterval(checkForMissingPicks, 5 * 60 * 1000);

        // Add event listeners for the commissioner buttons
        const manageMissingPicksBtn = document.getElementById('manageMissingPicksBtn');
        if (manageMissingPicksBtn) {
            manageMissingPicksBtn.addEventListener('click', openMissingPicksManager);
        }

        const pickAuditBtn = document.getElementById('pickAuditBtn');
        console.log('Pick Audit Button setup - element found:', !!pickAuditBtn);
        if (pickAuditBtn) {
            console.log('Adding click event listener to Pick Audit button');
            pickAuditBtn.addEventListener('click', function(event) {
                console.log('========== Pick Audit Button Clicked ==========');
                console.log('Event:', event);
                event.preventDefault();
                openPickAuditViewer();
            });
        } else {
            console.log('Pick Audit button not found during setup');
        }

        // Add event listeners for audit modal buttons
        const refreshAuditBtn = document.getElementById('refreshAuditBtn');
        if (refreshAuditBtn) {
            refreshAuditBtn.addEventListener('click', refreshAuditData);
        }

        const exportAuditBtn = document.getElementById('exportAuditBtn');
        if (exportAuditBtn) {
            exportAuditBtn.addEventListener('click', exportAuditData);
        }

        // Add event listener for save pick changes button
        const savePickChangesBtn = document.getElementById('savePickChanges');
        if (savePickChangesBtn) {
            savePickChangesBtn.addEventListener('click', savePickChanges);
        }
    }
});