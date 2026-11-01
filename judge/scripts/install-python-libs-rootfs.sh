#!/usr/bin/env bash
set -euo pipefail

# Installs the scientific Python and Tkinter runtimes used by EDU CODE tasks.
# Student programs still run as ordinary submissions inside nsjail; this script
# prepares the judge rootfs without adding application dependencies to backend.
ROOTFS="${JUDGE_ROOTFS:-/sandbox/rootfs}"
PIP_BIN="${PIP_BIN:-/usr/bin/pip3}"
PYTHON_BIN="${ROOTFS}/usr/bin/python3"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root so the rootfs can be updated." >&2
  exit 1
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Python runtime is missing from ${ROOTFS}." >&2
  exit 1
fi
if [[ ! -x "${PIP_BIN}" ]]; then
  echo "pip3 is missing at ${PIP_BIN}." >&2
  exit 1
fi

# Real Tk widgets are drawn by Tk, so the GUI profile needs the system Tk
# bindings and a private virtual display. Install them inside the same chroot
# used by nsjail; submitted programs still get no network or host display.
if [[ ! -x "${ROOTFS}/usr/bin/apt-get" ]]; then
  echo "apt-get is missing from ${ROOTFS}; cannot install Tkinter/Xvfb." >&2
  exit 1
fi
DEBIAN_FRONTEND=noninteractive chroot "${ROOTFS}" /usr/bin/apt-get update
# Reinstall the small GUI runtime set because minimal judge images can retain
# dpkg's "installed" metadata while a shared-library payload is absent. This
# includes Xvfb's runtime libraries and xauth's libXmuu dependency so the
# validation below exercises a real isolated window, not only a Tk import.
DEBIAN_FRONTEND=noninteractive chroot "${ROOTFS}" /usr/bin/apt-get install -y --reinstall --no-install-recommends \
  python3-tk xvfb xauth xkb-data libxft2 libxmuu1 libxkbfile1 libgl1 libglvnd0 libglx0 libpixman-1-0 libfontenc1

# pip may be a different Python from the jail interpreter. Target the exact
# Python ABI installed in the rootfs, and fail clearly for an unsupported ABI.
TARGET_PYTHON="$(chroot "${ROOTFS}" /usr/bin/python3 -c 'import sys; print(str(sys.version_info.major) + str(sys.version_info.minor))')"
case "${TARGET_PYTHON}" in
  310)
    NUMPY_VERSION="2.2.6"
    OPENCV_VERSION="4.12.0.88"
    PILLOW_VERSION="12.1.1"
    PANDAS_VERSION="2.3.3"
    SCIPY_VERSION="1.15.3"
    MATPLOTLIB_VERSION="3.10.8"
    SKLEARN_VERSION="1.7.2"
    ;;
  311|312|313)
    NUMPY_VERSION="2.4.6"
    OPENCV_VERSION="4.12.0.88"
    PILLOW_VERSION="12.1.1"
    PANDAS_VERSION="3.0.6"
    SCIPY_VERSION="1.18.1"
    MATPLOTLIB_VERSION="3.11.2"
    SKLEARN_VERSION="1.9.1"
    ;;
  314)
    NUMPY_VERSION="2.5.4"
    OPENCV_VERSION="4.12.0.88"
    PILLOW_VERSION="13.0.0"
    PANDAS_VERSION="3.0.6"
    SCIPY_VERSION="1.18.1"
    MATPLOTLIB_VERSION="3.11.2"
    SKLEARN_VERSION="1.9.1"
    ;;
  *)
    echo "Unsupported Python ABI in ${ROOTFS}: ${TARGET_PYTHON}; expected CPython 3.10–3.14." >&2
    exit 1
    ;;
esac
# The target rootfs is Ubuntu 22.04 (glibc 2.35), so it can run wheels built
# against older manylinux baselines too. Some Python 3.10 wheels (notably
# kiwisolver) are tagged manylinux2010 / manylinux_2_12 and are otherwise
# invisible to pip's cross-platform resolver.
PIP_PLATFORMS=(
  --platform manylinux_2_12_x86_64
  --platform manylinux2010_x86_64
  --platform manylinux2014_x86_64
  --platform manylinux_2_17_x86_64
  --platform manylinux_2_28_x86_64
)

