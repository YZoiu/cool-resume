import html2canvas from 'html2canvas';

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function sampleHasInk(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const { width, height } = canvas;
  if (width < 2 || height < 2) return false;
  const spots = [
    [Math.floor(width / 2), Math.floor(height / 2), 24, 24],
    [8, 8, 16, 16],
    [Math.max(0, width - 24), 8, 16, 16],
    [8, Math.max(0, height - 24), 16, 16],
    [Math.max(0, width - 24), Math.max(0, height - 24), 16, 16],
  ];
  for (const [sx, sy, sw, sh] of spots) {
    const { data } = ctx.getImageData(sx, sy, Math.min(sw, width - sx), Math.min(sh, height - sy));
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] === 0) continue;
      if (data[i] < 252 || data[i + 1] < 252 || data[i + 2] < 252) return true;
    }
  }
  return false;
}

function measureCaptureBox(element) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(
    1,
    Math.ceil(Math.max(element.scrollWidth || 0, element.offsetWidth || 0, rect.width || 0)),
  );
  const height = Math.max(
    1,
    Math.ceil(Math.max(element.scrollHeight || 0, element.offsetHeight || 0, rect.height || 0)),
  );
  return { width, height };
}

function compositeOntoWhite(canvas, { crop = 0 } = {}) {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(canvas, 0, 0);
  // html2canvas 会把预览灰底/抗锯齿脏边吃进最外圈，JPEG 再压成一圈黑边。
  // 不裁切画布，只把边缘盖成纯白，避免改变 A4 比例。
  if (crop > 0) {
    const frame = Math.min(crop, Math.floor(Math.min(width, height) / 2));
    ctx.fillRect(0, 0, width, frame);
    ctx.fillRect(0, 0, frame, height);
    ctx.fillRect(width - frame, 0, frame, height);
    ctx.fillRect(0, height - frame, width, frame);
  }
  return output;
}

export async function captureElement(element, {
  scale = 2,
  backgroundColor = '#ffffff',
  clip = false,
} = {}) {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  await nextFrame();
  const box = clip
    ? { width: Math.max(1, Math.round(element.offsetWidth)), height: Math.max(1, Math.round(element.offsetHeight)) }
    : measureCaptureBox(element);
  const { width, height } = box;
  document.documentElement.classList.add('resume-capturing');
  try {
    const canvas = await html2canvas(element, {
      backgroundColor,
      scale: Math.min(Math.max(Number(scale) || 2, 1), 3),
      useCORS: true,
      allowTaint: true,
      logging: false,
      x: 0,
      y: 0,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      onclone(doc, cloned) {
        doc.documentElement.classList.add('resume-capturing');
        doc.documentElement.classList.remove('resume-editor-split-mode', 'resume-editor-toolbar-visible', 'resume-preview-edit-mode', 'page-separator-mode');
        doc.body.classList.remove('page-separator-mode');
        cloned.querySelectorAll('.resume-edit-btn, .resume-photo-resize, .resume-font-scale-controls, .resume-format-menu').forEach(node => node.remove());
        cloned.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
        cloned.style.transform = 'none';
        cloned.style.position = 'absolute';
        cloned.style.left = '0px';
        cloned.style.top = '0px';
        cloned.style.right = 'auto';
        cloned.style.bottom = 'auto';
        cloned.style.margin = '0px';
        cloned.style.inset = 'auto';
        cloned.style.maxWidth = 'none';
        cloned.style.minHeight = '0';
        cloned.style.width = `${width}px`;
        cloned.style.height = `${height}px`;
        cloned.style.overflow = clip ? 'hidden' : 'visible';
        cloned.style.boxShadow = 'none';
        cloned.style.outline = 'none';
        cloned.style.border = '0';
        cloned.style.borderRadius = '0';
        cloned.style.background = backgroundColor;
        doc.documentElement.style.setProperty('background', backgroundColor, 'important');
        doc.body.style.setProperty('background', backgroundColor, 'important');
        doc.body.style.padding = '0px';
        doc.body.style.margin = '0px';
        doc.body.style.maxWidth = 'none';
        doc.body.style.minHeight = '0';
        Array.from(doc.body.children).forEach(node => {
          if (node !== cloned && !node.contains(cloned) && !cloned.contains(node)) {
            node.style.setProperty('display', 'none', 'important');
          }
        });
      },
    });
    const flattened = compositeOntoWhite(canvas, { crop: clip ? 8 : 0 });
    if (!sampleHasInk(flattened)) throw new Error('截图结果是空白');
    return flattened;
  } finally {
    document.documentElement.classList.remove('resume-capturing');
  }
}

export async function withCaptureStage(widthPx, build, { heightPx } = {}) {
  const stage = document.createElement('div');
  const bodyStyle = getComputedStyle(document.body);
  const width = Math.max(1, Math.ceil(widthPx));
  const height = heightPx ? Math.max(1, Math.ceil(heightPx)) : null;
  stage.className = 'resume-export-stage';
  stage.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:1',
    `width:${width}px`,
    'max-width:none',
    height ? `height:${height}px` : 'height:auto',
    'background:#fff',
    'color:' + bodyStyle.color,
    'font-family:' + bodyStyle.fontFamily,
    'font-size:' + bodyStyle.fontSize,
    'line-height:' + bodyStyle.lineHeight,
    'box-sizing:content-box',
    height ? 'overflow:hidden' : 'overflow:visible',
    'pointer-events:none',
    'margin:0',
    'transform:none',
    'box-shadow:none',
    'border:0',
  ].join(';');
  document.body.appendChild(stage);
  try {
    await build(stage);
    await nextFrame();
    if (!height) {
      const box = measureCaptureBox(stage);
      stage.style.width = `${box.width}px`;
      stage.style.height = `${box.height}px`;
      await nextFrame();
    }
    return stage;
  } catch (error) {
    stage.remove();
    throw error;
  }
}
