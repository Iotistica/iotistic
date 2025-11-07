# Provisioning Skip Feature - Testing Checklist

## Pre-Deployment Testing

### Test Environment Setup
- [ ] Fresh Raspberry Pi with Raspbian/Debian
- [ ] Device with existing provisioned agent
- [ ] CI/CD pipeline environment

---

## Test Case 1: Fresh Installation (No Prior Provisioning)

**Scenario**: Installing on a brand new device

**Steps**:
1. [ ] Start with a fresh Raspberry Pi (no iotistic directory)
2. [ ] Run installation script:
   ```bash
   curl -sSL https://raw.githubusercontent.com/Iotistica/iotistic/master/bin/install.sh | bash
   ```
3. [ ] Observe provisioning prompts appear
4. [ ] Enter provisioning API key when prompted
5. [ ] Enter cloud endpoint when prompted (or accept default)
6. [ ] Installation completes successfully

**Expected Results**:
- [ ] Provisioning prompts appear
- [ ] Database is created at `~/iotistic/agent/data/database.sqlite`
- [ ] After agent starts, `provisioned = 1` in database
- [ ] Device registered with cloud API
- [ ] Summary shows: "✅ Enabled"

---

## Test Case 2: Update After Provisioning (Primary Use Case)

**Scenario**: Updating agent code on an already-provisioned device

**Steps**:
1. [ ] Using device from Test Case 1 (already provisioned)
2. [ ] Verify provisioning status:
   ```bash
   sqlite3 ~/iotistic/agent/data/database.sqlite "SELECT provisioned FROM device;"
   # Should return: 1
   ```
3. [ ] Navigate to iotistic directory:
   ```bash
   cd ~/iotistic
   ```
4. [ ] Pull latest changes:
   ```bash
   git pull origin master
   ```
5. [ ] Run installation script:
   ```bash
   ./bin/install.sh
   ```
6. [ ] Observe that NO provisioning prompts appear
7. [ ] Installation completes successfully

**Expected Results**:
- [ ] Message displayed: "✅ Device Already Provisioned"
- [ ] Device UUID and name shown
- [ ] NO provisioning prompts
- [ ] Summary shows: "✅ Already provisioned (skipped)"
- [ ] Installation continues normally

---

## Test Case 3: Environment Variable Override

**Scenario**: Force provisioning via environment variable even when already provisioned

**Steps**:
1. [ ] Using device from Test Case 1 (already provisioned)
2. [ ] Run with environment variables:
   ```bash
   PROVISIONING_API_KEY=test-key-123 \
   CLOUD_API_ENDPOINT=http://test.example.com:4002 \
   ./bin/install.sh
   ```
3. [ ] Installation completes

