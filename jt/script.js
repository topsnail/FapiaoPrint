// ========== 导航功能 ==========
function goToHomePage() {
    try {
        const homeUrl = "https://888.topmer.top";
        window.location.href = homeUrl;
    } catch (error) {
        console.error('返回首页时出错:', error);
        alert('无法返回首页，请稍后重试！');
    }
}

function openInvoiceTool() {
    try {
        const invoiceUrl = "https://888.topmer.top/fp";
        window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
        console.error('打开发票工具时出错:', error);
        alert('无法打开发票工具，请稍后重试！');
    }
}

// ========== 应用配置 ==========
const CONFIG = {
    IMAGE_QUALITY: 0.9,
    MARGIN_MM: 4.3,
    SPACING_MM: 4.3,
    TARGET_WIDTH: 1080,
    TARGET_HEIGHT: 1440, // 保持3:4比例
    TARGET_RATIO: 1080 / 1440, // 0.75 (3:4)
    MAX_FILES: 50,
    MM_TO_PX: 96 / 25.4 // 1mm = 3.779527559055118像素（96DPI）
};

// ========== 应用状态 ==========
const AppState = {
    photoFiles: [], // 存储处理后的手机截图数据 {dataUrl, originalName, dimensions}
    originalFileNames: [], // 保存原始文件名
    originalFiles: [], // 保存原始文件对象
    currentMode: 9, // 默认9张模式
    showCutLines: true, // 裁剪线显示状态
    isProcessing: false
};

const { jsPDF } = window.jspdf;

// ========== 核心计算函数 ==========
function calculateLayout(mode) {
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;
    const margin = CONFIG.MARGIN_MM;
    const spacing = CONFIG.SPACING_MM;
    
    if (mode === 6) {
        // 1页6张：纵向A4，3列×2行
        const columns = 3;
        const rows = 2;
        const contentWidth = A4_WIDTH_MM - (margin * 2);
        const contentHeight = A4_HEIGHT_MM - (margin * 2);
        
        const slotWidth = (contentWidth - (spacing * (columns - 1))) / columns;
        const slotHeight = (contentHeight - (spacing * (rows - 1))) / rows;
        
        if (slotWidth <= 0 || slotHeight <= 0) {
            throw new Error('计算错误：槽位尺寸无效');
        }
        
        return {
            mode: 6,
            columns,
            rows,
            photosPerPage: columns * rows,
            slotWidth,
            slotHeight,
            orientation: 'portrait',
            pageWidth: A4_WIDTH_MM,
            pageHeight: A4_HEIGHT_MM,
            margin,
            spacing
        };
    } else if (mode === 9) {
        // 1页9张：纵向A4，3列×3行
        const columns = 3;
        const rows = 3;
        const contentWidth = A4_WIDTH_MM - (margin * 2);
        const contentHeight = A4_HEIGHT_MM - (margin * 2);
        
        const slotWidth = (contentWidth - (spacing * (columns - 1))) / columns;
        const slotHeight = (contentHeight - (spacing * (rows - 1))) / rows;
        
        if (slotWidth <= 0 || slotHeight <= 0) {
            throw new Error('计算错误：槽位尺寸无效');
        }
        
        return {
            mode: 9,
            columns,
            rows,
            photosPerPage: columns * rows,
            slotWidth,
            slotHeight,
            orientation: 'portrait',
            pageWidth: A4_WIDTH_MM,
            pageHeight: A4_HEIGHT_MM,
            margin,
            spacing
        };
    } else {
        // 1页12张：横向A4，6列×2行
        const columns = 6;
        const rows = 2;
        const pageWidth = A4_HEIGHT_MM;
        const pageHeight = A4_WIDTH_MM;
        const contentWidth = pageWidth - (margin * 2);
        const contentHeight = pageHeight - (margin * 2);
        
        const slotWidth = (contentWidth - (spacing * (columns - 1))) / columns;
        const slotHeight = (contentHeight - (spacing * (rows - 1))) / rows;
        
        if (slotWidth <= 0 || slotHeight <= 0) {
            throw new Error('计算错误：槽位尺寸无效');
        }
        
        return {
            mode: 12,
            columns,
            rows,
            photosPerPage: columns * rows,
            slotWidth,
            slotHeight,
            orientation: 'landscape',
            pageWidth,
            pageHeight,
            margin,
            spacing
        };
    }
}

