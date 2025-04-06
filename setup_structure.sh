#!/bin/bash

# Create directory structure for Flask application
mkdir -p static/css
mkdir -p static/js
mkdir -p static/uploads
mkdir -p templates/components
mkdir -p utils

# Create __init__.py files for Python packages
touch utils/__init__.py

# Set permissions
chmod -R 755 static
chmod -R 755 templates
chmod -R 755 utils

echo "Directory structure created successfully!"