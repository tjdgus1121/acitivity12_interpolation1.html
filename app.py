from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import io
import os
from werkzeug.utils import secure_filename
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

# Flask 앱 생성 및 CORS 설정
app = Flask(__name__)
CORS(app)

# 업로드 설정
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB 제한
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 모델 경로 및 디바이스 설정
MODEL_PATH = os.path.join('weights', 'realesr-general-x4v3.pth')
DEVICE = torch.device('cpu')  # Render 무료 플랜은 CPU만 제공

# 1) 네트워크 아키텍처 선언 (23개의 RRDB 블록)
model = RRDBNet(
    num_in_ch=3,
    num_out_ch=3,
    num_feat=64,
    num_block=23,
    num_grow_ch=32,
    scale=4
)

# 2) 체크포인트 로드
ckpt = torch.load(MODEL_PATH, map_location=DEVICE)
# EMA 키 우선, 없으면 params, 그 외는 전체
state_key = 'params_ema' if 'params_ema' in ckpt else ('params' if 'params' in ckpt else None)
state_dict = ckpt[state_key] if state_key else ckpt

# 3) 가중치 로드
# 가중치 일부만 로드 가능하도록 strict=False로 설정
model.load_state_dict(state_dict, strict=False)
model.to(DEVICE).eval()

# 4) RealESRGANer 인스턴스 생성 (model_path=None으로 아키텍처 재생성 방지)
upscaler = RealESRGANer(
    scale=4,
    model_path="",
    model=model,
    tile=0,
    tile_pad=10,
    pre_pad=0,
    half=False,
    device=DEVICE
)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return '<h1>🚀 Image Upscale Server</h1><p>서버 실행 중입니다.</p>'

@app.route('/upscale', methods=['POST'])
def upscale_image():
    if 'image' not in request.files:
        return jsonify({'error': '이미지 파일이 없습니다.'}), 400
    file = request.files['image']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': '유효한 이미지 파일을 선택하세요.'}), 400

    # 파라미터
    scale_factor = int(float(request.form.get('scale', 4)))
    quality_mode = request.form.get('quality', 'esrgan')  # 'opencv' 또는 'esrgan'

    # 이미지 디코딩
    nparr = np.frombuffer(file.read(), np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        return jsonify({'error': '이미지 로드 실패'}), 400

    # 업스케일 처리
    if quality_mode == 'esrgan':
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        output, _ = upscaler.enhance(img_rgb, outscale=scale_factor)
        upscaled = cv2.cvtColor(np.array(output), cv2.COLOR_RGB2BGR)
    else:
        h, w = img_bgr.shape[:2]
        upscaled = cv2.resize(
            img_bgr,
            (w * scale_factor, h * scale_factor),
            interpolation=cv2.INTER_CUBIC
        )

    # 결과 전송
    _, buffer = cv2.imencode('.png', upscaled)
    buf = io.BytesIO(buffer.tobytes())
    buf.seek(0)
    return send_file(
        buf,
        mimetype='image/png',
        download_name=f'upscaled_{secure_filename(file.filename)}'
    )

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5000)),
        debug=False,
        use_reloader=False
    )
