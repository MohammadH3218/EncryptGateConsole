from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from app.services.auth_service import authenticate_user_with_cognito, verify_mfa_code, create_access_token
from app.dependencies.auth import get_current_user

router = APIRouter()

# Request/Response models
class MFARequest(BaseModel):
    code: str

class LoginResponse(BaseModel):
    token: str
    role: str
    email: str

class MFAResponse(BaseModel):
    message: str

# User login route
@router.post("/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    print(f"Login attempt for: {form_data.username}")

    # Authenticate the user with AWS Cognito
    auth_response = authenticate_user_with_cognito(form_data.username, form_data.password)

    if auth_response["mfa_required"]:
        raise HTTPException(status_code=403, detail="MFA required. Use /verify-totp to continue.", headers={"session": auth_response["session"]})

    if not auth_response.get("authentication_result"):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate JWT access token
    access_token = create_access_token({
        "sub": form_data.username,
        "role": auth_response["role"],
        "email": auth_response["email"]
    })

    return {
        "token": access_token,
        "role": auth_response["role"],
        "email": auth_response["email"]
    }

# MFA verification route
@router.post("/verify-totp", response_model=MFAResponse)
async def verify_totp_endpoint(request: Request, mfa_request: MFARequest):
    session = request.headers.get("Session")
    if not session:
        raise HTTPException(status_code=401, detail="Missing session token for MFA verification")

    # Verify the MFA code and complete the challenge
    auth_result = verify_mfa_code(session, mfa_request.code)

    # Generate JWT access token after MFA verification
    access_token = create_access_token({
        "sub": "username-placeholder",  # Replace w/ actual username or email after lookup
        "role": "user"
    })

    return {"message": "MFA verified successfully", "token": access_token}
