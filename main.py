from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.auth_services_routes import router as auth_router
import logging

# Initialize the FastAPI application
app = FastAPI()

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (adjust for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication routes from app/services/auth_services_routes.py
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
logger.info("Router for '/api/auth' has been registered.")

# --- Health check route ---
@app.get("/health")
async def health_check():
    logger.info("Health check endpoint accessed")
    return {"status": "ok"}

# --- Root route ---
@app.get("/")
async def root():
    return {"message": "Welcome to EncryptGate API"}

# --- Run the application ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
