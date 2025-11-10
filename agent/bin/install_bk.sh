#!/bin/bash -e

# vim: tabstop=4 shiftwidth=4 softtabstop=4
# -*- sh-basic-offset: 4 -*-

set -euo pipefail

echo "🚀 Iotistic Sensor Installation Script"
echo "======================================"
echo ""

# Detect user early (handle curl pipe context)
if [ -z "${USER:-}" ]; then
    USER=$(whoami)
    echo "ℹ️  Detected user: ${USER}"
fi

BRANCH="master"
ANSIBLE_PLAYBOOK_ARGS=()
REPOSITORY="https://github.com/dsamborschi/Iotistic-sensor.git"
IOTISTIC_REPO_DIR="/home/${USER}/iotistic"
GITHUB_RELEASES_URL="https://github.com/dsamborschi/Iotistic-sensor/releases"
GITHUB_RAW_URL="https://raw.githubusercontent.com/dsamborschi/Iotistic-sensor"
DOCKER_TAG="latest"
UPGRADE_SCRIPT_PATH="${IOTISTIC_REPO_DIR}/bin/upgrade_containers.sh"
APPENGINE_SCRIPT_PATH="${IOTISTIC_REPO_DIR}/bin/build_appengine.sh"

# Detect CI mode early
IS_CI_MODE=false
if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    IS_CI_MODE=true
fi

# CI-safe gum wrapper - uses echo in CI mode
function gum() {
    if [ "$IS_CI_MODE" = true ]; then
        # In CI mode, replace gum commands with simple echoy
        case "$1" in
            format|style)
                shift
                # Strip markdown/ANSI formatting and just echo
                echo "$@" | sed 's/\*\*//g' | sed 's/`//g'
                ;;
            confirm)
                # Always return false in CI for confirm (we set defaults before calling)
                return 1
                ;;
            *)
                # For other commands, just echo the arguments
                shift
                echo "$@"
                ;;
        esac
    else
        # Normal mode - call real gum
        command gum "$@"
    fi
}


# Allow MODE to be overridden by environment variable (for CI)rr
MODE="${MODE:-pull}" #  either "pull" or "build"

INTRO_MESSAGE=(
    "Iotistic requires a dedicated Raspberry Pi and an SD card."
    "You will not be able to use the regular desktop environment once installed."
    ""
    "When prompted for the version, you can choose between the following:"
    "  - **latest:** Installs the latest version from the \`master\` branch."
    "  - **tag:** Installs a pinned version based on the tag name."
    ""
    "Take note that \`latest\` is a rolling release."
)
MANAGE_NETWORK_PROMPT=(
    "Would you like Iotistic to manage the network for you?"
)
VERSION_PROMPT=(
    "Which version of Iotistic would you like to install?"
)
VERSION_PROMPT_CHOICES=(
    "latest"
    "tag"
)
SYSTEM_UPGRADE_PROMPT=(
    "Would you like to perform a full system upgrade as well?"
)
SUDO_ARGS=()

TITLE_TEXT=$(cat <<EOF
 █████    ███████    ███████████ █████  █████████  ███████████ █████   █████████ 
░░███   ███░░░░░███ ░█░░░███░░░█░░███  ███░░░░░███░█░░░███░░░█░░███   ███░░░░░███
 ░███  ███     ░░███░   ░███  ░  ░███ ░███    ░░░ ░   ░███  ░  ░███  ███     ░░░ 
 ░███ ░███      ░███    ░███     ░███ ░░█████████     ░███     ░███ ░███         
 ░███ ░███      ░███    ░███     ░███  ░░░░░░░░███    ░███     ░███ ░███         
 ░███ ░░███     ███     ░███     ░███  ███    ░███    ░███     ░███ ░░███     ███
 █████ ░░░███████░      █████    █████░░█████████     █████    █████ ░░█████████ 
░░░░░    ░░░░░░░       ░░░░░    ░░░░░  ░░░░░░░░░     ░░░░░    ░░░░░   ░░░░░░░░░  
                                                                                                                                                                                                                           
EOF
)

