import boto3
import logging
import os
import hmac
import hashlib
import base64
from botocore.exceptions import ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Initialize Cognito client
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

def generate_secret_hash(username):
    """Generate the secret hash required for Cognito API calls"""
    message = username + CLIENT_ID
    dig = hmac.new(
        key=CLIENT_SECRET.encode('utf-8'),
        msg=message.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    return base64.b64encode(dig).decode()

def authenticate_user(username, password):
    """
    Authenticate user with Cognito
    
    Args:
        username: User's email or username
        password: User's password
        
    Returns:
        dict: Authentication result or challenge information
    """
    try:
        # Validate inputs
        if not username or not password:
            return {"error": "Username and password are required"}, 400
            
        # Generate secret hash
        secret_hash = generate_secret_hash(username)
        
        # Call Cognito to authenticate
        response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
                "SECRET_HASH": secret_hash
            }
        )
        
        # Process the response
        if "AuthenticationResult" in response:
            # Successful authentication
            auth_result = response["AuthenticationResult"]
            return {
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn")
            }
        elif "ChallengeName" in response:
            # Challenge required (e.g., NEW_PASSWORD_REQUIRED, MFA)
            challenge_name = response["ChallengeName"]
            
            if challenge_name == "NEW_PASSWORD_REQUIRED":
                return {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "message": "Password change required"
                }
            elif challenge_name == "SOFTWARE_TOKEN_MFA":
                return {
                    "mfa_required": True,
                    "session": response.get("Session"),
                    "message": "MFA verification required"
                }
            else:
                return {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "message": f"Challenge required: {challenge_name}"
                }
        else:
            return {"error": "Unexpected authentication response"}, 500
            
    except cognito_client.exceptions.NotAuthorizedException as e:
        logger.warning(f"Invalid credentials: {str(e)}")
        return {"error": "Invalid username or password"}, 401
    
    except cognito_client.exceptions.UserNotFoundException as e:
        logger.warning(f"User not found: {str(e)}")
        # Return same message as invalid credentials for security
        return {"error": "Invalid username or password"}, 401
    
    except cognito_client.exceptions.PasswordResetRequiredException:
        return {"error": "Password reset is required for this user"}, 400
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        logger.error(f"AWS error: {error_code} - {error_msg}")
        return {"error": f"Authentication error: {error_msg}"}, 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": "Authentication failed"}, 500

def change_password(username, session, new_password):
    """
    Change password for a user with NEW_PASSWORD_REQUIRED challenge
    
    Args:
        username: User's email or username
        session: Session string from initial authentication
        new_password: New password
        
    Returns:
        dict: Authentication result or error
    """
    try:
        # Generate secret hash
        secret_hash = generate_secret_hash(username)
        
        # Respond to the NEW_PASSWORD_REQUIRED challenge
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "NEW_PASSWORD": new_password,
                "SECRET_HASH": secret_hash
            }
        )
        
        # Process the response
        if "AuthenticationResult" in response:
            # Password change successful
            auth_result = response["AuthenticationResult"]
            return {
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn")
            }
        elif "ChallengeName" in response:
            # Another challenge required after password change
            return {
                "ChallengeName": response["ChallengeName"],
                "session": response.get("Session"),
                "message": f"Additional challenge required: {response['ChallengeName']}"
            }
        else:
            return {"error": "Unexpected response from password change"}, 500
            
    except cognito_client.exceptions.InvalidPasswordException as e:
        logger.warning(f"Invalid password: {str(e)}")
        return {"error": f"Password does not meet requirements: {str(e)}"}, 400
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        logger.error(f"AWS error: {error_code} - {error_msg}")
        return {"error": f"Password change error: {error_msg}"}, 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": "Password change failed"}, 500

def setup_mfa(access_token):
    """
    Set up MFA for a user
    
    Args:
        access_token: User's access token
        
    Returns:
        dict: MFA setup information or error
    """
    try:
        # Associate a software token with the user
        response = cognito_client.associate_software_token(
            AccessToken=access_token
        )
        
        # Return the secret code for the authenticator app
        return {
            "secretCode": response.get("SecretCode"),
            "message": "MFA setup initiated"
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        logger.error(f"AWS error: {error_code} - {error_msg}")
        return {"error": f"MFA setup error: {error_msg}"}, 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": "MFA setup failed"}, 500

def verify_mfa_setup(access_token, code):
    """
    Verify MFA setup with a code
    
    Args:
        access_token: User's access token
        code: Verification code from authenticator app
        
    Returns:
        dict: Verification result or error
    """
    try:
        # Verify the software token
        response = cognito_client.verify_software_token(
            AccessToken=access_token,
            UserCode=code,
            FriendlyDeviceName="EncryptGate Auth App"
        )
        
        # Check if verification was successful
        if response.get("Status") == "SUCCESS":
            # Set MFA preference
            cognito_client.set_user_mfa_preference(
                AccessToken=access_token,
                SoftwareTokenMfaSettings={
                    "Enabled": True,
                    "PreferredMfa": True
                }
            )
            return {"message": "MFA setup verified successfully"}
        else:
            return {"error": f"MFA verification failed with status: {response.get('Status')}"}, 400
            
    except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
        logger.warning(f"MFA setup error: {str(e)}")
        return {"error": f"Error enabling MFA: {str(e)}"}, 400
    
    except cognito_client.exceptions.CodeMismatchException as e:
        logger.warning(f"Code mismatch: {str(e)}")
        return {"error": "The verification code is incorrect or has expired"}, 400
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        logger.error(f"AWS error: {error_code} - {error_msg}")
        return {"error": f"MFA verification error: {error_msg}"}, 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": "MFA verification failed"}, 500

def verify_mfa(username, session, code):
    """
    Verify MFA during login
    
    Args:
        username: User's email or username
        session: Session string from initial authentication
        code: Verification code from authenticator app
        
    Returns:
        dict: Authentication result or error
    """
    try:
        # Generate secret hash
        secret_hash = generate_secret_hash(username)
        
        # Respond to the SOFTWARE_TOKEN_MFA challenge
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "SOFTWARE_TOKEN_MFA_CODE": code,
                "SECRET_HASH": secret_hash
            }
        )
        
        # Process the response
        if "AuthenticationResult" in response:
            # MFA verification successful
            auth_result = response["AuthenticationResult"]
            return {
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn")
            }
        else:
            return {"error": "Unexpected response from MFA verification"}, 500
            
    except cognito_client.exceptions.CodeMismatchException as e:
        logger.warning(f"Code mismatch: {str(e)}")
        return {"error": "The verification code is incorrect or has expired"}, 400
    
    except cognito_client.exceptions.ExpiredCodeException as e:
        logger.warning(f"Code expired: {str(e)}")
        return {"error": "The verification code has expired"}, 400
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        logger.error(f"AWS error: {error_code} - {error_msg}")
        return {"error": f"MFA verification error: {error_msg}"}, 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": "MFA verification failed"}, 500