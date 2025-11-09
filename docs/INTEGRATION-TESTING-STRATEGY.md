# Integration Testing Strategy

## Overview

This document explains how our integration testing workflow validates service deployments using versioned Docker images pulled from Docker Hub. The strategy ensures backward compatibility and safe incremental deployments.

## Architecture

### Services with Independent Versioning

```
Services (Independent CI/CD):
├── agent/        → build-device-agent-ci.yml → iotistic/agent:x.y.z
├── api/          → build-api-ci.yml          → iotistic/api:x.y.z
├── dashboard/    → build-dashboard-ci.yml    → iotistic/dashboard:x.y.z
├── housekeeper/  → build-housekeeper-ci.yml  → iotistic/housekeeper:x.y.z
└── postoffice/   → build-postoffice-ci.yml   → iotistic/postoffice:x.y.z

Integration Testing:
└── integration-tests.yml ← Tests services together with versioned images
```

### Key Principle: Test What Users Get

Integration tests **pull published Docker images from Docker Hub**, NOT build from source. This ensures:

✅ We test the exact images users will download  
✅ We validate the entire pipeline (build → push → pull → run)  
✅ We catch image build issues (layers, caching, multi-arch)  
✅ Tests are faster (pull vs rebuild)  

## Testing Modes

### 1. Incremental Testing (Automated)

**Trigger**: Automatically runs after each service build completes

**Purpose**: Validate backward compatibility when deploying one service at a time

**Example Flow**:
```bash
# Developer updates API code
git commit -m "feat: add new endpoint"
git push origin master

# 1. API CI Build
build-api-ci.yml:
  ✓ Tests pass
  ✓ Version bumps: 2.0.5 → 2.0.6
  ✓ Builds Docker image
  ✓ Pushes: iotistic/api:2.0.6
  ✓ Triggers: integration-tests.yml with api_version=2.0.6

# 2. Integration Tests
integration-tests.yml:
  Determines versions:
    - agent_version: 1.0.3 (from package.json - current stable)
    - api_version: 2.0.6 (from build trigger - NEW)
    - dashboard_version: 3.1.1 (from package.json - current stable)
  
  Pulls images:
    ✓ docker pull iotistic/agent:1.0.3
    ✓ docker pull iotistic/api:2.0.6       ← NEW VERSION
    ✓ docker pull iotistic/dashboard:3.1.1
  
  Runs test suite:
    Agent(1.0.3) ←→ API(2.0.6-NEW) ←→ Dashboard(3.1.1)
```

**What This Validates**:
- ✅ New API works with existing Agent (no breaking changes)
- ✅ New API works with existing Dashboard (backward compatible)
- ✅ Safe to deploy API without updating other services

### 2. Full Stack Testing (Manual + Scheduled)

**Triggers**: 
- Manual: GitHub Actions UI → Run workflow → Select "full-stack" mode
- Scheduled: Nightly at 2 AM UTC (cron)

**Purpose**: Validate integration between all latest versions

**Example Flow**:
```bash
# Manual trigger from GitHub UI
# OR
# Nightly cron schedule

integration-tests.yml:
  Determines versions:
    - agent_version: 1.0.3 (latest from package.json)
    - api_version: 2.0.6 (latest from package.json)
    - dashboard_version: 3.1.1 (latest from package.json)
  
  Pulls images:
    ✓ docker pull iotistic/agent:1.0.3
    ✓ docker pull iotistic/api:2.0.6
    ✓ docker pull iotistic/dashboard:3.1.1
  
  Runs test suite:
    Agent(1.0.3-LATEST) ←→ API(2.0.6-LATEST) ←→ Dashboard(3.1.1-LATEST)
```

**What This Validates**:
- ✅ All latest versions work together
- ✅ No integration issues between recent changes
- ✅ Complete system smoke test
- ✅ Nightly regression detection

### 3. Custom Version Testing (Manual)

**Trigger**: Manual with specific version inputs

**Purpose**: Test specific version combinations for debugging or validation

