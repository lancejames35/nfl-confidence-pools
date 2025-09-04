#!/bin/bash

echo "GitHub Push Helper"
echo "=================="
echo ""
echo "Enter your GitHub username (lancejames35):"
read GITHUB_USER

echo "Enter your GitHub personal access token:"
echo "(It will be hidden as you type)"
read -s GITHUB_TOKEN

echo ""
echo "Pushing to GitHub..."

# Push using the credentials
git push https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/lancejames35/nfl-confidence-pools.git main

echo ""
echo "Done!"