"""
CogniVara - Session Model
Stores each recording session with extracted features.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Session(Base):
    __tablename__ = 'sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), nullable=False, index=True)
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Extracted feature vectors stored as JSON
    acoustic_features: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    temporal_features: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    linguistic_features: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Computed scores
    z_scores: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)
    drift_scores: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    csi_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
