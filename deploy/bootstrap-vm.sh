#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/collected-recipes
DATA_DEVICE=/dev/disk/azure/scsi1/lun0
DATA_MOUNT=/mnt/recipes

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes ca-certificates curl docker.io docker-compose-v2
systemctl enable --now docker

if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

for _ in $(seq 1 30); do
  if [[ -e "${DATA_DEVICE}" ]]; then
    break
  fi
  sleep 2
done

if [[ ! -e "${DATA_DEVICE}" ]]; then
  echo "Azure data disk was not found at ${DATA_DEVICE}." >&2
  exit 1
fi

if ! blkid "${DATA_DEVICE}" >/dev/null 2>&1; then
  mkfs.ext4 -F "${DATA_DEVICE}"
fi

mkdir -p "${DATA_MOUNT}"
DATA_UUID=$(blkid -s UUID -o value "${DATA_DEVICE}")
if ! grep -q "UUID=${DATA_UUID}" /etc/fstab; then
  echo "UUID=${DATA_UUID} ${DATA_MOUNT} ext4 defaults,nofail 0 2" >> /etc/fstab
fi
mount "${DATA_MOUNT}"
MOUNTED_UUID=$(findmnt -n -o UUID --target "${DATA_MOUNT}")
if [[ "${MOUNTED_UUID}" != "${DATA_UUID}" ]]; then
  echo "Mounted data disk UUID does not match the attached disk." >&2
  exit 1
fi
chown 1000:1000 "${DATA_MOUNT}"
chmod 750 "${DATA_MOUNT}"

mkdir -p "${APP_DIR}"
find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -xzf /tmp/collected-recipes.tgz -C "${APP_DIR}"
install -m 600 /tmp/collected-recipes.env "${APP_DIR}/deploy/.env.azure"

cd "${APP_DIR}"
docker compose -f deploy/compose.azure.yml up --detach --build --remove-orphans

for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1/api/health >/dev/null; then
    docker compose -f deploy/compose.azure.yml ps
    exit 0
  fi
  sleep 5
done

docker compose -f deploy/compose.azure.yml logs --tail=200
echo "Application health check did not become ready." >&2
exit 1
