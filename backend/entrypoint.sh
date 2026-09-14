#!/bin/sh
set -e

echo "Running Django migrations..."
python manage.py makemigrations crm_core --noinput || true
python manage.py migrate --noinput

echo "Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
