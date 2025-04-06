let sessionId = null;
let modelFiles = [];

document.addEventListener('DOMContentLoaded', function() {
    const uploadBtn = document.getElementById('uploadBtn');
    const reconstructBtn = document.getElementById('reconstructBtn');
    const clearBtn = document.getElementById('clearBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const detailLevel = document.getElementById('detailLevel');
    const detailValue = document.getElementById('detailValue');
    const statusMessage = document.getElementById('statusMessage');
    const imageGallery = document.getElementById('imageGallery');
    const modelViewer = document.getElementById('modelViewer');
    
    detailLevel.addEventListener('input', function() {
        detailValue.textContent = `${this.value}%`;
    });
    
    uploadBtn.addEventListener('click', function() {
        const videoFile = document.getElementById('videoUpload').files[0];
        const imageFiles = document.getElementById('imageUpload').files;
        
        if (!videoFile && imageFiles.length === 0) {
            showStatus('Please select a video or at least one image to upload.', 'warning');
            return;
        }
        
        const formData = new FormData();
        if (videoFile) {
            formData.append('video', videoFile);
        }
        
        for (let i = 0; i < imageFiles.length; i++) {
            formData.append('images', imageFiles[i]);
        }
        
        showStatus('Uploading files...', 'info');
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showStatus(data.error, 'danger');
                return;
            }
            
            sessionId = data.session_id;
            
            updateGallery(data.images);
            
            reconstructBtn.disabled = false;
            
            showStatus(`Upload complete. ${data.image_count} images ready for reconstruction.`, 'success');
        })
        .catch(error => {
            console.error('Error:', error);
            showStatus('Error uploading files. Please try again.', 'danger');
        });
    });
    
    reconstructBtn.addEventListener('click', function() {
        if (!sessionId) {
            showStatus('Please upload files first.', 'warning');
            return;
        }
        
        const params = {
            session_id: sessionId,
            conf_thres: parseFloat(detailLevel.value),
            frame_filter: document.getElementById('frameFilter').value,
            mask_black_bg: document.getElementById('filterDarkAreas').checked,
            mask_white_bg: document.getElementById('filterLightAreas').checked,
            show_cam: document.getElementById('showCameras').checked,
            mask_sky: document.getElementById('filterSky').checked,
            prediction_mode: document.getElementById('reconstructionMethod').value,
            export_format: document.getElementById('exportFormat').value
        };
        
        showStatus('Reconstructing ecosystem... This may take a few minutes.', 'info');
        
        fetch('/reconstruct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showStatus(data.error, 'danger');
                return;
            }
            
            modelFiles = data.files;
            
            downloadBtn.disabled = false;
            
            displayModel(data.files[0]);
            
            showStatus('Reconstruction complete! 3D model ready for viewing and download.', 'success');
        })
        .catch(error => {
            console.error('Error:', error);
            showStatus('Error during reconstruction. Please try again.', 'danger');
        });
    });
    
    downloadBtn.addEventListener('click', function() {
        if (modelFiles.length === 0) {
            showStatus('No files available for download.', 'warning');
            return;
        }
        
        modelFiles.forEach(file => {
            const filename = file.split('/').pop();
            window.open(`/download/${sessionId}/${filename}`, '_blank');
        });
    });
    
    clearBtn.addEventListener('click', function() {
        if (sessionId) {
            fetch('/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_id: sessionId })
            })
            .catch(error => console.error('Error cleaning up session:', error));
        }
        
        resetUI();
    });
    
    const updateParams = ['detailLevel', 'frameFilter', 'showCameras', 'filterSky', 
                          'filterDarkAreas', 'filterLightAreas', 'reconstructionMethod', 'exportFormat'];
    
    updateParams.forEach(param => {
        const element = document.getElementById(param);
        if (element) {
            element.addEventListener('change', function() {
                if (modelFiles.length > 0) {
                    reconstructBtn.click();
                }
            });
        }
    });
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    dropArea.classList.add('dragover');
}

