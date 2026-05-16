# Container image for AWS Lambda (avoids 250MB zip/layer combined limit).
FROM public.ecr.aws/lambda/python:3.11

# Upgrade pip first — older pip in the base image often fails on google-genai / modern wheels.
RUN pip3 install --no-cache-dir --upgrade "pip>=24.0" setuptools wheel

# ML: force prebuilt wheels only (no gcc in this image for compiling scipy/sklearn).
COPY requirements.prod-ml.txt /tmp/requirements.prod-ml.txt
RUN pip3 install --no-cache-dir --only-binary=:all: -r /tmp/requirements.prod-ml.txt

# Remaining dependencies.
COPY requirements.prod.txt /tmp/requirements.prod.txt
RUN pip3 install --no-cache-dir -r /tmp/requirements.prod.txt

COPY app ${LAMBDA_TASK_ROOT}/app

CMD ["app.main.handler"]
