from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from app.services.auth_service import authenticate_user_with_cognito, verify_mfa_code, confirm_signup
from pydantic import BaseModel
import logging

router = APIRouter()

# Request/Response models
class MFARequest(BaseModel):
    code: str
    session: str

class SignupConfirmationRequest(BaseModel):
    email: str
    temporary_password: str
    new_password: str

class LoginResponse(BaseModel):
    token: str = None
    role: str = None
    email: str = None
    mfa_required: bool = False
    session: str = None

# User login route
@router.post("/auth/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    logging.info(f"Login attempt: username={form_data.username}")
    try:
        auth_response = authenticate_user_with_cognito(form_data.username, form_data.password)
    except Exception as e:
        logging.error(f"Error during authentication: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    if auth_response.get("mfa_required"):
        logging.info("MFA required for user")
        return LoginResponse(mfa_required=True, session=auth_response["session"])
    
    authentication_result = auth_response.get("authentication_result")
    if not authentication_result:
        logging.warning("Authentication result is missing")
        raise HTTPException(status_code=401, detail="Authentication failed")

    logging.info("User authenticated successfully")
    return LoginResponse(token=authentication_result["IdToken"], role="employee", email=form_data.username)

# Confirm signup and password change route
@router.post("/auth/confirm-signup")
async def confirm_signup_endpoint(request: SignupConfirmationRequest):
    success = confirm_signup(request.email, request.temporary_password, request.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to confirm sign-up")
    return {"message": "Password changed successfully"}

# MFA verification route
@router.post("/auth/verify-mfa")
async def verify_mfa_endpoint(request: Request, mfa_request: MFARequest):
    try:
        auth_result = verify_mfa_code(mfa_request.session, mfa_request.code)
        return {"token": auth_result["IdToken"]}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