function unhighlight() {
    dropArea.classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    let hasValidFiles = false;
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/') || files[i].type.startsWith('video/')) {
            hasValidFiles = true;
            break;
        }
    }
    
    if (!hasValidFiles) {
        showStatus('Please upload only image or video files.', 'warning');
        return;
    }
    
    let videoFile = null;
    const imageFiles = [];
    
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('video/') && !videoFile) {
            videoFile = files[i];
        } else if (files[i].type.startsWith('image/')) {
            imageFiles.push(files[i]);
        }
    }
    
    if (videoFile) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(videoFile);
        videoUpload.files = dataTransfer.files;
    }
    
    if (imageFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        imageFiles.forEach(file => dataTransfer.items.add(file));
        imageUpload.files = dataTransfer.files;
    }
    
    uploadBtn.click();
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.innerHTML = `<i class="fas ${getIconForType(type)} me-2"></i>${message}`;
    
    statusMessage.className = 'alert';
    
    switch (type) {
        case 'success':
            statusMessage.classList.add('alert-success');
            break;
        case 'warning':
            statusMessage.classList.add('alert-warning');
            break;
        case 'danger':
            statusMessage.classList.add('alert-danger');
            break;
        default:
            statusMessage.classList.add('alert-info');
    }
    
    statusMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getIconForType(type) {
    switch (type) {
        case 'success':
            return 'fa-check-circle';
        case 'warning':
            return 'fa-exclamation-triangle';
        case 'danger':
            return 'fa-times-circle';
        default:
            return 'fa-info-circle';
    }
}

function setProcessingStatus(isProcessing) {
    processingStatus = isProcessing;
    
    document.getElementById('uploadBtn').disabled = isProcessing;
    document.getElementById('clearBtn').disabled = isProcessing;
    
    if (isProcessing) {
        document.body.classList.add('processing');
    } else {
        document.body.classList.remove('processing');
    }
}

function displayModel(modelPath) {
    const modelViewerDestroyed = document.getElementById('modelViewerDestroyed');
    
    modelViewerDestroyed.innerHTML = `
        <div class="loading-container">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p>Loading 3D model...</p>
        </div>
    `;
    
    const filename = modelPath.split('/').pop();
    
    const modelElement = document.createElement('model-viewer');
    modelElement.src = `/uploads/${sessionId}/${filename}`;
    modelElement.alt = '3D Ecosystem Model';
    modelElement.setAttribute('auto-rotate', '');
    modelElement.setAttribute('camera-controls', '');
    modelElement.setAttribute('environment-image', 'neutral');
    modelElement.setAttribute('shadow-intensity', '1');
    
    modelElement.addEventListener('load', () => {
        console.log('Model loaded successfully');
    });
    
    modelElement.addEventListener('error', (error) => {
        console.error('Error loading model:', error);
        showStatus('Error loading 3D model. Please try again.', 'danger');
    });
    
    setTimeout(() => {
        modelViewerDestroyed.innerHTML = '';
        modelViewerDestroyed.appendChild(modelElement);
        
        const controls = document.createElement('div');
        controls.className = 'model-controls';
        controls.innerHTML = `
            <button class="btn btn-sm btn-light" id="resetViewBtn">
                <i class="fas fa-sync-alt"></i>
            </button>
            <button class="btn btn-sm btn-light" id="toggleRotateBtn">
                <i class="fas fa-redo"></i>
            </button>
            <button class="btn btn-sm btn-light" id="fullscreenBtn">
                <i class="fas fa-expand"></i>
            </button>
        `;
        modelViewerDestroyed.appendChild(controls);
        
        document.getElementById('resetViewBtn').addEventListener('click', () => {
            modelElement.cameraOrbit = '0deg 75deg 105%';
            modelElement.cameraTarget = '0m 0m 0m';
        });
        
        document.getElementById('toggleRotateBtn').addEventListener('click', (e) => {
            modelElement.autoRotate = !modelElement.autoRotate;
            e.currentTarget.classList.toggle('active');
        });
        
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            if (modelViewerDestroyed.requestFullscreen) {
                modelViewerDestroyed.requestFullscreen();
            } else if (modelViewerDestroyed.webkitRequestFullscreen) {
                modelViewerDestroyed.webkitRequestFullscreen();
            }
        });
    }, 500);
}

