# Deployment Guide

## Fly.io Continuous Deployment Setup

This project uses GitHub Actions to automatically deploy to Fly.io when changes are pushed to the main branch.

### Setting up the FLY_API_TOKEN secret

1. Generate a Fly.io API token by running:
   ```
   flyctl auth token
   ```
   
2. In your GitHub repository, go to Settings > Secrets and variables > Actions

3. Click "New repository secret"

4. Name: `FLY_API_TOKEN`

5. Value: Paste the token generated in step 1

6. Click "Add secret"

### Security Notes

- Never share your Fly.io API token in chat messages, commit it to the repository, or expose it in any public place
- If you believe your token has been compromised, generate a new one and update the GitHub secret
- Token rotation is recommended as a security best practice

## Manual Deployment

If you prefer to deploy manually, you can use:

```
flyctl deploy
```

This will prompt you to log in if you're not already authenticated. 