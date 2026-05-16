"""Invoke app.main.handler with an API Gateway HTTP API v2 simplify event."""
import json
import sys

from app.main import handler

text = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "Software engineer role in Melbourne. Requirements: Python, 3 years experience."
)

event = {
    "version": "2.0",
    "routeKey": "POST /api/v1/job-description/simplify",
    "rawPath": "/api/v1/job-description/simplify",
    "rawQueryString": "",
    "headers": {"content-type": "application/json"},
    "requestContext": {
        "accountId": "123456789012",
        "apiId": "z7s8pudd5d",
        "domainName": "z7s8pudd5d.execute-api.ap-southeast-2.amazonaws.com",
        "domainPrefix": "z7s8pudd5d",
        "http": {
            "method": "POST",
            "path": "/api/v1/job-description/simplify",
            "protocol": "HTTP/1.1",
            "sourceIp": "127.0.0.1",
            "userAgent": "local-test",
        },
        "requestId": "test-request-id",
        "routeKey": "POST /api/v1/job-description/simplify",
        "stage": "$default",
        "time": "01/Jan/2026:00:00:00 +0000",
        "timeEpoch": 1735689600000,
    },
    "body": json.dumps({"text": text}),
    "isBase64Encoded": False,
}

resp = handler(event, None)
print("statusCode:", resp.get("statusCode"))
body = resp.get("body") or ""
print("body_len:", len(body))
print("body_preview:", body[:800])
