-- Magic links table for passwordless authentication
CREATE TABLE IF NOT EXISTS magic_links (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('signin', 'signup')),
    user_data JSONB, -- Stores additional data for signup (firstName, lastName, role, etc)
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- Cleanup old expired magic links periodically (can be run as a scheduled job)
-- DELETE FROM magic_links WHERE expires_at < CURRENT_TIMESTAMP;