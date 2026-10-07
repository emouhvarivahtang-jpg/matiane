FROM python:3.13-alpine
WORKDIR /app
COPY deploy/github-poller.py ./github_poller.py
COPY deploy/gateway.py deploy/setup-matiane-gateway.sh ./
CMD ["python", "/app/gateway.py"]
