#!/bin/bash

echo "🚀 Setting up Kids Can database..."

# Check if PostgreSQL is running
if ! pg_isready > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    exit 1
fi

# Create user if not exists
echo "Creating database user..."
psql -U postgres -c "CREATE USER kidscan_user WITH PASSWORD 'KidsCanDB2024';" 2>/dev/null || echo "User might already exist"

# Create database if not exists
echo "Creating database..."
psql -U postgres -c "CREATE DATABASE kidscan OWNER kidscan_user;" 2>/dev/null || echo "Database might already exist"

# Grant all privileges
echo "Granting privileges..."
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE kidscan TO kidscan_user;"

echo "✅ Database setup complete!"
echo ""
echo "To run migrations, use: npm run db:migrate"