# Kubernetes Deployment Workflow Guide

## Overview
Automated deployment workflow for Iotistic platform to Kubernetes cluster.

## Triggers

### Automatic Deployment
```bash
# Deploy billing service
git commit -m "feat: update billing service [deploy-billing]"

# Deploy VPN server
git commit -m "fix: vpn configuration [deploy-vpn]"

# Deploy monitoring
git commit -m "chore: monitoring updates [deploy-monitoring]"
```

### Manual Deployment
1. Go to **Actions** tab in GitHub
2. Select **Deploy to Kubernetes** workflow
3. Click **Run workflow**
4. Choose:
   - Environment: `staging` or `production`
   - Namespace: Custom namespace (optional)

## Jobs

### 1. Deploy Billing Service (`deploy-billing`)
- Creates `billing` namespace
- Deploys billing API
- Connects to managed PostgreSQL
- Configures Stripe integration

**Environment Variables Required:**
- `KUBECONFIG` - Base64 encoded kubeconfig
- `K8S_CONTEXT` - Kubernetes context name
- `BILLING_DB_HOST` - PostgreSQL host
- `BILLING_DB_PASSWORD` - Database password
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Webhook secret

### 2. Deploy VPN Server (`deploy-vpn-server`)
- Creates `vpn-server` namespace
- Deploys OpenVPN server
- Deploys Certificate Manager API
- Exposes LoadBalancer service

### 3. Deploy Customer Instance (`deploy-customer-instance`)
- Creates customer namespace (e.g., `customer-demo`)
- Deploys full stack:
  - API
  - Dashboard
  - PostgreSQL
  - Neo4j
  - Mosquitto MQTT
  - Redis
  - Billing Exporter
- Configures license key
- Sets up monitoring

**Environment Variables Required:**
- `CUSTOMER_DB_PASSWORD` - PostgreSQL password
- `NEO4J_PASSWORD` - Neo4j password
- `MQTT_ADMIN_PASSWORD` - MQTT admin password
- `IOTISTIC_LICENSE_KEY` - JWT license token

### 4. Deploy Monitoring Stack (`deploy-monitoring`)
- Creates `monitoring` namespace
- Installs Prometheus Operator CRDs
- Deploys ServiceMonitors
- Configures scraping for all customer instances

### 5. Rollback (`rollback`)
- Triggers on deployment failure
- Rolls back to previous Helm release
- Only runs on manual deployments

### 6. Report (`report`)
- Generates deployment summary
- Shows cluster info
- Lists all pods and services
- Displays endpoints

## Setup Requirements

### 1. Kubernetes Cluster
```bash
# Get your kubeconfig
kubectl config view --raw > kubeconfig.yaml

# Base64 encode it
cat kubeconfig.yaml | base64 -w 0
```

### 2. GitHub Secrets
Add these secrets to your repository:

**Cluster Access:**
- `KUBECONFIG` - Base64 encoded kubeconfig
- `K8S_CONTEXT` - Context name (e.g., `arn:aws:eks:us-east-1:xxx:cluster/iotistic`)

**Billing Service:**
- `BILLING_DB_HOST` - RDS/CloudSQL endpoint
- `BILLING_DB_PASSWORD` - Database password
- `STRIPE_SECRET_KEY` - From Stripe dashboard
- `STRIPE_WEBHOOK_SECRET` - From Stripe webhooks

**Customer Instances:**
- `CUSTOMER_DB_PASSWORD` - Default PostgreSQL password
- `NEO4J_PASSWORD` - Default Neo4j password
- `MQTT_ADMIN_PASSWORD` - MQTT admin password
- `IOTISTIC_LICENSE_KEY` - JWT from billing service

### 3. Helm Charts
Ensure these charts exist:
- `charts/billing/` - Billing service chart
- `charts/vpn-server/` - VPN server chart
- `charts/customer-instance/` - Customer stack chart
- `charts/monitoring-stack.yaml` - Monitoring resources

## Usage Examples

### Deploy Everything to Staging
```bash
# Manual deployment via GitHub Actions UI
Environment: staging
Namespace: customer-staging
```

### Deploy Single Customer Instance
```bash
# Manual deployment
Environment: production
Namespace: customer-abc123
```

### Update Billing Service Only
```bash
git commit -m "feat: add new billing plan [deploy-billing]"
git push origin master
```

### Emergency Rollback
If deployment fails, the workflow automatically triggers rollback job. Manual rollback:
```bash
kubectl rollout undo deployment/billing-api -n billing
# or
helm rollback customer-abc123 -n customer-abc123
```

## Monitoring Deployment

### View Logs
```bash
# API logs
kubectl logs -f deployment/customer-abc123-api -n customer-abc123

# Dashboard logs
kubectl logs -f deployment/customer-abc123-dashboard -n customer-abc123
```

### Check Status
```bash
# All pods in namespace
kubectl get pods -n customer-abc123

# Services and endpoints
kubectl get svc -n customer-abc123

# Deployment status
kubectl rollout status deployment/customer-abc123-api -n customer-abc123
```

### Access Services
```bash
# Get LoadBalancer IPs
kubectl get svc -n customer-abc123

# Port forward for testing
kubectl port-forward svc/customer-abc123-api 3002:3002 -n customer-abc123
```

## Troubleshooting

### Deployment Stuck
```bash
# Check events
kubectl get events -n customer-abc123 --sort-by='.lastTimestamp'

# Check pod logs
kubectl describe pod <pod-name> -n customer-abc123
```

### ImagePullBackOff
```bash
# Check if images exist
docker pull iotistic/api:$SHA
docker pull iotistic/dashboard:$SHA

# Verify image pull secrets
kubectl get secrets -n customer-abc123
```

### Database Connection Issues
```bash
# Test from pod
kubectl exec -it deployment/customer-abc123-api -n customer-abc123 -- sh
nc -zv customer-abc123-postgresql 5432
```

## Best Practices

1. **Always test in staging first**
   ```bash
   Environment: staging
   ```

2. **Use semantic versioning for images**
   ```yaml
   --set api.image.tag=v2.0.1
   ```

3. **Monitor deployments**
   - Check GitHub Actions summary
   - Watch pod status in real-time
   - Review logs for errors

4. **Incremental rollouts**
   - Deploy one service at a time
   - Verify health before next deployment
   - Keep previous version running during migration

5. **Backup before major changes**
   ```bash
   # Backup Helm release
   helm get values customer-abc123 -n customer-abc123 > backup-values.yaml
   ```

## CI/CD Integration

The workflow integrates with your existing CI:
- Waits for Docker images from `build-api-ci.yml`
- Waits for Docker images from `build-dashboard-ci.yml`
- Uses `${{ github.sha }}` for image tags
- Automatic rollback on failure

## Security Notes

- Secrets are encrypted in GitHub
- KUBECONFIG has cluster admin access (use RBAC in production)
- License keys are passed as Helm values
- Passwords are not logged or displayed
- Use NetworkPolicies to isolate customer namespaces
