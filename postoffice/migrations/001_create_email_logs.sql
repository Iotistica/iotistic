-- Email communication logs table
-- Stores audit trail of all emails sent through the platform

CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    template_name VARCHAR(100) NOT NULL,
    subject TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, sent, failed
    error_message TEXT,
    job_id VARCHAR(50),
    user_id INTEGER, -- Optional: link to users table
    metadata JSONB, -- Store context data (sanitized)
    queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_template ON email_logs(template_name);
CREATE INDEX idx_email_logs_created_at ON email_logs(created_at);
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id) WHERE user_id IS NOT NULL;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_email_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_logs_updated_at
    BEFORE UPDATE ON email_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_email_logs_updated_at();

-- Retention policy: Delete logs older than 90 days (configurable)
-- Run this as a scheduled job via housekeeper service
-- DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL '90 days';
