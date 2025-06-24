from flask import Flask, send_file, request, jsonify
from flask_cors import CORS
from io import BytesIO
import os
from PIL import Image
import numpy as np
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer

app = Flask(__name__)
CORS(app)

# 모델 초기화
model_path = os.path.join('weights', 'realesr-general-x4v3.pth')
upscaler = None

@app.before_first_request
def load_model():
    global upscaler
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                    num_block=23, num_grow_ch=32, scale=4)
    upscaler = RealESRGANer(
        scale=4,
        model_path=model_path,
        model=model,
        tile=0,
        tile_pad=10,
        pre_pad=0,
        half=False
    )

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/upscale', methods=['POST'])
def upscale_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    image_file = request.files['image']
    image = Image.open(image_file.stream).convert('RGB')

    try:
        output, _ = upscaler.enhance(np.array(image))
        output_image = Image.fromarray(output)

        buffer = BytesIO()
        output_image.save(buffer, format='PNG')
        buffer.seek(0)
        return send_file(buffer, mimetype='image/png')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
