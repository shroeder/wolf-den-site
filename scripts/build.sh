#!/bin/bash

# Build script for Vercel deployments
# Runs database migrations first, then Next.js build

set -e

echo "🗄️  Running database migrations..."
node scripts/migrate.js

if [ $? -ne 0 ]; then
    echo "❌ Database migrations failed. Aborting build."
    exit 1
fi

echo "✅ Migrations completed successfully."
echo "🔨 Building Next.js application..."
next build

echo "✅ Build complete."
