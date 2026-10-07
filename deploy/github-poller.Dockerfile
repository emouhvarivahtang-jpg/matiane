FROM python:3.12.10-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY deploy/github-poller.py /app/poller.py
RUN mkdir -p /state
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD python /app/poller.py healthcheck
CMD ["python", "-u", "/app/poller.py"]
