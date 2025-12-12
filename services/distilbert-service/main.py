"""
DistilBERT Phishing Detection Service
FastAPI microservice for phishing email detection using DistilBERT model
Model: cybersectony/phishing-email-detection-distilbert_v2.4.1
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import logging
import time
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="EncryptGate DistilBERT Phishing Detector",
    description="Phishing detection microservice using DistilBERT",
    version="1.0.0"
)

# CORS middleware - restrict to your app server in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict to your Next.js server IP in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
MODEL_NAME = "cybersectony/phishing-email-detection-distilbert_v2.4.1"
MAX_LENGTH = 512  # DistilBERT max token length

# Global model and tokenizer
tokenizer = None
model = None
device = None


class PredictionRequest(BaseModel):
    """Request schema for phishing prediction"""
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body content")
    urls: Optional[List[str]] = Field(default=None, description="URLs found in email")


class LabelScore(BaseModel):
    """Individual label with confidence score"""
    label: str
    score: float


class PredictionResponse(BaseModel):
    """Response schema for phishing prediction"""
    model_version: str
    labels: List[LabelScore]
    phish_score: float
    processing_time_ms: float
    device_used: str


def load_model():
    """Load DistilBERT model and tokenizer into memory"""
    global tokenizer, model, device

    try:
        logger.info(f"Loading model: {MODEL_NAME}")
        start_time = time.time()

        # Determine device (GPU if available, else CPU)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        logger.info("Tokenizer loaded successfully")

        # Load model
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        model.to(device)
        model.eval()  # Set to evaluation mode

        load_time = time.time() - start_time
        logger.info(f"Model loaded successfully in {load_time:.2f}s")
        logger.info(f"Model config: {model.config.num_labels} labels")

        return True

    except Exception as e:
        logger.error(f"Error loading model: {str(e)}", exc_info=True)
        return False


def compute_phish_score(labels: List[Dict]) -> float:
    """
    Compute unified phishing score from model output labels

    Strategy:
    - Sum scores of phishing-related labels
    - Common phishing labels: 'phishing_url', 'phishing_email', etc.
    - Clamp final score to [0, 1] range

    Args:
        labels: List of label dictionaries with 'label' and 'score' keys

    Returns:
        float: Phishing score between 0.0 and 1.0
    """
    phishing_keywords = ['phishing', 'malicious', 'suspicious', 'scam', 'fraud']

    phish_score = 0.0
    for label_obj in labels:
        label_name = label_obj['label'].lower()
        score = label_obj['score']

        # Check if label indicates phishing
        if any(keyword in label_name for keyword in phishing_keywords):
            phish_score += score

    # Clamp to [0, 1] range
    phish_score = min(max(phish_score, 0.0), 1.0)

    return round(phish_score, 4)


@app.on_event("startup")
async def startup_event():
    """Load model on application startup"""
    logger.info("Starting DistilBERT Phishing Detection Service...")
    success = load_model()
    if not success:
        logger.error("Failed to load model on startup!")
        raise RuntimeError("Model initialization failed")
    logger.info("Service ready to accept requests")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "EncryptGate DistilBERT Phishing Detector",
        "status": "online",
        "model": MODEL_NAME,
        "device": str(device),
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    model_loaded = model is not None and tokenizer is not None

    return {
        "status": "healthy" if model_loaded else "unhealthy",
        "model_loaded": model_loaded,
        "device": str(device) if device else "unknown",
        "model_version": MODEL_NAME,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict_phishing(request: PredictionRequest):
    """
    Predict phishing probability for an email

    Args:
        request: PredictionRequest with subject, body, and optional URLs

    Returns:
        PredictionResponse with labels, scores, and phishing probability
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time = time.time()

    try:
        # Combine email content for analysis
        # Format: "Subject: {subject}\n\n{body}"
        # Include URLs if provided
        email_text = f"Subject: {request.subject}\n\n{request.body}"

        if request.urls and len(request.urls) > 0:
            urls_text = "\n\nURLs found: " + ", ".join(request.urls[:5])  # Limit to first 5 URLs
            email_text += urls_text

        # Tokenize input
        inputs = tokenizer(
            email_text,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_LENGTH,
            padding=True
        )

        # Move to device
        inputs = {k: v.to(device) for k, v in inputs.items()}

        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits

        # Apply softmax to get probabilities
        probabilities = torch.softmax(logits, dim=-1)

        # Get all label scores
        scores = probabilities[0].cpu().numpy()

        # Map to label names (if available in config)
        id2label = model.config.id2label if hasattr(model.config, 'id2label') else {}

        labels = []
        for idx, score in enumerate(scores):
            label_name = id2label.get(idx, f"label_{idx}")
            labels.append({
                "label": label_name,
                "score": round(float(score), 4)
            })

        # Sort labels by score (descending)
        labels.sort(key=lambda x: x['score'], reverse=True)

        # Compute unified phishing score
        phish_score = compute_phish_score(labels)

        # Calculate processing time
        processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds

        logger.info(
            f"Prediction completed | Phish score: {phish_score:.4f} | "
            f"Top label: {labels[0]['label']} ({labels[0]['score']:.4f}) | "
            f"Time: {processing_time:.2f}ms"
        )

        return PredictionResponse(
            model_version=MODEL_NAME,
            labels=labels,
            phish_score=phish_score,
            processing_time_ms=round(processing_time, 2),
            device_used=str(device)
        )

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.get("/model-info")
async def model_info():
    """Get detailed model information"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    config = model.config

    return {
        "model_name": MODEL_NAME,
        "architecture": config.architectures[0] if hasattr(config, 'architectures') else "unknown",
        "num_labels": config.num_labels if hasattr(config, 'num_labels') else "unknown",
        "max_position_embeddings": config.max_position_embeddings if hasattr(config, 'max_position_embeddings') else "unknown",
        "hidden_size": config.hidden_size if hasattr(config, 'hidden_size') else "unknown",
        "num_attention_heads": config.num_attention_heads if hasattr(config, 'num_attention_heads') else "unknown",
        "num_hidden_layers": config.num_hidden_layers if hasattr(config, 'num_hidden_layers') else "unknown",
        "label_mapping": config.id2label if hasattr(config, 'id2label') else {},
        "device": str(device),
        "max_input_length": MAX_LENGTH
    }


if __name__ == "__main__":
    import uvicorn

    # Run server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False  # Disable reload in production
    )