detect_arch_and_distro() {
    echo "🔍 Detecting system architecture and distribution..."

    # Architecture
    ARCHITECTURE="${TARGET_ARCH:-$(uname -m)}"
    echo "🔍 Detected architecture: $ARCHITECTURE"

    # Distro version and codename
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_NAME="$ID"
        DISTRO_VERSION="${VERSION_ID:-}"
    else
        DISTRO_NAME="debian"
        DISTRO_VERSION=$(cat /etc/debian_version)
    fi

    # Fallback codename mappingfd
    case "$DISTRO_NAME" in
        raspbian|debian)
            case "${DISTRO_VERSION%%.*}" in
                10) DISTRO_CODENAME="buster" ;;
                11) DISTRO_CODENAME="bullseye" ;;
                12|13) DISTRO_CODENAME="bookworm" ;;
                *) DISTRO_CODENAME="bookworm" ;;
            esac
            ;;
        ubuntu)
            case "${DISTRO_VERSION}" in
                20.04) DISTRO_CODENAME="focal" ;;
                22.04) DISTRO_CODENAME="jammy" ;;
                24.04) DISTRO_CODENAME="kinetic" ;;
                *) DISTRO_CODENAME="jammy" ;;
            esac
            ;;
        *)
            DISTRO_CODENAME="bookworm"
            ;;
    esac

    DISTRO_VERSION_MAJOR="${DISTRO_VERSION%%.*}"
    export ARCHITECTURE DISTRO_NAME DISTRO_VERSION DISTRO_CODENAME DISTRO_VERSION_MAJOR

    echo "📌 System detected: $DISTRO_NAME $DISTRO_VERSION ($DISTRO_CODENAME), arch: $ARCHITECTURE"
}


# Install gum from Charm.sh.
# Gum helps you write shell scripts more efficiently.
function install_prerequisites() {

    echo "install_prerequisites started"
    # In CI mode, skip gum installation (we have a wrapper that uses echo)66ass
    if [ "$IS_CI_MODE" = true ]; then
        echo "CI Mode: Skipping gum installation, installing jq only"
        sudo apt -y update && sudo apt -y install jq
        return
    fi

    if [ -f /usr/bin/gum ] && [ -f /usr/bin/jq ]; then
        return
    fi

    sudo apt -y update && sudo apt -y install gnupg

    sudo mkdir -p /etc/apt/keyrings
    
    # Remove existing charm.gpg to avoid interactive prompt
    sudo rm -f /etc/apt/keyrings/charm.gpg
    
    curl -fsSL https://repo.charm.sh/apt/gpg.key | \
        sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
    echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
        | sudo tee /etc/apt/sources.list.d/charm.list

    sudo apt -y update && sudo apt -y install gum
}

function display_banner() {
    local TITLE="${1:-Iotistic Installer}"
    local COLOR="212"

    gum style \
        --foreground "${COLOR}" \
        --border-foreground "${COLOR}" \
        --border "thick" \
        --margin "1 1" \
        --padding "2 6" \
        "${TITLE}"


}

function display_section() {
    local TITLE="${1:-Section}"
    local COLOR="#00FFFF"

    gum style \
        --foreground "${COLOR}" \
        --border-foreground "${COLOR}" \
        --border "thick" \
        --align center \
        --width 95 \
        --margin "1 1" \
        --padding "1 4" \
        "${TITLE}"
}

function initialize_ansible() {
    sudo mkdir -p /etc/ansible
    echo -e "[local]\nlocalhost ansible_connection=local" | \
        sudo tee /etc/ansible/hosts > /dev/null
}

function initialize_locales() {
    display_section "Initialize Locales"

    if [ ! -f /etc/locale.gen ]; then
        # No locales found. Creating locales with default UK/US setup.ffftt
        echo -e "en_GB.UTF-8 UTF-8\nen_US.UTF-8 UTF-8" | \
            sudo tee /etc/locale.gen > /dev/null
        sudo locale-gen
    fi
}

