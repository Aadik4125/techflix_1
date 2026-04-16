from __future__ import annotations

import requests

from app.core.settings import get_settings


def transcribe_audio(audio_bytes: bytes) -> str:
    settings = get_settings()
    if settings.transcription_provider.lower() == "none":
        return ""

    if settings.transcription_provider.lower() == "huggingface":
        if not settings.hf_api_key:
            return ""
        response = requests.post(
            url=f"https://api-inference.huggingface.co/models/{settings.hf_stt_model}",
            headers={
                "Authorization": f"Bearer {settings.hf_api_key}",
                "Content-Type": "audio/wav",
            },
            data=audio_bytes,
            timeout=60,
        )
        if response.ok:
            payload = response.json()
            if isinstance(payload, dict):
                text = payload.get("text")
                if isinstance(text, str):
                    return text
            return ""
        return ""

    return ""
