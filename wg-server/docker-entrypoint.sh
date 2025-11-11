#!/bin/sh
set -e

echo "🔧 Initializing WireGuard VPN server..."

# Check if WireGuard configuration exists
if [ ! -f /etc/wireguard/wg0.conf ]; then
    echo "❌ ERROR: /etc/wireguard/wg0.conf not found!"
    exit 1
fi

echo "✅ WireGuard config found at /etc/wireguard/wg0.conf"

# Bring up WireGuard interface
echo "🚀 Starting WireGuard interface wg0..."
wg-quick up wg0 || {
    echo "⚠️  Warning: wg-quick failed, trying manual setup..."
    
    # Manual setup fallback (for environments where wg-quick doesn't work)
    ip link add dev wg0 type wireguard
    wg setconf wg0 /etc/wireguard/wg0.conf
    ip link set wg0 up
    ip addr add 10.8.0.1/24 dev wg0
    
    # Apply iptables rules
    iptables -A FORWARD -i wg0 -j ACCEPT
    iptables -A FORWARD -o wg0 -j ACCEPT
    iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
}

# Verify interface is up
if ip link show wg0 > /dev/null 2>&1; then
    echo "✅ WireGuard interface wg0 is UP"
    wg show wg0
else
    echo "❌ ERROR: Failed to bring up wg0 interface"
    exit 1
fi

# Enable IP forwarding (required for VPN routing)
echo "🔄 Enabling IP forwarding..."
echo 1 > /proc/sys/net/ipv4/ip_forward
echo "✅ IP forwarding enabled"

echo "🎉 WireGuard VPN server initialized successfully!"
echo ""

# Start the Node.js API server
echo "🚀 Starting WireGuard API server on port ${PORT:-8089}..."
exec node dist/server.js
