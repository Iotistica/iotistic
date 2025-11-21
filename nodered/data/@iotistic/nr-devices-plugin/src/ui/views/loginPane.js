import $ from 'jquery'
import RED from 'node-red'
import { connect, getSettings } from '../api.js'

const loginPane = {
    id: 'login',
    onshow: () => {},
    content: () => {
        const pane = $('<div class="ff-nr-tools-pane ff-nr-tools-pane-centered"></div>')
        const settings = getSettings()
        
        // If using nr-auth, show info message instead of login form
        if (settings.authSource === 'nr-auth') {
            $(`
                <div style="max-width: 400px; text-align: center; padding: 40px;">
                    <i class="fa fa-check-circle" style="font-size: 48px; color: #4caf50; margin-bottom: 20px;"></i>
                    <h3 style="margin-bottom: 10px;">Authenticated via Node-RED</h3>
                    <p style="color: var(--red-ui-secondary-text-color); margin-bottom: 20px;">
                        You're logged in using Node-RED's authentication.
                    </p>
                    <p style="font-size: 0.9em; color: var(--red-ui-secondary-text-color);">
                        Connected as: <strong>${settings.user?.username || 'Unknown'}</strong>
                    </p>
                </div>
            `).appendTo(pane)
            return pane
        }
        
        const loginForm = $(`
            <div class="ff-nr-tools-login-form" style="max-width: 400px; width: 100%; padding: 20px;">
                <h3 style="margin-bottom: 20px; text-align: center;">Connect to Iotistic</h3>
                
                <div class="form-row" style="margin-bottom: 15px;">
                    <label for="iotistic-url" style="display: block; margin-bottom: 5px;">Server URL</label>
                    <input type="text" id="iotistic-url" class="red-ui-input" 
                           placeholder="https://api.iotistic.com" 
                           value="${settings.iotisticURL || ''}"
                           style="width: 100%;">
                </div>
                
                <div class="form-row" style="margin-bottom: 15px;">
                    <label for="iotistic-username" style="display: block; margin-bottom: 5px;">Username or Email</label>
                    <input type="text" id="iotistic-username" class="red-ui-input" 
                           placeholder="your-username" 
                           style="width: 100%;">
                </div>
                
                <div class="form-row" style="margin-bottom: 20px;">
                    <label for="iotistic-password" style="display: block; margin-bottom: 5px;">Password</label>
                    <input type="password" id="iotistic-password" class="red-ui-input" 
                           placeholder="••••••••" 
                           style="width: 100%;">
                </div>
                
                <button type="button" id="iotistic-login-btn" class="red-ui-button" 
                        style="width: 100%;">
                    <i class="fa fa-sign-in"></i> Login
                </button>
                
                <div id="login-status" style="margin-top: 15px; text-align: center; color: var(--red-ui-text-color-error);"></div>
            </div>
        `).appendTo(pane)
        
        const urlInput = loginForm.find('#iotistic-url')
        const usernameInput = loginForm.find('#iotistic-username')
        const passwordInput = loginForm.find('#iotistic-password')
        const loginBtn = loginForm.find('#iotistic-login-btn')
        const statusDiv = loginForm.find('#login-status')
        
        // Enable login on Enter key
        passwordInput.on('keypress', function(e) {
            if (e.which === 13) { // Enter key
                loginBtn.click()
            }
        })
        
        loginBtn.on('click', function() {
            const url = urlInput.val().trim()
            const username = usernameInput.val().trim()
            const password = passwordInput.val()
            
            if (!url) {
                statusDiv.text('Please enter server URL')
                return
            }
            
            if (!username) {
                statusDiv.text('Please enter username')
                return
            }
            
            if (!password) {
                statusDiv.text('Please enter password')
                return
            }
            
            statusDiv.text('')
            loginBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Connecting...')
            
            connect(url, username, password, () => {
                loginBtn.prop('disabled', false).html('<i class="fa fa-sign-in"></i> Login')
            })
        })
        
        return pane
    }
}

export {
    loginPane
}
