import os
import cv2
import torch
import numpy as np
import glob
import gc
import time
import shutil
from datetime import datetime
import sys

sys.path.append("vggt/")

from vggt.visual_util import predictions_to_glb
from vggt.utils.load_fn import load_and_preprocess_images
from vggt.utils.pose_enc import pose_encoding_to_extri_intri
from vggt.utils.geometry import unproject_depth_map_to_point_map

def handle_uploads(video_file, image_files, session_dir):
    start_time = time.time()
    gc.collect()
    
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    target_dir = session_dir
    target_dir_images = os.path.join(target_dir, "images")
    os.makedirs(target_dir_images, exist_ok=True)
    
    image_paths = []
    
    if image_files:
        for file in image_files:
            if file.filename:
                file_path = os.path.join(target_dir_images, file.filename)
                file.save(file_path)
                image_paths.append(file_path)
    
    if video_file and video_file.filename:
        video_path = os.path.join(target_dir, video_file.filename)
        video_file.save(video_path)
        
        vs = cv2.VideoCapture(video_path)
        fps = vs.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps * 1)
        
        count = 0
        video_frame_num = 0
        while True:
            gotit, frame = vs.read()
            if not gotit:
                break
            count += 1
            if count % frame_interval == 0:
                image_path = os.path.join(target_dir_images, f"{video_frame_num:06}.png")
                cv2.imwrite(image_path, frame)
                image_paths.append(image_path)
                video_frame_num += 1
        
        vs.release()
    
    image_paths = sorted(image_paths)
    
    end_time = time.time()
    print(f"Files processed in {target_dir_images}; took {end_time - start_time:.3f} seconds")
    return target_dir, image_paths

def run_model(target_dir, model, device) -> dict:
    print(f"Processing ecosystem images from {target_dir}")
    
    model = model.to(device)
    model.eval()
    
    image_names = glob.glob(os.path.join(target_dir, "images", "*"))
    image_names = sorted(image_names)
    print(f"Found {len(image_names)} ecosystem images")
    
    if len(image_names) == 0:
        raise ValueError("No images found. Please upload images of the ecosystem.")
    
    images = load_and_preprocess_images(image_names).to(device)
    print(f"Preprocessed images shape: {images.shape}")
    
    print("Running ecosystem reconstruction...")
    with torch.no_grad():
        if device == "cuda":
            with torch.cuda.amp.autocast(dtype=torch.bfloat16):
                predictions = model(images)
        else:
            predictions = model(images)
    
    print("Converting pose encoding to extrinsic and intrinsic matrices...")
    extrinsic, intrinsic = pose_encoding_to_extri_intri(predictions["pose_enc"], images.shape[-2:])
    predictions["extrinsic"] = extrinsic
    predictions["intrinsic"] = intrinsic
    
    for key in predictions.keys():
        if isinstance(predictions[key], torch.Tensor):
            predictions[key] = predictions[key].cpu().numpy().squeeze(0)
    
    print("Computing ecosystem terrain from depth map...")
    depth_map = predictions["depth"]
    world_points = unproject_depth_map_to_point_map(depth_map, predictions["extrinsic"], predictions["intrinsic"])
    predictions["world_points_from_depth"] = world_points
    
    if device == "cuda":
        torch.cuda.empty_cache()
    
    return predictions

def process_reconstruction(target_dir, predictions, params):
    prediction_save_path = os.path.join(target_dir, "predictions.npz")
    np.savez(prediction_save_path, **predictions)
    
    conf_thres = params.get('conf_thres', 50.0)
    frame_filter = params.get('frame_filter', 'All')
    mask_black_bg = params.get('mask_black_bg', False)
    mask_white_bg = params.get('mask_white_bg', False)
    show_cam = params.get('show_cam', True)
    mask_sky = params.get('mask_sky', False)
    prediction_mode = params.get('prediction_mode', 'Pointmap Regression')
    export_format = params.get('export_format', 'GLB')
    
    glbfile = os.path.join(
        target_dir,
        f"ecosystem_model_{conf_thres}_{frame_filter.replace('.', '_').replace(':', '').replace(' ', '_')}.glb",
    )
    
    glbscene = predictions_to_glb(
        predictions,
        conf_thres=conf_thres,
        filter_by_frames=frame_filter,
        mask_black_bg=mask_black_bg,
        mask_white_bg=mask_white_bg,
        show_cam=show_cam,
        mask_sky=mask_sky,
        target_dir=target_dir,
        prediction_mode=prediction_mode,
    )
    glbscene.export(file_obj=glbfile)
    
    result_files = [glbfile]
    
    if export_format != "GLB":
        try:
            import trimesh
            mesh = trimesh.load(glbfile)
            
            if export_format == "OBJ":
                objfile = os.path.join(target_dir, f"ecosystem_model_{conf_thres}.obj")
                mesh.export(objfile)
                result_files.append(objfile)
            elif export_format == "STL":
                stlfile = os.path.join(target_dir, f"ecosystem_model_{conf_thres}.stl")
                mesh.export(stlfile)
                result_files.append(stlfile)
        except Exception as e:
            print(f"Error exporting to {export_format}: {e}")
    
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    return result_files

def get_available_formats():
    formats = ["GLB"]
    
    try:
        import trimesh
        formats.extend(["OBJ", "STL"])
    except ImportError:
        pass
    
    return formats