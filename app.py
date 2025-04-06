import os
import cv2
import torch
import numpy as np
import sys
import shutil
from datetime import datetime
import glob
import gc
import time
import json
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
import uuid

sys.path.append("vggt/")

from utils.processing import (
    handle_uploads, 
    run_model, 
    process_reconstruction,
    get_available_formats
)
from vggt.models.vggt import VGGT

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Initializing and loading VGGT model on {device}...")

model = VGGT()
_URL = "https://huggingface.co/facebook/VGGT-1B/resolve/main/model.pt"
model.load_state_dict(torch.hub.load_state_dict_from_url(_URL))
model.eval()

sessions = {}

@app.route('/')
def index():
    return render_template('index.html', export_formats=get_available_formats())

@app.route('/upload', methods=['POST'])
def upload():
    session_id = str(uuid.uuid4())
    
    video_file = request.files.get('video')
    image_files = request.files.getlist('images')
    
    if not video_file and not image_files:
        return jsonify({'error': 'No files uploaded'}), 400
    
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    target_dir, image_paths = handle_uploads(video_file, image_files, session_dir)
    
    sessions[session_id] = {
        'target_dir': target_dir,
        'image_paths': image_paths,
        'timestamp': datetime.now().isoformat()
    }
    
    return jsonify({
        'session_id': session_id,
        'image_count': len(image_paths),
        'images': [os.path.basename(p) for p in image_paths]
    })

@app.route('/reconstruct', methods=['POST'])
def reconstruct():
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    params = {
        'conf_thres': float(data.get('conf_thres', 50.0)),
        'frame_filter': data.get('frame_filter', 'All'),
        'mask_black_bg': data.get('mask_black_bg', False),
        'mask_white_bg': data.get('mask_white_bg', False),
        'show_cam': data.get('show_cam', True),
        'mask_sky': data.get('mask_sky', False),
        'prediction_mode': data.get('prediction_mode', 'Pointmap Regression'),
        'export_format': data.get('export_format', 'GLB')
    }
    
    target_dir = sessions[session_id]['target_dir']
    
    try:
        predictions = run_model(target_dir, model, device)
        
        result_files = process_reconstruction(target_dir, predictions, params)
        
        sessions[session_id]['result_files'] = result_files
        
        return jsonify({
            'success': True,
            'message': 'Reconstruction complete',
            'files': result_files
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<session_id>/<filename>')
def download_file(session_id, filename):
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    target_dir = sessions[session_id]['target_dir']
    file_path = os.path.join(target_dir, filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(file_path, as_attachment=True)

@app.route('/view/<session_id>/<filename>')
def view_model(session_id, filename):
    if session_id not in sessions:
        return redirect(url_for('index'))
    
    target_dir = sessions[session_id]['target_dir']
    file_path = os.path.join(target_dir, filename)
    
    if not os.path.exists(file_path):
        return redirect(url_for('index'))
    
    rel_path = os.path.join('uploads', session_id, filename)
    
    return render_template('viewer.html', model_path=rel_path)

@app.route('/gallery/<session_id>')
def get_gallery(session_id):
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    image_paths = sessions[session_id]['image_paths']
    images = []
    
    for path in image_paths:
        rel_path = os.path.relpath(path, app.config['UPLOAD_FOLDER'])
        images.append(url_for('static', filename=f'uploads/{rel_path}'))
    
    return jsonify({'images': images})

@app.route('/cleanup', methods=['POST'])
def cleanup_session():
    data = request.json
    session_id = data.get('session_id')
    
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    target_dir = sessions[session_id]['target_dir']
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    
    del sessions[session_id]
    
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    return jsonify({'success': True})

@app.route('/static/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/uploads/<session_id>/images/<filename>')
def serve_uploaded_image(session_id, filename):
    image_path = os.path.join(app.config['UPLOAD_FOLDER'], session_id, 'images')
    return send_from_directory(image_path, filename)

@app.route('/uploads/<session_id>/<filename>')
def serve_uploaded_file(session_id, filename):
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    return send_from_directory(file_path, filename)

if __name__ == '__main__':
    app.run(debug=True)