SITE_PACKAGES_RELATIVE="$(chroot "${ROOTFS}" /usr/bin/python3 -c 'import site; print(site.getsitepackages()[0])')"
if [[ "${SITE_PACKAGES_RELATIVE}" != /* ]]; then
  echo "Python site-packages path is not absolute inside ${ROOTFS}: ${SITE_PACKAGES_RELATIVE}" >&2
  exit 1
fi
SITE_PACKAGES="${ROOTFS}${SITE_PACKAGES_RELATIVE}"
if [[ "${SITE_PACKAGES}" != "${ROOTFS}/"* ]]; then
  echo "Refusing to install Python packages outside ${ROOTFS}: ${SITE_PACKAGES}" >&2
  exit 1
fi
STAGING_ROOT="$(mktemp -d /tmp/studycod-python-libs.XXXXXX)"
trap 'rm -rf "${STAGING_ROOT}"' EXIT
STAGING_SITE_PACKAGES="${STAGING_ROOT}/site-packages"
mkdir -p "${SITE_PACKAGES}" "${STAGING_SITE_PACKAGES}"

# Resolve and stage the whole runtime before replacing installed packages. If
# PyPI/index resolution fails, the rootfs keeps its previous working set.
"${PIP_BIN}" install \
  --disable-pip-version-check \
  --no-cache-dir \
  --upgrade \
  --target "${STAGING_SITE_PACKAGES}" \
  "${PIP_PLATFORMS[@]}" \
  --implementation cp \
  --python-version "${TARGET_PYTHON}" \
  --abi "cp${TARGET_PYTHON}" \
  --abi abi3 \
  --only-binary :all: \
  "Flask==3.1.2" \
  "fastapi==0.116.1" \
  "httpx==0.28.1" \
  "exceptiongroup==1.3.1" \
  "sniffio==1.3.1" \
  "numpy==${NUMPY_VERSION}" \
  "opencv-python-headless==${OPENCV_VERSION}" \
  "Pillow==${PILLOW_VERSION}" \
  "pandas==${PANDAS_VERSION}" \
  "scipy==${SCIPY_VERSION}" \
  "matplotlib==${MATPLOTLIB_VERSION}" \
  "scikit-learn==${SKLEARN_VERSION}" \
  "seaborn==0.13.2" \
  "sympy==1.14.0"

# Replace only after pip resolved and installed every pinned package. Keep the
# host Python environment untouched and preserve unrelated rootfs packages.
for pattern in \
  "flask" "Flask-*.dist-info" "fastapi" "fastapi-*.dist-info" \
  "httpx" "httpx-*.dist-info" "numpy" "numpy-*.dist-info" \
  "cv2" "opencv_python*.dist-info" "PIL" "pillow-*.dist-info" \
  "pandas" "pandas-*.dist-info" "scipy" "scipy-*.dist-info" \
  "matplotlib" "matplotlib-*.dist-info" "sklearn" "scikit_learn-*.dist-info" \
  "seaborn" "seaborn-*.dist-info" "sympy" "sympy-*.dist-info" \
  "pydantic" "pydantic-*.dist-info" \
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
cp -a "${STAGING_SITE_PACKAGES}/." "${SITE_PACKAGES}/"

chroot "${ROOTFS}" /usr/bin/python3 -c \
  'import cv2, fastapi, flask, matplotlib, numpy, pandas, PIL, scipy, seaborn, sklearn, sympy, tkinter; from PIL import ImageGrab; print("python-libs rootfs: OK")'
chroot "${ROOTFS}" /usr/bin/xvfb-run -a /usr/bin/python3 -c \
  'import tkinter as tk; root = tk.Tk(); root.withdraw(); root.update(); root.destroy(); print("Tk virtual display: OK")'