**Example**:
```bash
# GitHub Actions UI:
# - agent_version: 1.0.2
# - api_version: 2.0.5
# - dashboard_version: 3.1.0

integration-tests.yml:
  Pulls images:
    ✓ docker pull iotistic/agent:1.0.2
    ✓ docker pull iotistic/api:2.0.5
    ✓ docker pull iotistic/dashboard:3.1.0
```

**Use Cases**:
- Reproduce production bug with specific versions
- Test upgrade path (e.g., Agent 1.0.1 → 1.0.3)
- Validate hotfix compatibility

## Version Determination Logic

The integration test workflow determines which versions to test using this priority:

```yaml
For each service:
  1. Use workflow input if provided (manual trigger)
  2. Fall back to package.json version (auto trigger or defaults)
  3. Validate image exists on Docker Hub before proceeding
```

**Implementation**:
```bash
# From integration-tests.yml
if [ -n "${{ inputs.agent_version }}" ]; then
  AGENT_VERSION="${{ inputs.agent_version }}"
else
  AGENT_VERSION=$(jq -r '.version' agent/package.json)
fi

# Validate image exists
docker manifest inspect "iotistic/agent:$AGENT_VERSION" || exit 1
```

## Test Suite Components

Integration tests validate the complete E2E stack:

```yaml
Jobs:
├── determine-versions    # Get/validate versions, pull images
├── setup                 # Display test configuration
├── test-postgres         # PostgreSQL connectivity
├── test-redis            # Redis connectivity
├── test-neo4j            # Neo4j graph database
├── test-mosquitto        # MQTT broker
├── test-api              # API server functionality
├── test-agents           # Agent connectivity & orchestration
├── test-sensors          # Protocol simulators (Modbus, CANbus, OPC-UA)
├── test-dashboard        # Dashboard UI
└── report                # Generate test summary
```

**Infrastructure Services (Fixed Versions)**:
- PostgreSQL: `16-alpine`
- Redis: `7-alpine`
- Neo4j: `5.15-community`
- Mosquitto: `iegomez/mosquitto-go-auth:2.0.0`

**Application Services (Versioned)**:
- Agent: `iotistic/agent:${AGENT_VERSION}`
- API: `iotistic/api:${API_VERSION}`
- Dashboard: `iotistic/dashboard:${DASHBOARD_VERSION}`

## Real-World Deployment Scenario

### Week 1: API Update

**Monday - Developer Work**:
```bash
# Add new feature to API
git commit -m "feat: add device bulk operations endpoint"
git push origin master
```

**Monday - Automated Testing**:
```
API CI Build:
  ✓ Version: 2.0.5 → 2.0.6
  ✓ Build & push: iotistic/api:2.0.6

Integration Tests (Incremental):
  Agent: 1.0.3 (stable)
  API: 2.0.6 (NEW)
  Dashboard: 3.1.1 (stable)
  
  Result: ✅ PASS
  → New API is backward compatible
  → Safe to deploy without updating other services
```

**Tuesday - Production Deployment**:
```bash
# Deploy only API (already tested with existing services)
kubectl set image deployment/api api=iotistic/api:2.0.6
```

### Week 2: Dashboard Update

**Monday - Developer Work**:
```bash
# Update Dashboard UI to use new bulk operations
git commit -m "feat: add bulk device management UI"
git push origin master
```

**Monday - Automated Testing**:
```
Dashboard CI Build:
  ✓ Version: 3.1.1 → 3.1.2
  ✓ Build & push: iotistic/dashboard:3.1.2

Integration Tests (Incremental):
  Agent: 1.0.3 (stable)
  API: 2.0.6 (deployed last week)
  Dashboard: 3.1.2 (NEW)
  
  Result: ✅ PASS
  → New Dashboard works with current API
  → Safe to deploy
```

**Wednesday - Production Deployment**:
```bash
# Deploy Dashboard (already tested with current API)
kubectl set image deployment/dashboard dashboard=iotistic/dashboard:3.1.2
```

### Before Major Release