function updateGallery(images) {
    const imageGalleryDestroyed = document.getElementById('imageGalleryDestroyed');
    const frameFilter = document.getElementById('frameFilter');
    
    imageGalleryDestroyed.innerHTML = '';
    if (frameFilter) {
        frameFilter.innerHTML = '<option value="All">All Images</option>';
    }
    
    if (images.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'gallery-empty-state';
        emptyState.innerHTML = `
            <i class="fas fa-image gallery-empty-icon"></i>
            <p>No images uploaded yet</p>
        `;
        imageGalleryDestroyed.appendChild(emptyState);
        return;
    }
    
    images.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        
        const imagePath = `/uploads/${sessionId}/images/${image}`;
        
        const img = document.createElement('img');
        img.src = imagePath;
        img.alt = `Image ${index + 1}`;
        img.loading = 'lazy';
        
        img.onerror = function() {
            this.src = '/static/img/image-error.png'
            this.alt = 'Image failed to load';
        };
        
        item.addEventListener('click', function() {
            document.querySelectorAll('.gallery-item').forEach(el => el.classList.remove('selected'));
            this.classList.add('selected');
            
            generateRestoredImage(imagePath);
            
            if (frameFilter) {
                frameFilter.value = `${index}: ${image}`;
                
                if (modelFiles.length > 0 && !processingStatus) {
                    frameFilter.dispatchEvent(new Event('change'));
                }
            }
        });
        
        item.appendChild(img);
        imageGalleryDestroyed.appendChild(item);
        
        if (frameFilter) {
            const option = document.createElement('option');
            option.value = `${index}: ${image}`;
            option.textContent = `Image ${index + 1}`;
            frameFilter.appendChild(option);
        }
    });
    
    if (images.length > 0) {
        const firstItem = imageGalleryDestroyed.querySelector('.gallery-item');
        if (firstItem) {
            firstItem.click();
        }
    }
}

function resetUI() {
    document.getElementById('videoUpload').value = '';
    document.getElementById('imageUpload').value = '';
    
    if (document.getElementById('detailLevel')) {
        document.getElementById('detailLevel').value = 50;
        document.getElementById('detailValue').textContent = '50%';
    }
    
    if (document.getElementById('frameFilter')) {
        document.getElementById('frameFilter').innerHTML = '<option value="All">All Images</option>';
    }
    
    const imageGalleryDestroyed = document.getElementById('imageGalleryDestroyed');
    imageGalleryDestroyed.innerHTML = `
        <div class="gallery-empty-state">
            <i class="fas fa-image gallery-empty-icon"></i>
            <p>Destroyed images will appear here</p>
        </div>
    `;
    
    const imageGalleryRestored = document.getElementById('imageGalleryRestored');
    imageGalleryRestored.innerHTML = `
        <div class="gallery-empty-state">
            <i class="fas fa-image gallery-empty-icon"></i>
            <p>Restored images will appear here</p>
        </div>
    `;
    
    const modelViewerDestroyed = document.getElementById('modelViewerDestroyed');
    modelViewerDestroyed.innerHTML = `
        <div class="placeholder-content">
            <i class="fas fa-cube placeholder-icon"></i>
            <p>Destroyed 3D model will appear here</p>
        </div>
    `;
    
    const modelViewerRestored = document.getElementById('modelViewerRestored');
    modelViewerRestored.innerHTML = `
        <div class="placeholder-content">
            <i class="fas fa-cube placeholder-icon"></i>
            <p>Restored 3D model will appear here</p>
        </div>
    `;
    
    showStatus('Upload images of the ecosystem, then click Reconstruct.', 'info');
    
    document.getElementById('reconstructBtn').disabled = true;
    document.getElementById('downloadBtn').disabled = true;
    
    sessionId = null;
    modelFiles = [];
    processingStatus = false;
}

