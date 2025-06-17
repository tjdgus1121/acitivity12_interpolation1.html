from flask import Flask, request, send_file, render_template_string
from flask_cors import CORS
import torch
import cv2
import numpy as np
from PIL import Image
import io
import os
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

app = Flask(__name__)
CORS(app)

# 전역 변수로 모델 인스턴스 저장
upsampler = None

# 보간법 매핑 (프론트엔드 처리로 인해 더 이상 사용되지 않음)
# INTERPOLATION_METHODS = {
#     'nearest': cv2.INTER_NEAREST,
#     'bilinear': cv2.INTER_LINEAR,
#     'bicubic': cv2.INTER_CUBIC,
# }

def initialize_model():
    """모델 초기화"""
    global upsampler
    
    if upsampler is None:
        try:
            # 모델 파일 경로
            model_path = os.path.join('weights', 'RealESRGAN_x4plus.pth')
            
            # 모델 파일이 없으면 기본 모델 사용
            if not os.path.exists(model_path):
                model_path = 'weights/RealESRGAN_x4plus.pth'
            
            # RRDBNet 모델 정의
            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
            
            # RealESRGAN 업샘플러 초기화
            upsampler = RealESRGANer(
                scale=4,
                model_path=model_path,
                model=model,
                tile=0,
                tile_pad=10,
                pre_pad=0,
                half=False,  # CPU에서는 half precision 사용하지 않음
                device='cpu'  # CPU 환경에서 실행
            )
            
            print("RealESRGAN 모델이 성공적으로 로드되었습니다.")
            
        except Exception as e:
            print(f"모델 초기화 오류: {str(e)}")
            # 백업 방법: 간단한 바이큐빅 업샘플링
            upsampler = None

def simple_upscale_fallback(image, scale=4):
    """RealESRGAN 로드 실패 또는 처리 오류 시의 바이큐빅 업샘플링 (백업용)"""
    height, width = image.shape[:2]
    new_height, new_width = height * scale, width * scale
    return cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_CUBIC)

@app.route('/')
def index():
    """메인 페이지"""
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.route('/upscale', methods=['POST'])
def upscale_image():
    """이미지 업스케일링 API (RealESRGAN 전용)"""
    try:
        # 파일 확인
        if 'image' not in request.files:
            return {'error': 'No image file provided'}, 400
        
        file = request.files['image']
        if file.filename == '':
            return {'error': 'No image file selected'}, 400
        
        # 이미지 읽기
        image_bytes = file.read()
        image = Image.open(io.BytesIO(image_bytes))
        
        # PIL Image를 OpenCV 형식으로 변환
        image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        output = None # 결과 이미지 초기화

        # 모델 초기화 (처음 요청 시에만)
        if upsampler is None:
            initialize_model()
        
        # RealESRGAN 업스케일링 수행
        if upsampler is not None:
            try:
                output, _ = upsampler.enhance(image_cv, outscale=4)
                print("RealESRGAN으로 업스케일링 완료")
            except Exception as e:
                print(f"RealESRGAN 처리 오류: {str(e)}")
                # RealESRGAN 실패 시 백업: 바이큐빅 업샘플링
                output = simple_upscale_fallback(image_cv, 4)
                print("RealESRGAN 실패로 바이큐빅 업샘플링으로 처리 완료")
        else:
            # upsampler가 로드되지 않았을 경우 백업: 바이큐빅 업샘플링
            output = simple_upscale_fallback(image_cv, 4)
            print("RealESRGAN 모델 미로드로 바이큐빅 업샘플링으로 처리 완료")
        
        # 결과를 PIL Image로 변환
        output_rgb = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
        result_image = Image.fromarray(output_rgb)
        
        # 이미지를 바이트로 변환
        img_buffer = io.BytesIO()
        result_image.save(img_buffer, format='PNG', quality=95)
        img_buffer.seek(0)
        
        return send_file(
            img_buffer,
            mimetype='image/png',
            as_attachment=False,
            download_name='upscaled_image.png'
        )
        
    except Exception as e:
        print(f"업스케일링 오류: {str(e)}")
        return {'error': f'Processing failed: {str(e)}'}, 500

@app.route('/health')
def health_check():
    """헬스 체크 엔드포인트"""
    return {'status': 'healthy', 'model_loaded': upsampler is not None}

if __name__ == '__main__':
    # weights 디렉토리 생성
    os.makedirs('weights', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    # 개발 환경에서는 디버그 모드 활성화
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)