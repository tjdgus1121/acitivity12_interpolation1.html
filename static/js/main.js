let originalFile = null;
let upscaledImageUrl = null;
let isSliding = false;

const upscaleBtn = document.getElementById('upscaleBtn');
const uploadSection = document.querySelector('.upload-section');
const serverStatusSection = document.getElementById('serverStatusSection');
const serverStatusText = document.getElementById('serverStatusText');

// 진행 상황 모달 관련 요소
const progressModal = document.getElementById('progressModal');
const progressTitle = document.getElementById('progressTitle');
const progressStatusText = document.getElementById('progressStatusText');

// RealESRGAN 옵션 관련 요소
const realesrganOption = document.getElementById('realesrganOption');
const realesrganStatus = document.getElementById('realesrganStatus');

// 보간법 라디오 버튼 그룹
const interpolationRadios = document.querySelectorAll('input[name="interpolation"]');

// 진행 상황 모달 표시 함수
function showProgressModal(title, status) {
    progressTitle.textContent = title;
    progressStatusText.textContent = status;
    progressModal.classList.add('modal--active');
}

// 진행 상황 모달 숨김 함수
function hideProgressModal() {
    progressModal.classList.remove('modal--active');
}

// "업스케일 시작" 버튼 활성화 상태 업데이트 함수
function updateUpscaleButtonState() {
    const selectedMethod = document.querySelector('input[name="interpolation"]:checked');
    const isRealESRGANSelected = selectedMethod && selectedMethod.value === 'realesrgan';

    // 파일이 있고,
    // (RealESRGAN이 선택되었고 활성화된 경우 OR 클라이언트 측 보간법이 선택된 경우)
    if (originalFile && 
        ((isRealESRGANSelected && !realesrganOption.disabled) || 
         (!isRealESRGANSelected && selectedMethod)) ) {
        upscaleBtn.disabled = false;
    } else {
        upscaleBtn.disabled = true;
    }
}

// 초기 상태 설정: RealESRGAN 옵션만 비활성화
realesrganOption.disabled = true; // RealESRGAN 옵션은 초기에는 비활성화
// uploadSection 및 upscaleBtn은 기본적으로 활성화 상태 유지 (파일 선택 시 upscaleBtn 활성화는 별도 로직)

// 서버 상태 확인 함수
async function checkServerStatus() {
    try {
        const response = await fetch('https://acitivity12-interpolation1-html.onrender.com/health');
        const data = await response.json();

        if (response.ok && data.status === 'healthy' && data.model_loaded) {
            serverStatusText.textContent = '서버 준비 완료!';
            serverStatusSection.style.display = 'none'; // 서버 상태 섹션 숨김
            
            // RealESRGAN 옵션 활성화 및 상태 업데이트
            realesrganOption.disabled = false;
            realesrganStatus.textContent = '준비 완료';

            // 서버 준비 완료 시 업스케일 버튼 상태 업데이트
            updateUpscaleButtonState(); 

            console.log('Server is healthy and model is loaded.');
        } else {
            serverStatusText.textContent = '모델 로딩 중... 잠시 기다려 주세요.';
            realesrganStatus.textContent = '로딩 중...';
            realesrganOption.disabled = true;
            
            // 서버가 준비되지 않았을 때 업스케일 버튼 상태 업데이트
            updateUpscaleButtonState(); 
            
            setTimeout(checkServerStatus, 5000); // 5초 후 다시 확인
            console.log('Server or model not ready yet. Retrying...');
        }
    } catch (error) {
        serverStatusText.textContent = '서버 연결 중... ';
        realesrganStatus.textContent = '연결 실패';
        realesrganOption.disabled = true;
        
        // 서버 연결 실패 시에도 업스케일 버튼 상태 업데이트
        updateUpscaleButtonState(); 
        
        setTimeout(checkServerStatus, 5000); // 5초 후 다시 확인
        console.error('Failed to fetch server health:', error);
    }
}

// 페이지 로드 시 서버 상태 확인 시작
window.addEventListener('load', () => {
    checkServerStatus();
    updateUpscaleButtonState(); // 초기 페이지 로드 시 버튼 상태 설정
});

// 파일 선택 이벤트
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        originalFile = file;
        
        // 파일 정보 표시
        const uploadText = document.querySelector('.upload-text');
        uploadText.textContent = `선택된 파일: ${file.name}`;

        const previewSection = document.getElementById('previewSection');
        const imagePreview = document.getElementById('imagePreview');
        const fileNameSpan = document.getElementById('fileName');
        const fileResolutionSpan = document.getElementById('fileResolution');
        const fileSizeSpan = document.getElementById('fileSize');

        // 미리보기 표시
        previewSection.style.display = 'flex';
        imagePreview.src = URL.createObjectURL(file);

        // 파일 정보 업데이트
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

        const img = new Image();
        img.onload = function() {
            fileResolutionSpan.textContent = `${img.width} × ${img.height} 픽셀`;
        };
        img.src = imagePreview.src;

    } else {
        // 파일 선택이 취소되었을 때 미리보기 섹션 숨기기
        document.getElementById('previewSection').style.display = 'none';
        originalFile = null; // 파일이 없음을 명시
        document.querySelector('.upload-text').textContent = '이미지를 업로드하세요';
    }
    updateUpscaleButtonState(); // 파일 선택 변경 시 버튼 상태 업데이트
});

