import os
# NumPy 호환성 설정 (최우선 실행)
os.environ['NUMPY_EXPERIMENTAL_ARRAY_FUNCTION'] = '0'

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import base64
import io
from PIL import Image
import torch
import sys
import types

# torchvision 호환성 처리
try:
    from torchvision.transforms.functional_tensor import rgb_to_grayscale
except ImportError:
    from torchvision.transforms.functional import rgb_to_grayscale
    functional_tensor = types.ModuleType("torchvision.transforms.functional_tensor")
    functional_tensor.rgb_to_grayscale = rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = functional_tensor

from basicsr.archs.rrdbnet_arch import RRDBNet
import numpy as np

app = Flask(__name__, static_folder='.') # Serve static files from current directory
CORS(app)

# ESRGAN 모델 로드
model = None
try:
    print("Real-ESRGAN 모델 로딩 시작...")
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32)
    
    # 모델 파일 경로 확인
    model_path = 'weights/RealESRGAN_x4plus.pth'
    if not os.path.exists(model_path):
        print(f"모델 파일을 찾을 수 없습니다: {model_path}")
        print(f"현재 디렉토리: {os.getcwd()}")
        print(f"디렉토리 내용: {os.listdir('.')}")
        if os.path.exists('weights'):
            print(f"weights 디렉토리 내용: {os.listdir('weights')}")
    else:
        model.load_state_dict(torch.load(model_path, map_location='cpu'))
        model.eval()
        print("Real-ESRGAN 모델이 성공적으로 로드되었습니다.")
        
except Exception as e:
    print(f"Real-ESRGAN 모델 로드 중 오류 발생: {e}")
    import traceback
    traceback.print_exc()

# 헬스 체크 엔드포인트
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'python_version': sys.version,
        'torch_version': torch.__version__ if 'torch' in sys.modules else 'N/A'
    })

# Serve index.html as the main page
@app.route('/')
def serve_index():
    try:
        return send_from_directory('.', 'index.html')
    except Exception as e:
        return f"""
        <html>
        <head><title>Real-ESRGAN API</title></head>
        <body>
            <h1>Real-ESRGAN 업스케일링 API</h1>
            <p>모델 상태: {'로드됨' if model is not None else '로드 실패'}</p>
            <p>API 엔드포인트: POST /upscale_esrgan</p>
            <p>헬스 체크: GET /health</p>
        </body>
        </html>
        """

# Serve other static files
@app.route('/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('.', filename)
    except Exception as e:
        return jsonify({'error': f'파일을 찾을 수 없습니다: {filename}'}), 404

@app.route('/upscale_esrgan', methods=['POST'])
def upscale_esrgan():
    if model is None:
        return jsonify({
            'error': 'AI 모델이 서버에서 로드되지 않았습니다.',
            'details': '모델 파일이 없거나 로딩 중 오류가 발생했습니다.'
        }), 500
        
    try:
        # Content-Type 확인
        if request.content_type != 'application/json':
            return jsonify({'error': 'Content-Type은 application/json이어야 합니다.'}), 400
            
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': '이미지 데이터가 없습니다.'}), 400

        # 이미지 디코딩
        try:
            image_data = base64.b64decode(data['image'].split(',')[1])
            image = Image.open(io.BytesIO(image_data)).convert("RGB")
            print(f"입력 이미지 크기: {image.size}")
        except Exception as e:
            return jsonify({'error': f'이미지 디코딩 실패: {str(e)}'}), 400

        # 이미지 크기 제한 (메모리 보호)
        max_size = 1024
        if image.width > max_size or image.height > max_size:
            ratio = min(max_size/image.width, max_size/image.height)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            print(f"이미지 크기 조정: {new_size}")

        # ESRGAN 업스케일링
        with torch.no_grad():
            img_np = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)
            
            print(f"입력 텐서 크기: {input_tensor.shape}")
            output_tensor = model(input_tensor)
            print(f"출력 텐서 크기: {output_tensor.shape}")
            
            output_image_np = (output_tensor.squeeze(0).permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype(np.uint8)
            output_image = Image.fromarray(output_image_np)

        # 결과 이미지 인코딩
        buffered = io.BytesIO()
        output_image.save(buffered, format="PNG", optimize=True)
        img_str = base64.b64encode(buffered.getvalue()).decode()

        print(f"업스케일링 완료: {image.size} → {output_image.size}")
        return jsonify({
            'upscaled_image': f'data:image/png;base64,{img_str}',
            'original_size': image.size,
            'upscaled_size': output_image.size
        })

    except Exception as e:
        print(f"ESRGAN 업스케일링 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'ESRGAN 업스케일링 중 오류가 발생했습니다: {str(e)}'}), 500

# 오류 핸들러
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': '요청한 엔드포인트를 찾을 수 없습니다.'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': '서버 내부 오류가 발생했습니다.'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))  # Render 기본 포트
    print(f"서버 시작: 포트 {port}")
    print(f"모델 상태: {'로드됨' if model is not None else '로드 실패'}")
    app.run(host='0.0.0.0', port=port, debug=False)