// ========== 裁剪线功能 ==========
function toggleCutLines() {
    AppState.showCutLines = !AppState.showCutLines;
    const btn = document.getElementById('cutLineToggle');
    
    if (btn) {
        btn.innerText = AppState.showCutLines ? '已开启' : '已关闭';
        btn.className = `toggle-btn ${AppState.showCutLines ? 'btn-on' : 'btn-off'}`;
    }
    
    renderPreview();
}

// ========== 浏览器兼容性检测 ==========
function checkBrowserCompatibility() {
    const missingAPIs = [];
    
    if (!window.File) missingAPIs.push('File API');
    if (!window.FileReader) missingAPIs.push('FileReader API');
    if (!window.Promise) missingAPIs.push('Promise API');
    if (!window.HTMLCanvasElement) missingAPIs.push('Canvas API');
    
    if (missingAPIs.length > 0) {
        console.warn('浏览器不支持以下必要API:', missingAPIs.join(', '));
        document.getElementById('browserWarning').style.display = 'block';
        return false;
    }
    
    return true;
}

function closeBrowserWarning() {
    document.getElementById('browserWarning').style.display = 'none';
}

// ========== 使用说明弹窗功能 ==========
function showHelp() {
    try {
        document.getElementById('helpDialog').style.display = 'flex';
    } catch (error) {
        console.error('显示帮助弹窗时出错:', error);
    }
}

function closeHelp() {
    try {
        document.getElementById('helpDialog').style.display = 'none';
    } catch (error) {
        console.error('关闭帮助弹窗时出错:', error);
    }
}

// ========== 继续添加文件功能 ==========
function continueAddFiles() {
    document.getElementById('fileIn').click();
}

// ========== 删除单个文件 ==========
function deleteFile(index) {
    if (index < 0 || index >= AppState.photoFiles.length) {
        console.error('deleteFile: 索引无效', index);
        return;
    }
    
    // 从各个状态中移除文件
    AppState.photoFiles.splice(index, 1);
    AppState.originalFileNames.splice(index, 1);
    AppState.originalFiles.splice(index, 1);
    
    // 更新文件列表显示
    updateFileList(AppState.originalFiles);
    
    // 更新成功信息
    const successInfo = document.getElementById('successInfo');
    if (successInfo) {
        successInfo.innerText = `✅ 已成功加载 ${AppState.photoFiles.length} 张手机截图 ✨`;
    }
    
    // 如果没有文件了，显示拖拽区域
    if (AppState.photoFiles.length === 0) {
        const dropZone = document.getElementById('dropZone');
        const feedbackArea = document.getElementById('feedbackArea');
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        
        if (dropZone) dropZone.style.display = 'flex';
        if (feedbackArea) feedbackArea.style.display = 'none';
        if (exportBtn) exportBtn.disabled = true;
        if (printBtn) printBtn.disabled = true;
        
        // 清空预览
        const previewGrid = document.getElementById('previewGrid');
        if (previewGrid) previewGrid.innerHTML = '';
    } else {
        // 重新渲染预览
        renderPreview();
        
        // 确保按钮可用
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        if (exportBtn) exportBtn.disabled = false;
        if (printBtn) printBtn.disabled = false;
    }
}

