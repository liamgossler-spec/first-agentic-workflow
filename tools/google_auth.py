"""Google OAuth helper for Workspace tools (Sheets / Slides / Docs / Drive).

First run opens a browser to authorize and writes token.json. Subsequent runs
reuse and auto-refresh that token. Other tools import `get_credentials()`.

Setup:
  1. In Google Cloud Console, create an OAuth 2.0 Client ID (Desktop app).
  2. Download it as `credentials.json` into the project root.
  3. Run:  python tools/google_auth.py   (to authorize once)
"""
from __future__ import annotations

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from config import ROOT

# Broad Workspace scopes. Trim to least-privilege per workflow if you prefer.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]

CREDENTIALS_FILE = ROOT / "credentials.json"
TOKEN_FILE = ROOT / "token.json"


def get_credentials() -> Credentials:
    """Return valid user credentials, running the OAuth flow if needed."""
    creds: Credentials | None = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                raise RuntimeError(
                    f"Missing {CREDENTIALS_FILE.name}. Create an OAuth Desktop "
                    "client in Google Cloud Console and save it to the project root."
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), SCOPES
            )
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())

    return creds


if __name__ == "__main__":
    get_credentials()
    print("Authorized. token.json written.")
