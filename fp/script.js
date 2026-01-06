'use strict';

import * as pdfjsLib from './pdfjs/build/pdf.mjs';

const CONFIG = {
    PDF_RENDER_SCALE: 2.5,
    IMAGE_QUALITY: 0.85,
    DEFAULT_MARGIN: 2,
    MAX_FILES: 50
};

const AppState = {
    invoiceFiles: [],
    currentMode: 4,
    currentMargin: 2,
    showLines: true,
    isProcessing: false,
    originalFiles: [] // 保存原始文件对象
};

const { jsPDF } = window.jspdf;

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/build/pdf.worker.mjs';

// Toast 通知系统
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-content">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // 自动移除
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, duration);
    }
    
    return toast;
}

function checkBrowserCompatibility() {
    const missingAPIs = [];
    if (!window.File) missingAPIs.push('File API');
    if (!window.FileReader) missingAPIs.push('FileReader API');
    if (!window.Promise) missingAPIs.push('Promise API');
    if (!window.fetch) missingAPIs.push('Fetch API');
    
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

function showHelp() {
    document.getElementById('helpDialog').style.display = 'flex';
}

function closeHelp() {
    document.getElementById('helpDialog').style.display = 'none';
}

function updateFileList() {
    try {
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        
        if (!fileList || !fileCount) return;
        
        const files = AppState.originalFiles;
        if (!files || files.length === 0) {
            fileList.innerHTML = '';
            fileCount.textContent = '0';
            return;
        }
        
        fileCount.textContent = files.length;
        
        fileList.innerHTML = files.map((file, index) => {
            const displayName = file.name.length > 25 
                ? file.name.substring(0, 22) + '...' 
                : file.name;
                
            return `
                <div class="file-item" title="文件名: ${file.name}">
                    <div class="file-index">${index + 1}.</div>
                    <div class="file-name" title="${file.name}">${displayName}</div>
                    <div class="file-status">✓ 已加载</div>
                    <button class="file-remove-btn" data-index="${index}" title="移除此文件">×</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('更新文件列表时出错:', error);
    }
}

function removeFile(indexToRemove) {
    try {
        AppState.originalFiles.splice(indexToRemove, 1);
        AppState.invoiceFiles.splice(indexToRemove, 1);

        if (AppState.originalFiles.length === 0) {
            resetApp();
            return;
        }

        updateFileList();
        renderPreview();
        
        const successInfo = document.getElementById('successInfo');
        if (successInfo) {
            successInfo.innerText = `✅ 已成功加载 ${AppState.invoiceFiles.length} 张发票 ✨`;
        }

    } catch (error) {
        console.error(`移除文件 #${indexToRemove} 时出错:`, error);
        showToast('移除文件时出错，请重试。', 'error');
    }
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;
    if (AppState.isProcessing) {
        showToast('正在处理文件中，请稍候...', 'warning');
        return;
    }

    let pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (!pdfFiles.length) {
        showToast('请选择PDF文件！', 'warning');
        return;
    }

    // 检测重复文件并自动跳过
    const duplicateFiles = [];
    const newFilesToProcess = pdfFiles.filter(newFile => {
        const isDuplicate = AppState.originalFiles.some(existingFile => 
            existingFile.name === newFile.name && 
            existingFile.size === newFile.size && 
            existingFile.lastModified === newFile.lastModified
        );
        if (isDuplicate) {
            duplicateFiles.push(newFile.name);
        }
        return !isDuplicate;
    });

    // 如果有重复文件，显示提示
    if (duplicateFiles.length > 0) {
        const duplicateCount = duplicateFiles.length;
        const message = duplicateCount === 1 
            ? `已跳过重复文件：${duplicateFiles[0]}`
            : `已跳过 ${duplicateCount} 个重复文件`;
        showToast(message, 'info', 4000);
    }

    if (newFilesToProcess.length === 0) {
        if (duplicateFiles.length === 0) {
            showToast('请选择PDF文件！', 'warning');
        }
        return;
    }

    const totalAfterAdding = AppState.originalFiles.length + newFilesToProcess.length;
    if (totalAfterAdding > CONFIG.MAX_FILES) {
        const canAdd = CONFIG.MAX_FILES - AppState.originalFiles.length;
        showToast(`最多支持${CONFIG.MAX_FILES}个文件，当前已有${AppState.originalFiles.length}个，只能添加${canAdd}个新文件`, 'warning', 5000);
        // 只处理能添加的文件数量
        newFilesToProcess.splice(canAdd);
        if (newFilesToProcess.length === 0) return;
    }

    AppState.isProcessing = true;
    document.getElementById('dropZone').style.display = 'none';
    document.getElementById('feedbackArea').style.display = 'flex';
    
    const progressWrapper = document.getElementById('progressWrapper');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressWrapper.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.innerText = `准备中...`;

    let successCount = 0;
    let failCount = 0;
    const failedFiles = [];
    
    try {
        for (let i = 0; i < newFilesToProcess.length; i++) {
            const file = newFilesToProcess[i];
            const currentIndex = i + 1;
            const totalNew = newFilesToProcess.length;
            
            progressText.innerText = `解析中 ${currentIndex} / ${totalNew}`;
            
            try {
                const data = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ 
                    data, 
                    cMapUrl: './pdfjs/web/cmaps/',
                    cMapPacked: true 
                }).promise;
                
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: CONFIG.PDF_RENDER_SCALE });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) throw new Error('无法获取canvas上下文');
                
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                
                const imageData = canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY);
                
                AppState.originalFiles.push(file);
                AppState.invoiceFiles.push(imageData);
                successCount++;
                
                const progress = Math.round((currentIndex / totalNew) * 100);
                progressBar.style.width = `${progress}%`;
                
                // 主动清理 Canvas 内存
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                context.clearRect(0, 0, canvasWidth, canvasHeight);
                canvas.width = 0;
                canvas.height = 0;
                // Canvas 会在作用域结束后自动被垃圾回收
                
            } catch (error) {
                console.error(`文件 ${file.name} 处理失败:`, error);
                failCount++;
                failedFiles.push(file.name);
            }
        }
        
        // 显示处理结果
        if (successCount > 0) {
            document.getElementById('successInfo').innerText = `✅ 已成功加载 ${AppState.invoiceFiles.length} 张发票 ✨`;
            updateFileList();
            document.getElementById('exportBtn').disabled = false;
            document.getElementById('printBtn').disabled = false;
            renderPreview();
            
            showToast(`成功加载 ${successCount} 个文件`, 'success');
        }
        
        if (failCount > 0) {
            const failMessage = failCount === 1 
                ? `文件处理失败：${failedFiles[0]}`
                : `${failCount} 个文件处理失败`;
            showToast(failMessage, 'error', 5000);
        }
        
        // 如果所有文件都失败，显示提示
        if (successCount === 0 && failCount > 0) {
            showToast('所有文件处理失败，请检查文件格式', 'error', 5000);
        }
        
    } catch (error) {
        console.error('文件处理失败:', error);
        showToast('文件处理失败，请重试！', 'error');
        resetApp();
    } finally {
        AppState.isProcessing = false;
        progressWrapper.style.display = 'none';
    }
}

