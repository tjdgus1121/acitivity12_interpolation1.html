FROM python:3.10

WORKDIR /app

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    git \
    git-lfs \
    ffmpeg \
    libsm6 \
    libxext6 \
    cmake \
    rsync \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# 기본 Python 패키지 설치
COPY requirements-base.txt .
RUN pip install --no-cache-dir -r requirements-base.txt

# PyTorch 설치 확인
RUN python -c "import torch; print('PyTorch version:', torch.__version__)"

# basicsr 직접 설치
RUN git clone https://github.com/XPixelGroup/BasicSR.git && \
    cd BasicSR && \
    pip install -e .

# 애플리케이션 파일 복사
COPY . .

# 포트 설정
EXPOSE 7860

# 실행 명령
CMD ["python", "app.py"] 