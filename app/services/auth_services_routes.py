from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from app.services.auth_service import authenticate_user_with_cognito, verify_mfa_code, confirm_signup
import logging

# Initialize the router and logger
router = APIRouter()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Request/Response models
class MFARequest(BaseModel):
    code: str
    session: str

class SignupConfirmationRequest(BaseModel):
    email: str
    temporary_password: str
    new_password: str

class LoginResponse(BaseModel):
    token: str
    role: str
    email: str
    mfa_required: bool
    session: str = None

class MessageResponse(BaseModel):
    message: str

# --- Test route ---
@router.get("/test", response_model=MessageResponse)
async def test_route():
    logger.info("Test route accessed successfully.")
    return {"message": "GET /test route works!"}

# --- User login route ---
@router.post("/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info(f"Login attempt for username: {form_data.username}")

    try:
        # Authenticate the user with Cognito
        auth_response = authenticate_user_with_cognito(form_data.username, form_data.password)
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    # Check if MFA is required
    if auth_response.get("mfa_required"):
        logger.info(f"MFA required for username: {form_data.username}")
        return {"mfa_required": True, "session": auth_response["session"]}

    # Extract authentication result
    authentication_result = auth_response.get("authentication_result")
    if not authentication_result:
        logger.warning("Authentication result missing in Cognito response")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.info(f"User {form_data.username} authenticated successfully.")
    return {
        "token": authentication_result["IdToken"],
        "role": "employee",  # Modify if role is dynamic
        "email": form_data.username,
        "mfa_required": False
    }

# --- Confirm signup route ---
@router.post("/confirm-signup", response_model=MessageResponse)
async def confirm_signup_endpoint(request: SignupConfirmationRequest):
    logger.info(f"Signup confirmation attempt for email: {request.email}")

    try:
        success = confirm_signup(request.email, request.temporary_password, request.new_password)
        if not success:
            logger.error("Signup confirmation failed")
            raise HTTPException(status_code=400, detail="Failed to confirm sign-up")
    except Exception as e:
        logger.error(f"Error during signup confirmation: {e}")
        raise HTTPException(status_code=400, detail="Signup confirmation failed")

    logger.info("Signup confirmed successfully.")
    return {"message": "Password changed successfully"}

# --- MFA verification route ---
@router.post("/verify-mfa", response_model=LoginResponse)
async def verify_mfa_endpoint(request: Request, mfa_request: MFARequest):
    logger.info("MFA verification attempt")

    try:
        auth_result = verify_mfa_code(mfa_request.session, mfa_request.code)
        logger.info("MFA verification successful.")
        return {
            "token": auth_result["IdToken"],
            "role": "employee",  # Modify if role is dynamic
            "email": "username-placeholder",  # Adjust based on your business logic
            "mfa_required": False
        }
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        raise HTTPException(status_code=401, detail="MFA verification failed")