// 보간법 라디오 버튼 변경 이벤트 리스너
interpolationRadios.forEach(radio => {
    radio.addEventListener('change', updateUpscaleButtonState);
});

// 프론트엔드에서 이미지 리사이징 (Canvas API 사용)
function resizeImageClientSide(imageFile, scale, method) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const originalWidth = img.width;
            const originalHeight = img.height;
            const newWidth = originalWidth * scale;
            const newHeight = originalHeight * scale;

            canvas.width = newWidth;
            canvas.height = newHeight;

            // 보간법 설정
            if (method === 'nearest') {
                ctx.imageSmoothingEnabled = false;
            } else if (method === 'bilinear') {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'low'; // Bilinear-like quality
            } else { // bicubic
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high'; // Bicubic-like quality
            }

            // 이미지 그리기
            ctx.drawImage(img, 0, 0, originalWidth, originalHeight, 0, 0, newWidth, newHeight);

            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        };
        img.src = URL.createObjectURL(imageFile);
    });
}

// 업스케일 시작
async function startUpscale() {
    if (!originalFile) return;

    const loading = document.getElementById('loading');
    const btn = document.getElementById('upscaleBtn');
    
    btn.disabled = true;
    loading.style.display = 'block'; // 기존 로딩 스피너도 함께 표시
    document.getElementById('previewSection').style.display = 'none'; // 업스케일 시작 시 미리보기 숨김

    // 선택된 보간법 가져오기
    const selectedInterpolationMethod = document.querySelector('input[name="interpolation"]:checked').value;

    try {
        let resultBlob;

        if (['nearest', 'bilinear', 'bicubic'].includes(selectedInterpolationMethod)) {
            // 클라이언트 측에서 보간법 처리
            showProgressModal('이미지 처리 중...', `프론트엔드 ${selectedInterpolationMethod} 보간법 적용 중...`);
            resultBlob = await resizeImageClientSide(originalFile, 4, selectedInterpolationMethod);
            console.log(`클라이언트 측 ${selectedInterpolationMethod} 보간법으로 업스케일 완료`);
        } else if (selectedInterpolationMethod === 'realesrgan') { 
            // RealESRGAN (백엔드) 처리
            showProgressModal('AI 이미지 업스케일링 중...', '서버로 이미지 전송 및 AI 모델 처리 중...');
            const formData = new FormData();
            formData.append('image', originalFile);
            
            const response = await fetch('https://acitivity12-interpolation1-html.onrender.com/upscale', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                resultBlob = await response.blob();
                console.log("RealESRGAN으로 업스케일 완료");
            } else {
                throw new Error('업스케일 처리 중 오류가 발생했습니다.');
            }
        } else {
            // 예상치 못한 보간법 선택 시 오류 처리 (기본 RealESRGAN)
            showProgressModal('오류', '알 수 없는 보간법이 선택되었습니다. AI 업스케일링으로 진행합니다.');
            const formData = new FormData();
            formData.append('image', originalFile);
            
            const response = await fetch('https://acitivity12-interpolation1-html.onrender.com/upscale', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                resultBlob = await response.blob();
                console.log("RealESRGAN으로 업스케일 완료 (기본 처리)");
            } else {
                throw new Error('업스케일 처리 중 오류가 발생했습니다.');
            }
        }

        upscaledImageUrl = URL.createObjectURL(resultBlob);
        showComparison();

    } catch (error) {
        alert('오류: ' + error.message);
        console.error('Error:', error);
    } finally {
        loading.style.display = 'none'; // 기존 로딩 스피너 숨김
        btn.disabled = false;
        hideProgressModal(); // 진행 상황 모달 숨김
    }
}

// 비교 이미지 표시
function showComparison() {
    const originalUrl = URL.createObjectURL(originalFile);
    
    // 모든 이미지 엘리먼트에 URL 설정
    document.getElementById('beforeImage').src = originalUrl;
    document.getElementById('afterImage').src = upscaledImageUrl;
    document.getElementById('beforeImageSimple').src = originalUrl;
    document.getElementById('afterImageSimple').src = upscaledImageUrl;

    // 이미지 정보 업데이트
    const img = new Image();
    img.onload = function() {
        document.getElementById('originalSize').textContent = `${img.width} × ${img.height}`;
        document.getElementById('upscaledSize').textContent = `${img.width * 4} × ${img.height * 4}`;
    };
    img.src = originalUrl;

    document.getElementById('comparisonContainer').style.display = 'block';
    setupSlider();
}

