#!/bin/bash
# Script to run migrations on Render PostgreSQL database

# Instructions:
# 1. Get your database connection details from Render dashboard
# 2. Replace the placeholders below with your actual values
# 3. Run: chmod +x run-migrations.sh
# 4. Run: ./run-migrations.sh

# Database connection details from Render
DB_HOST="your-database-host.render.com"
DB_PORT="5432"
DB_NAME="kidscan"
DB_USER="kidscan_user"
DB_PASSWORD="your-database-password"

# Run migrations
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < all-migrations.sql

echo "Migrations completed!"