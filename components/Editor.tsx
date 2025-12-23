import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ToolType, Annotation, Point, PRESET_BACKGROUNDS, BackgroundConfig } from '../types';
import { extractTextFromImage, explainImage } from '../services/geminiService';
import { IconArrow, IconCheck, IconCopy, IconCrop, IconCursor, IconDownload, IconEyeOff, IconPen, IconRedo, IconSparkles, IconSquare, IconType, IconUndo, IconX } from './Icons';

interface EditorProps {
  imageSrc: string;
  onClose: () => void;
  onSave?: (imageData: string) => Promise<void> | void;
  onCopy?: (imageData: string) => Promise<void> | void;
}

const Editor: React.FC<EditorProps> = ({ imageSrc, onClose, onSave, onCopy }) => {
  // --- State ---
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentTool, setCurrentTool] = useState<ToolType>(ToolType.SELECT);
  const [currentColor, setCurrentColor] = useState<string>('#ef4444'); // Default red
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState<number>(4);
  const [bgConfig, setBgConfig] = useState<BackgroundConfig>({
    type: 'gradient',
    value: PRESET_BACKGROUNDS[0].value,
    padding: 60,
    shadow: true,
    inset: 1,
  });
  
  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [selection, setSelection] = useState<string | null>(null); // ID of selected annotation
  const [isDragging, setIsDragging] = useState(false); // For dragging text annotations
  const [dragOffset, setDragOffset] = useState<Point | null>(null); // Offset when dragging starts
  
  // History State for undo/redo
  const [history, setHistory] = useState<Annotation[][]>([]); // History stack
  const [historyIndex, setHistoryIndex] = useState<number>(-1); // Current position in history
  const isUndoRedoRef = useRef<boolean>(false); // Flag to prevent saving history during undo/redo
  
  // AI State
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<{type: 'text' | 'desc', content: string} | null>(null);
  
  // Text Input State - inline editing
  const [editingText, setEditingText] = useState<{id: string; point: Point; text: string; color: string; fontSize: number} | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [textFontSize, setTextFontSize] = useState<number>(24); // Font size for text tool

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());
  const containerRef = useRef<HTMLDivElement>(null);
  const originalAnnotationRef = useRef<Annotation | null>(null); // Store original annotation when editing starts

  // --- Initialization ---
  useEffect(() => {
    imageRef.current.src = imageSrc;
    imageRef.current.onload = () => {
      drawCanvas();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  useEffect(() => {
    drawCanvas();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, currentAnnotation, bgConfig, selection, editingText]);

  // Save to history when annotations change (but not during undo/redo or dragging)
  useEffect(() => {
    // Skip if this is an undo/redo operation
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    
    // Skip if dragging (will save when drag ends)
    if (isDragging) return;
    
    // Skip if history is empty (initial state)
    if (history.length === 0 && annotations.length === 0) return;
    
    // Save current state to history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(annotations))); // Deep copy
    // Limit history to 50 steps
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistoryIndex(newHistory.length - 1);
    setHistory(newHistory);
  }, [annotations]); // Only depend on annotations

  // Handle keyboard events for deletion and undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace/Undo/Redo when not editing text (to avoid interfering with text input)
      if (editingText) return;
      
      // Handle Delete or Backspace key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // If a text annotation is selected, delete it
        if (selection) {
          const selectedAnn = annotations.find(a => a.id === selection);
          if (selectedAnn && selectedAnn.type === ToolType.TEXT) {
            console.log('[TEXT EDIT] Deleting selected text annotation:', selectedAnn);
            e.preventDefault();
            setAnnotations(prev => prev.filter(a => a.id !== selection));
            setSelection(null);
          }
        }
      }
      
      // Handle Undo (Cmd/Ctrl+Z)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0 && history.length > 0) {
          isUndoRedoRef.current = true;
          const prevState = history[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          setAnnotations(JSON.parse(JSON.stringify(prevState))); // Deep copy
          console.log('[HISTORY] Undo to index:', historyIndex - 1);
        }
      }
      
      // Handle Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (historyIndex < history.length - 1 && history.length > 0) {
          isUndoRedoRef.current = true;
          const nextState = history[historyIndex + 1];
          setHistoryIndex(historyIndex + 1);
          setAnnotations(JSON.parse(JSON.stringify(nextState))); // Deep copy
          console.log('[HISTORY] Redo to index:', historyIndex + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selection, annotations, editingText, history, historyIndex]);

  // Create and manage text input element in DOM
  useEffect(() => {
    if (!editingText) {
      console.log('[TEXT EDIT] editingText cleared, checking for restore...');
      // Remove input if editingText is cleared
      const existingInput = document.getElementById('inline-text-input-container');
      if (existingInput) {
        console.log('[TEXT EDIT] Removing input element from DOM');
        existingInput.remove();
      }
      // Restore original annotation if editing was cancelled without saving
      if (originalAnnotationRef.current) {
        console.log('[TEXT EDIT] Found originalAnnotationRef:', originalAnnotationRef.current);
        // Check if the annotation still exists (if not, restore it)
        const exists = annotations.some(a => a.id === originalAnnotationRef.current!.id);
        console.log('[TEXT EDIT] Annotation exists in annotations?', exists);
        console.log('[TEXT EDIT] Current annotations:', annotations.map(a => ({ id: a.id, type: a.type })));
        if (!exists) {
          console.log('[TEXT EDIT] Restoring original annotation:', originalAnnotationRef.current);
          setAnnotations(prev => {
            console.log('[TEXT EDIT] Before restore, prev annotations:', prev.map(a => ({ id: a.id, type: a.type })));
            const restored = [...prev, originalAnnotationRef.current!];
            console.log('[TEXT EDIT] After restore, new annotations:', restored.map(a => ({ id: a.id, type: a.type })));
            return restored;
          });
        } else {
          console.log('[TEXT EDIT] Annotation already exists, skipping restore');
        }
        originalAnnotationRef.current = null;
      } else {
        console.log('[TEXT EDIT] No originalAnnotationRef to restore');
      }
      return;
    }

    // Check if input already exists - if so, just update its value and position
    const existingContainer = document.getElementById('inline-text-input-container');
    if (existingContainer) {
      const existingInput = existingContainer.querySelector('input') as HTMLInputElement;
      if (existingInput) {
        // Update value if it changed
        if (existingInput.value !== editingText.text) {
          existingInput.value = editingText.text;
        }
        // Update position if needed
        const canvasPos = getCanvasViewportPosition();
        if (canvasPos) {
          const scaleX = canvasPos.width / canvasPos.canvasWidth;
          const scaleY = canvasPos.height / canvasPos.canvasHeight;
          const viewportX = canvasPos.left + (editingText.point.x + bgConfig.padding) * scaleX;
          const viewportY = canvasPos.top + (editingText.point.y + bgConfig.padding) * scaleY;
          existingContainer.style.left = `${viewportX}px`;
          existingContainer.style.top = `${viewportY}px`;
        }
        return; // Don't recreate, just update
      }
    }

    const canvasPos = getCanvasViewportPosition();
    if (!canvasPos) {
      console.log('Canvas position not available');
      return;
    }

    // Calculate scale factor
    const scaleX = canvasPos.width / canvasPos.canvasWidth;
    const scaleY = canvasPos.height / canvasPos.canvasHeight;
    
    // Convert canvas coordinates to viewport coordinates
    const viewportX = canvasPos.left + (editingText.point.x + bgConfig.padding) * scaleX;
    const viewportY = canvasPos.top + (editingText.point.y + bgConfig.padding) * scaleY;

    console.log('Creating text input at position:', { viewportX, viewportY, point: editingText.point });

    // Remove existing input if any (shouldn't happen, but just in case)
    if (existingContainer) {
      existingContainer.remove();
    }

    // Create container div
    const container = document.createElement('div');
    container.id = 'inline-text-input-container';
    container.style.position = 'fixed';
    container.style.left = `${viewportX}px`;
    container.style.top = `${viewportY}px`;
    container.style.zIndex = '2147483647';
    container.style.pointerEvents = 'auto';
    container.style.backgroundColor = '#1e293b';
    container.style.padding = '8px 12px';
    container.style.borderRadius = '8px';
    container.style.border = '2px solid #3b82f6';
    container.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.8)';
    container.style.minWidth = '200px';
    container.style.display = 'block';

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = editingText.text;
    input.placeholder = 'Type text...';
    input.style.color = editingText.color;
    input.style.fontSize = `${editingText.fontSize}px`;
    input.style.fontFamily = 'Inter, sans-serif';
    input.style.minWidth = '180px';
    input.style.width = '100%';
    input.style.height = 'auto';
    input.style.minHeight = `${editingText.fontSize * 1.2}px`;
    input.style.backgroundColor = 'transparent';
    input.style.textShadow = '0 0 3px rgba(0,0,0,0.8)';
    input.style.caretColor = editingText.color;
    input.style.lineHeight = '1.2';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.display = 'block';
    input.style.boxSizing = 'border-box';

    // Set ref
    (textInputRef as any).current = input;

    // Store current editingText in closure to avoid stale closure
    // IMPORTANT: Always use originalAnnotationRef.current.id if it exists, otherwise use editingText.id
    let currentText = editingText.text;
    let currentEditingText = editingText;
    // Capture the correct ID: use original annotation ID if editing existing text
    const correctId = originalAnnotationRef.current ? originalAnnotationRef.current.id : editingText.id;
    console.log('[TEXT EDIT] useEffect - editingText.id:', editingText.id, 'originalAnnotationRef.current?.id:', originalAnnotationRef.current?.id, 'correctId:', correctId);

    // Add event listeners
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      currentText = target.value;
      // Update state without closing the input, but preserve the correct ID
      const updatedEditingText = { ...currentEditingText, text: target.value, id: correctId };
      setEditingText(updatedEditingText);
      currentEditingText = updatedEditingText;
    };

    const handleBlur = () => {
      console.log('[TEXT EDIT] handleBlur called');
      console.log('[TEXT EDIT] currentText:', currentText);
      console.log('[TEXT EDIT] currentEditingText:', currentEditingText);
      console.log('[TEXT EDIT] originalAnnotationRef.current:', originalAnnotationRef.current);
      console.log('[TEXT EDIT] correctId:', correctId);
      
      const wasEditing = originalAnnotationRef.current !== null;
      const originalAnn = originalAnnotationRef.current;
      
      // Only save if there's text
      if (currentText.trim()) {
        console.log('[TEXT EDIT] Saving text annotation');
        
        // ALWAYS use original annotation ID if editing existing text, otherwise use correctId
        const annotationId = originalAnn ? originalAnn.id : correctId;
        console.log('[TEXT EDIT] Using annotation ID:', annotationId, '(originalAnn:', originalAnn?.id, ', correctId:', correctId, ', currentEditingText:', currentEditingText.id, ')');
        
        // Clear the ref since we're saving (not cancelling)
        originalAnnotationRef.current = null;
        
        const newAnn: Annotation = {
          id: annotationId, // Use original ID if editing, or new ID if creating
          type: ToolType.TEXT,
          startPoint: currentEditingText.point,
          text: currentText.trim(),
          color: currentEditingText.color,
          strokeWidth: Math.round(currentEditingText.fontSize / 6),
        };
        (newAnn as any).fontSize = currentEditingText.fontSize;
        // Check if this is updating an existing annotation (same ID)
        setAnnotations(prev => {
          // Remove old annotation with same ID if exists, then add new one
          const filtered = prev.filter(a => a.id !== annotationId);
          console.log('[TEXT EDIT] Filtered annotations (removed id:', annotationId, '), remaining:', filtered.map(a => ({ id: a.id, type: a.type })));
          console.log('[TEXT EDIT] Adding new annotation:', newAnn);
          return [...filtered, newAnn];
        });
      } else {
        console.log('[TEXT EDIT] No text to save, wasEditing:', wasEditing);
        if (wasEditing && originalAnn) {
          // If editing existing text but no text entered, delete the annotation (user deleted all text)
          console.log('[TEXT EDIT] Empty text after editing - deleting annotation:', originalAnn);
          // Delete the annotation instead of restoring it
          setAnnotations(prev => prev.filter(a => a.id !== originalAnn.id));
          // Clear ref after deleting
          originalAnnotationRef.current = null;
        } else {
          console.log('[TEXT EDIT] Not restoring - wasEditing:', wasEditing, 'originalAnn:', originalAnn);
          // Keep ref for useEffect cleanup to handle (in case blur happens before state updates)
        }
      }
      setEditingText(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[TEXT EDIT] Enter pressed, blurring input');
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        console.log('[TEXT EDIT] Escape pressed, cancelling edit');
        // Cancel editing - restore original annotation
        if (originalAnnotationRef.current) {
          console.log('[TEXT EDIT] Restoring original annotation on Escape:', originalAnnotationRef.current);
          setAnnotations(prev => {
            const filtered = prev.filter(a => a.id !== originalAnnotationRef.current!.id);
            const restored = [...filtered, originalAnnotationRef.current!];
            console.log('[TEXT EDIT] Restored annotations:', restored.map(a => ({ id: a.id, type: a.type })));
            return restored;
          });
          originalAnnotationRef.current = null;
        }
        setEditingText(null);
      }
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('keydown', handleKeyDown);

    container.appendChild(input);
    document.body.appendChild(container);

    console.log('Text input container added to DOM:', container);
    console.log('Container in body?', document.body.contains(container));
    console.log('Input element:', input);

    // Focus input
    setTimeout(() => {
      input.focus();
      input.select();
      console.log('Input focused:', input === document.activeElement);
      console.log('Input visible?', input.offsetWidth > 0 && input.offsetHeight > 0);
    }, 50);

    // Cleanup
    return () => {
      // Remove event listeners before cleanup
      input.removeEventListener('input', handleInput);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('keydown', handleKeyDown);
      if (container.parentNode) {
        container.remove();
      }
      (textInputRef as any).current = null;
    };
  }, [editingText?.id, editingText?.point.x, editingText?.point.y, editingText?.color, editingText?.fontSize, bgConfig.padding]); // Only recreate when position/ID/color/size changes, not when text changes

  // Update text input position when canvas moves or resizes
  useEffect(() => {
    if (!editingText) return;
    
    const handleResize = () => {
      // Force re-render to update position, but preserve the correct ID
      const correctId = originalAnnotationRef.current ? originalAnnotationRef.current.id : editingText.id;
      setEditingText({ ...editingText, id: correctId });
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [editingText]);

  // --- Drawing Logic ---
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Setup Size
    // We want the canvas to be large enough for the padding
    const baseWidth = imageRef.current.naturalWidth;
    const baseHeight = imageRef.current.naturalHeight;
    const totalWidth = baseWidth + (bgConfig.padding * 2);
    const totalHeight = baseHeight + (bgConfig.padding * 2);

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    // 2. Draw Background
    if (bgConfig.type === 'transparent') {
      ctx.clearRect(0, 0, totalWidth, totalHeight);
    } else {
      if (bgConfig.value.startsWith('linear-gradient')) {
        const gradient = ctx.createLinearGradient(0, 0, totalWidth, totalHeight);
        // Simplistic gradient parser for demo (just taking the preset values)
        // In a real app we'd parse the string properly. 
        // Here we map known presets to canvas gradients manually or just fill rect.
        // Actually, canvas createLinearGradient is complex to map from CSS string.
        // Quick hack: Use a hidden div to compute colors or just hardcode preset logic.
        // Let's keep it simple: if it's our preset, we manually reconstruct.
        if (bgConfig.value.includes('#e0e7ff')) { // Clean
            gradient.addColorStop(0, '#e0e7ff'); gradient.addColorStop(1, '#cffafe');
        } else if (bgConfig.value.includes('#1e293b')) { // Midnight
            gradient.addColorStop(0, '#1e293b'); gradient.addColorStop(1, '#0f172a');
        } else if (bgConfig.value.includes('#f6d365')) { // Sunset
            gradient.addColorStop(0, '#f6d365'); gradient.addColorStop(1, '#fda085');
        } else if (bgConfig.value.includes('#84fab0')) { // Neon
            gradient.addColorStop(0, '#84fab0'); gradient.addColorStop(1, '#8fd3f4');
        } else {
            gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#ffffff');
        }
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = bgConfig.value;
      }
      ctx.fillRect(0, 0, totalWidth, totalHeight);
    }

    // 3. Draw Shadow & Image
    const imgX = bgConfig.padding;
    const imgY = bgConfig.padding;
    
    if (bgConfig.shadow) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 15;
        // Draw a rect behind the image to cast shadow
        ctx.fillStyle = "black";
        ctx.fillRect(imgX, imgY, baseWidth, baseHeight);
        ctx.restore();
    }

    ctx.drawImage(imageRef.current, imgX, imgY, baseWidth, baseHeight);

    // 4. Draw Annotations (Relative to image position)
    ctx.translate(imgX, imgY);

    const allAnns = [...annotations, ...(currentAnnotation ? [currentAnnotation] : [])];

    allAnns.forEach(ann => {
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.type === ToolType.RECTANGLE && ann.startPoint && ann.endPoint) {
        const w = ann.endPoint.x - ann.startPoint.x;
        const h = ann.endPoint.y - ann.startPoint.y;
        ctx.strokeRect(ann.startPoint.x, ann.startPoint.y, w, h);
      } 
      else if (ann.type === ToolType.ARROW && ann.startPoint && ann.endPoint) {
        // Draw Line
        const headlen = ann.strokeWidth * 3; 
        const dx = ann.endPoint.x - ann.startPoint.x;
        const dy = ann.endPoint.y - ann.startPoint.y;
        const angle = Math.atan2(dy, dx);
        
        ctx.moveTo(ann.startPoint.x, ann.startPoint.y);
        ctx.lineTo(ann.endPoint.x, ann.endPoint.y);
        ctx.stroke();

        // Draw Arrowhead
        ctx.beginPath();
        ctx.moveTo(ann.endPoint.x, ann.endPoint.y);
        ctx.lineTo(ann.endPoint.x - headlen * Math.cos(angle - Math.PI / 6), ann.endPoint.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ann.endPoint.x - headlen * Math.cos(angle + Math.PI / 6), ann.endPoint.y - headlen * Math.sin(angle + Math.PI / 6));
        ctx.lineTo(ann.endPoint.x, ann.endPoint.y);
        ctx.fillStyle = ann.color;
        ctx.fill();
      }
      else if ((ann.type === ToolType.PEN || ann.type === ToolType.HIGHLIGHTER) && ann.points) {
        if (ann.type === ToolType.HIGHLIGHTER) {
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = ann.strokeWidth * 3; // Thicker for highlighter
        }
        if (ann.points.length > 0) {
            ctx.moveTo(ann.points[0].x, ann.points[0].y);
            for (let i = 1; i < ann.points.length; i++) {
                ctx.lineTo(ann.points[i].x, ann.points[i].y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }
      else if (ann.type === ToolType.COUNTER && ann.startPoint) {
         const radius = 12 + (ann.strokeWidth);
         ctx.fillStyle = ann.color;
         ctx.beginPath();
         ctx.arc(ann.startPoint.x, ann.startPoint.y, radius, 0, Math.PI * 2);
         ctx.fill();
         
         ctx.fillStyle = '#ffffff';
         ctx.font = `bold ${radius * 1.2}px Inter, sans-serif`;
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(ann.number?.toString() || '1', ann.startPoint.x, ann.startPoint.y + 1);
         
         // Little drop shadow for the counter
         ctx.shadowColor = "rgba(0,0,0,0.2)";
         ctx.shadowBlur = 4;
      }
      else if (ann.type === ToolType.PIXELATE && ann.startPoint && ann.endPoint) {
         // Pixelate Logic
         const x = Math.min(ann.startPoint.x, ann.endPoint.x);
         const y = Math.min(ann.startPoint.y, ann.endPoint.y);
         const w = Math.abs(ann.endPoint.x - ann.startPoint.x);
         const h = Math.abs(ann.endPoint.y - ann.startPoint.y);
         
         if (w > 0 && h > 0) {
            const pixelSize = 10;
            // We need to sample from the original image at this location
            // Since we are translated, coords match image coords
            // Draw mini rectangles
            for (let px = x; px < x + w; px += pixelSize) {
                for (let py = y; py < y + h; py += pixelSize) {
                    // Get color of center pixel of the block from ORIGINAL image
                    // This is computationally expensive in a loop if we use getImageData every time.
                    // Optimization: Clip the region and redraw it with a low-res version?
                    // Better visual trick: Just draw a blurred/colored rect for now to be performant
                    // Or actually implement it properly via offscreen canvas?
                    
                    // Simple "Redact" blur approach:
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    // For true pixelate we need raw data. 
                    // Let's assume standard 'Blur' behavior which is often just a mosaic.
                    // To keep it fast in React render loop, we'll draw a mosaic overlay.
                    // We can pick a color from the image if we had context access easily, but
                    // getImageData is slow. Let's do a simple specialized "Blur" fill.
                }
            }
            // Fallback: Gaussian Blur Rect
            ctx.save();
            ctx.filter = 'blur(8px)';
            ctx.drawImage(imageRef.current, x, y, w, h, x, y, w, h);
            ctx.restore();
            
            // Add a border to show it's an edit? No, clean look.
         }
      }
      else if (ann.type === ToolType.TEXT && ann.startPoint && ann.text) {
          // Use fontSize from annotation if available, otherwise use strokeWidth
          const fontSize = (ann as any).fontSize || ann.strokeWidth * 6;
          ctx.font = `${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = ann.color;
          ctx.textBaseline = 'top';
          ctx.fillText(ann.text, ann.startPoint.x, ann.startPoint.y);
          
          // Selection box if selected
          if (selection === ann.id) {
              const metrics = ctx.measureText(ann.text);
              const height = fontSize;
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(ann.startPoint.x - 4, ann.startPoint.y - 4, metrics.width + 8, height + 8);
              ctx.setLineDash([]);
          }
      }
    });
  };

  // --- Handlers ---

  const getRelativePoint = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    // Adjust for padding (we want coords relative to image 0,0)
    x -= bgConfig.padding;
    y -= bgConfig.padding;

    return { x, y };
  };

  // Get canvas position in viewport for text input positioning
  const getCanvasViewportPosition = () => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      canvasWidth: canvasRef.current.width,
      canvasHeight: canvasRef.current.height,
    };
  };

  // Check if click is on an existing text annotation
  const findTextAnnotationAtPoint = (pt: Point): Annotation | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Check all text annotations
    for (const ann of annotations) {
      if (ann.type === ToolType.TEXT && ann.startPoint && ann.text) {
        const fontSize = (ann as any).fontSize || ann.strokeWidth * 6;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        const metrics = ctx.measureText(ann.text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        // Check if point is within text bounds
        const textX = ann.startPoint.x;
        const textY = ann.startPoint.y;
        const textRight = textX + textWidth;
        const textBottom = textY + textHeight;

        if (pt.x >= textX - 5 && pt.x <= textRight + 5 && 
            pt.y >= textY - 5 && pt.y <= textBottom + 5) {
          return ann;
        }
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getRelativePoint(e);
    if (!pt) return;

    // If currently editing text and clicking elsewhere, handle the previous edit first
    if (editingText && originalAnnotationRef.current) {
      console.log('[TEXT EDIT] Clicking elsewhere while editing, restoring previous annotation');
      // Restore the previous annotation since user clicked away without saving
      const prevAnn = originalAnnotationRef.current;
      setAnnotations(prev => {
        const filtered = prev.filter(a => a.id !== prevAnn.id);
        return [...filtered, prevAnn];
      });
      originalAnnotationRef.current = null;
      setEditingText(null);
      // Continue to handle the new click below
    } else if (editingText) {
      // If editing new text (no originalAnnotationRef), just clear it
      console.log('[TEXT EDIT] Clicking elsewhere while creating new text, clearing editingText');
      setEditingText(null);
      // Continue to handle the new click below
    }

    // Check if clicking on existing text annotation (for editing or selecting)
    if (currentTool === ToolType.TEXT || currentTool === ToolType.SELECT) {
      const existingTextAnn = findTextAnnotationAtPoint(pt);
      if (existingTextAnn && existingTextAnn.text) {
        if (currentTool === ToolType.SELECT) {
          // Select tool: select for deletion or dragging
          console.log('[TEXT EDIT] Selected text annotation:', existingTextAnn);
          setSelection(existingTextAnn.id);
          // Start dragging
          setIsDragging(true);
          setDragOffset({
            x: pt.x - existingTextAnn.startPoint!.x,
            y: pt.y - existingTextAnn.startPoint!.y
          });
          setIsDrawing(false);
          return;
        } else {
          // Text tool: edit the annotation
          console.log('[TEXT EDIT] Clicked on existing text annotation:', existingTextAnn);
          // Store original annotation for potential restore
          originalAnnotationRef.current = { ...existingTextAnn };
          console.log('[TEXT EDIT] Stored original annotation in ref:', originalAnnotationRef.current);
          
          // Start editing existing text
          const fontSize = (existingTextAnn as any).fontSize || existingTextAnn.strokeWidth * 6;
          const editingTextData = {
            id: existingTextAnn.id, // Use same ID to update existing annotation
            point: existingTextAnn.startPoint!,
            text: existingTextAnn.text,
            color: existingTextAnn.color,
            fontSize: fontSize
          };
          console.log('[TEXT EDIT] Setting editingText with ID:', editingTextData.id, '(should match originalAnnotationRef:', originalAnnotationRef.current.id, ')');
          setEditingText(editingTextData);
          // Remove the old annotation temporarily (will be replaced when saved, or restored if cancelled)
          setAnnotations(prev => {
            const filtered = prev.filter(a => a.id !== existingTextAnn.id);
            console.log('[TEXT EDIT] Removed annotation, remaining:', filtered.map(a => ({ id: a.id, type: a.type })));
            return filtered;
          });
          setIsDrawing(false);
          setTimeout(() => {
            textInputRef.current?.focus();
            textInputRef.current?.select();
          }, 50);
          return;
        }
      }
    }

    if (currentTool === ToolType.SELECT) return;
    
    setIsDrawing(true);
    const id = Date.now().toString();

    if (currentTool === ToolType.COUNTER) {
        const count = annotations.filter(a => a.type === ToolType.COUNTER).length + 1;
        const newAnn: Annotation = {
            id, type: ToolType.COUNTER, startPoint: pt, color: currentColor, strokeWidth: currentStrokeWidth, number: count
        };
        setAnnotations(prev => [...prev, newAnn]);
        setIsDrawing(false); // Immediate placement
        return;
    }

    if (currentTool === ToolType.TEXT) {
        // Create inline text input at click position
        // Clear originalAnnotationRef since this is a new text, not editing existing one
        originalAnnotationRef.current = null;
        console.log('[TEXT EDIT] Creating new text, cleared originalAnnotationRef');
        
        const textId = Date.now().toString();
        setEditingText({
          id: textId,
          point: pt,
          text: '',
          color: currentColor,
          fontSize: textFontSize
        });
        setIsDrawing(false);
        // Focus input after render
        setTimeout(() => {
          textInputRef.current?.focus();
          textInputRef.current?.select();
        }, 50);
        return;
    }

    const newAnn: Annotation = {
      id,
      type: currentTool,
      startPoint: pt,
      endPoint: pt,
      points: [pt],
      color: currentColor,
      strokeWidth: currentStrokeWidth
    };
    setCurrentAnnotation(newAnn);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getRelativePoint(e);
    if (!pt) return;

    // Handle dragging text annotations
    if (isDragging && selection && dragOffset) {
      const selectedAnn = annotations.find(a => a.id === selection);
      if (selectedAnn && selectedAnn.type === ToolType.TEXT) {
        // Update annotation position
        const newPoint = {
          x: pt.x - dragOffset.x,
          y: pt.y - dragOffset.y
        };
        setAnnotations(prev => prev.map(ann => 
          ann.id === selection 
            ? { ...ann, startPoint: newPoint }
            : ann
        ));
        return;
      }
    }

    // Handle drawing annotations
    if (!isDrawing || !currentAnnotation) return;

    if (currentTool === ToolType.PEN || currentTool === ToolType.HIGHLIGHTER) {
        setCurrentAnnotation(prev => ({
            ...prev!,
            points: [...(prev!.points || []), pt]
        }));
    } else {
        setCurrentAnnotation(prev => ({
            ...prev!,
            endPoint: pt
        }));
    }
  };

  const handlePointerUp = () => {
    if (isDragging) {
      // End dragging
      setIsDragging(false);
      setDragOffset(null);
      return;
    }

    if (isDrawing && currentAnnotation) {
      setAnnotations(prev => [...prev, currentAnnotation]);
      setCurrentAnnotation(null);
    }
    setIsDrawing(false);
  };

  const handleExport = async (type: 'copy' | 'download') => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }

    try {
      // Ensure canvas is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const imageData = canvas.toDataURL('image/png');
      
      if (!imageData || imageData === 'data:,') {
        console.error('Failed to generate image data');
        alert('Failed to export image. Please try again.');
        return;
      }

      if (type === 'download') {
        if (onSave) {
          try {
            await onSave(imageData);
            // Show success feedback
            const button = document.querySelector('[data-save-button]') as HTMLElement;
            if (button) {
              const originalText = button.innerHTML;
              button.innerHTML = '<span class="text-green-400">✓ Saved!</span>';
              setTimeout(() => {
                button.innerHTML = originalText;
              }, 2000);
            }
          } catch (error) {
            console.error('Save failed:', error);
            alert('Failed to save image. Please try again.');
          }
        } else {
          // Fallback: direct download
          try {
            const link = document.createElement('a');
            link.download = `cleansnap-${Date.now()}.png`;
            link.href = imageData;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Show success feedback
            const button = document.querySelector('[data-save-button]') as HTMLElement;
            if (button) {
              const originalText = button.innerHTML;
              button.innerHTML = '<span class="text-green-400">✓ Saved!</span>';
              setTimeout(() => {
                button.innerHTML = originalText;
              }, 2000);
            }
          } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download image. Please try again.');
          }
        }
      } else {
        // Copy to clipboard
        if (onCopy) {
          try {
            await onCopy(imageData);
            // Show success feedback
            const button = document.querySelector('[data-copy-button]') as HTMLElement;
            if (button) {
              const originalText = button.innerHTML;
              button.innerHTML = '<span class="text-green-400">✓ Copied!</span>';
              setTimeout(() => {
                button.innerHTML = originalText;
              }, 2000);
            }
          } catch (error) {
            console.error('Copy failed:', error);
            alert('Failed to copy image. Please try again.');
          }
        } else {
          // Fallback: browser clipboard API
          try {
            canvas.toBlob(async (blob) => {
              if (blob) {
                try {
                  await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                  ]);
                  
                  // Show success feedback
                  const button = document.querySelector('[data-copy-button]') as HTMLElement;
                  if (button) {
                    const originalText = button.innerHTML;
                    button.innerHTML = '<span class="text-green-400">✓ Copied!</span>';
                    setTimeout(() => {
                      button.innerHTML = originalText;
                    }, 2000);
                  }
                } catch (err) {
                  console.error('Clipboard write failed:', err);
                  alert('Failed to copy to clipboard. Please try again.');
                }
              }
            }, 'image/png');
          } catch (error) {
            console.error('Copy failed:', error);
            alert('Failed to copy image. Please try again.');
          }
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export image. Please try again.');
    }
  };

  const handleAiAction = async (action: 'text' | 'desc') => {
    setIsAiProcessing(true);
    setAiResult(null);
    try {
        const base64 = imageRef.current.src; // Use original image for better OCR
        let text = "";
        if (action === 'text') {
            text = await extractTextFromImage(base64);
        } else {
            text = await explainImage(base64);
        }
        setAiResult({ type: action, content: text });
    } catch (e) {
        alert("AI processing failed. Check your API Key.");
    } finally {
        setIsAiProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-white">
      {/* Header / Toolbar */}
      <div className="h-16 border-b border-slate-700 bg-slate-900 flex items-center justify-between px-4 shrink-0 z-20 shadow-md">
         <div className="flex items-center space-x-2">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">CleanSnap</span>
         </div>

         {/* Tools */}
         <div className="flex items-center bg-slate-800 rounded-lg p-1 space-x-1 border border-slate-700">
             {[
                 { id: ToolType.SELECT, icon: <IconCursor className="w-4 h-4" />, label: '选择工具' },
                 { id: ToolType.RECTANGLE, icon: <IconSquare className="w-4 h-4" />, label: '矩形' },
                 { id: ToolType.ARROW, icon: <IconArrow className="w-4 h-4" />, label: '箭头' },
                 { id: ToolType.PEN, icon: <IconPen className="w-4 h-4" />, label: '画笔' },
                 { id: ToolType.TEXT, icon: <IconType className="w-4 h-4" />, label: '文字' },
                 { id: ToolType.COUNTER, icon: <span className="font-bold text-xs bg-white text-black rounded-full w-4 h-4 flex items-center justify-center">1</span>, label: '计数' },
                 { id: ToolType.PIXELATE, icon: <IconEyeOff className="w-4 h-4" />, label: '模糊' },
             ].map(tool => (
                 <button
                    key={tool.id}
                    onClick={() => setCurrentTool(tool.id)}
                    className={`p-2 rounded-md transition-all relative group ${currentTool === tool.id ? 'bg-blue-600 shadow-sm text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                    title={tool.label}
                 >
                     {tool.icon}
                     <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                         {tool.label}
                     </span>
                 </button>
             ))}
         </div>

         {/* Actions */}
         <div className="flex items-center space-x-3">
             <div className="flex items-center space-x-1 bg-slate-800 rounded-md p-1 border border-slate-700">
                 <div 
                    className="w-6 h-6 rounded cursor-pointer border border-slate-600" 
                    style={{backgroundColor: currentColor}}
                    onClick={() => {
                        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'];
                        const idx = colors.indexOf(currentColor);
                        setCurrentColor(colors[(idx + 1) % colors.length]);
                    }}
                 />
             </div>
             <button 
                 data-copy-button
                 onClick={() => handleExport('copy')} 
                 className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-3 py-1.5 rounded-md text-sm flex items-center font-medium transition-colors"
             >
                 <IconCopy className="w-4 h-4 mr-2" /> Copy
             </button>
             <button 
                 data-save-button
                 onClick={() => handleExport('download')} 
                 className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-sm flex items-center font-medium shadow-lg shadow-blue-900/20 transition-all"
             >
                 <IconDownload className="w-4 h-4 mr-2" /> Save
             </button>
             <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
                 <IconX className="w-5 h-5" />
             </button>
         </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
         {/* Sidebar Properties */}
         <div className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto shrink-0 z-10">
             
             {/* Text Tool Settings */}
             {currentTool === ToolType.TEXT && (
                 <div className="space-y-3 pb-4 border-b border-slate-800">
                     <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Text Settings</h3>
                     <div className="space-y-2">
                         <div className="flex justify-between text-xs text-slate-400">
                             <span>Size</span>
                             <span>{textFontSize}px</span>
                         </div>
                         <input 
                            type="range" min="12" max="72" step="2"
                            value={textFontSize}
                            onChange={(e) => {
                                const newSize = Number(e.target.value);
                                setTextFontSize(newSize);
                                if (editingText) {
                                    const correctId = originalAnnotationRef.current ? originalAnnotationRef.current.id : editingText.id;
                                    setEditingText({ ...editingText, fontSize: newSize, id: correctId });
                                }
                            }}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                         />
                     </div>
                     <div className="space-y-2">
                         <div className="text-xs text-slate-400 mb-2">Color</div>
                         <div className="grid grid-cols-3 gap-2">
                             {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'].map((color) => (
                                 <div 
                                    key={color}
                                    className={`h-8 rounded cursor-pointer border-2 transition-all ${
                                        currentColor === color ? 'border-white scale-110' : 'border-slate-600'
                                    }`}
                                    style={{backgroundColor: color}}
                                    onClick={() => {
                                        setCurrentColor(color);
                                        if (editingText) {
                                            const correctId = originalAnnotationRef.current ? originalAnnotationRef.current.id : editingText.id;
                                            setEditingText({ ...editingText, color, id: correctId });
                                        }
                                    }}
                                 />
                             ))}
                         </div>
                     </div>
                 </div>
             )}
             
             {/* Background Config */}
             <div className="space-y-3">
                 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Background</h3>
                 <div className="grid grid-cols-3 gap-2">
                     {PRESET_BACKGROUNDS.map((bg, i) => (
                         <button 
                            key={i}
                            className={`h-10 rounded-md border-2 overflow-hidden relative ${bgConfig.value === bg.value ? 'border-blue-500' : 'border-slate-700'}`}
                            style={{ background: bg.value }}
                            onClick={() => setBgConfig(prev => ({ ...prev, value: bg.value, type: bg.value === 'transparent' ? 'transparent' : 'gradient' }))}
                         >
                            {bg.name === 'Transparent' && <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/1/18/Transparent_Square_Tiles_Texture.png')] bg-contain opacity-20" />}
                         </button>
                     ))}
                 </div>
                 <div className="space-y-2 pt-2">
                     <div className="flex justify-between text-xs text-slate-400">
                         <span>Padding</span>
                         <span>{bgConfig.padding}px</span>
                     </div>
                     <input 
                        type="range" min="0" max="200" step="10"
                        value={bgConfig.padding}
                        onChange={(e) => setBgConfig(prev => ({...prev, padding: Number(e.target.value)}))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                     />
                 </div>
                 <div className="flex items-center justify-between pt-2">
                     <span className="text-sm text-slate-300">Shadow</span>
                     <button 
                        onClick={() => setBgConfig(prev => ({...prev, shadow: !prev.shadow}))}
                        className={`w-10 h-5 rounded-full relative transition-colors ${bgConfig.shadow ? 'bg-blue-600' : 'bg-slate-700'}`}
                     >
                         <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${bgConfig.shadow ? 'left-6' : 'left-1'}`} />
                     </button>
                 </div>
             </div>

             {/* AI Tools */}
             <div className="space-y-3 pt-4 border-t border-slate-800">
                 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
                    <IconSparkles className="w-3 h-3 mr-1 text-purple-400" />
                    Gemini AI
                 </h3>
                 <button 
                    disabled={isAiProcessing}
                    onClick={() => handleAiAction('text')}
                    className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm flex items-center justify-center transition-colors"
                 >
                    {isAiProcessing ? 'Processing...' : 'Extract Text (OCR)'}
                 </button>
                 <button 
                    disabled={isAiProcessing}
                    onClick={() => handleAiAction('desc')}
                    className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm flex items-center justify-center transition-colors"
                 >
                    {isAiProcessing ? 'Processing...' : 'Explain Image'}
                 </button>

                 {aiResult && (
                     <div className="mt-2 p-3 bg-slate-800/50 rounded-md border border-slate-700 text-sm text-slate-300 max-h-48 overflow-y-auto scrollbar-thin">
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-semibold text-xs uppercase text-slate-500">{aiResult.type === 'text' ? 'Extracted Text' : 'Explanation'}</span>
                             <button onClick={() => navigator.clipboard.writeText(aiResult.content)} className="text-blue-400 hover:text-blue-300 text-xs">Copy</button>
                         </div>
                         <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed opacity-90">{aiResult.content}</p>
                     </div>
                 )}
             </div>

             {/* Undo/Redo */}
             <div className="pt-4 border-t border-slate-800 mt-auto">
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => {
                          if (historyIndex > 0 && history.length > 0) {
                            isUndoRedoRef.current = true;
                            const prevState = history[historyIndex - 1];
                            setHistoryIndex(historyIndex - 1);
                            setAnnotations(JSON.parse(JSON.stringify(prevState)));
                          }
                        }}
                        disabled={historyIndex <= 0}
                        className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                          historyIndex <= 0 
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                        title="Undo (Cmd/Ctrl+Z)"
                    >
                        <IconUndo className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                          if (historyIndex < history.length - 1 && history.length > 0) {
                            isUndoRedoRef.current = true;
                            const nextState = history[historyIndex + 1];
                            setHistoryIndex(historyIndex + 1);
                            setAnnotations(JSON.parse(JSON.stringify(nextState)));
                          }
                        }}
                        disabled={historyIndex >= history.length - 1}
                        className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                          historyIndex >= history.length - 1 
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                        title="Redo (Cmd/Ctrl+Shift+Z)"
                    >
                        <IconRedo className="w-4 h-4" />
                    </button>
                </div>
                <button 
                    onClick={() => setAnnotations([])}
                    className="w-full text-red-400 hover:text-red-300 text-xs py-2 hover:bg-red-900/10 rounded transition-colors"
                 >
                    Clear All Annotations
                 </button>
             </div>
         </div>

         {/* Canvas Area */}
         <div 
            ref={containerRef}
            className="flex-1 bg-[#0c1221] checkerboard overflow-auto flex items-center justify-center p-8 cursor-crosshair"
         >
             <canvas 
                ref={canvasRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                className="shadow-2xl max-w-none"
                style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    objectFit: 'contain'
                }}
             />
         </div>
      </div>

      {/* Inline Text Input is managed by useEffect (direct DOM manipulation) */}
    </div>
  );
};

export default Editor;