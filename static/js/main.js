document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const upscaleButton = document.getElementById('upscaleBtn');
    const previewSection = document.getElementById('previewSection');
    const fileNameSpan = document.getElementById('fileName');
    const fileResolutionSpan = document.getElementById('fileResolution');
    const fileSizeSpan = document.getElementById('fileSize');
    const serverStatusSpan = document.getElementById('serverStatus');
    const realesrganStatusSpan = document.getElementById('realesrganStatus');
    const progressModal = document.getElementById('progressModal');
    const progressMessage = document.getElementById('progressMessage');
    const progressBar = document.getElementById('progressBar');
    const progressSpinner = document.getElementById('progressSpinner');
    const helpBtn = document.getElementById('helpBtn');
    const helpPopup = document.getElementById('helpPopup');
    const closeHelpPopupBtn = document.getElementById('closeHelpPopupBtn');
    const helpPopupContent = document.getElementById('helpPopupContent');
    const interpolationOptions = document.querySelectorAll('input[name="interpolation"]');
    const comparisonSection = document.getElementById('comparisonSection');
    const downloadBtn = document.getElementById('downloadBtn');
    const imagePreview = document.getElementById('imagePreview');

    let originalFile = null;
    let upscaledImageUrl = null;
    let serverReady = false;
    let modelReady = false;
    let currentOriginalImage = null; // showComparison에서 원본 이미지 URL을 저장할 변수
    let currentUpscaledImage = null; // showComparison에서 업스케일된 이미지 URL을 저장할 변수

    // 서버 상태 및 RealESRGAN 모델 로드 상태 확인
    const checkServerStatus = async () => {
        try {
            const response = await fetch('http://127.0.0.1:5000/health'); // 로컬 서버로 변경
            const data = await response.json();
            serverReady = data.server_status === 'ready';
            modelReady = data.model_status === 'ready';

            if (serverReady && modelReady) {
                serverStatusSpan.textContent = '서버 및 RealESRGAN 모델 준비 완료';
                serverStatusSpan.style.color = 'green';
                upscaleButton.disabled = false;
                realesrganStatusSpan.textContent = '(준비 완료)';
                document.getElementById('realesrganOption').disabled = false;
            } else if (serverReady && !modelReady) {
                serverStatusSpan.textContent = '서버 준비 완료, RealESRGAN 모델 로딩 중...';
                serverStatusSpan.style.color = 'orange';
                upscaleButton.disabled = true; // 서버만 준비되면 업스케일 버튼 비활성화
                realesrganStatusSpan.textContent = '(로딩 중...)';
                document.getElementById('realesrganOption').disabled = true;
            } else {
                serverStatusSpan.textContent = '서버 연결 중... (재시도 중)';
                serverStatusSpan.style.color = 'red';
                upscaleButton.disabled = true;
                realesrganStatusSpan.textContent = '(서버 연결 중)';
                document.getElementById('realesrganOption').disabled = true;
            }
        } catch (error) {
            serverReady = false;
            modelReady = false;
            serverStatusSpan.textContent = '서버 연결 실패 (재시도 중)';
            serverStatusSpan.style.color = 'red';
            upscaleButton.disabled = true;
            realesrganStatusSpan.textContent = '(서버 연결 실패)';
            document.getElementById('realesrganOption').disabled = true;
        } finally {
            updateUpscaleButtonState(); // 상태 업데이트 후 버튼 상태도 갱신
        }
    };

    // 업스케일 버튼 및 RealESRGAN 옵션 상태 업데이트
    const updateUpscaleButtonState = () => {
        const selectedMethod = document.querySelector('input[name="interpolation"]:checked').value;
        if (selectedMethod === 'realesrgan') {
            upscaleButton.disabled = !originalFile || !(serverReady && modelReady);
        } else {
            upscaleButton.disabled = !originalFile; // 클라이언트 측 업스케일링은 서버 상태와 무관
        }
    };

    // 파일 입력 변경 이벤트
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            originalFile = file;
            previewSection.style.display = 'block';
            fileNameSpan.textContent = file.name;
            fileSizeSpan.textContent = `${(file.size / 1024).toFixed(2)} KB`;

            // 이미지 해상도 미리보기 및 이미지 미리보기 표시
            const img = new Image();
            img.onload = () => {
                fileResolutionSpan.textContent = `${img.width} × ${img.height} 픽셀`;
                imagePreview.src = img.src;
            };
            img.src = URL.createObjectURL(file);
        } else {
            originalFile = null;
            previewSection.style.display = 'none';
            imagePreview.src = '#';
        }
        updateUpscaleButtonState();
    });

    // 보간법 라디오 버튼 변경 이벤트
    interpolationOptions.forEach(radio => {
        radio.addEventListener('change', updateUpscaleButtonState);
    });

    // 클라이언트 측 이미지 리사이즈 함수 (Canvas API 사용)
    const resizeImageClientSide = async (file, scaleFactor, method) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const newWidth = img.width * scaleFactor;
                const newHeight = img.height * scaleFactor;

                canvas.width = newWidth;
                canvas.height = newHeight;

                // 보간법 설정
                if (method === 'nearest') {
                    ctx.imageSmoothingEnabled = false;
                } else {
                    ctx.imageSmoothingEnabled = true;
                    // 다른 보간법은 'quality' 속성으로 조절
                    if (method === 'bilinear' || method === 'bicubic') {
                        // 기본적으로 브라우저의 기본 imageSmoothingQuality를 사용하거나,
                        // 필요시 더 높은 품질로 설정 (대부분의 브라우저는 기본적으로 bilinear/bicubic 사용)
                        ctx.imageSmoothingQuality = 'high';
                    }
                }

                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, 'image/png');
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    // 업스케일 시작 함수
    const startUpscale = async () => {
        if (!originalFile) {
            alert('업스케일할 이미지를 선택해주세요.');
            return;
        }

        const selectedMethod = document.querySelector('input[name="interpolation"]:checked').value;
        const scaleFactor = 4; // 항상 4배 업스케일

        progressMessage.textContent = '업스케일링 중...';
        progressBar.style.width = '0%';
        progressSpinner.style.display = 'block';
        progressModal.style.display = 'flex';

        try {
            let processedImageUrl;
            if (selectedMethod === 'realesrgan') {
                if (!serverReady || !modelReady) {
                    alert('서버 또는 RealESRGAN 모델이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
                    return;
                }
                const formData = new FormData();
                formData.append('image', originalFile);
                formData.append('scale', scaleFactor);

                const response = await fetch('http://127.0.0.1:5000/upscale', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const blob = await response.blob();
                processedImageUrl = URL.createObjectURL(blob);
            } else {
                // 클라이언트 측 업스케일링
                processedImageUrl = await resizeImageClientSide(originalFile, scaleFactor, selectedMethod);
            }

            upscaledImageUrl = processedImageUrl; // 업스케일된 이미지 URL 저장
            currentOriginalImage = URL.createObjectURL(originalFile); // 원본 이미지 URL 저장
            currentUpscaledImage = upscaledImageUrl; // 업스케일된 이미지 URL 저장

            // 진행 상황 업데이트 (완료)
            progressMessage.textContent = `클라이언트 측 ${selectedMethod} 보간법으로 업스케일 완료`;
            progressBar.style.width = '100%';
            progressSpinner.style.display = 'none';

            // 이미지 비교 섹션 표시
            showComparison();
            downloadBtn.style.display = 'block'; // 다운로드 버튼 표시
        } catch (error) {
            console.error('Error during upscale:', error);
            progressMessage.textContent = '업스케일링 실패!';
            progressBar.style.width = '0%';
            progressSpinner.style.display = 'none';
            alert(`업스케일링 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            // 짧은 지연 후 모달 닫기
            setTimeout(() => {
                progressModal.style.display = 'none';
            }, 1000);
        }
    };

    upscaleButton.addEventListener('click', startUpscale);

    // 이미지 다운로드
    const downloadImage = () => {
        if (upscaledImageUrl) {
            const a = document.createElement('a');
            a.href = upscaledImageUrl;
            a.download = `upscaled_${originalFile ? originalFile.name.split('.')[0] : 'image'}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(upscaledImageUrl); // 메모리 해제
        } else {
            alert('업스케일된 이미지가 없습니다.');
        }
    };

    downloadBtn.addEventListener('click', downloadImage);

    // 이미지를 표시하고 비교 슬라이더를 설정합니다.
    function showComparison() {
        const comparisonSection = document.getElementById('comparisonSection');
        const comparisonContainer = document.getElementById('comparisonContainer');

        // 캔버스 요소가 null인지 확인하여 오류 방지
        if (!comparisonContainer || !comparisonSection) {
            console.error("Comparison section or container not found!");
            return;
        }

        // 원본 이미지 로드
        const originalImg = new Image();
        originalImg.onload = () => {
            // 업스케일된 이미지 로드 (originalImg 로드 후에 수행)
            const upscaledImg = new Image();
            upscaledImg.onload = () => {
                const upscaledCanvas = document.getElementById('upscaledCanvas');
                const originalCanvas = document.getElementById('originalCanvas');
                
                // 캔버스 요소가 null인지 확인하여 오류 방지
                if (!originalCanvas || !upscaledCanvas) {
                    console.error("Canvas elements not found!");
                    return;
                }

                const upscaledCtx = upscaledCanvas.getContext('2d');
                const originalCtx = originalCanvas.getContext('2d');

                comparisonSection.style.display = 'block'; // 비교 섹션 표시

                // DOM 렌더링 및 레이아웃 계산을 확실히 기다리기 위해 중첩된 requestAnimationFrame 사용
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        const containerRect = comparisonContainer.getBoundingClientRect();
                        const displayWidth = containerRect.width;
                        const displayHeight = containerRect.height; // CSS에서 900px로 설정됨

                        // 두 캔버스의 크기를 동일하게 설정하여 슬라이더 작동 시 일관성을 유지합니다.
                        originalCanvas.width = displayWidth;
                        originalCanvas.height = displayHeight;
                        upscaledCanvas.width = displayWidth;
                        upscaledCanvas.height = displayHeight;

                        // 원본 이미지 그리기 (비율 유지하며 캔버스 중앙에)
                        let originalRatio = Math.min(displayWidth / originalImg.width, displayHeight / originalImg.height);
                        let originalDrawWidth = originalImg.width * originalRatio;
                        let originalDrawHeight = originalImg.height * originalRatio;
                        let originalXOffset = (displayWidth - originalDrawWidth) / 2;
                        let originalYOffset = (displayHeight - originalDrawHeight) / 2;
                        originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
                        originalCtx.drawImage(originalImg, originalXOffset, originalYOffset, originalDrawWidth, originalDrawHeight);
                        
                        // 업스케일된 이미지 그리기 (비율 유지하며 캔버스 중앙에)
                        let upscaledRatio = Math.min(displayWidth / upscaledImg.width, displayHeight / upscaledImg.height);
                        let upscaledDrawWidth = upscaledImg.width * upscaledRatio;
                        let upscaledDrawHeight = upscaledImg.height * upscaledRatio;
                        let upscaledXOffset = (displayWidth - upscaledDrawWidth) / 2;
                        let upscaledYOffset = (displayHeight - upscaledDrawHeight) / 2;
                        upscaledCtx.clearRect(0, 0, upscaledCanvas.width, upscaledCanvas.height);
                        upscaledCtx.drawImage(upscaledImg, upscaledXOffset, upscaledYOffset, upscaledDrawWidth, upscaledDrawHeight);

                        // 해상도 정보 업데이트
                        document.getElementById('originalSize').textContent = `${originalImg.width} × ${originalImg.height} 픽셀`;
                        document.getElementById('upscaledSize').textContent = `${upscaledImg.width} × ${upscaledImg.height} 픽셀`;

                        setupSlider(); // 슬라이더 설정
                    });
                });
            };
            upscaledImg.src = upscaledImageUrl;
        };
        originalImg.src = URL.createObjectURL(originalFile);
    }

    // 슬라이더 설정
    function setupSlider() {
        const comparisonContainer = document.getElementById('comparisonContainer');
        const resizeHandle = document.getElementById('resizeHandle');
        const upscaledCanvas = document.getElementById('upscaledCanvas');

        if (!comparisonContainer || !resizeHandle || !upscaledCanvas) {
            console.error("Slider elements not found!");
            return;
        }

        let isResizing = false;

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const containerRect = comparisonContainer.getBoundingClientRect();
            let x = e.clientX - containerRect.left;
            
            // 경계 설정
            x = Math.max(0, Math.min(x, containerRect.width));

            resizeHandle.style.left = `${x}px`;
            // clip-path를 사용하여 업스케일된 이미지의 보이는 부분을 조절
            upscaledCanvas.style.clipPath = `polygon(0px 0px, ${x}px 0px, ${x}px 100%, 0px 100%)`;
            upscaledCanvas.style.webkitClipPath = `polygon(0px 0px, ${x}px 0px, ${x}px 100%, 0px 100%)`; // 웹킷 브라우저 지원
        };

        const onMouseUp = () => {
            isResizing = false;
            comparisonContainer.removeEventListener('mousemove', onMouseMove);
            comparisonContainer.removeEventListener('mouseup', onMouseUp);
            upscaledCanvas.style.transition = 'clip-path 0.3s ease-out'; // 트랜지션 다시 활성화
        };

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            upscaledCanvas.style.transition = 'none'; // 드래그 중 트랜지션 비활성화
            comparisonContainer.addEventListener('mousemove', onMouseMove);
            comparisonContainer.addEventListener('mouseup', onMouseUp);
        });

        // 초기 위치 설정 (중앙)
        const initialX = comparisonContainer.offsetWidth / 2;
        resizeHandle.style.left = `${initialX}px`;
        upscaledCanvas.style.clipPath = `polygon(0px 0px, ${initialX}px 0px, ${initialX}px 100%, 0px 100%)`;
        upscaledCanvas.style.webkitClipPath = `polygon(0px 0px, ${initialX}px 0px, ${initialX}px 100%, 0px 100%)`;
    }

    // 도움말 팝업
    const interpolationDescriptions = {
        nearest: {
            title: '최근접 이웃 보간법 (Nearest Neighbor)',
            description: '주변 픽셀 중 가장 가까운 픽셀의 색상 값을 그대로 사용하여 이미지를 확대합니다. 가장 빠르지만, 결과물이 계단 현상(픽셀화)을 보일 수 있습니다.',
            usage: '빠른 처리 속도가 중요하거나 픽셀 아트와 같이 거친 질감이 필요한 경우에 적합합니다.'
        },
        bilinear: {
            title: '양선형 보간법 (Bilinear)',
            description: '주변 4개 픽셀의 색상 값을 사용하여 새로운 픽셀의 색상을 계산합니다. 최근접 이웃보다 부드러운 결과를 제공하지만, 이미지가 약간 흐릿해 보일 수 있습니다.',
            usage: '일반적인 사진이나 그래픽에 적합하며, 속도와 품질 사이의 균형이 좋습니다.'
        },
        bicubic: {
            title: '양입방 보간법 (Bicubic)',
            description: '주변 16개 픽셀의 색상 값을 사용하여 새로운 픽셀의 색상을 계산합니다. 가장 정교하고 부드러운 결과를 제공하지만, 처리 속도가 가장 느립니다.',
            usage: '최고 품질의 이미지 확대가 필요한 경우 (예: 인쇄용 이미지)에 적합합니다.'
        },
        realesrgan: {
            title: 'RealESRGAN (AI) 학습',
            description: '인공지능 기반의 고급 업스케일링 기술로, 손실된 이미지 디테일을 복원하고 선명도를 향상시켜 뛰어난 결과를 제공합니다. 특히 저해상도 이미지의 품질을 크게 개선할 수 있습니다.',
            usage: '사진, 일러스트레이션 등 고품질 업스케일링이 필요한 모든 종류의 이미지에 가장 권장됩니다. 서버에서 AI 모델을 통해 처리되므로 시간이 소요될 수 있습니다.'
        }
    };

    helpBtn.addEventListener('click', () => showHelpPopup('homepage')); // 홈페이지 활용법 기본 표시

    function showHelpPopup(context) {
        let contentHTML = '';
        if (context === 'homepage') {
            contentHTML = `
                <div class="help-content-section">
                    <h3>✨ 홈페이지 활용법</h3>
                    <p>이 웹 애플리케이션은 인공지능과 다양한 보간법을 사용하여 이미지의 해상도를 높여주는 도구입니다. 아래 단계를 따라 이미지를 업스케일링해보세요!</p>
                </div>
                <div class="help-content-section">
                    <h4>1. 이미지 업로드</h4>
                    <p><strong>"이미지 선택"</strong> 버튼을 클릭하여 업스케일링할 이미지를 선택합니다. 업로드 즉시 이미지의 파일명, 해상도, 파일 크기 등 미리보기 정보가 표시됩니다.</p>
                </div>
                <div class="help-content-section">
                    <h4>2. 보간법 선택</h4>
                    <p>네 가지 보간법 옵션 중 하나를 선택할 수 있습니다. 각 보간법은 다른 이미지 처리 방식과 특징을 가집니다:</p>
                    <ul>
                        <li><strong>최근접 이웃 (Nearest Neighbor)</strong>: 가장 빠르지만, 픽셀화가 두드러질 수 있습니다.</li>
                        <li><strong>양선형 (Bilinear)</strong>: 최근접 이웃보다 부드럽지만 약간 흐릿할 수 있습니다.</li>
                        <li><strong>양입방 (Bicubic)</strong>: 가장 부드럽고 정교하지만 처리 시간이 더 걸립니다.</li>
                        <li><strong>RealESRGAN (AI)</strong>: 인공지능 기반으로 가장 뛰어난 품질을 제공하며, 이미지의 손실된 디테일을 복원합니다. 이 옵션은 서버와 AI 모델이 준비된 경우에만 활성화됩니다.</li>
                    </ul>
                    <p>각 보간법 옆의 <strong>"자세히 알아보기"</strong> 버튼을 클릭하면 더 상세한 설명을 볼 수 있습니다.</p>
                </div>
                <div class="help-content-section">
                    <h4>3. 업스케일 시작</h4>
                    <p>이미지와 보간법을 선택한 후 <strong>"업스케일 시작"</strong> 버튼을 클릭합니다. 선택한 보간법에 따라 클라이언트(브라우저) 또는 서버(AI 모델)에서 이미지가 처리됩니다. 처리 중에는 진행 상황 팝업이 나타납니다.</p>
                </div>
                <div class="help-content-section">
                    <h4>4. 결과 확인 및 다운로드</h4>
                    <p>업스케일링이 완료되면 원본 이미지와 업스케일된 이미지를 비교할 수 있는 슬라이더가 나타납니다. 슬라이더를 좌우로 움직여 두 이미지를 비교하고, <strong>"업스케일된 이미지 다운로드"</strong> 버튼을 클릭하여 결과 이미지를 저장할 수 있습니다.</p>
                </div>
                <div class="help-content-section">
                    <p>문의사항이 있다면 언제든지 도움말 버튼을 다시 눌러주세요!</p>
                </div>
            `;
        } else if (interpolationDescriptions[context]) {
            const desc = interpolationDescriptions[context];
            contentHTML = `
                <div class="help-content-section">
                    <h3>${desc.title}</h3>
                    <p><strong>설명:</strong> ${desc.description}</p>
                    <p><strong>활용:</strong> ${desc.usage}</p>
                </div>
                <div class="help-content-section">
                    <p>다른 보간법에 대해 알아보려면 옵션을 선택하고 다시 <strong>"자세히 알아보기"</strong>를 클릭해주세요.</p>
                </div>
            `;
        }
        helpPopupContent.innerHTML = contentHTML;
        helpPopup.style.display = 'flex';
    }

    closeHelpPopupBtn.addEventListener('click', closeHelpPopup);

    function closeHelpPopup() {
        helpPopup.style.display = 'none';
    }

    // 각 보간법 옵션의 "자세히 알아보기" 버튼 이벤트 리스너 추가
    document.querySelectorAll('.learn-more-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const method = event.target.dataset.method;
            showHelpPopup(method);
        });
    });

    // 5초마다 서버 상태 확인
    setInterval(checkServerStatus, 5000);

    // 초기 서버 상태 확인
    checkServerStatus();
}); 