**Friday - Full Stack Test**:
```bash
# Manual trigger: full-stack mode
# Or: Wait for nightly cron

Integration Tests (Full Stack):
  Agent: 1.0.3 (LATEST)
  API: 2.0.6 (LATEST)
  Dashboard: 3.1.2 (LATEST)
  
  Result: ✅ PASS
  → All latest versions work together
  → Ready for release announcement
```

## How to Run Tests

### Automatic (Happens on Every Push)

```bash
# Just push code to master - tests run automatically
git push origin master

# Agent changes → Incremental test with new Agent
# API changes → Incremental test with new API
# Dashboard changes → Incremental test with new Dashboard
```

### Manual - Full Stack Test

1. Go to GitHub Actions
2. Select "Integration Tests" workflow
3. Click "Run workflow"
4. Select:
   - Branch: `master`
   - Test mode: `full-stack`
5. Click "Run workflow"

### Manual - Specific Versions

1. Go to GitHub Actions
2. Select "Integration Tests" workflow
3. Click "Run workflow"
4. Enter specific versions:
   - agent_version: `1.0.2`
   - api_version: `2.0.5`
   - dashboard_version: `3.1.0`
5. Click "Run workflow"

## Workflow Outputs

### Build Summary (Per Service)

Each build workflow generates:

```markdown
## Build & Release Summary

### Version Information
- Version: 2.0.6
- Git SHA: a1b2c3d
- Platform: linux/amd64

### Docker Image
- Size: 245.32 MB
- Layers: 12
- Tags:
  - iotistic/api:latest
  - iotistic/api:a1b2c3d
  - iotistic/api:2.0.6

### Docker Hub Links
- [Docker Hub Image](https://hub.docker.com/r/iotistic/api/tags?name=2.0.6)

### Changelog
- feat: add device bulk operations endpoint
- fix: handle empty device arrays
- docs: update API documentation
```

### Integration Test Summary

```markdown
## Integration Test Configuration

### Test Mode
Mode: Incremental (Mixed Versions - Testing Backward Compatibility)

### Versions Under Test
- Agent: 1.0.3
- API: 2.0.6
- Dashboard: 3.1.1

### Docker Images
- iotistic/agent:1.0.3
- iotistic/api:2.0.6
- iotistic/dashboard:3.1.1

### Test Results
✅ PostgreSQL connectivity
✅ Redis connectivity
✅ Neo4j connectivity
✅ Mosquitto MQTT broker
✅ API server functionality
✅ Agent connectivity
✅ Dashboard UI
✅ Protocol simulators

All tests passed! 🎉
```

## Troubleshooting

### Image Not Found Error

**Error**:
```
ERROR: Some images are missing on Docker Hub!
✗ iotistic/api:2.0.6 NOT FOUND
```

**Cause**: Build workflow failed or image not yet pushed

**Solution**:
1. Check build workflow status
2. Verify image exists: `docker pull iotistic/api:2.0.6`
3. Wait for build to complete before running tests

### Version Mismatch

**Error**:
```
Expected API version 2.0.6 but got 2.0.5
```

**Cause**: package.json not updated or out of sync

**Solution**:
1. Pull latest master: `git pull origin master`
2. Check version in package.json
3. Re-run workflow with correct version

### Test Failures After Deployment

**Scenario**: Incremental test passes but integration fails

**Cause**: Service incompatibility not caught by mixed version testing

**Solution**:
1. Run full-stack test to reproduce
2. Check service compatibility matrix
3. Fix breaking changes or add migration path
4. Consider service versioning strategy (semver)

## Best Practices

### 1. Semantic Versioning

Follow semver for all services:
- **MAJOR**: Breaking changes (API contract changes)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### 2. Backward Compatibility

New versions should work with previous versions:
- API v2.1.0 should work with Dashboard v3.0.0
- Use feature flags for gradual rollouts
- Deprecate features gradually (not immediately)

### 3. Deployment Strategy

Deploy services incrementally:
1. Deploy API first (most critical)
2. Monitor for errors
3. Deploy Dashboard next
4. Deploy Agent last (if needed)

### 4. Testing Frequency

- **On every push**: Incremental tests (automatic)
- **Nightly**: Full stack tests (scheduled)
- **Before release**: Full stack tests (manual)
- **After incidents**: Specific version tests (manual)

