#!/bin/sh
set -u

SSH_TUNNEL_HOST="${SSH_TUNNEL_HOST:-root@fsd.snowmonkey.co.uk}"
SSH_TUNNEL_LOCAL_PORT="${SSH_TUNNEL_LOCAL_PORT:-5543}"
SSH_TUNNEL_REMOTE_HOST="${SSH_TUNNEL_REMOTE_HOST:-127.0.0.1}"
SSH_TUNNEL_REMOTE_PORT="${SSH_TUNNEL_REMOTE_PORT:-5543}"
RETRY_DELAY="${SSH_TUNNEL_RETRY_DELAY:-5}"

trap 'echo "[db-tunnel] stopping"; exit 0' INT TERM

while true; do
  echo "[db-tunnel] connecting to ${SSH_TUNNEL_HOST} (local ${SSH_TUNNEL_LOCAL_PORT} -> ${SSH_TUNNEL_REMOTE_HOST}:${SSH_TUNNEL_REMOTE_PORT})"
  ssh \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o TCPKeepAlive=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    -N \
    -L "${SSH_TUNNEL_LOCAL_PORT}:${SSH_TUNNEL_REMOTE_HOST}:${SSH_TUNNEL_REMOTE_PORT}" \
    "${SSH_TUNNEL_HOST}"
  status=$?
  echo "[db-tunnel] ssh exited with status ${status}, reconnecting in ${RETRY_DELAY}s"
  sleep "${RETRY_DELAY}"
done