document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        .selected {
            border: 2px solid var(--primary);
            transform: scale(1.02);
        }
        
        .image-count-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: var(--primary);
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }
        
        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--gray-600);
        }
        
        .loading-container p {
            margin-top: 1rem;
        }
        
        .model-controls {
            position: absolute;
            bottom: 16px;
            right: 16px;
            display: flex;
            gap: 8px;
            z-index: 10;
        }
        
        .model-controls .btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(255, 255, 255, 0.8);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .model-controls .btn:hover {
            background-color: white;
        }
        
        .model-controls .btn.active {
            background-color: var(--primary);
            color: white;
        }
        
        .processing .card {
            opacity: 0.7;
            pointer-events: none;
        }
        
        .processing .btn:not(:disabled) {
            pointer-events: auto;
        }
    `;
    document.head.appendChild(style);
});

function generateRestoredImage(originalImageUrl) {
    const apiKey = '2xna4OHs9j7rgNDNOjJ3LPdMHHK6bhM9sddPib60V7irbctXVgqynM5llNMC';
    const prompt = "How would this destroyed ecosystem look if it were restored. Please generate a complete image";
    
    showStatus('Generating restored ecosystem image...', 'info');
    
    fetch('https://api.modelslab.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            prompt: prompt,
            image: originalImageUrl,
            n: 1,
            size: '1024x1024',
            response_format: 'url'
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.data && data.data.length > 0 && data.data[0].url) {
            const restoredImageUrl = data.data[0].url;
            
            // Display the restored image
            displayRestoredImage(restoredImageUrl);
            
            // Generate and display the 3D model for the restored image
            generateRestoredModel(restoredImageUrl);
            
            showStatus('Restoration complete!', 'success');
        } else {
            throw new Error('No image data received from API');
        }
    })
    .catch(error => {
        console.error('Error generating restored image:', error);
        showStatus('Failed to generate restored image. Please try again.', 'danger');
    });
}

function displayRestoredImage(imageUrl) {
    const imageGalleryRestored = document.getElementById('imageGalleryRestored');
    
    // Clear previous content
    imageGalleryRestored.innerHTML = '';
    
    // Create gallery item
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Restored Ecosystem';
    img.loading = 'lazy';
    
    img.onerror = function() {
        console.error(`Failed to load restored image: ${imageUrl}`);
        this.src = '/static/img/image-error.png';
        this.alt = 'Image failed to load';
    };
    
    item.appendChild(img);
    imageGalleryRestored.appendChild(item);
}

function generateRestoredModel(restoredImageUrl) {
    const modelViewerRestored = document.getElementById('modelViewerRestored');
    
    modelViewerRestored.innerHTML = `
        <div class="loading-container">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p>Generating 3D model from restored image...</p>
        </div>
    `;
    
    // Call API to generate 3D model from the restored image
    fetch('https://api.modelslab.com/v1/models/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer 2xna4OHs9j7rgNDNOjJ3LPdMHHK6bhM9sddPib60V7irbctXVgqynM5llNMC`
        },
        body: JSON.stringify({
            prompt: "Create a detailed 3D model of this restored ecosystem",
            image: restoredImageUrl,
            format: 'glb'
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.model_url) {
            // Create model-viewer element
            const modelElement = document.createElement('model-viewer');
            modelElement.src = data.model_url;
            modelElement.alt = 'Restored 3D Ecosystem Model';
            modelElement.setAttribute('auto-rotate', '');
            modelElement.setAttribute('camera-controls', '');
            modelElement.setAttribute('environment-image', 'neutral');
            modelElement.setAttribute('shadow-intensity', '1');
            
            modelViewerRestored.innerHTML = '';
            modelViewerRestored.appendChild(modelElement);
            
            const controls = document.createElement('div');
            controls.className = 'model-controls';
            controls.innerHTML = `
                <button class="btn btn-sm btn-light" id="resetViewBtnRestored">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button class="btn btn-sm btn-light" id="toggleRotateBtnRestored">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="btn btn-sm btn-light" id="fullscreenBtnRestored">
                    <i class="fas fa-expand"></i>
                </button>
            `;
            modelViewerRestored.appendChild(controls);
            
            // Add control event listeners
            document.getElementById('resetViewBtnRestored').addEventListener('click', () => {
                modelElement.cameraOrbit = '0deg 75deg 105%';
                modelElement.cameraTarget = '0m 0m 0m';
            });
            
            document.getElementById('toggleRotateBtnRestored').addEventListener('click', (e) => {
                modelElement.autoRotate = !modelElement.autoRotate;
                e.currentTarget.classList.toggle('active');
            });
            
            document.getElementById('fullscreenBtnRestored').addEventListener('click', () => {
                if (modelViewerRestored.requestFullscreen) {
                    modelViewerRestored.requestFullscreen();
                } else if (modelViewerRestored.webkitRequestFullscreen) {
                    modelViewerRestored.webkitRequestFullscreen();
                }
            });
        } else {
            throw new Error('No model URL received from API');
        }
    })
    .catch(error => {
        console.error('Error generating restored 3D model:', error);
        modelViewerRestored.innerHTML = `
            <div class="placeholder-content">
                <i class="fas fa-exclamation-circle placeholder-icon text-danger"></i>
                <p>Failed to generate restored 3D model</p>
            </div>
        `;
    });
}