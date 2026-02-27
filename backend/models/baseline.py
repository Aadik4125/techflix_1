"""
CogniVara - Baseline Model
Stores per-user baseline statistics (mean + std for each feature).
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Baseline(Base):
    __tablename__ = 'baselines'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id'), unique=True, nullable=False, index=True
    )

    # Per-feature statistics computed from baseline sessions
    feature_means: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)
    feature_stds: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)

    session_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