### 5. Rollback Strategy

Keep previous versions available:
```bash
# Quick rollback if issues found
kubectl set image deployment/api api=iotistic/api:2.0.5

# Or use Helm rollback
helm rollback api-release 1
```

## Integration with CI/CD Pipeline

### Complete Flow

```
┌─────────────────┐
│  Code Push      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Service CI Build           │
│  - Run unit tests           │
│  - Bump version             │
│  - Build Docker image       │
│  - Push to Docker Hub       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Integration Tests          │
│  - Pull versioned images    │
│  - Run E2E tests            │
│  - Validate compatibility   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Manual Review              │
│  - Check test results       │
│  - Review changelog         │
│  - Approve deployment       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Production Deployment      │
│  - Deploy to staging        │
│  - Smoke tests              │
│  - Deploy to production     │
└─────────────────────────────┘
```

## Configuration Files

### Integration Test Workflow
- **File**: `.github/workflows/integration-tests.yml`
- **Trigger**: `workflow_call`, `workflow_dispatch`, `release`, `schedule`
- **Duration**: ~10-15 minutes
- **Cost**: ~$0.10 per run (GitHub Actions pricing)

### Docker Compose Stack
- **File**: `docker-compose.e2e.yml`
- **Services**: postgres, redis, neo4j, mosquitto, api, dashboard, agent, vpn-server, simulators
- **Environment Variables**: `AGENT_VERSION`, `API_VERSION`, `DASHBOARD_VERSION`

### Service Build Workflows
- **Agent**: `.github/workflows/build-device-agent-ci.yml`
- **API**: `.github/workflows/build-api-ci.yml`
- **Dashboard**: `.github/workflows/build-dashboard-ci.yml`

## Metrics & Monitoring

### Key Metrics to Track

1. **Test Success Rate**: % of integration tests passing
2. **Version Compatibility**: Which version combinations pass
3. **Test Duration**: Time to run complete test suite
4. **Deployment Frequency**: How often services are deployed
5. **Mean Time to Recovery**: Time to rollback failed deployments

### Recommended Dashboards

Monitor in GitHub Actions:
- Test success rate over time
- Average test duration
- Failed test patterns
- Service version matrix

## Future Improvements

### Potential Enhancements

1. **Test Coordinator Workflow**
   - Wait for all three builds to complete
   - Trigger single full-stack test
   - Avoid duplicate test runs

2. **Performance Benchmarking**
   - Track API response times across versions
   - Monitor resource usage (CPU, memory)
   - Alert on performance regressions

3. **Matrix Testing**
   - Test multiple version combinations
   - Validate upgrade paths (e.g., 1.0.0 → 1.0.3)
   - Test with different infrastructure versions

4. **Chaos Engineering**
   - Inject failures during tests
   - Validate retry logic
   - Test circuit breakers

5. **Contract Testing**
   - API contract validation (OpenAPI/Swagger)
   - Message schema validation (Protobuf/Avro)
   - Database migration testing

## Conclusion

This integration testing strategy ensures:

✅ **Quality**: Every change is validated before deployment  
✅ **Confidence**: Test real Docker images users will download  
✅ **Safety**: Validate backward compatibility automatically  
✅ **Flexibility**: Support both incremental and full-stack testing  
✅ **Efficiency**: Fast feedback loops with parallel service builds  

The independent versioning of services combined with comprehensive integration testing enables safe, frequent deployments while maintaining system stability.

## References

- [Docker Compose E2E Configuration](../docker-compose.e2e.yml)
- [Integration Tests Workflow](../.github/workflows/integration-tests.yml)
- [Agent CI Build](../.github/workflows/build-device-agent-ci.yml)
- [API CI Build](../.github/workflows/build-api-ci.yml)
- [Dashboard CI Build](../.github/workflows/build-dashboard-ci.yml)
- [Retention Policies Documentation](./RETENTION-POLICIES.md)
- [Kubernetes Deployment Guide](./K8S-DEPLOYMENT-GUIDE.md)
