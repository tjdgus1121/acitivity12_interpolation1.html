from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import base64
import io
from PIL import Image
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
import os
import numpy as np

app = Flask(__name__, static_folder='.') # Serve static files from current directory
CORS(app)

# ESRGAN 모델 로드
try:
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32)
    model_path = 'weights/RealESRGAN_x4plus.pth'
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()
    print("Real-ESRGAN 모델이 성공적으로 로드되었습니다.")
except Exception as e:
    print(f"Real-ESRGAN 모델 로드 중 오류 발생: {e}")
    model = None

# Serve index.html as the main page
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

# Serve other static files
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/upscale_esrgan', methods=['POST'])
def upscale_esrgan():
    if model is None:
        return jsonify({'error': 'AI 모델이 서버에서 로드되지 않았습니다.'}), 500
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': '이미지 데이터가 없습니다.'}), 400

        image_data = base64.b64decode(data['image'].split(',')[1])
        image = Image.open(io.BytesIO(image_data)).convert("RGB")

        with torch.no_grad():
            img_np = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)
            output_tensor = model(input_tensor)
            output_image_np = (output_tensor.squeeze(0).permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype(np.uint8)
            output_image = Image.fromarray(output_image_np)

        buffered = io.BytesIO()
        output_image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return jsonify({'upscaled_image': f'data:image/png;base64,{img_str}'})

    except Exception as e:
        print(f"ESRGAN 업스케일링 중 오류 발생: {e}")
        return jsonify({'error': f'ESRGAN 업스케일링 중 오류가 발생했습니다: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)