// ========== 文件列表更新函数 ==========
function updateFileList(files) {
    try {
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        
        if (!fileList || !fileCount) {
            console.warn('updateFileList: 文件列表元素不存在');
            return;
        }
        
        fileCount.textContent = files.length;
        
        if (!files || files.length === 0) {
            fileList.innerHTML = '';
            return;
        }
        
        fileList.innerHTML = files.map((file, index) => {
            const displayName = file.name.length > 30 
                ? file.name.substring(0, 27) + '...' 
                : file.name;
                
            return `
                <div class="file-item" data-index="${index}">
                    <div class="file-name" title="${file.name}">
                        ${index + 1}. ${displayName}
                    </div>
                    <button class="file-delete" onclick="deleteFile(${index})" title="删除此文件">×</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('更新文件列表时出错:', error);
    }
}

// ========== 处理单张图片（保留原始比例） ==========
async function processImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                // 这里不进行裁剪，只保存原始图片信息和数据URL
                // 裁剪会在预览和PDF生成时根据布局动态进行
                resolve({
                    dataUrl: e.target.result, // 使用原始数据URL
                    originalName: file.name,
                    dimensions: {
                        originalWidth: img.width,
                        originalHeight: img.height,
                        originalRatio: img.width / img.height
                    }
                });
            };
            
            img.onerror = function() {
                reject(new Error('图片加载失败: ' + file.name));
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = function() {
            reject(new Error('文件读取失败: ' + file.name));
        };
        
        reader.readAsDataURL(file);
    });
}

// ========== 处理多个文件 ==========
async function handleFiles(files) {
    if (!files || files.length === 0) {
        console.error('handleFiles: 未接收到文件');
        return;
    }

    if (AppState.isProcessing) {
        alert('正在处理文件中，请稍候...');
        return;
    }

    const imageFiles = Array.from(files).filter(f => 
        f.type.startsWith('image/') && 
        ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type)
    );
    
    if (!imageFiles.length) {
        alert('请选择图片文件（支持JPG、PNG、WEBP格式）！');
        return;
    }

    // 检查是否超过最大文件数
    const totalFiles = AppState.photoFiles.length + imageFiles.length;
    if (totalFiles > CONFIG.MAX_FILES) {
        const remainingSlots = CONFIG.MAX_FILES - AppState.photoFiles.length;
        alert(`最多支持${CONFIG.MAX_FILES}个文件，已加载${AppState.photoFiles.length}个，本次最多还能添加${remainingSlots}个`);
        
        if (remainingSlots <= 0) {
            return;
        }
        
        imageFiles.length = remainingSlots;
    }

    AppState.isProcessing = true;
    
    const progressWrapper = document.getElementById('progressWrapper');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (!progressWrapper || !progressBar || !progressText) {
        console.error('进度条元素不存在');
        AppState.isProcessing = false;
        return;
    }
    
    progressWrapper.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.innerText = `准备中...`;

    try {
        const startIndex = AppState.photoFiles.length;
        
        for (let i = 0; i < imageFiles.length; i++) {
            const currentIndex = startIndex + i;
            progressText.innerText = `处理中 ${currentIndex + 1} / ${totalFiles}`;
            
            try {
                const processedImage = await processImageFile(imageFiles[i]);
                AppState.photoFiles.push(processedImage);
                AppState.originalFileNames.push(imageFiles[i].name);
                AppState.originalFiles.push(imageFiles[i]);
                
                const progress = Math.round(((i + 1) / imageFiles.length) * 100);
                progressBar.style.width = `${progress}%`;
                
            } catch (error) {
                console.error(`文件 ${imageFiles[i].name} 处理失败:`, error);
                continue;
            }
        }
        
        const dropZone = document.getElementById('dropZone');
        const feedbackArea = document.getElementById('feedbackArea');
        const successInfo = document.getElementById('successInfo');
        
        if (!dropZone || !feedbackArea || !successInfo) {
            throw new Error('必要的DOM元素不存在');
        }
        
        // 隐藏拖拽区域，显示反馈区域
        dropZone.style.display = 'none';
        feedbackArea.style.display = 'flex';
        successInfo.innerText = `✅ 已成功加载 ${AppState.photoFiles.length} 张手机截图 ✨`;
        
        updateFileList(AppState.originalFiles);
        
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        
        if (exportBtn) exportBtn.disabled = false;
        if (printBtn) printBtn.disabled = false;
        
        renderPreview();
        
    } catch (error) {
        console.error('文件处理失败:', error);
        alert('文件处理失败，请重试！\n错误信息: ' + error.message);
    } finally {
        AppState.isProcessing = false;
        if (progressWrapper) {
            progressWrapper.style.display = 'none';
        }
    }
}

// ========== 渲染预览（根据布局动态调整） ==========
function renderPreview() {
    try {
        const grid = document.getElementById('previewGrid');
        if (!grid) {
            console.error('renderPreview: 预览容器不存在');
            return;
        }
        
        grid.innerHTML = '';
        
        if (!AppState.photoFiles.length) return;
        
        const layout = calculateLayout(AppState.currentMode);
        const totalPages = Math.ceil(AppState.photoFiles.length / layout.photosPerPage);
        
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const pageDiv = document.createElement('div');
            
            const pageClass = layout.orientation === 'portrait' ? 'v-page' : 'h-page';
            pageDiv.className = `preview-page ${pageClass}`;
            
            for (let row = 0; row < layout.rows; row++) {
                for (let col = 0; col < layout.columns; col++) {
                    const slotIndex = row * layout.columns + col;
                    const fileIndex = pageIndex * layout.photosPerPage + slotIndex;
                    
                    if (fileIndex >= AppState.photoFiles.length) continue;
                    
                    const leftPercent = (layout.margin + (col * (layout.slotWidth + layout.spacing))) / layout.pageWidth * 100;
                    const topPercent = (layout.margin + (row * (layout.slotHeight + layout.spacing))) / layout.pageHeight * 100;
                    const widthPercent = layout.slotWidth / layout.pageWidth * 100;
                    const heightPercent = layout.slotHeight / layout.pageHeight * 100;
                    
                    const slot = document.createElement('div');
                    slot.className = 'slot';
                    slot.style.left = `${leftPercent}%`;
                    slot.style.top = `${topPercent}%`;
                    slot.style.width = `${widthPercent}%`;
                    slot.style.height = `${heightPercent}%`;
                    
                    // 根据布局模式设置不同的样式
                    slot.style.overflow = 'hidden';
                    slot.style.display = 'flex';
                    slot.style.alignItems = 'flex-start'; // 顶部对齐
                    slot.style.justifyContent = 'center';
                    slot.style.background = 'white';
                    
                    const img = document.createElement('img');
                    img.src = AppState.photoFiles[fileIndex].dataUrl;
                    img.alt = `手机截图 ${fileIndex + 1} - ${AppState.photoFiles[fileIndex].originalName}`;
                    
                    // 关键：统一设置图片在槽位中的显示方式
                    // 宽度填满槽位，高度按比例自适应，顶部对齐，超出裁剪
                    img.style.width = '100%';
                    img.style.height = 'auto';
                    img.style.objectFit = 'cover'; // 保持比例，超出部分裁剪
                    img.style.objectPosition = 'top center'; // 顶部对齐
                    img.style.background = 'white';
                    
                    slot.appendChild(img);
                    pageDiv.appendChild(slot);
                }
            }
            
            // 绘制裁剪线
            if (AppState.showCutLines) {
                for (let col = 1; col < layout.columns; col++) {
                    const lineX = layout.margin + (col * layout.slotWidth) + ((col - 0.5) * layout.spacing);
                    const lineXPercent = lineX / layout.pageWidth * 100;
                    
                    const line = document.createElement('div');
                    line.className = 'cut-line vertical';
                    line.style.left = `${lineXPercent}%`;
                    line.style.top = '0%';
                    line.style.height = '100%';
                    
                    pageDiv.appendChild(line);
                }
                
                for (let row = 1; row < layout.rows; row++) {
                    const lineY = layout.margin + (row * layout.slotHeight) + ((row - 0.5) * layout.spacing);
                    const lineYPercent = lineY / layout.pageHeight * 100;
                    
                    const line = document.createElement('div');
                    line.className = 'cut-line horizontal';
                    line.style.top = `${lineYPercent}%`;
                    line.style.left = '0%';
                    line.style.width = '100%';
                    
                    pageDiv.appendChild(line);
                }
            }
            
            grid.appendChild(pageDiv);
        }
        
        updateModeButtons();
        
    } catch (error) {
        console.error('渲染预览时发生错误:', error);
        
        const grid = document.getElementById('previewGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e67e22;">
                    <p>⚠️ 预览渲染失败</p>
                    <p>请尝试调整设置或重新加载文件</p>
                    <p>错误信息: ${error.message}</p>
                </div>
            `;
        }
    }
}

// ========== 设置模式 ==========
function setMode(mode) {
    if (AppState.currentMode === mode) return;
    
    AppState.currentMode = mode;
    
    try {
        const body = document.getElementById('theBody');
        if (body) {
            body.className = `mode-${mode}`;
        }
        renderPreview();
    } catch (error) {
        console.error('设置模式时出错:', error);
    }
}

// ========== 更新模式按钮 ==========
function updateModeButtons() {
    try {
        const m6 = document.getElementById('m6');
        const m9 = document.getElementById('m9');
        const m12 = document.getElementById('m12');
        
        if (m6) m6.classList.toggle('active', AppState.currentMode === 6);
        if (m9) m9.classList.toggle('active', AppState.currentMode === 9);
        if (m12) m12.classList.toggle('active', AppState.currentMode === 12);
    } catch (error) {
        console.error('更新模式按钮时出错:', error);
    }
}

// ========== 保存PDF（根据布局动态调整） ==========
async function savePDF() {
    if (!AppState.photoFiles.length) {
        console.warn('savePDF: 没有可导出的文件');
        alert('请先加载手机截图文件！');
        return;
    }
    
    try {
        const layout = calculateLayout(AppState.currentMode);
        
        const doc = new jsPDF({
            orientation: layout.orientation,
            unit: 'mm',
            format: 'a4'
        });
        
        if (!doc) {
            throw new Error('无法创建PDF文档');
        }
        
        const totalPages = Math.ceil(AppState.photoFiles.length / layout.photosPerPage);
        
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            if (pageIndex > 0) {
                doc.addPage();
            }
            
            for (let row = 0; row < layout.rows; row++) {
                for (let col = 0; col < layout.columns; col++) {
                    const slotIndex = row * layout.columns + col;
                    const fileIndex = pageIndex * layout.photosPerPage + slotIndex;
                    
                    if (fileIndex >= AppState.photoFiles.length) break;
                    
                    const x = layout.margin + (col * (layout.slotWidth + layout.spacing));
                    const y = layout.margin + (row * (layout.slotHeight + layout.spacing));
                    
                    const imgInfo = AppState.photoFiles[fileIndex];
                    const originalRatio = imgInfo.dimensions.originalRatio;
                    
                    // 计算图片在槽位中的实际尺寸
                    // 宽度填满槽位
                    const drawWidth = layout.slotWidth;
                    // 高度按原始比例计算
                    const drawHeight = layout.slotWidth / originalRatio;
                    
                    if (drawHeight <= layout.slotHeight) {
                        // 图片高度小于等于槽位高度：完整显示，底部留白
                        doc.addImage(
                            imgInfo.dataUrl,
                            'JPEG',
                            x,
                            y,
                            drawWidth,
                            drawHeight
                        );
                        
                        // 绘制白色矩形填充底部留白区域
                        if (drawHeight < layout.slotHeight) {
                            doc.setFillColor(255, 255, 255); // 白色
                            doc.rect(
                                x,
                                y + drawHeight,
                                drawWidth,
                                layout.slotHeight - drawHeight,
                                'F' // 填充模式
                            );
                        }
                    } else {
                        // 图片高度大于槽位高度：只绘制顶部部分（裁剪底部）
                        // 计算源图片的裁剪区域（只取顶部部分）
                        const sourceWidth = imgInfo.dimensions.originalWidth;
                        const sourceHeight = imgInfo.dimensions.originalHeight;
                        
                        // 计算需要裁剪的源图片高度比例
                        const cropRatio = layout.slotHeight / drawHeight;
                        const cropHeight = sourceHeight * cropRatio;
                        
                        // 使用jsPDF的裁剪功能：只绘制源图片的顶部部分
                        doc.addImage(
                            imgInfo.dataUrl,
                            'JPEG',
                            0, 0, // 源图片裁剪起始点 (sx, sy)
                            sourceWidth, cropHeight, // 源图片裁剪尺寸 (sw, sh)
                            x, y, // 目标位置
                            drawWidth, layout.slotHeight // 目标尺寸
                        );
                    }
                }
            }
            
            // 绘制裁剪线
            if (AppState.showCutLines) {
                doc.setDrawColor(170, 170, 170);
                doc.setLineWidth(0.3);
                doc.setLineDashPattern([3, 3], 0);
                
                for (let col = 1; col < layout.columns; col++) {
                    const lineX = layout.margin + (col * layout.slotWidth) + ((col - 0.5) * layout.spacing);
                    doc.line(lineX, layout.margin, lineX, layout.pageHeight - layout.margin);
                }
                
                for (let row = 1; row < layout.rows; row++) {
                    const lineY = layout.margin + (row * layout.slotHeight) + ((row - 0.5) * layout.spacing);
                    doc.line(layout.margin, lineY, layout.pageWidth - layout.margin, lineY);
                }
                
                doc.setLineDashPattern([], 0);
            }
        }
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        doc.save(`手机截图合版_${timestamp}.pdf`);
        
    } catch (error) {
        console.error('导出PDF失败:', error);
        
        let errorMsg = '导出PDF失败';
        if (error.message && error.message.includes('security')) {
            errorMsg += '：可能是浏览器安全策略限制，请尝试在其他浏览器中操作';
        } else if (error.message && error.message.includes('memory')) {
            errorMsg += '：文件过大导致内存不足，请减少文件数量';
        }
        
        alert(errorMsg + '，请重试！');
    }
}

