#!/bin/bash
# Script to deploy OceanView-v2 to a fresh machine

set -e  # Exit on any error

echo "🚀 Deploying to Fly.io with fixes..."
echo "This will deploy a fresh machine with the fixed configuration..."

# Create and deploy a new machine with current configuration
fly deploy --strategy immediate

echo "✅ Deployment complete!"
echo "🔄 The application should now start successfully with:"
echo "   - ML model files in the correct location"
echo "   - Database migrations applied during deployment"
echo "   - Required database records created by the seed script"
echo ""
echo "📊 Check application logs with: fly logs -a ocean-staging" 