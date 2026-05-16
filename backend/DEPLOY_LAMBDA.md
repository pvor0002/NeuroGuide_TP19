# Lambda deploy (container image)

## Why container (not zip + layers)

AWS limits **combined** unzipped size of the function zip **plus all layers** to **250 MB**.

This backend’s ML stack (scipy, pandas, sklearn, numpy, …) is ~450 MB — too large for zip or for two layers (~140 MB + ~180 MB).

Deploy uses a **Docker image** pushed to **ECR** (limit ~10 GB).

## One-time: convert `neuroguide-api` to container type

If the function was created as **Zip**, `update-function-code --image-uri` will fail. You must use **Package type: Container image** once:

### Option A — AWS Console

1. Lambda → **Create function** → **Container image** (or recreate `neuroguide-api` if safe).
2. Use existing IAM role from the old function.
3. **Image**: deploy from CI first to ECR (`neuroguide-api` repo), then select that image.
4. Handler is set in the Dockerfile: `app.main.handler`.
5. Point **API Gateway** integration to this function (same as before).
6. Copy **environment variables** from the old function.

### Option B — CLI (new function, then swap API)

```bash
aws lambda create-function \
  --function-name neuroguide-api-v2 \
  --package-type Image \
  --code ImageUri=<ECR_URI_FROM_CI> \
  --role arn:aws:iam::<account>:role/<your-lambda-role> \
  --timeout 30 \
  --memory-size 1024 \
  --region ap-southeast-2
```

Update API Gateway to invoke `neuroguide-api-v2`, then delete the old zip function when verified.

## GitHub IAM permissions

In addition to existing Lambda/S3 access, the deploy user needs:

- `ecr:GetAuthorizationToken`
- `ecr:CreateRepository` (first run)
- `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`
- `lambda:UpdateFunctionCode` (image URI)

## CI workflow

On push to `main` with `backend/**` changes: **Deploy Backend to AWS Lambda** builds `backend/Dockerfile`, pushes to ECR, updates Lambda with the new image tag (`github.sha`).