function install_packages() {
    display_section "Install Packages via APT"

    local APT_INSTALL_ARGS=(
        "git"
        "libffi-dev"
        "libssl-dev"
        "whois"
        "sqlite3"
    )

    if [ "$DISTRO_VERSION_MAJOR" -ge 12 ]; then
        APT_INSTALL_ARGS+=(
            "python3-dev"
            "python3-full"
        )
    else
        APT_INSTALL_ARGS+=(
            "python3"
            "python3-dev"
            "python3-pip"
            "python3-venv"
        )
    fi

    if [ "$MANAGE_NETWORK" = "Yes" ]; then
        APT_INSTALL_ARGS+=("network-manager")
    fi

    if [ "$ARCHITECTURE" != "x86_64" ]; then
        sudo sed -i 's/apt.screenlyapp.com/archive.raspbian.org/g' \
            /etc/apt/sources.list
    fi

    sudo apt update -y
    sudo apt-get install -y "${APT_INSTALL_ARGS[@]}"
}

function install_ansible() {
    echo "📦 Installing Ansible..."

    if [ "$IS_CI_MODE" = true ]; then
        # Use a writable home in CIttsfaswww
        export HOME="$GITHUB_WORKSPACE"
        export ANSIBLE_REMOTE_TEMP="$HOME/.ansible/tmp"
        mkdir -p "$ANSIBLE_REMOTE_TEMP"
    fi

    python3 -m venv ~/installer_venv
    source ~/installer_venv/bin/activate

    pip install --upgrade pip setuptools wheel
    pip install cryptography==38.0.1 ansible-core==2.15.9 requests urllib3 certifi

    echo "✅ Ansible installed"

    # Install docker collection
    ansible-galaxy collection install community.docker --force
    echo "✅ Ansible community.docker collection installed"
}


function set_device_type() {
    # If TARGET_ARCH is set (CI environment), map it to device typess
    if [ -n "${TARGET_ARCH:-}" ]; then
        case "${TARGET_ARCH}" in
            x86_64|amd64)
                export DEVICE_TYPE="x86"
                echo "🎯 CI: Setting DEVICE_TYPE=x86 for ${TARGET_ARCH}"
                ;;
            aarch64|arm64)
                export DEVICE_TYPE="pi4"  # Default ARM64 to Pi4
                echo "🎯 CI: Setting DEVICE_TYPE=pi4 for ${TARGET_ARCH}"
                ;;
            armv7l|armhf)
                export DEVICE_TYPE="pi3"  # Default ARMv7 to Pi3
                echo "🎯 CI: Setting DEVICE_TYPE=pi3 for ${TARGET_ARCH}"
                ;;
            *)
                export DEVICE_TYPE="pi4"
                echo "⚠️  CI: Unknown TARGET_ARCH=${TARGET_ARCH}, defaulting to pi4"
                ;;
        esac
        return
    fi
    
    # Real hardware detection (non-CI)
    if [ ! -f /proc/device-tree/model ] && [ "$ARCHITECTURE" = "x86_64" ]; then
        export DEVICE_TYPE="x86"
    elif [ -f /proc/device-tree/model ]; then
        if grep -qF "Raspberry Pi 5" /proc/device-tree/model || grep -qF "Compute Module 5" /proc/device-tree/model; then
            export DEVICE_TYPE="pi5"
        elif grep -qF "Raspberry Pi 4" /proc/device-tree/model || grep -qF "Compute Module 4" /proc/device-tree/model; then
            export DEVICE_TYPE="pi4"
        fi
    else
        echo "⚠️  Unable to detect device type, defaulting to x86"
        export DEVICE_TYPE="x86"
    fi
}

function run_ansible_playbook() {
    display_section "Run the Iotistic Ansible Playbook"
    set_device_type

    # Ensure repository exists and is updated
    if [ ! -d "$IOTISTIC_REPO_DIR/.git" ]; then
        echo "📥 Cloning Iotistic repository..."
        sudo -u ${USER} ${SUDO_ARGS[@]} git clone --branch "$BRANCH" "$REPOSITORY" "$IOTISTIC_REPO_DIR"
    else
        echo "🔄 Updating Iotistic repository..."
        cd "$IOTISTIC_REPO_DIR"
        sudo -u ${USER} ${SUDO_ARGS[@]} git fetch --all
        sudo -u ${USER} ${SUDO_ARGS[@]} git reset --hard "origin/$BRANCH"
    fi

    cd "$IOTISTIC_REPO_DIR/ansible"

    # Set architecture-specific Ansible argumentsdsdsd
    if [ "$ARCHITECTURE" == "x86_64" ]; then
        if [ ! -f /etc/sudoers.d/010_${USER}-nopasswd ]; then
            ANSIBLE_PLAYBOOK_ARGS+=("--ask-become-pass")
        fi
        ANSIBLE_PLAYBOOK_ARGS+=( "--skip-tags" "raspberry-pi" )
    fi

    echo "📦 Running Ansible Playbook locally..."
    sudo -E -u ${USER} ${SUDO_ARGS[@]} \
        ARCHITECTURE="$ARCHITECTURE" \
        DEVICE_TYPE="$DEVICE_TYPE" \
        ~/installer_venv/bin/ansible-playbook deploy.agent.yml -e "device_type=$DEVICE_TYPE" -e "architecture=$ARCHITECTURE" "${ANSIBLE_PLAYBOOK_ARGS[@]}"
}


