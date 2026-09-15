import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'default-secret-key')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'crm_core.apps.CrmCoreConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'django_core.urls'

if os.environ.get('USE_POSTGRES', 'False') == 'True':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'picasa_db'),
            'USER': os.environ.get('DB_USER', 'picasa_user'),
            'PASSWORD': os.environ.get('DB_PASSWORD', 'picasa_pass'),
            'HOST': os.environ.get('DB_HOST', 'ams-postgres'),
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
else:
    DATA_DIR = os.environ.get('DATA_DIR', str(BASE_DIR / 'data'))
    os.makedirs(DATA_DIR, exist_ok=True)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(DATA_DIR, 'whatsapp_crm.sqlite3'),
        }
    }

TIME_ZONE = 'Asia/Dhaka'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
