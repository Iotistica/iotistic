# Retention Policies - Cost Optimization

This document describes the automated retention policies for Docker images and Azure Blob Storage to manage costs and prevent storage bloat.

## Overview

- **Docker Hub**: Keeps latest 10 version tags (configurable)
- **Azure Blob Storage**: Automatic lifecycle policies + manual cleanup
- **Cleanup Schedule**: Weekly (Sunday 2 AM UTC)
- **Manual Trigger**: Available via GitHub Actions UI

## Docker Hub Retention

### Policy
- **Retention**: Keep latest **10 version tags** (e.g., 1.0.34, 1.0.33, ...)
- **Excluded from cleanup**: `latest` tag and SHA-based tags remain indefinitely
- **Cleanup frequency**: Weekly via GitHub Actions

### Cost Impact
- Docker Hub Free tier: Unlimited public repositories
- Storage: Images auto-expire after cleanup (no manual intervention needed)
- Bandwidth: Only affects pulls of old versions (unlikely after cleanup)

### Manual Trigger
```bash
# Via GitHub CLI
gh workflow run cleanup-old-releases.yml \
  -f keep_versions=10 \
  -f dry_run=true

# Via GitHub UI
Actions → Cleanup Old Releases → Run workflow
```

### How It Works
The cleanup workflow:
1. Authenticates with Docker Hub API
2. Fetches all version tags (matching pattern `X.Y.Z`)
3. Sorts versions (newest first)
4. Keeps latest N versions
5. Deletes older versions via API

**Example**:
```
Found versions: 1.0.40, 1.0.39, ..., 1.0.30, 1.0.29
Keep: 1.0.40 → 1.0.31 (latest 10)
Delete: 1.0.30, 1.0.29, ... (all older)
```

## Azure Blob Storage Retention

### Lifecycle Policies (Automatic)

Two automatic lifecycle rules are configured:

#### 1. Versioned Scripts Cleanup
- **Path**: `agent/versions/install-docker-*.sh`, `agent/versions/install-systemd-*.sh`
- **Retention**: 90 days from creation
- **Action**: Auto-delete blobs older than 90 days

#### 2. Blob Versioning Cleanup
- **Path**: `agent/*` (all agent files)
- **Retention**: 30 days for old blob versions
- **Action**: Auto-delete non-current versions after 30 days
- **Protected**: Latest/current version never deleted

### Manual Cleanup (Weekly)

In addition to lifecycle policies, the workflow manually deletes old versioned scripts:

- **Retention**: Keep latest **10 versions** of each script type
- **Scope**: `agent/versions/install-docker-*.sh` and `agent/versions/install-systemd-*.sh`
- **Checksums**: Automatically deletes corresponding `.sha256` files

### Cost Impact
- **Current cost**: ~$0.02/GB/month for Blob Storage (LRS)
- **Estimated storage**: Each script ~5KB, 10 versions × 2 scripts = 100KB
- **Annual cost**: < $0.01 (negligible)
- **With versioning**: Old blob versions add ~2-3× storage, lifecycle policy limits to 30 days

### Protected Files
These files are **never automatically deleted**:
- `agent/install-docker.sh` (latest)
- `agent/install-systemd.sh` (latest)
- `agent/install-docker.sh.sha256`
- `agent/install-systemd.sh.sha256`

### How It Works
1. **Lifecycle Policy**: Azure automatically deletes blobs/versions based on age
2. **Manual Cleanup**: GitHub workflow:
   - Lists all versioned scripts
   - Sorts by creation date (newest first)
   - Keeps latest N versions
   - Deletes older versions + checksums

## Workflow Configuration

### File Location
`.github/workflows/cleanup-old-releases.yml`

### Schedule
```yaml
schedule:
  # Run weekly on Sunday at 2 AM UTC
  - cron: '0 2 * * 0'
```

### Manual Trigger Options
- `keep_versions`: Number of versions to keep (default: 10)
- `dry_run`: Preview deletions without actually deleting (default: true)

### Secrets Required
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_PASSWORD`: Docker Hub password/token
- `AZURE_CREDENTIALS`: Azure service principal credentials
- `AZURE_STORAGE_ACCOUNT`: Azure storage account name

## Usage Examples

### Dry Run (Preview Only)
```bash
gh workflow run cleanup-old-releases.yml \
  -f keep_versions=10 \
  -f dry_run=true
```

### Live Cleanup (Delete Old Versions)
```bash
gh workflow run cleanup-old-releases.yml \
  -f keep_versions=10 \
  -f dry_run=false
```

### Aggressive Cleanup (Keep Only 5 Versions)
```bash
gh workflow run cleanup-old-releases.yml \
  -f keep_versions=5 \
  -f dry_run=false
```

## Monitoring

### View Cleanup Results
1. Go to GitHub Actions
2. Select "Cleanup Old Releases" workflow
3. View latest run for deletion summary

### Verify Docker Hub
```bash
# List all tags
curl -s "https://hub.docker.com/v2/repositories/iotistic/agent/tags?page_size=100" | \
  jq -r '.results[].name' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V

# Count version tags
curl -s "https://hub.docker.com/v2/repositories/iotistic/agent/tags?page_size=100" | \
  jq '[.results[] | select(.name | test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))] | length'
```

### Verify Azure Storage
```bash
# List versioned scripts
az storage blob list \
  --account-name <account-name> \
  --container-name scripts \
  --prefix agent/versions/ \
  --output table

# View lifecycle policy
az storage account management-policy show \
  --account-name <account-name> \
  --query policy
```

## Cost Estimates

### Docker Hub
- **Free tier**: Unlimited public repositories
- **Bandwidth**: Free for public images
- **Cost**: $0/month (using free tier)

### Azure Blob Storage (Current Usage)
- **Scripts**: ~100KB total (10 versions × 2 scripts × 5KB)
- **Blob versions**: ~200KB (with 30-day versioning)
- **Total**: ~300KB
- **Monthly cost**: ~$0.006 (negligible)

### Without Retention Policies (Projected)
After 1 year of weekly builds:
- **Scripts**: ~52 versions × 2 scripts × 5KB = 520KB
- **Blob versions**: ~2.5MB (accumulated versions)
- **Monthly cost**: ~$0.05-0.10

### Savings
- **Estimated savings**: ~90% reduction in storage costs
- **Annual savings**: ~$0.50-1.00 (minor but compounds over time)

## Recommendations

1. **Keep defaults**: 10 versions is sufficient for rollback scenarios
2. **Monitor monthly**: Check GitHub Actions for cleanup failures
3. **Adjust if needed**: Increase retention if frequent rollbacks are needed
4. **Dry run first**: Always test with `dry_run=true` when changing policies

## Troubleshooting

### Docker Hub API Authentication Fails
```bash
# Regenerate Docker Hub token
# Dashboard → Account Settings → Security → New Access Token
```

### Azure Lifecycle Policy Not Applied
```bash
# Verify lifecycle policy exists
az storage account management-policy show \
  --account-name <account-name>

# Reapply policy
az storage account management-policy create \
  --account-name <account-name> \
  --policy @lifecycle-policy.json
```

### Manual Cleanup Fails
- Check Azure credentials are valid
- Verify storage account name is correct
- Ensure service principal has "Storage Blob Data Contributor" role

## Related Documentation
- [Azure Blob Storage Lifecycle Policies](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview)
- [Docker Hub API](https://docs.docker.com/docker-hub/api/latest/)
- [GitHub Actions Scheduled Workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