// ========== 打印相关函数 ==========
function showPrintDialog() {
    if (!AppState.photoFiles.length) {
        console.warn('showPrintDialog: 没有可打印的文件');
        alert('请先加载手机截图文件！');
        return;
    }
    
    try {
        let modeText, orientationText;
        
        if (AppState.currentMode === 6) {
            modeText = '1页6张(纵向)';
            orientationText = '纵向';
        } else if (AppState.currentMode === 9) {
            modeText = '1页9张(纵向)';
            orientationText = '纵向';
        } else {
            modeText = '1页12张(横向)';
            orientationText = '横向';
        }
        
        const printModeText = document.getElementById('printModeText');
        const printOrientationText = document.getElementById('printOrientationText');
        
        if (printModeText) printModeText.textContent = modeText;
        if (printOrientationText) printOrientationText.textContent = orientationText;
        
        const printDialog = document.getElementById('printDialog');
        if (printDialog) {
            printDialog.style.display = 'flex';
        }
    } catch (error) {
        console.error('显示打印对话框时出错:', error);
    }
}

function hidePrintDialog() {
    try {
        const printDialog = document.getElementById('printDialog');
        if (printDialog) {
            printDialog.style.display = 'none';
        }
    } catch (error) {
        console.error('隐藏打印对话框时出错:', error);
    }
}

