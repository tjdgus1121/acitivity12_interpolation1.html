from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
import cv2
import numpy as np
from PIL import Image
import io
import os
from werkzeug.utils import secure_filename
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

# 업로드 설정
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB 제한
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 모델 설정
MODEL_PATH = os.path.join('weights', 'realesr-general-x4v3.pth')
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ------------------- 수정된 부분 -------------------
model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
upscaler = RealESRGANer(
    scale=4,
    model_path=MODEL_PATH,
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
    return '''<h1>🚀 Image Upscale Server</h1><p>서버 실행 중.</p>'''

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

    # 이미지 로드
    nparr = np.frombuffer(file.read(), np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        return jsonify({'error': '이미지 로드 실패'}), 400

    if quality_mode == 'esrgan':
        # BGR -> RGB
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        output, _ = upscaler.enhance(img_rgb, outscale=scale_factor)
        # RGB -> BGR
        upscaled = cv2.cvtColor(np.array(output), cv2.COLOR_RGB2BGR)
    else:
        # OpenCV 기본 업스케일
        height, width = img_bgr.shape[:2]
        upscaled = cv2.resize(
            img_bgr,
            (width * scale_factor, height * scale_factor),
            interpolation=cv2.INTER_CUBIC
        )

    # 메모리 인코딩
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
        debug=False,        # ← 디버그 모드 off
        use_reloader=False  # ← 자동 재시작 기능 off
    )
