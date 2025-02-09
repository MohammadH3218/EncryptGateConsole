from fastapi import APIRouter, HTTPException
from app.services.auth_service import authenticate_user_with_cognito
from pydantic import BaseModel
import logging

router = APIRouter()

# Request and Response models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str = None
    role: str = None
    email: str = None
    mfa_required: bool = False
    session: str = None

# Test route for API availability
@router.get("/auth/test")
async def test_get():
    return {"message": "GET request successful"}

# Test route for POST request handling
@router.post("/auth/test")
async def test_post():
    return {"message": "POST request successful"}

# Temporary login route for testing with Postman
@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    logging.info(f"Login attempt: username={request.username}")
    try:
        auth_response = authenticate_user_with_cognito(request.username, request.password)
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
    return LoginResponse(token=authentication_result["IdToken"], role="employee", email=request.username)