**Expected Results**:
- [ ] NO interactive prompts (env vars used)
- [ ] Summary shows: "✅ Enabled"
- [ ] Cloud endpoint shows the provided value
- [ ] Agent will attempt to provision (may fail if key is invalid, but that's expected)

---

## Test Case 4: CI Mode

**Scenario**: Running in GitHub Actions CI pipeline

**Steps**:
1. [ ] Set CI environment variable:
   ```bash
   CI=true ./bin/install.sh
   ```
   OR
   ```bash
   GITHUB_ACTIONS=true ./bin/install.sh
   ```
2. [ ] Installation runs

**Expected Results**:
- [ ] NO interactive prompts (CI mode detected)
- [ ] Uses defaults or environment variables
- [ ] No gum formatting (uses echo wrapper)
- [ ] Installation completes without user input

---

## Test Case 5: Database Check Failure Handling

**Scenario**: Database exists but sqlite3 not installed

**Steps**:
1. [ ] Ensure device has database from previous run
2. [ ] Uninstall sqlite3:
   ```bash
   sudo apt remove sqlite3
   ```
3. [ ] Run installation:
   ```bash
   ./bin/install.sh
   ```

**Expected Results**:
- [ ] Script continues without error
- [ ] Falls back to prompting for provisioning (safe default)
- [ ] Installation completes successfully

**Cleanup**:
```bash
sudo apt install sqlite3
```

---

## Test Case 6: Corrupted Database

**Scenario**: Database file exists but is corrupted

**Steps**:
1. [ ] Corrupt the database file:
   ```bash
   echo "garbage" > ~/iotistic/agent/data/database.sqlite
   ```
2. [ ] Run installation:
   ```bash
   cd ~/iotistic
   ./bin/install.sh
   ```

**Expected Results**:
- [ ] Script handles error gracefully
- [ ] Falls back to prompting for provisioning
- [ ] Installation continues

**Cleanup**:
```bash
rm ~/iotistic/agent/data/database.sqlite
# Restart agent to recreate database
```

---

## Test Case 7: Manual Provisioning Reset

**Scenario**: User wants to re-provision a device

**Steps**:
1. [ ] Using provisioned device
2. [ ] Reset provisioning status:
   ```bash
   sqlite3 ~/iotistic/agent/data/database.sqlite \
     "UPDATE device SET provisioned = 0;"
   ```
3. [ ] Run installation:
   ```bash
   ./bin/install.sh
   ```

**Expected Results**:
- [ ] Provisioning prompts appear (since provisioned=0)
- [ ] Can enter new provisioning credentials
- [ ] Installation completes

---

## Test Case 8: Test Script Validation

**Scenario**: Using the test-provisioning-skip.sh utility

**Steps**:
1. [ ] Run test script:
   ```bash
   cd ~/iotistic/bin
   bash test-provisioning-skip.sh
   ```
2. [ ] Test Option 1: Check provisioning status
   - [ ] Shows current status correctly
   - [ ] Displays device UUID, name, ID
3. [ ] Test Option 2: Simulate provisioning
   - [ ] Sets provisioned=1
   - [ ] Updates device name and ID
4. [ ] Test Option 3: Reset provisioning
   - [ ] Sets provisioned=0
5. [ ] Test Option 4: View full device record
   - [ ] Shows complete device row

**Expected Results**:
- [ ] All options work without errors
- [ ] Database queries execute successfully
- [ ] Status changes are persisted

---

## Test Case 9: Multi-Device Fleet

**Scenario**: Multiple devices, each with different provisioning states

**Setup**: 3 devices
- Device A: Fresh installation
- Device B: Previously provisioned
- Device C: Provisioned then reset

**Steps**:
1. [ ] Device A: Run fresh installation → Should prompt
2. [ ] Device B: Run update → Should skip
3. [ ] Device C: Reset then run → Should prompt

**Expected Results**:
- [ ] Each device behaves correctly based on its state
- [ ] No cross-contamination between devices
- [ ] All devices functional after installation

---

## Test Case 10: Backwards Compatibility

**Scenario**: Install script works on devices with old database schema

**Steps**:
1. [ ] Use device with old agent version (before this feature)
2. [ ] Pull latest install script
3. [ ] Run installation

**Expected Results**:
- [ ] Script handles missing columns gracefully
- [ ] Falls back to safe behavior (prompting)
- [ ] Upgrade completes successfully
- [ ] New schema applied after agent restart

---

## Performance Testing

### Database Query Performance
- [ ] Query executes in < 100ms (typically ~1-5ms)
- [ ] No noticeable delay in installation script

### Installation Time Comparison
- [ ] Fresh install (with prompts): ~X minutes
- [ ] Update (skip prompts): ~X-30 seconds (faster)

---

## Security Testing

### Sensitive Data Handling
- [ ] Provisioning API key not logged in plain text
- [ ] Device API key truncated in logs (first 16 chars + "...")
- [ ] Database file has proper permissions (600 or 640)

### SQL Injection
- [ ] No user input directly in SQL queries
- [ ] UUID and device name from database only (not user input)

---

## Documentation Review

- [ ] README.md updated (if applicable)
- [ ] PROVISIONING-SKIP-IMPLEMENTATION.md is accurate
- [ ] PROVISIONING-SKIP-QUICK-REF.md is clear
- [ ] PROVISIONING-SKIP-FLOW.md diagrams are correct
- [ ] PROVISIONING-SKIP-CHANGES.md complete
- [ ] Inline code comments are clear

---

## Edge Cases

### Edge Case 1: Race Condition
**Scenario**: Two installations running simultaneously
- [ ] Tested with parallel runs
- [ ] No database corruption
- [ ] Both installations complete (or one fails gracefully)

### Edge Case 2: Network Failure During Provisioning
**Scenario**: Network drops mid-provisioning
- [ ] Database remains in consistent state
- [ ] provisioned flag not set until completion
- [ ] Can retry provisioning

### Edge Case 3: Disk Full
**Scenario**: No space for database
- [ ] Installation fails gracefully
- [ ] Clear error message
- [ ] No partial state

---

## Post-Deployment Monitoring

### Metrics to Track
- [ ] Number of devices skipping provisioning prompts
- [ ] Number of devices re-provisioning
- [ ] Average installation time (before vs after)
- [ ] Error rate for database queries

### User Feedback
- [ ] Collect feedback on improved UX
- [ ] Monitor support requests related to provisioning
- [ ] Track any confusion or issues

---

## Rollback Testing

**Scenario**: Need to revert to previous version

**Steps**:
1. [ ] Note current git commit hash
2. [ ] Deploy new version
3. [ ] Test on one device
4. [ ] If issues occur, rollback:
   ```bash
   cd ~/iotistic
   git checkout <previous-commit>
   ./bin/install.sh
   ```

**Expected Results**:
- [ ] Rollback completes successfully
- [ ] Device continues functioning
- [ ] Old provisioning behavior restored

---

## Sign-Off

### Developer Testing
- [ ] All test cases passed
- [ ] No critical bugs found
- [ ] Code reviewed

### QA Testing
- [ ] Independent QA verification
- [ ] Test cases executed
- [ ] Documentation verified

### Staging Deployment
- [ ] Deployed to staging devices
- [ ] Monitored for 24 hours
- [ ] No issues observed

### Production Readiness
- [ ] All checklist items completed
- [ ] Documentation finalized
- [ ] Rollback plan documented
- [ ] Team notified

**Approved by**: _________________
**Date**: _________________
