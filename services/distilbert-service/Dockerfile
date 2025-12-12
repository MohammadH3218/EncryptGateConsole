# DistilBERT Phishing Detection Service - Dockerfile
# CPU-only PyTorch to save disk space

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ curl && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (CPU-only PyTorch to save space)
RUN pip install --no-cache-dir \
  fastapi==0.109.0 \
  "uvicorn[standard]==0.27.0" \
  transformers==4.37.2 \
  pydantic==2.5.3 \
  python-multipart==0.0.9 \
  safetensors==0.4.2

# Install CPU-only PyTorch (much smaller than CUDA version)
RUN pip install --no-cache-dir torch==2.2.0 --index-url https://download.pytorch.org/whl/cpu

# Copy application code
COPY main.py .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
