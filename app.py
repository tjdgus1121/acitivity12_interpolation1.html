from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from PIL import Image
import io
import os
import tempfile
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)  # CORS 설정으로 브라우저에서 접근 허용

# 업로드 설정
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB 제한

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# 업로드 폴더가 없으면 생성
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """허용된 파일 확장자인지 확인"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upscale_image_opencv(image_array, scale_factor=2):
    """
    OpenCV를 사용한 이미지 업스케일링
    여러 알고리즘 중 INTER_CUBIC 사용 (품질과 속도의 균형)
    """
    height, width = image_array.shape[:2]
    new_width = int(width * scale_factor)
    new_height = int(height * scale_factor)
    
    # INTER_CUBIC: 고품질 업스케일링
    upscaled = cv2.resize(image_array, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    return upscaled

def upscale_image_advanced(image_array, scale_factor=2):
    """
    더 고급 업스케일링 (EDSR-like 기법 시뮬레이션)
    실제 AI 모델 없이 여러 기법을 조합
    """
    # 1. 기본 업스케일링
    upscaled = upscale_image_opencv(image_array, scale_factor)
    
    # 2. 샤프닝 필터 적용
    kernel = np.array([[-1,-1,-1],
                       [-1, 9,-1],
                       [-1,-1,-1]])
    sharpened = cv2.filter2D(upscaled, -1, kernel)
    
    # 3. 원본과 샤프닝 결과를 블렌딩 (70% 샤프닝, 30% 원본)
    result = cv2.addWeighted(upscaled, 0.3, sharpened, 0.7, 0)
    
    # 4. 노이즈 제거 (bilateral filter)
    denoised = cv2.bilateralFilter(result, 9, 75, 75)
    
    return denoised

def enhance_image_quality(image_array):
    """이미지 품질 향상 (대비, 밝기, 채도 조정)"""
    # BGR to HSV 변환
    hsv = cv2.cvtColor(image_array, cv2.COLOR_BGR2HSV)
    
    # 채도 향상 (S 채널)
    hsv[:, :, 1] = cv2.multiply(hsv[:, :, 1], 1.2)
    
    # HSV to BGR 변환
    enhanced = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    
    # 대비 향상
    enhanced = cv2.convertScaleAbs(enhanced, alpha=1.1, beta=10)
    
    return enhanced

@app.route('/')
def index():
    """홈페이지 - 간단한 서버 상태 확인"""
    return '''
    <h1>🚀 Image Upscale Server</h1>
    <p>서버가 정상적으로 실행 중입니다!</p>
    <p><strong>사용법:</strong> POST 요청을 <code>/upscale</code> 엔드포인트로 보내세요.</p>
    <ul>
        <li>지원 형식: PNG, JPG, JPEG, GIF, BMP, TIFF, WEBP</li>
        <li>최대 파일 크기: 16MB</li>
        <li>기본 확대율: 2배</li>
    </ul>
    '''

@app.route('/upscale', methods=['POST'])
def upscale_image():
    """이미지 업스케일 엔드포인트"""
    try:
        # 파일이 있는지 확인
        if 'image' not in request.files:
            return jsonify({'error': '이미지 파일이 없습니다.'}), 400
        
        file = request.files['image']
        
        # 파일이 선택되었는지 확인
        if file.filename == '':
            return jsonify({'error': '파일이 선택되지 않았습니다.'}), 400
        
        # 허용된 파일 형식인지 확인
        if not allowed_file(file.filename):
            return jsonify({'error': f'지원하지 않는 파일 형식입니다. 지원 형식: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # 확대율 파라미터 (옵션)
        scale_factor = float(request.form.get('scale', 2.0))
        if scale_factor < 1.0 or scale_factor > 4.0:
            scale_factor = 2.0  # 기본값으로 설정
        
        # 품질 모드 파라미터 (옵션)
        quality_mode = request.form.get('quality', 'high')  # 'basic' 또는 'high'
        
        print(f"업스케일 시작 - 파일: {file.filename}, 확대율: {scale_factor}x, 품질모드: {quality_mode}")
        
        # 이미지 읽기
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return jsonify({'error': '이미지를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.'}), 400
        
        print(f"원본 이미지 크기: {image.shape[1]}x{image.shape[0]}")
        
        # 이미지가 너무 큰 경우 제한 (메모리 보호)
        height, width = image.shape[:2]
        if width * height > 2000 * 2000:  # 4MP 제한
            # 크기 조정
            max_dimension = 2000
            if width > height:
                new_width = max_dimension
                new_height = int(height * max_dimension / width)
            else:
                new_height = max_dimension
                new_width = int(width * max_dimension / height)
            
            image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
            print(f"이미지 크기 조정됨: {new_width}x{new_height}")
        
        # 업스케일링 수행
        if quality_mode == 'high':
            upscaled_image = upscale_image_advanced(image, scale_factor)
            # 추가 품질 향상
            upscaled_image = enhance_image_quality(upscaled_image)
        else:
            upscaled_image = upscale_image_opencv(image, scale_factor)
        
        final_height, final_width = upscaled_image.shape[:2]
        print(f"업스케일 완료 - 최종 크기: {final_width}x{final_height}")
        
        # 결과 이미지를 메모리에서 인코딩
        _, buffer = cv2.imencode('.png', upscaled_image, [cv2.IMWRITE_PNG_COMPRESSION, 6])
        
        # BytesIO 객체로 변환
        img_io = io.BytesIO(buffer.tobytes())
        img_io.seek(0)
        
        # 이미지 파일로 응답
        return send_file(
            img_io,
            mimetype='image/png',
            as_attachment=False,
            download_name=f'upscaled_{secure_filename(file.filename)}'
        )
        
    except Exception as e:
        print(f"업스케일 오류: {str(e)}")
        return jsonify({'error': f'이미지 처리 중 오류가 발생했습니다: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인 엔드포인트"""
    return jsonify({
        'status': 'healthy',
        'message': 'Image Upscale Server is running',
        'supported_formats': list(ALLOWED_EXTENSIONS),
        'max_file_size_mb': MAX_CONTENT_LENGTH // (1024 * 1024)
    })

@app.errorhandler(413)
def too_large(e):
    """파일 크기 초과 에러 핸들러"""
    return jsonify({'error': f'파일 크기가 너무 큽니다. 최대 {MAX_CONTENT_LENGTH // (1024 * 1024)}MB까지 업로드 가능합니다.'}), 413

@app.errorhandler(404)
def not_found(e):
    """404 에러 핸들러"""
    return jsonify({'error': '요청한 엔드포인트를 찾을 수 없습니다.'}), 404

@app.errorhandler(500)
def internal_error(e):
    """500 에러 핸들러"""
    return jsonify({'error': '서버 내부 오류가 발생했습니다.'}), 500

if __name__ == '__main__':
    print("🚀 Image Upscale Server 시작!")
    print("지원 형식:", ", ".join(ALLOWED_EXTENSIONS))
    print(f"최대 파일 크기: {MAX_CONTENT_LENGTH // (1024 * 1024)}MB")
    print("엔드포인트:")
    print("  - GET  /        : 서버 정보")
    print("  - POST /upscale : 이미지 업스케일")
    print("  - GET  /health  : 상태 확인")
    print("-" * 50)
    
    # 개발용 서버 실행 (배포시에는 gunicorn 등 사용 권장)
    app.run(host='0.0.0.0', port=5000, debug=True)