// 슬라이더 설정
function setupSlider() {
    const slider = document.getElementById('comparisonSlider');
    const handle = document.getElementById('sliderHandle');
    const afterImage = document.getElementById('afterImage');

    function updateSlider(x) {
        const rect = slider.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(100, (x - rect.left) / rect.width * 100));
        
        handle.style.left = percentage + '%';
        afterImage.style.clipPath = `polygon(${percentage}% 0%, 100% 0%, 100% 100%, ${percentage}% 100%)`;
    }

    // 마우스 이벤트
    handle.addEventListener('mousedown', (e) => {
        isSliding = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isSliding) {
            updateSlider(e.clientX);
        }
    });

    document.addEventListener('mouseup', () => {
        isSliding = false;
    });

    // 터치 이벤트
    handle.addEventListener('touchstart', (e) => {
        isSliding = true;
        e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
        if (isSliding) {
            updateSlider(e.touches[0].clientX);
        }
    });

    document.addEventListener('touchend', () => {
        isSliding = false;
    });

    // 클릭으로 슬라이더 이동
    slider.addEventListener('click', (e) => {
        if (!isSliding) {
            updateSlider(e.clientX);
        }
    });
}

// 탭 전환
function switchTab(tab) {
    // 탭 활성화 상태 변경
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    // 뷰 전환
    document.getElementById('comparisonView').style.display = 'none';
    document.getElementById('beforeView').style.display = 'none';
    document.getElementById('afterView').style.display = 'none';

    if (tab === 'comparison') {
        document.getElementById('comparisonView').style.display = 'block';
    } else if (tab === 'before') {
        document.getElementById('beforeView').style.display = 'block';
    } else if (tab === 'after') {
        document.getElementById('afterView').style.display = 'block';
    }
}

// 이미지 다운로드
function downloadImage() {
    if (upscaledImageUrl) {
        const a = document.createElement('a');
        a.href = upscaledImageUrl;
        a.download = 'upscaled_image.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// 드래그 앤 드롭 지원
uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#667eea';
    uploadSection.style.background = '#f0f2ff';
});

uploadSection.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#ddd';
    uploadSection.style.background = '#f8f9fa';
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#ddd';
    uploadSection.style.background = '#f8f9fa';
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        originalFile = files[0];
        // 파일 선택 시 업스케일 버튼 상태 업데이트
        updateUpscaleButtonState();
        
        const uploadText = document.querySelector('.upload-text');
        uploadText.textContent = `선택된 파일: ${files[0].name}`;
    }
});

// 도움말 모달 관련 JavaScript
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeButton = helpModal.querySelector('.close-button');
const modalTitle = helpModal.querySelector('h2');
const modalBody = helpModal.querySelector('.modal-body');

