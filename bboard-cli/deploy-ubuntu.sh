#!/bin/bash
# FleetShield API Backend Ubuntu VM Provisioning Script
# OS: Ubuntu 24.04 LTS

set -e

echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "Installing Node.js 24..."
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Installing Docker..."
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

echo "Installing PM2..."
sudo npm install -g pm2

echo "Provisioning complete!"
echo ""
echo "Next Steps:"
echo "1. Log out and log back in (or run 'newgrp docker') to apply Docker permissions."
echo "2. Clone your repository: git clone https://github.com/divyanshkumar333/fleetshield-midnight.git"
echo "3. cd fleetshield-midnight"
echo "4. npm ci --legacy-peer-deps"
echo "5. npm run build -w contract && npm run build -w api && npm run build -w bboard-cli"
echo "6. cd bboard-cli && cp .env.example .env && nano .env"
echo "7. pm2 start dist/bboard-cli/api-server/server.js --name 'fleetshield-api' -i 1"
echo "8. pm2 save && pm2 startup"
