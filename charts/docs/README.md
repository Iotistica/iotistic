# Iotistic IoT Platform - Kubernetes Deployment

Complete Kubernetes deployment guide and Helm charts for the Iotistic multi-tenant IoT platform.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
  - [1. Prerequisites Setup](#1-prerequisites-setup)
  - [2. Deploy Customer Instance](#2-deploy-customer-instance)
  - [3. Verify Deployment](#3-verify-deployment)
- [Cluster Setup](#cluster-setup)
  - [Automated Setup Scripts](#automated-setup-scripts)
  - [Manual Installation](#manual-installation)
- [Customer Instance Deployment](#customer-instance-deployment)
  - [Via Billing API](#via-billing-api)
  - [Via Helm](#via-helm)
  - [Configuration Reference](#configuration-reference)
- [Architecture](#architecture)
- [MQTT Authentication](#mqtt-authentication)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Operations](#operations)

---

## Overview

The Iotistic platform uses a **multi-tenant architecture** with namespace-level isolation on Kubernetes:

- **Billing Service**: Single shared instance managing customers, subscriptions, and licenses
- **Customer Instances**: Isolated per customer, each in their own namespace

### Each Customer Instance Includes

- **PostgreSQL** - Database for sensor data and MQTT authentication
- **Mosquitto** - MQTT broker with PostgreSQL authentication (mosquitto-go-auth)
- **API** - Backend API service with license validation
- **Dashboard** - Web-based admin panel
- **Billing Exporter** - Metrics collector for usage tracking

### Monitoring Architecture

- **Shared Monitoring** (Starter/Professional) - ServiceMonitor resources scraped by cluster Prometheus
- **Dedicated Monitoring** (Enterprise) - Full Prometheus + Grafana stack per customer

---

## Quick Start

> **💡 Docker Desktop Users**: This guide works perfectly with Docker Desktop's built-in Kubernetes! No Helm required - all steps use `kubectl` commands.
> 
> **📖 See**: [DOCKER-DESKTOP-SETUP.md](./DOCKER-DESKTOP-SETUP.md) for step-by-step validated instructions specific to Docker Desktop.

### 1. Prerequisites Setup

**Option A: Automated Setup (Recommended)**

```bash
# Linux/Mac
chmod +x cluster-setup.sh
./cluster-setup.sh --domain iotistic.ca --email admin@iotistic.ca

# Windows PowerShell
.\cluster-setup.ps1 -Domain iotistic.ca -Email admin@iotistic.ca
```

Installs:
- ✅ ServiceMonitor CRD (REQUIRED)
- ✅ Nginx Ingress Controller  
- ✅ cert-manager + Let's Encrypt
- ✅ Prometheus Operator (shared monitoring)

**Option B: Minimal Manual Setup**

At minimum, install ServiceMonitor CRD (CRITICAL):

```bash
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Verify
kubectl get crd servicemonitors.monitoring.coreos.com
```

❌ **Without this CRD, all deployments fail with:**
```
Error: no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

### 2. Deploy Customer Instance

**Via Billing API (Recommended):**

```bash
curl -X POST http://localhost:3100/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "SecurePass123!",
    "company_name": "Acme Corp"
  }'

# Check deployment status
curl http://localhost:3100/api/customers/<customer-id>/deployment/status
```

**Via Helm (Manual):**

```bash
helm install customer-abc123 ./customer-instance \
  --set customer.id=abc123 \
  --set customer.email=customer@example.com \
  --set customer.companyName="Acme Corp" \
  --set license.key="eyJhbGc..." \
  --set domain.base=iotistic.ca \
  --namespace customer-abc123 \
  --create-namespace
```

### 3. Verify Deployment

```bash
# Check all resources
kubectl get all -n customer-abc123

# Expected: 4 pods running (api, dashboard, mosquitto, postgres)

# Check ServiceMonitor created
kubectl get servicemonitor -n customer-abc123

# Test API health
kubectl port-forward -n customer-abc123 svc/customer-abc123-api 3001:3001
curl http://localhost:3001/health
```

---

## Cluster Setup

### Automated Setup Scripts

Use the one-time cluster setup scripts to install all prerequisites:

**Linux/Mac:**

```bash
cd charts
chmod +x cluster-setup.sh

# Full installation
./cluster-setup.sh --domain iotistic.ca --email admin@iotistic.ca

# Minimal (CRD only)
./cluster-setup.sh --skip-ingress --skip-cert-manager --skip-monitoring

# Preview changes
./cluster-setup.sh --dry-run --domain iotistic.ca --email admin@iotistic.ca
```

**Windows:**

```powershell
cd charts

# Full installation
.\cluster-setup.ps1 -Domain iotistic.ca -Email admin@iotistic.ca

# Minimal (CRD only)
.\cluster-setup.ps1 -SkipIngress -SkipCertManager -SkipMonitoring

# Preview changes
.\cluster-setup.ps1 -DryRun -Domain iotistic.ca -Email admin@iotistic.ca
```

**Script Options:**

| Option | Description |
|--------|-------------|
| `--domain / -Domain` | Base domain for customer subdomains (e.g., iotistic.ca) |
| `--email / -Email` | Email for Let's Encrypt notifications |
| `--skip-ingress / -SkipIngress` | Don't install Nginx Ingress |
| `--skip-cert-manager / -SkipCertManager` | Don't install cert-manager |
| `--skip-monitoring / -SkipMonitoring` | Don't install Prometheus Operator |
| `--dry-run / -DryRun` | Preview without making changes |

### Manual Installation

#### 1. ServiceMonitor CRD (REQUIRED)

```bash
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
```

#### 2. Nginx Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer

# Get external IP
kubectl get service -n ingress-nginx ingress-nginx-controller
```

#### 3. cert-manager (Optional - for TLS)

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.13.0 \
  --set installCRDs=true

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@iotistic.ca  # Change this!
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

#### 4. Prometheus Operator (Optional - for monitoring)

**Option A: Using kubectl (No Helm Required - Recommended for Docker Desktop)**

```bash
# Create monitoring namespace
kubectl create namespace monitoring

# Install Prometheus Operator
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/bundle.yaml

# Install Prometheus CRD
kubectl apply --server-side -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_prometheuses.yaml

# Restart operator to detect new CRDs
kubectl rollout restart deployment prometheus-operator -n default

# Wait for operator to restart
kubectl wait --for=condition=available deployment/prometheus-operator -n default --timeout=60s

# Create monitoring stack (Prometheus + Grafana)
# Download the manifest
curl -O https://raw.githubusercontent.com/Iotistica/iotistic/master/charts/monitoring-stack.yaml

# Or create it manually (see monitoring-stack.yaml in charts/)
kubectl apply -f monitoring-stack.yaml

# Verify installation
kubectl get pods -n monitoring
# Expected: prometheus-prometheus-0 (2/2 Running), grafana-xxx (1/1 Running)

# Access Grafana
kubectl port-forward -n monitoring svc/grafana 3000:3000
# Open http://localhost:3000
# Credentials: admin/admin
```

**Option B: Using Helm**

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus-operator prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false

# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-operator-grafana 3000:80
# Default: admin/prom-operator
```

---

## Customer Instance Deployment

### Via Billing API

The billing service automatically handles deployment:

```bash
# Signup triggers deployment
curl -X POST http://localhost:3100/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "SecurePass123!",
    "company_name": "Acme Corp"
  }'

# Monitor deployment
curl http://localhost:3100/api/customers/<customer-id>/deployment/status

# Manually trigger deployment
curl -X POST http://localhost:3100/api/customers/<customer-id>/deploy

# Delete deployment
curl -X DELETE http://localhost:3100/api/customers/<customer-id>/deployment
```

### Via Helm

**Method 1: Command-line flags**

```bash
helm install customer-abc123 ./customer-instance \
  --set customer.id=abc123 \
  --set customer.email=customer@example.com \
  --set customer.companyName="Acme Corp" \
  --set license.key="eyJhbGc..." \
  --set domain.base=iotistic.ca \
  --namespace customer-abc123 \
  --create-namespace

# Watch deployment
kubectl get pods -n customer-abc123 --watch
```

**Method 2: Values file**

```bash
# Create values file
cat > customer-abc123-values.yaml <<EOF
customer:
  id: "abc123"
  email: "customer@example.com"
  companyName: "Acme Corp"

license:
  key: "eyJhbGc..."

domain:
  base: "iotistic.ca"

ingress:
  enabled: true
  className: nginx
  tls:
    enabled: true
EOF

# Install
helm install customer-abc123 ./customer-instance \
  -f customer-abc123-values.yaml \
  --namespace customer-abc123 \
  --create-namespace
```

### Configuration Reference

#### Required Values

```yaml
customer:
  id: "abc123"                    # Unique customer ID
  email: "customer@example.com"   # Customer email
  companyName: "Acme Corp"        # Company name

license:
  key: "eyJhbGc..."               # JWT license key

domain:
  base: "iotistic.ca"             # Base domain
```

#### Optional Values (with defaults)

```yaml
# PostgreSQL
postgres:
  image: postgres:15-alpine
  storageSize: 10Gi
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

# Mosquitto MQTT Broker
mosquitto:
  image: iegomez/mosquitto-go-auth:latest
  mqttPort: 1883
  websocketPort: 9001
  auth:
    allowAnonymous: false
    hasher: bcrypt
    hasherCost: 10
  resources:
    requests:
      cpu: 100m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi

# API Service
api:
  image: iotistic/api:latest
  port: 3002
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

# Dashboard
dashboard:
  image: iotistic/dashboard:latest
  port: 80
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    enabled: true

# Monitoring (set automatically from license)
monitoring:
  enabled: true
  dedicated: false              # true for Enterprise
  scrapeInterval: "30s"         # 30s/15s based on plan
  retention: "7d"               # 7d/15d/30d based on plan
  storageSize: "10Gi"           # 10Gi/50Gi based on plan

# Resource Quotas
resourceQuota:
  enabled: true
  cpu: "4"
  memory: "4Gi"
  pvcs: "5"
  services: "10"

# Network Policies
networkPolicy:
  enabled: true
```

#### Access Deployed Services

**Via Ingress** (if configured with DNS):
- Dashboard: `https://abc123.iotistic.ca/`
- API: `https://abc123.iotistic.ca/api`

**Via Port-Forward:**

```bash
# Dashboard
kubectl port-forward -n customer-abc123 svc/customer-abc123-dashboard 8080:80
# Open http://localhost:8080

# API
kubectl port-forward -n customer-abc123 svc/customer-abc123-api 3001:3002
curl http://localhost:3001/health

# MQTT
kubectl port-forward -n customer-abc123 svc/customer-abc123-mosquitto 1883:1883
mosquitto_sub -h localhost -p 1883 -u device001 -P password -t test/#
```

---

## Architecture

```
Internet
    │
    ├─── Ingress (nginx + cert-manager)
    │         │
    │         ├─── / → Dashboard (port 80)
    │         ├─── /api → API (port 3002)
    │         └─── /metrics → Exporter (port 9090)
    │
    └─── Namespace: customer-{id}
              │
              ├─── PostgreSQL (ClusterIP:5432)
              │     ├─── PVC (10Gi)
              │     └─── Tables: mqtt_users, mqtt_acls
              │
              ├─── Mosquitto (ClusterIP:1883,9001)
              │     └─── Auth via PostgreSQL (mosquitto-go-auth)
              │
              ├─── API (with license validation)
              │     └─── Connects to: PostgreSQL, Mosquitto
              │
              ├─── Dashboard
              │     └─── Connects to: API
              │
              └─── Billing Exporter
                    └─── Collects usage metrics
```

---

## MQTT Authentication

Mosquitto uses PostgreSQL for authentication and ACL management via `mosquitto-go-auth`.

### Database Tables

**mqtt_users** - User credentials

```sql
CREATE TABLE mqtt_users (
  username VARCHAR(255) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_superuser BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**mqtt_acls** - Access control lists

```sql
CREATE TABLE mqtt_acls (
  username VARCHAR(255),
  topic VARCHAR(255),
  access INTEGER,  -- 1=read, 2=write, 3=read+write, 4=subscribe
  PRIMARY KEY (username, topic)
);
```

### Creating MQTT Users

```bash
# Connect to PostgreSQL
kubectl exec -it -n customer-abc123 deployment/customer-abc123-postgres -- \
  psql -U postgres -d iotistic

# Create device user (bcrypt hash for password)
INSERT INTO mqtt_users (username, password_hash, is_active, is_superuser)
VALUES ('device001', '$2a$10$...bcrypt-hash...', true, false);

# Grant access
INSERT INTO mqtt_acls (username, topic, access)
VALUES 
  ('device001', 'sensor/device001/#', 3),  -- read+write
  ('device001', 'command/device001/#', 1); -- read only
```

### Testing MQTT Connection

```bash
# Port-forward Mosquitto
kubectl port-forward -n customer-abc123 svc/customer-abc123-mosquitto 1883:1883

# Test publish (requires authentication)
mosquitto_pub -h localhost -p 1883 \
  -u device001 -P yourpassword \
  -t sensor/device001/temperature \
  -m '{"value": 22.5, "unit": "C"}'

# Test subscribe
mosquitto_sub -h localhost -p 1883 \
  -u device001 -P yourpassword \
  -t sensor/device001/#
```

---

## Monitoring

### Architecture Overview

**Shared Monitoring** (Starter & Professional)
- ServiceMonitor resource created in customer namespace
- Metrics scraped by shared Prometheus in `monitoring` namespace
- Customer metrics labeled with `customer_id`, `customer_plan`, `customer_company`

**Dedicated Monitoring** (Enterprise)
- Full Prometheus + Grafana stack in customer namespace
- Isolated metrics and dashboards
- Custom retention (30 days) and storage (50GB)

### Verify Monitoring Setup

```bash
# Check ServiceMonitor (shared monitoring)
kubectl get servicemonitor -n customer-abc123
kubectl get servicemonitor -n customer-abc123 -o yaml

# Check Prometheus (dedicated monitoring - Enterprise only)
kubectl get prometheus -n customer-abc123

# Check Grafana (dedicated monitoring - Enterprise only)
kubectl get deployment -n customer-abc123 | grep grafana
```

### Access Metrics

**Shared Prometheus:**

```bash
# Port-forward to Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Open http://localhost:9090
# Query: {customer_id="cust_abc123..."}
```

**Shared Grafana:**

```bash
# Port-forward to Grafana
kubectl port-forward -n monitoring svc/grafana 3000:3000
# Open http://localhost:3000
# Credentials: admin/admin

# Navigate to: Explore → Select Prometheus datasource
# Query examples:
#   {namespace="customer-abc123"}
#   {job="customer-abc123-api"}
#   up{namespace="customer-abc123"}
```

**Dedicated Prometheus** (Enterprise):

```bash
# Prometheus
kubectl port-forward -n customer-abc123 svc/customer-abc123-prometheus 9090:9090

# Grafana
kubectl port-forward -n customer-abc123 svc/customer-abc123-grafana 3000:80
# Open http://localhost:3000 (admin/admin)
```

**Direct Metrics Endpoints:**

```bash
# API metrics
kubectl port-forward -n customer-abc123 svc/customer-abc123-api 3001:3002
curl http://localhost:3001/metrics

# Mosquitto metrics
kubectl port-forward -n customer-abc123 svc/customer-abc123-mosquitto 9234:9234
curl http://localhost:9234/metrics

# PostgreSQL metrics
kubectl port-forward -n customer-abc123 svc/customer-abc123-postgres 9187:9187
curl http://localhost:9187/metrics
```

---

## Troubleshooting

### Deployment Fails: ServiceMonitor CRD Missing

**Error:**
```
Error: no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

**Fix:**
```bash
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Retry deployment
helm upgrade customer-abc123 ./customer-instance --reuse-values -n customer-abc123
```

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n customer-abc123

# Describe failing pod
kubectl describe pod <pod-name> -n customer-abc123

# Check events
kubectl get events -n customer-abc123 --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n customer-abc123 <pod-name>
```

### License Validation Fails

```bash
# Check API logs
kubectl logs -n customer-abc123 deployment/customer-abc123-api | grep -i license

# Verify license secret
kubectl get secret customer-abc123-secrets -n customer-abc123 \
  -o jsonpath='{.data.IOTISTIC_LICENSE_KEY}' | base64 -d

# Decode JWT
echo "eyJhbGc..." | cut -d'.' -f2 | base64 -d | jq
```

### Database Connection Issues

```bash
# Test PostgreSQL connectivity
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  pg_isready -h customer-abc123-postgres -p 5432

# Check PostgreSQL logs
kubectl logs -n customer-abc123 deployment/customer-abc123-postgres

# Connect manually
kubectl exec -it -n customer-abc123 deployment/customer-abc123-postgres -- \
  psql -U postgres -d iotistic
```

### MQTT Connection Issues

```bash
# Test Mosquitto connectivity
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- \
  nc -zv customer-abc123-mosquitto 1883

# Check Mosquitto logs
kubectl logs -n customer-abc123 deployment/customer-abc123-mosquitto

# Verify PostgreSQL auth
kubectl exec -it -n customer-abc123 deployment/customer-abc123-postgres -- \
  psql -U postgres -d iotistic -c "SELECT * FROM mqtt_users;"
```

### Ingress Not Working

```bash
# Check ingress status
kubectl get ingress -n customer-abc123
kubectl describe ingress -n customer-abc123

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller

# Check DNS resolution
nslookup abc123.iotistic.ca

# Check certificate (if TLS enabled)
kubectl get certificate -n customer-abc123
kubectl describe certificate -n customer-abc123
```

---

## Operations

### Upgrade Customer Instance

```bash
# Update license or configuration
helm upgrade customer-abc123 ./customer-instance \
  --set license.key="new-jwt-token" \
  --reuse-values \
  --namespace customer-abc123

# Or via billing API
curl -X PUT http://localhost:3100/api/customers/abc123/license \
  -H "Content-Type: application/json" \
  -d '{"plan":"professional"}'
```

### Uninstall Customer Instance

```bash
# Via Helm
helm uninstall customer-abc123 --namespace customer-abc123

# Delete namespace (removes all resources)
kubectl delete namespace customer-abc123

# Or via billing API
curl -X DELETE http://localhost:3100/api/customers/abc123/deployment
```

### Quick Reference Commands

```bash
# List all customer namespaces
kubectl get namespaces -l managed-by=iotistic

# Check specific customer
kubectl get all -n customer-abc123

# View logs
kubectl logs -f -n customer-abc123 deployment/customer-abc123-api

# Shell into pod
kubectl exec -it -n customer-abc123 deployment/customer-abc123-api -- sh

# Port-forward service
kubectl port-forward -n customer-abc123 svc/customer-abc123-api 3001:3002

# Check resource usage
kubectl top pods -n customer-abc123
kubectl describe resourcequota -n customer-abc123
```

### Helm Commands

```bash
# List releases
helm list -A

# Get release info
helm status customer-abc123 -n customer-abc123

# Get current values
helm get values customer-abc123 -n customer-abc123

# Rollback to previous version
helm rollback customer-abc123 -n customer-abc123
```

### Common Ports

| Service | Internal Port | External (Port-Forward) |
|---------|---------------|-------------------------|
| API | 3002 | `kubectl port-forward ... 3001:3002` |
| Dashboard | 80 | `kubectl port-forward ... 8080:80` |
| MQTT | 1883 | `kubectl port-forward ... 1883:1883` |
| MQTT WebSocket | 9001 | `kubectl port-forward ... 9001:9001` |
| PostgreSQL | 5432 | `kubectl port-forward ... 5432:5432` |

---

## Support

For issues or questions:

1. Check pod logs: `kubectl logs <pod-name> -n customer-{id}`
2. Check events: `kubectl get events -n customer-{id} --sort-by='.lastTimestamp'`
3. Check deployment status via API: `GET /api/customers/{id}/deployment/status`

## Related Documentation

- **Production Deployment**: `../docs/K8S-DEPLOYMENT-GUIDE.md`
- **Signup Implementation**: `../docs/CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md`
- **Billing System**: `../billing/docs/README.md`

## License

Proprietary - Iotistic
