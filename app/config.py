import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    openai_api_key: str = ""
    admin_api_key: str = "change-me"
    cors_origins: str = "*"

    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@tbmevaluator.com"
    smtp_from_name: str = "TBM Evaluator"

    # App
    base_url: str = "http://localhost:8000"
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "extra": "ignore"}


try:
    settings = Settings()
    if not settings.database_url:
        print("ERROR: DATABASE_URL environment variable is not set!", file=sys.stderr)
        sys.exit(1)
    if not settings.openai_api_key:
        print("ERROR: OPENAI_API_KEY environment variable is not set!", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"ERROR loading settings: {e}", file=sys.stderr)
    sys.exit(1)
