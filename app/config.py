from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    openai_api_key: str = ""
    admin_api_key: str = "change-me"

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


settings = Settings()

if not settings.database_url:
    raise ValueError("DATABASE_URL environment variable is required")
if not settings.openai_api_key:
    raise ValueError("OPENAI_API_KEY environment variable is required")