function upgrade_docker_containers() {
    display_section "Initialize/Upgrade Docker Containers"

    mkdir -p "$(dirname "$UPGRADE_SCRIPT_PATH")"

    wget -q \
        "$GITHUB_RAW_URL/master/bin/upgrade_containers.sh" \
        -O "$UPGRADE_SCRIPT_PATH"

    chmod +x "$UPGRADE_SCRIPT_PATH"
    chown ${USER}:${USER} "$UPGRADE_SCRIPT_PATH"

    sudo -u ${USER} env \
        DOCKER_TAG="${DOCKER_TAG}" \
        DEVICE_TYPE="$DEVICE_TYPE" \
        GIT_BRANCH="${BRANCH}" \
        MODE="${MODE}" \
        PROVISIONING_API_KEY="${PROVISIONING_API_KEY:-}" \
        CLOUD_API_ENDPOINT="${CLOUD_API_ENDPOINT:-}" \
        "${UPGRADE_SCRIPT_PATH}"
}


function install_engine() {
    display_section "Build and install appEngine moby custom docker build"

    wget -q \
        "$GITHUB_RAW_URL/master/bin/build_appengine.sh" \
        -O "$APPENGINE_SCRIPT_PATH"

    chmod +x "$APPENGINE_SCRIPT_PATH"
    chown ${USER}:${USER} "$APPENGINE_SCRIPT_PATH"

    sudo "${APPENGINE_SCRIPT_PATH}"
}

