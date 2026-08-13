#!/usr/bin/env bash
set -euo pipefail

# Installs only the libraries used by the isolated curriculum project checker.
# The judge keeps execution inside nsjail; this script prepares its shared
# rootfs instead of making the backend import application dependencies.
ROOTFS="${JUDGE_ROOTFS:-/sandbox/rootfs}"
PIP_BIN="${PIP_BIN:-/usr/bin/pip3}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root so the rootfs can be updated." >&2
  exit 1
fi
if [[ ! -x "${ROOTFS}/usr/bin/python3" ]]; then
  echo "Python runtime is missing from ${ROOTFS}." >&2
  exit 1
fi
if [[ ! -x "${PIP_BIN}" ]]; then
  echo "pip3 is missing at ${PIP_BIN}." >&2
  exit 1
fi

SITE_PACKAGES="$(${ROOTFS}/usr/bin/python3 -c 'import site; print(site.getsitepackages()[0])')"
mkdir -p "${SITE_PACKAGES}"

# pip is usually the host Python (currently 3.12), while the jail runtime is
# Python 3.10. Remove only packages owned by this installer before the staged
# replacement so an incompatible host wheel cannot remain in the rootfs.
for pattern in \
  "flask" "Flask-*.dist-info" "fastapi" "fastapi-*.dist-info" \
  "httpx" "httpx-*.dist-info" "numpy" "numpy-*.dist-info" \
  "cv2" "opencv_python*.dist-info" "pydantic" "pydantic-*.dist-info" \
  "pydantic_core" "pydantic_core-*.dist-info" "starlette" "starlette-*.dist-info" \
  "anyio" "anyio-*.dist-info" "typing_extensions.py" "typing_extensions-*.dist-info" \
  "exceptiongroup" "exceptiongroup-*.dist-info" "sniffio" "sniffio-*.dist-info" \
  "typing_inspection" "typing_inspection-*.dist-info" "annotated_types" "annotated_types-*.dist-info" \
  "blinker" "blinker-*.dist-info" "click" "click-*.dist-info" "certifi" "certifi-*.dist-info" \
  "h11" "h11-*.dist-info" "httpcore" "httpcore-*.dist-info" "idna" "idna-*.dist-info" \
  "itsdangerous" "itsdangerous-*.dist-info" "jinja2" "Jinja2-*.dist-info" \
  "markupsafe" "MarkupSafe-*.dist-info" "werkzeug" "Werkzeug-*.dist-info"; do
  rm -rf "${SITE_PACKAGES}"/${pattern}
done

# These versions support the Python 3.10 runtime currently shipped in the
# rootfs. --target keeps the host Python environment untouched.
"${PIP_BIN}" install \
  --disable-pip-version-check \
  --no-cache-dir \
  --upgrade \
  --target "${SITE_PACKAGES}" \
  --platform manylinux_2_17_x86_64 \
  --implementation cp \
  --python-version 310 \
  --abi cp310 \
  --only-binary :all: \
  "Flask==3.1.2" \
  "fastapi==0.116.1" \
  "httpx==0.28.1" \
  "exceptiongroup==1.3.1" \
  "sniffio==1.3.1" \
  "numpy==2.2.6" \
  "opencv-python-headless==4.12.0.88"

chroot "${ROOTFS}" /usr/bin/python3 -c \
  'import cv2, fastapi, flask, numpy; print("python-libs rootfs: OK")'