function handlePrint() {
    if (!AppState.photoFiles.length) {
        console.warn('handlePrint: 没有可打印的文件');
        return;
    }
    
    try {
        const body = document.getElementById('theBody');
        if (body) {
            if (AppState.currentMode === 6 || AppState.currentMode === 9) {
                body.className = `mode-${AppState.currentMode}`;
            } else {
                body.className = 'mode-12';
            }
        }
        
        setTimeout(() => {
            window.print();
            
            setTimeout(() => {
                window.scrollTo(0, 0);
                if (body) {
                    body.className = `mode-${AppState.currentMode}`;
                }
            }, 100);
        }, 100);
    } catch (error) {
        console.error('执行打印时出错:', error);
        alert('打印失败，请检查打印机设置！');
    }
}

// ========== 重置应用 ==========
function resetApp() {
    if (AppState.isProcessing) {
        if (!confirm('文件正在处理中，确定要重置吗？')) {
            return;
        }
    }
    
    try {
        AppState.photoFiles = [];
        AppState.originalFileNames = [];
        AppState.originalFiles = [];
        AppState.showCutLines = true;
        AppState.isProcessing = false;
        
        const dropZone = document.getElementById('dropZone');
        const feedbackArea = document.getElementById('feedbackArea');
        const previewGrid = document.getElementById('previewGrid');
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        const progressWrapper = document.getElementById('progressWrapper');
        const cutLineToggle = document.getElementById('cutLineToggle');
        const fileIn = document.getElementById('fileIn');
        
        if (dropZone) dropZone.style.display = 'flex';
        if (feedbackArea) feedbackArea.style.display = 'none';
        if (previewGrid) previewGrid.innerHTML = '';
        if (exportBtn) exportBtn.disabled = true;
        if (printBtn) printBtn.disabled = true;
        if (progressWrapper) progressWrapper.style.display = 'none';
        if (cutLineToggle) {
            cutLineToggle.innerText = '已开启';
            cutLineToggle.className = 'toggle-btn btn-on';
        }
        if (fileIn) fileIn.value = '';
        
        setMode(9);
        
        hidePrintDialog();
        
    } catch (error) {
        console.error('重置应用时出错:', error);
        alert('重置失败，请刷新页面重试！');
    }
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', function() {
    try {
        checkBrowserCompatibility();
    } catch (error) {
        console.error('检查浏览器兼容性时出错:', error);
    }
    
    const fileIn = document.getElementById('fileIn');
    if (fileIn) {
        fileIn.addEventListener('change', function(e) {
            if (e.target && e.target.files) {
                handleFiles(e.target.files);
            }
        });
    }
    
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.6)';
            dropZone.style.borderColor = '#147a61';
        });
        
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.5)';
            dropZone.style.borderColor = '#4a6d7c';
        });
        
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.5)';
            dropZone.style.borderColor = '#4a6d7c';
            
            if (e.dataTransfer && e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
        });
    }
    
    const confirmPrint = document.getElementById('confirmPrint');
    if (confirmPrint) {
        confirmPrint.addEventListener('click', function() {
            hidePrintDialog();
            handlePrint();
        });
    }
    
    const cancelPrint = document.getElementById('cancelPrint');
    if (cancelPrint) {
        cancelPrint.addEventListener('click', function() {
            hidePrintDialog();
        });
    }
    
    const printDialog = document.getElementById('printDialog');
    if (printDialog) {
        printDialog.addEventListener('click', function(e) {
            if (e.target === this) {
                hidePrintDialog();
            }
        });
    }
    
    const helpDialog = document.getElementById('helpDialog');
    if (helpDialog) {
        helpDialog.addEventListener('click', function(e) {
            if (e.target === this) {
                closeHelp();
            }
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hidePrintDialog();
            closeHelp();
            closeBrowserWarning();
        }
    });
    
    window.addEventListener('error', function(event) {
        console.error('全局错误捕获:', event.error);
        
        if (event.error && event.error.message) {
            console.error('错误详情:', event.error.message);
        }
    });
    
    window.addEventListener('unhandledrejection', function(event) {
        console.error('未处理的Promise拒绝:', event.reason);
        event.preventDefault();
    });
    
    updateModeButtons();
});