function renderPreview() {
    try {
        const grid = document.getElementById('previewGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        if (!AppState.invoiceFiles.length) return;
        
        const totalPages = Math.ceil(AppState.invoiceFiles.length / AppState.currentMode);
        
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const pageDiv = document.createElement('div');
            const pageClass = AppState.currentMode === 2 ? 'v-page' : 'h-page';
            const linesClass = AppState.showLines ? 'show-lines' : '';
            pageDiv.className = `preview-page ${pageClass} ${linesClass}`;
            pageDiv.innerHTML = '<div class="line-h"></div><div class="line-v"></div>';
            
            for (let slotIndex = 0; slotIndex < AppState.currentMode; slotIndex++) {
                const fileIndex = pageIndex * AppState.currentMode + slotIndex;
                if (fileIndex >= AppState.invoiceFiles.length) break;
                
                const slot = document.createElement('div');
                slot.className = 'slot';
                
                const margin = AppState.currentMargin;
                
                if (AppState.currentMode === 2) {
                    slot.style.width = '100%';
                    slot.style.height = '50%';
                    slot.style.top = slotIndex === 0 ? '0' : '50%';
                    slot.style.left = '0';
                } else {
                    slot.style.width = '50%';
                    slot.style.height = '50%';
                    slot.style.top = slotIndex < 2 ? '0' : '50%';
                    slot.style.left = slotIndex % 2 === 0 ? '0' : '50%';
                }
                
                slot.style.padding = `${margin}mm`;
                
                const img = document.createElement('img');
                img.src = AppState.invoiceFiles[fileIndex];
                img.alt = `发票 ${fileIndex + 1}`;
                slot.appendChild(img);
                
                pageDiv.appendChild(slot);
            }
            grid.appendChild(pageDiv);
        }
        updateModeButtons();
    } catch (error) {
        console.error('渲染预览时发生错误:', error);
        const grid = document.getElementById('previewGrid');
        if (grid) {
            grid.innerHTML = `<div style="text-align: center; padding: 20px; color: #e67e22;"><p>⚠️ 预览渲染失败</p><p>请尝试调整设置或重新加载文件</p></div>`;
        }
    }
}

function updateMargin(value) {
    AppState.currentMargin = parseInt(value);
    document.getElementById('marginVal').innerText = value;
    renderPreview();
}

