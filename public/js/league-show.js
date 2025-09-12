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