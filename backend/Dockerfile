# Container image for AWS Lambda (avoids 250MB zip/layer combined limit).
FROM public.ecr.aws/lambda/python:3.11

COPY requirements.prod.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY app ${LAMBDA_TASK_ROOT}/app

CMD ["app.main.handler"]