function setMode(mode) {
    if (AppState.currentMode === mode) return;
    AppState.currentMode = mode;
    document.getElementById('theBody').className = `mode-${mode}`;
    renderPreview();
}

function toggleLines() {
    AppState.showLines = !AppState.showLines;
    const btn = document.getElementById('lineToggle');
    btn.innerText = AppState.showLines ? '已开启' : '已关闭';
    btn.className = `toggle-btn ${AppState.showLines ? 'btn-on' : 'btn-off'}`;
    renderPreview();
}

function updateModeButtons() {
    document.getElementById('m2').classList.toggle('active', AppState.currentMode === 2);
    document.getElementById('m4').classList.toggle('active', AppState.currentMode === 4);
}

async function savePDF() {
    if (!AppState.invoiceFiles.length) return;
    
    try {
        const orientation = AppState.currentMode === 2 ? 'portrait' : 'landscape';
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        if (!doc) throw new Error('无法创建PDF文档');
        
        const margin = AppState.currentMargin;
        
        for (let i = 0; i < AppState.invoiceFiles.length; i++) {
            if (i > 0 && i % AppState.currentMode === 0 && i < AppState.invoiceFiles.length) {
                doc.addPage();
            }
            
            const slotIndex = i % AppState.currentMode;
            let x, y, slotWidth, slotHeight;
            
            if (AppState.currentMode === 2) {
                slotWidth = 210; slotHeight = 148.5;
                x = 0; y = slotIndex === 0 ? 0 : 148.5;
            } else {
                slotWidth = 148.5; slotHeight = 105;
                x = (slotIndex === 1 || slotIndex === 3) ? 148.5 : 0;
                y = slotIndex < 2 ? 0 : 105;
            }
            
            doc.addImage(AppState.invoiceFiles[i], 'JPEG', x + margin, y + margin, slotWidth - (margin * 2), slotHeight - (margin * 2));
            
            if (AppState.showLines && slotIndex === (AppState.currentMode - 1)) {
                doc.setDrawColor(120); doc.setLineWidth(0.1);
                doc.setLineDashPattern([2, 2], 0);
                if (AppState.currentMode === 2) {
                    doc.line(0, 148.5, 210, 148.5);
                } else {
                    doc.line(0, 105, 297, 105);
                    doc.line(148.5, 0, 148.5, 210);
                }
                doc.setLineDashPattern([], 0);
            }
        }
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hour}${minute}`;
        
        doc.save(`发票_${timestamp}.pdf`);
    } catch (error) {
        console.error('导出PDF失败:', error);
        let errorMsg = '导出PDF失败';
        if (error.message?.includes('security')) errorMsg += '：可能是浏览器安全策略限制，请尝试在其他浏览器中操作';
        else if (error.message?.includes('memory')) errorMsg += '：文件过大导致内存不足，请减少文件数量';
        showToast(errorMsg + '，请重试！', 'error', 6000);
    }
}

function showPrintDialog() {
    if (!AppState.invoiceFiles.length) return;
    const modeText = AppState.currentMode === 2 ? '1页2张(纵向)' : '1页4张(横向)';
    const orientationText = AppState.currentMode === 2 ? '纵向' : '横向';
    document.getElementById('printModeText').textContent = modeText;
    document.getElementById('printOrientationText').textContent = orientationText;
    document.getElementById('printDialog').style.display = 'flex';
}

function hidePrintDialog() {
    document.getElementById('printDialog').style.display = 'none';
}

function handlePrint() {
    if (!AppState.invoiceFiles.length) return;
    
    // 根据布局模式设置打印方向
    const printOrientation = AppState.currentMode === 2 ? 'portrait' : 'landscape';
    
    // 动态创建或更新打印样式
    let printStyle = document.getElementById('dynamic-print-style');
    if (!printStyle) {
        printStyle = document.createElement('style');
        printStyle.id = 'dynamic-print-style';
        printStyle.setAttribute('media', 'print');
        document.head.appendChild(printStyle);
    }
    
    // 设置 @page 规则
    printStyle.textContent = `
        @page {
            margin: 0;
            size: A4 ${printOrientation};
        }
    `;
    
    setTimeout(() => { 
        window.print(); 
        setTimeout(() => { window.scrollTo(0, 0); }, 100); 
    }, 100);
}

function resetApp() {
    if (AppState.isProcessing && !confirm('文件正在处理中，确定要重置吗？')) return;

    AppState.invoiceFiles = [];
    AppState.originalFiles = [];
    AppState.currentMargin = CONFIG.DEFAULT_MARGIN;
    AppState.showLines = true;
    AppState.isProcessing = false;
    
    document.getElementById('dropZone').style.display = 'flex';
    document.getElementById('feedbackArea').style.display = 'none';
    document.getElementById('previewGrid').innerHTML = '';
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('printBtn').disabled = true;
    document.getElementById('progressWrapper').style.display = 'none';
    document.getElementById('marginRange').value = CONFIG.DEFAULT_MARGIN;
    document.getElementById('marginVal').innerText = CONFIG.DEFAULT_MARGIN;
    const lineToggle = document.getElementById('lineToggle');
    lineToggle.innerText = '已开启';
    lineToggle.className = 'toggle-btn btn-on';
    document.getElementById('fileIn').value = '';
    
    setMode(4);
    hidePrintDialog();
}

function goToHomePage() {
    window.location.href = "https://888.topmer.top";
}

function openInvoiceTool() {
    window.open("https://888.topmer.top/jt/index.html", '_blank', 'noopener,noreferrer');
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    if (!checkBrowserCompatibility()) return;

    const elements = {
        fileIn: document.getElementById('fileIn'),
        dropZone: document.getElementById('dropZone'),
        feedbackArea: document.getElementById('feedbackArea'),
        addMoreFilesBtn: document.getElementById('addMoreFilesBtn'),
        marginRange: document.getElementById('marginRange'),
        lineToggle: document.getElementById('lineToggle'),
        m2: document.getElementById('m2'),
        m4: document.getElementById('m4'),
        exportBtn: document.getElementById('exportBtn'),
        printBtn: document.getElementById('printBtn'),
        resetBtn: document.getElementById('resetBtn'),
        homeBtn: document.getElementById('homeBtn'),
        invoiceBtn: document.getElementById('invoiceBtn'),
        helpBtn: document.getElementById('helpBtn'),
        helpClose: document.getElementById('helpClose'),
        confirmPrint: document.getElementById('confirmPrint'),
        cancelPrint: document.getElementById('cancelPrint'),
        browserWarningClose: document.getElementById('browserWarningClose'),
        printDialog: document.getElementById('printDialog'),
        helpDialog: document.getElementById('helpDialog'),
        fileList: document.getElementById('fileList')
    };

    elements.fileIn?.addEventListener('change', e => handleFiles(e.target.files));
    elements.dropZone?.addEventListener('click', () => elements.fileIn.click());
    elements.addMoreFilesBtn?.addEventListener('click', () => elements.fileIn.click());
    
    elements.dropZone?.addEventListener('dragover', e => {
        e.preventDefault();
        elements.dropZone.style.background = 'rgba(255, 255, 255, 0.4)';
        elements.dropZone.style.borderColor = '#147a61';
    });
    elements.dropZone?.addEventListener('dragleave', e => {
        e.preventDefault();
        elements.dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
        elements.dropZone.style.borderColor = '#4a6d7c';
    });
    elements.dropZone?.addEventListener('drop', e => {
        e.preventDefault();
        elements.dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
        elements.dropZone.style.borderColor = '#4a6d7c';
        if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
    });

    elements.marginRange?.addEventListener('input', e => updateMargin(e.target.value));
    elements.lineToggle?.addEventListener('click', toggleLines);
    elements.m2?.addEventListener('click', () => setMode(2));
    elements.m4?.addEventListener('click', () => setMode(4));
    elements.exportBtn?.addEventListener('click', savePDF);
    elements.printBtn?.addEventListener('click', showPrintDialog);
    elements.resetBtn?.addEventListener('click', resetApp);
    elements.homeBtn?.addEventListener('click', goToHomePage);
    elements.invoiceBtn?.addEventListener('click', openInvoiceTool);
    elements.helpBtn?.addEventListener('click', showHelp);
    elements.helpClose?.addEventListener('click', closeHelp);
    elements.confirmPrint?.addEventListener('click', () => { hidePrintDialog(); handlePrint(); });
    elements.cancelPrint?.addEventListener('click', hidePrintDialog);
    elements.browserWarningClose?.addEventListener('click', closeBrowserWarning);  

    // 文件列表删除按钮事件委托
    elements.fileList?.addEventListener('click', e => {
        if (e.target.classList.contains('file-remove-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            if (!isNaN(index)) {
                removeFile(index);
            }
        }
    });

    elements.printDialog?.addEventListener('click', e => { if (e.target === elements.printDialog) hidePrintDialog(); });
    elements.helpDialog?.addEventListener('click', e => { if (e.target === elements.helpDialog) closeHelp(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            hidePrintDialog();
            closeHelp();
            closeBrowserWarning();
        }
    });

    window.addEventListener('error', event => console.error('全局错误捕获:', event.error));
    window.addEventListener('unhandledrejection', event => {
        console.error('未处理的Promise拒绝:', event.reason);
        event.preventDefault();
    });

    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    updateModeButtons();
});