// 보간법 설명 데이터
const interpolationDescriptions = {
    nearest: {
        title: '최근접 이웃 (Nearest Neighbor) 보간법',
        content: `
            <p><strong>최근접 이웃 (Nearest Neighbor)</strong> 보간법은 이미지를 확대할 때 가장 단순한 방식입니다. 새로운 픽셀의 색상을 결정할 때, 원본 이미지에서 가장 가까운 픽셀의 색상을 그대로 가져와 채웁니다. 이 방법은 계산 비용이 매우 낮고 빠르지만, 결과 이미지에 계단 현상(aliasing)이 발생하여 품질이 떨어져 보일 수 있습니다.</p>
            <p><strong>장점:</strong> 가장 빠르고 단순하며, 새로운 색상이 추가되지 않아 원본 이미지의 색상 팔레트가 유지됩니다.</p>
            <p><strong>단점:</strong> 계단 현상, 블록 현상 등 이미지 품질 저하가 뚜렷하게 나타납니다. 텍스트나 선이 있는 이미지에서는 특히 품질 저하가 심합니다.</p>
        `
    },
    bilinear: {
        title: '선형 보간 (Bilinear) 보간법',
        content: `
            <p><strong>선형 보간 (Bilinear)</strong> 보간법은 새로운 픽셀의 색상을 결정할 때, 주변 2x2 픽셀의 색상 값을 사용하여 가중 평균을 계산합니다. 최근접 이웃 보간법보다 부드러운 결과를 제공하며, 계단 현상이 줄어듭니다.</p>
            <p><strong>장점:</strong> 최근접 이웃 보간법보다 시각적으로 훨씬 부드러운 결과물을 제공합니다. 계산 비용이 크게 높지 않아 비교적 효율적입니다.</p>
            <p><strong>단점:</strong> 여전히 어느 정도의 블러(blur) 현상이 발생하여 이미지가 선명하지 않을 수 있습니다. 미세한 디테일이 손실될 수 있습니다.</p>
        `
    },
    bicubic: {
        title: '비큐빅 보간 (Bicubic) 보간법',
        content: `
            <p><strong>비큐빅 보간 (Bicubic)</strong> 보간법은 새로운 픽셀의 색상을 결정할 때, 주변 4x4 픽셀의 색상 값을 사용하여 복잡한 3차 함수를 통해 가중 평균을 계산합니다. 이 방법은 선형 보간보다 훨씬 더 부드럽고 자연스러운 결과를 제공하며, 이미지의 디테일을 더 잘 보존합니다.</p>
            <p><strong>장점:</strong> 이미지 품질이 가장 우수하며, 계단 현상이나 블러 현상이 가장 적습니다. 사진이나 복잡한 이미지에 특히 적합합니다.</p>
            <p><strong>단점:</strong> 다른 보간법에 비해 계산 비용이 가장 높습니다. 때때로 이미지에 인공적인 샤프닝(sharpening) 효과가 나타날 수 있습니다.</p>
        `
    },
    realesrgan: {
        title: 'RealESRGAN (AI 학습) 소개',
        content: `
            <p><strong>RealESRGAN</strong>은 최신 딥러닝 기술을 기반으로 하는 이미지 초해상화(Super-Resolution) 모델입니다. 기존의 전통적인 보간법들과 달리, 인공지능이 저해상도 이미지의 손실된 디테일을 학습하고 복원하여 훨씬 더 선명하고 자연스러운 고해상도 이미지를 생성합니다.</p>
            <p>이 모델은 특히 사진이나 복잡한 그림에서 탁월한 성능을 발휘하며, 실제 같은 질감과 선명도를 복원하는 데 중점을 둡니다.</p>
            <p><strong>장점:</strong> 이미지 품질이 가장 뛰어나며, 미세한 디테일과 질감을 AI가 생성하여 복원합니다.</p>
            <p><strong>단점:</strong> 딥러닝 모델이므로 처리 시간이 다른 보간법에 비해 길 수 있으며, 서버 자원(GPU 또는 CPU)을 사용합니다. 때때로 AI가 존재하지 않는 디테일을 '생성'하여 원본과 미묘하게 다를 수 있습니다.</p>
        `
    }
};

helpBtn.addEventListener('click', () => {
    // 기본 도움말 내용 로드
    modalTitle.textContent = 'AI Image Upscaler 활용 가이드';
    modalBody.innerHTML = `
        <p>환영합니다! 이 웹사이트는 AI 기반의 RealESRGAN 모델을 사용하여 이미지를 4배 고해상도로 업스케일해주는 도구입니다.</p>
        <p><strong>사용 방법:</strong></p>
        <ol>
            <li><strong>이미지 업로드:</strong> '이미지를 업로드하세요' 영역을 클릭하거나 이미지를 드래그 앤 드롭하여 업로드합니다. JPG, PNG, WebP 형식이 지원되며 최대 10MB까지 가능합니다.</li>
            <li><strong>이미지 정보 확인:</strong> 이미지를 업로드하면 미리보기와 함께 파일명, 해상도, 파일 크기 등 기본 정보가 표시됩니다.</li>
            <li><strong>업스케일 시작:</strong> '업스케일 시작' 버튼을 클릭하여 AI 업스케일링을 시작합니다. 서버 로딩 상태를 확인한 후 진행해 주세요.</li>
            <li><strong>결과 확인:</strong> 업스케일링이 완료되면, 원본 이미지와 업스케일된 이미지를 비교 뷰에서 확인할 수 있습니다. 슬라이더를 움직여 변화를 자세히 살펴보세요. '원본' 탭과 '업스케일' 탭으로 개별 이미지를 볼 수도 있습니다.</li>
            <li><strong>이미지 다운로드:</strong> 업스케일된 이미지 뷰에서 '다운로드' 버튼을 클릭하여 고해상도 이미지를 저장할 수 있습니다.</li>
        </ol>
        <p>궁금한 점이 있다면 언제든지 문의해 주세요!</p>
    `;
    helpModal.classList.add('modal--active');
});

closeButton.addEventListener('click', () => {
    helpModal.classList.remove('modal--active');
});

// 모달 외부 클릭 시 닫기
window.addEventListener('click', (event) => {
    if (event.target == helpModal) {
        helpModal.classList.remove('modal--active');
    }
});

// 자세히 알아보기 버튼 이벤트 리스너 추가
document.querySelectorAll('.learn-more-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const method = e.target.dataset.method;
        const description = interpolationDescriptions[method];

        if (description) {
            modalTitle.textContent = description.title;
            modalBody.innerHTML = description.content;
            helpModal.classList.add('modal--active');
        }
    });
}); 