# Kubernetes Deployment - Cloud OIDC Version
# Choose the section for your cloud provider

## AWS EKS Setup

### 1. Create IAM Role for GitHub Actions
```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:Iotistica/iotistic:*"
        }
      }
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name GitHubActionsEKSRole \
  --assume-role-policy-document file://trust-policy.json

# Attach EKS policy
aws iam attach-role-policy \
  --role-name GitHubActionsEKSRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy
```

### 2. Update Workflow
```yaml
jobs:
  deploy:
    permissions:
      id-token: write
      contents: read
    
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::YOUR_ACCOUNT:role/GitHubActionsEKSRole
          aws-region: us-east-1

      - run: aws eks update-kubeconfig --name YOUR_CLUSTER --region us-east-1
      - run: kubectl get pods
```

---

## GCP GKE Setup

### 1. Create Workload Identity Pool
```bash
# Enable required APIs
gcloud services enable iamcredentials.googleapis.com

# Create pool
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"

# Create service account
gcloud iam service-accounts create github-actions

# Bind permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:github-actions@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/container.admin"

# Allow GitHub to impersonate
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@YOUR_PROJECT.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/Iotistica/iotistic"
```

### 2. Update Workflow
```yaml
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-provider'
          service_account: 'github-actions@YOUR_PROJECT.iam.gserviceaccount.com'

      - run: gcloud container clusters get-credentials YOUR_CLUSTER --zone us-central1-a
      - run: kubectl get pods
```

---

## Azure AKS Setup

### 1. Create Azure AD App
```bash
# Create app
az ad app create --display-name github-actions-aks

# Create service principal
az ad sp create --id APP_ID

# Get credentials
az ad app federated-credential create \
  --id APP_ID \
  --parameters '{
    "name": "github-iotistic",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:Iotistica/iotistic:ref:refs/heads/master",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Grant AKS permissions
az role assignment create \
  --assignee APP_ID \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --scope /subscriptions/SUBSCRIPTION_ID/resourceGroups/RESOURCE_GROUP/providers/Microsoft.ContainerService/managedClusters/CLUSTER_NAME
```

### 2. Add GitHub Secrets
- `AZURE_CLIENT_ID`: App (client) ID
- `AZURE_TENANT_ID`: Directory (tenant) ID  
- `AZURE_SUBSCRIPTION_ID`: Subscription ID

### 3. Update Workflow
```yaml
      - uses: azure/login@v1
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - run: az aks get-credentials --resource-group RESOURCE_GROUP --name CLUSTER_NAME
      - run: kubectl get pods
```

---

## Self-Hosted Runner Setup

### 1. Install in Cluster
```bash
# Add Helm repo
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller

# Install controller
helm install arc \
  --namespace actions-runner-system \
  --create-namespace \
  --set authSecret.github_token=YOUR_GITHUB_PAT \
  actions-runner-controller/actions-runner-controller

# Deploy runners
kubectl apply -f - <<EOF
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: iotistic-runner
  namespace: actions-runner-system
spec:
  replicas: 2
  template:
    spec:
      repository: Iotistica/iotistic
      labels:
        - self-hosted
        - kubernetes
      dockerEnabled: true
      resources:
        limits:
          cpu: "2"
          memory: "4Gi"
        requests:
          cpu: "1"
          memory: "2Gi"
EOF
```

### 2. Update Workflow
```yaml
jobs:
  deploy:
    runs-on: [self-hosted, kubernetes]  # Use your runners
    
    steps:
      # kubectl works automatically - runner is in cluster!
      - run: kubectl get pods
```

### 3. GitHub PAT Token
Create at: https://github.com/settings/tokens
- Permissions: `repo`, `admin:org`