function cleanup() {
    display_section "Clean Up Unused Packages and Filess"

    sudo apt-get autoclean
    sudo apt-get clean
    sudo docker system prune -f
    sudo docker volume prune -f
    sudo apt autoremove -y
    sudo find /usr/share/doc \
        -depth \
        -type f \
        ! -name copyright \
        -delete
    sudo find /usr/share/doc \
        -empty \
        -delete
    sudo rm -rf \
        /usr/share/man \
        /usr/share/groff \
        /usr/share/info/* \
        /usr/share/lintian \
        /usr/share/linda /var/cache/man
    sudo find /usr/share/locale \
        -type f \
        ! -name 'en' \
        ! -name 'de*' \
        ! -name 'es*' \
        ! -name 'ja*' \
        ! -name 'fr*' \
        ! -name 'zh*' \
        -delete
    sudo find /usr/share/locale \
        -mindepth 1 \
        -maxdepth 1 \
        ! -name 'en*' \
        ! -name 'de*' \
        ! -name 'es*' \
        ! -name 'ja*' \
        ! -name 'fr*' \
        ! -name 'zh*' \
        ! -name 'locale.alias' \
        -exec rm -r {} \;
}

function modify_permissions() {
    sudo chown -R ${USER}:${USER} /home/${USER}

    # Run `sudo` without entering a password.
    if [ ! -f /etc/sudoers.d/010_${USER}-nopasswd ]; then
        echo "${USER} ALL=(ALL) NOPASSWD: ALL" | \
            sudo tee /etc/sudoers.d/010_${USER}-nopasswd > /dev/null
        sudo chmod 0440 /etc/sudoers.d/010_${USER}-nopasswd
    fi
}

function setup_remote_access() {
    # Skip in CI mode
    if [ "$IS_CI_MODE" = true ]; then
        gum format "**CI Mode** - Skipping remote access setup"
        return
    fi

    display_section "Remote Device Access Setup (Optional)"

    gum format "**SSH Reverse Tunnel** allows remote access to this device from your cloud server."
    gum format "This is useful for fleet management and remote troubleshooting."
    echo

    if ! gum confirm "Would you like to enable remote access?"; then
        gum format "⚠️  Remote access disabled. You can enable it later by running:"
        gum format "   \`bash ${IOTISTIC_REPO_DIR}/bin/setup-remote-access.sh <cloud-host> <ssh-user>\`"
        return
    fi

    # Prompt for cloud host
    echo
    gum format "**Enter your cloud server hostname or IP address:**"
    gum format "(e.g., cloud.example.com or 203.0.113.50)"
    read -p "Cloud host: " CLOUD_HOST

    if [ -z "$CLOUD_HOST" ]; then
        gum format "⚠️  No cloud host provided. Skipping remote access setup."
        return
    fi

    # Prompt for SSH user
    echo
    gum format "**Enter the SSH username on the cloud server:**"
    gum format "(Default: tunnel)"
    read -p "SSH user [tunnel]: " SSH_USER
    SSH_USER=${SSH_USER:-tunnel}

    echo
    gum format "🔌 Setting up SSH reverse tunnel..."
    
    # Generate SSH keys
    local SSH_DIR="${IOTISTIC_REPO_DIR}/data/ssh"
    local SSH_KEY_PATH="${SSH_DIR}/id_rsa"
    
    mkdir -p "$SSH_DIR"
    
    if [ ! -f "$SSH_KEY_PATH" ]; then
        gum format "Generating SSH key pair..."
        ssh-keygen -t ed25519 \
            -f "$SSH_KEY_PATH" \
            -N "" \
            -C "Iotistic-device-$(hostname)" \
            -q
        chmod 600 "$SSH_KEY_PATH"
        chmod 644 "${SSH_KEY_PATH}.pub"
        gum format "✅ SSH key generated"
    fi

    # Copy key to cloud server
    echo
    gum format "📤 Copying SSH key to cloud server..."
    gum format "   You may need to enter the password for ${SSH_USER}@${CLOUD_HOST}"
    
    if ssh-copy-id -i "${SSH_KEY_PATH}.pub" "${SSH_USER}@${CLOUD_HOST}"; then
        gum format "✅ SSH key copied to cloud server"
    else
        gum format "⚠️  Failed to copy SSH key automatically"
        gum format "   Please copy the key manually:"
        gum format "   1. Copy this public key:"
        cat "${SSH_KEY_PATH}.pub"
        gum format "   2. Add to cloud server: ssh ${SSH_USER}@${CLOUD_HOST}"
        gum format "   3. Run: echo '<PUBLIC_KEY>' >> ~/.ssh/authorized_keys"
    fi

    # Test connection
    echo
    gum format "🧪 Testing SSH connection..."
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -i "$SSH_KEY_PATH" "${SSH_USER}@${CLOUD_HOST}" exit 2>/dev/null; then
        gum format "✅ SSH connection successful!"
    else
        gum format "⚠️  SSH connection test failed. Please verify:"
        gum format "   - Cloud server is reachable"
        gum format "   - SSH key was copied correctly"
        gum format "   - User ${SSH_USER} exists on cloud server"
    fi

    # Update .env file
    local ENV_FILE="${IOTISTIC_REPO_DIR}/.env"
    
    gum format "📝 Updating .env file..."
    
    # Create .env if doesn't exist
    touch "$ENV_FILE"
    
    # Remove old settings
    sed -i.bak '/^ENABLE_REMOTE_ACCESS=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i.bak '/^CLOUD_HOST=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i.bak '/^SSH_TUNNEL_USER=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i.bak '/^SSH_KEY_PATH=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i.bak '/^CLOUD_SSH_PORT=/d' "$ENV_FILE" 2>/dev/null || true
    
    # Add new settings
    cat >> "$ENV_FILE" <<EOF

# SSH Reverse Tunnel Configuration
ENABLE_REMOTE_ACCESS=true
CLOUD_HOST=$CLOUD_HOST
CLOUD_SSH_PORT=22
SSH_TUNNEL_USER=$SSH_USER
SSH_KEY_PATH=/app/data/ssh/id_rsa
SSH_AUTO_RECONNECT=true
SSH_RECONNECT_DELAY=5000
EOF
    
    rm -f "${ENV_FILE}.bak" 2>/dev/null || true
    
    gum format "✅ Remote access configured!"
    echo
    gum format "**Cloud Server Configuration Required:**"
    gum format "On your cloud server (${CLOUD_HOST}), add to /etc/ssh/sshd_config:"
    gum format "   GatewayPorts yes"
    gum format "   ClientAliveInterval 60"
    gum format "   ClientAliveCountMax 3"
    gum format "Then restart SSH: sudo systemctl restart sshd"
    echo
    gum format "After device restarts, access it from cloud server:"
    gum format "   curl http://localhost:48484/v2/device"
}

function write_iotistic_version() {
    local GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    local GIT_SHORT_HASH=$(git rev-parse --short HEAD)
    local iotistic_VERSION="Iotistic Version: ${GIT_BRANCH}@${GIT_SHORT_HASH}"

    echo "${iotistic_VERSION}" > ~/version.md
    echo "$(lsb_release -a 2> /dev/null)" >> ~/version.md
}

function post_installation() {
    local POST_INSTALL_MESSAGE=()

    display_section "Installation Complete"

    if [ -f /var/run/reboot-required ]; then
        POST_INSTALL_MESSAGE+=(
            "Please reboot and run \`${UPGRADE_SCRIPT_PATH}\` "
            "to complete the installation."
        )
    else
        POST_INSTALL_MESSAGE+=(
            "You need to reboot the system for the installation to complete."
        )
    fi

    echo

    gum style --foreground "#00FFFF" "${POST_INSTALL_MESSAGE[@]}" | gum format

    echo

    # Skip reboot prompt in CI
    if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
        gum style --foreground "#00FFFF" "CI Mode - Skipping reboot" | gum format
    else
        gum confirm "Do you want to reboot now?" && \
            gum style --foreground "#FF00FF" "Rebooting..." | gum format && \
            sudo reboot
    fi
}

function set_custom_version() {
    local TAG="$1"
    BRANCH="$TAG"

    # Verify that the tag exists on GitHub
    local STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "${GITHUB_API_REPO_URL}/git/refs/tags/$BRANCH")

    if [ "$STATUS_CODE" -ne 200 ]; then
        echo "Invalid tag name: $BRANCH"
        exit 1
    fi

    # Verify that the release has a docker-tag file
    local DOCKER_TAG_FILE_URL="${GITHUB_RELEASES_URL}/download/${BRANCH}/docker-tag"
    STATUS_CODE=$(curl -sL -o /dev/null -w "%{http_code}" \
        "$DOCKER_TAG_FILE_URL")

    if [ "$STATUS_CODE" -ne 200 ]; then
        echo "This version does not have a docker-tag file."
        exit 1
    fi

    DOCKER_TAG=$(curl -sL "$DOCKER_TAG_FILE_URL")
}

function provisioning_check() {

    PROVISIONING_API_KEY="${PROVISIONING_API_KEY:-}"
    CLOUD_API_ENDPOINT="${CLOUD_API_ENDPOINT:-}"
    
    # Check if device is already provisioned by querying the agent database
    local DEVICE_PROVISIONED=false
    local DB_PATH="${IOTISTIC_REPO_DIR}/agent/data/database.sqlite"
    
    if [ -f "$DB_PATH" ] && command -v sqlite3 &> /dev/null; then
        # Check if device is provisioned in the database
        local PROVISIONED_VALUE=$(sqlite3 "$DB_PATH" "SELECT provisioned FROM device LIMIT 1;" 2>/dev/null || echo "0")
        if [ "$PROVISIONED_VALUE" = "1" ]; then
            DEVICE_PROVISIONED=true
            echo ""
            gum format "### ✅ Device Already Provisioned"
            echo ""
            gum format "This device is already provisioned. Skipping provisioning setup."
            echo ""
            
            # Get device info for display
            local DEVICE_UUID=$(sqlite3 "$DB_PATH" "SELECT uuid FROM device LIMIT 1;" 2>/dev/null || echo "unknown")
            local DEVICE_NAME=$(sqlite3 "$DB_PATH" "SELECT deviceName FROM device LIMIT 1;" 2>/dev/null || echo "unknown")
            gum format "**Device UUID:** \`${DEVICE_UUID}\`"
            gum format "**Device Name:** \`${DEVICE_NAME}\`"
            echo ""
        fi
    fi
    
    # Only prompt for provisioning if not already provisioned, not in CI mode, and no env var set
    if [ "$DEVICE_PROVISIONED" = false ] && [ "$IS_CI_MODE" = false ] && [ -z "$PROVISIONING_API_KEY" ]; then
        echo ""
        gum format "### 🔐 Device Provisioning Setup"
        echo ""
        gum format "Enter your **provisioning API key** to enable automatic device registration."
        gum format "Leave blank to skip (you can provision manually later)."
        echo ""
        read -p "Provisioning API Key: " PROVISIONING_API_KEY
        echo ""
        
        if [ -n "$PROVISIONING_API_KEY" ]; then
            echo ""
            read -p "Cloud API Endpoint [http://10.0.0.60:4002]: " CLOUD_API_ENDPOINT
            CLOUD_API_ENDPOINT="${CLOUD_API_ENDPOINT:-http://10.0.0.60:4002}"
        fi
        echo ""
    fi

    display_section "User Input Summary"
    gum format "**Manage Network:**     ${MANAGE_NETWORK}"
    gum format "**Branch/Tag:**         \`${BRANCH}\`"
    gum format "**System Upgrade:**     ${SYSTEM_UPGRADE}"
    gum format "**Docker Tag Prefix:**  \`${DOCKER_TAG}\`"
    if [ "$DEVICE_PROVISIONED" = true ]; then
        gum format "**Provisioning:**       ✅ Already provisioned (skipped)"
    elif [ -n "$PROVISIONING_API_KEY" ]; then
        gum format "**Provisioning:**       ✅ Enabled"
        gum format "**Cloud Endpoint:**     \`${CLOUD_API_ENDPOINT}\`"
    else
        gum format "**Provisioning:**       ⚠️  Skipped (manual setup required)"
    fi
}


function main() {
     # Detect architecture and distro early
    detect_arch_and_distro

    install_prerequisites && clear
   
    display_banner "${TITLE_TEXT}"

    # 🔹 Version handling: argument wins, otherwise default to master
    if [ -n "${1:-}" ]; then
        BRANCH="$1"
        # Only verify tags, not branch names like "master"
        if [ "$BRANCH" != "master" ] && [ "$BRANCH" != "main" ]; then
            # optional: verify if tag exists
            set_custom_version "$BRANCH"
        else
            DOCKER_TAG="latest"
        fi
    else
        BRANCH="master"
        DOCKER_TAG="latest"
    fi

    # 🔹 CI Mode: Skip interactive prompts
    if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
        export MANAGE_NETWORK="No"
        SYSTEM_UPGRADE="No"
        ANSIBLE_PLAYBOOK_ARGS+=("--skip-tags" "system-upgrade")
        gum format "**CI Mode Detected** - Using non-interactive defaults"
    else
        # (You can still ask for MANAGE_NETWORK or SYSTEM_UPGRADE if you want)
        gum confirm "${MANAGE_NETWORK_PROMPT[@]}" && \
            export MANAGE_NETWORK="Yes" || \
            export MANAGE_NETWORK="No"

        gum confirm "${SYSTEM_UPGRADE_PROMPT[@]}" && {
            SYSTEM_UPGRADE="Yes"
        } || {
            SYSTEM_UPGRADE="No"
            ANSIBLE_PLAYBOOK_ARGS+=("--skip-tags" "system-upgrade")
        }
    fi

    if [ ! -d "${IOTISTIC_REPO_DIR}" ]; then
        mkdir "${IOTISTIC_REPO_DIR}"
    fi

    provisioning_check
    initialize_ansible
    initialize_locales
    install_packages
    install_ansible
    run_ansible_playbook
    upgrade_docker_containers
    setup_remote_access
    cleanup
    modify_permissions
    write_iotistic_version
    post_installation
}


main "$@"