from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from db.database import get_db
from db.models import User
from services.settings_schema import UserSettings, dump_settings, load_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class UserSettingsResponse(UserSettings):
    stored: bool = False  # False until the user saved settings once (lets the client move local preferences up)


@router.get("", response_model=UserSettingsResponse)
def get_user_settings(current_user: User = Depends(get_current_user)):
    """Global settings of the logged-in user (unit preference and solver settings)."""
    loaded = load_settings(current_user.settings, UserSettings)
    return UserSettingsResponse(**loaded.model_dump(), stored=bool(current_user.settings))


@router.put("", response_model=UserSettings)
def put_user_settings(
    payload: UserSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    user.settings = dump_settings(payload)
    db.commit()
    return payload
