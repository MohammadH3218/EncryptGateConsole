"""
Test script for DistilBERT Phishing Detection Service
Run this to verify the service is working correctly
"""

import requests
import json
from typing import Dict, Any


def test_health_check(base_url: str = "http://localhost:8000"):
    """Test the health check endpoint"""
    print("\n=== Testing Health Check ===")
    try:
        response = requests.get(f"{base_url}/health", timeout=10)
        response.raise_for_status()
        data = response.json()
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(data, indent=2)}")
        return data.get("status") == "healthy"
    except Exception as e:
        print(f"Error: {str(e)}")
        return False


def test_prediction(base_url: str = "http://localhost:8000"):
    """Test the prediction endpoint with sample phishing email"""
    print("\n=== Testing Prediction - Phishing Email ===")

    payload = {
        "subject": "URGENT: Your Account Will Be Suspended",
        "body": """
        Dear Customer,

        Your account has been flagged for suspicious activity and will be suspended within 24 hours.

        To prevent suspension, please verify your identity immediately by clicking the link below:

        http://secure-verify-account.tk/verify?user=12345

        Failure to verify will result in permanent account closure.

        Thank you,
        Security Team
        """,
        "urls": ["http://secure-verify-account.tk/verify?user=12345"]
    }

    try:
        response = requests.post(
            f"{base_url}/predict",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        print(f"Status: {response.status_code}")
        print(f"\nModel Version: {data['model_version']}")
        print(f"Phishing Score: {data['phish_score']}")
        print(f"Processing Time: {data['processing_time_ms']}ms")
        print(f"Device: {data['device_used']}")
        print(f"\nTop 3 Labels:")
        for label in data['labels'][:3]:
            print(f"  - {label['label']}: {label['score']:.4f}")

        return data['phish_score'] > 0.5

    except Exception as e:
        print(f"Error: {str(e)}")
        return False


def test_legitimate_email(base_url: str = "http://localhost:8000"):
    """Test the prediction endpoint with legitimate email"""
    print("\n=== Testing Prediction - Legitimate Email ===")

    payload = {
        "subject": "Weekly Team Meeting Notes",
        "body": """
        Hi Team,

        Here are the notes from today's weekly sync:

        - Q4 roadmap planning on track
        - New hire onboarding next Monday
        - Please submit your time sheets by Friday

        Let me know if you have questions.

        Best,
        Sarah
        """,
        "urls": []
    }

    try:
        response = requests.post(
            f"{base_url}/predict",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        print(f"Status: {response.status_code}")
        print(f"\nModel Version: {data['model_version']}")
        print(f"Phishing Score: {data['phish_score']}")
        print(f"Processing Time: {data['processing_time_ms']}ms")
        print(f"Device: {data['device_used']}")
        print(f"\nTop 3 Labels:")
        for label in data['labels'][:3]:
            print(f"  - {label['label']}: {label['score']:.4f}")

        return data['phish_score'] < 0.5

    except Exception as e:
        print(f"Error: {str(e)}")
        return False


def test_model_info(base_url: str = "http://localhost:8000"):
    """Test the model info endpoint"""
    print("\n=== Testing Model Info ===")
    try:
        response = requests.get(f"{base_url}/model-info", timeout=10)
        response.raise_for_status()
        data = response.json()
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(data, indent=2)}")
        return True
    except Exception as e:
        print(f"Error: {str(e)}")
        return False


def run_all_tests(base_url: str = "http://localhost:8000"):
    """Run all tests"""
    print("=" * 60)
    print("EncryptGate DistilBERT Service - Test Suite")
    print("=" * 60)

    results = {
        "Health Check": test_health_check(base_url),
        "Phishing Detection": test_prediction(base_url),
        "Legitimate Email": test_legitimate_email(base_url),
        "Model Info": test_model_info(base_url),
    }

    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)

    all_passed = True
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"{test_name}: {status}")
        if not passed:
            all_passed = False

    print("=" * 60)
    if all_passed:
        print("All tests passed! ✓")
    else:
        print("Some tests failed. Check logs above.")

    return all_passed


if __name__ == "__main__":
    import sys

    # Get base URL from command line argument or use default
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

    print(f"Testing service at: {base_url}\n")

    success = run_all_tests(base_url)
    sys.exit(0 if success else 1)
