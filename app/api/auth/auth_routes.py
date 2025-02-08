from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from app.services.auth_service import authenticate_user_with_cognito, verify_totp
from app.dependencies.auth import get_current_user
from pydantic import BaseModel

router = APIRouter()

# Request/Response models
class MFARequest(BaseModel):
    code: str

class LoginResponse(BaseModel):
    token: str
    role: str
    email: str

# User login route
@router.post("/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Authenticate the user with Cognito
    user = authenticate_user_with_cognito(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Return token and user details if authentication is successful
    return {"token": user["AccessToken"], "role": user["role"], "email": user["email"]}

# MFA verification route
@router.post("/verify-totp")
async def verify_totp_endpoint(request: Request, mfa_request: MFARequest):
    # Extract the JWT token from the request headers
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    # Verify the TOTP code (function implementation could validate against Cognito if required)
    if not verify_totp(token, mfa_request.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    return {"message": "MFA verified successfully"}
