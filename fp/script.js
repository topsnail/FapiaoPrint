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
    originalFileNames: [], // 保存原始文件名
    originalFiles: [] // 保存原始文件对象
};

const { jsPDF } = window.jspdf;

// 设置pdf.js worker源
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/build/pdf.worker.mjs';

// 浏览器兼容性检测
function checkBrowserCompatibility() {
    // 检测关键API是否支持
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

// 使用说明弹窗功能
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

// 文件列表更新函数
function updateFileList(files) {
    try {
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        
        if (!fileList || !fileCount) {
            console.warn('updateFileList: 文件列表元素不存在');
            return;
        }
        
        if (!files || files.length === 0) {
            fileList.innerHTML = '';
            fileCount.textContent = '0';
            return;
        }
        
        fileCount.textContent = files.length;
        
        // 生成文件列表HTML，添加title属性用于悬停提示
        fileList.innerHTML = files.map((file, index) => {
            const displayName = file.name.length > 25 
                ? file.name.substring(0, 22) + '...' 
                : file.name;
                
            return `
                <div class="file-item" title="文件名: ${file.name}">
                    <div class="file-name" title="${file.name}">
                        ${index + 1}. ${displayName}
                    </div>
                    <div class="file-status">✓ 已加载</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('更新文件列表时出错:', error);
    }
}

async function handleFiles(files) {
    // 新增：参数验证
    if (!files || files.length === 0) {
        console.error('handleFiles: 未接收到文件');
        return;
    }

    if (AppState.isProcessing) {
        alert('正在处理文件中，请稍候...');
        return;
    }

    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (!pdfFiles.length) {
        alert('请选择PDF文件！');
        return;
    }

    if (pdfFiles.length > CONFIG.MAX_FILES) {
        alert(`最多支持${CONFIG.MAX_FILES}个文件，已自动截取前${CONFIG.MAX_FILES}个`);
        pdfFiles.length = CONFIG.MAX_FILES;
    }

    AppState.isProcessing = true;
    AppState.invoiceFiles = [];
    AppState.originalFileNames = pdfFiles.map(f => f.name);
    AppState.originalFiles = pdfFiles; // 保存原始文件对象
    
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
        for (let i = 0; i < pdfFiles.length; i++) {
            progressText.innerText = `解析中 ${i + 1} / ${pdfFiles.length}`;
            
            try {
                const data = await pdfFiles[i].arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ 
                    data, 
                    cMapUrl: './pdfjs/web/cmaps/',
                    cMapPacked: true 
                }).promise;
                
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: CONFIG.PDF_RENDER_SCALE });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                if (!context) {
                    throw new Error('无法获取canvas上下文');
                }
                
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
                
                const imageData = canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY);
                AppState.invoiceFiles.push(imageData);
                
                const progress = Math.round(((i + 1) / pdfFiles.length) * 100);
                progressBar.style.width = `${progress}%`;
                
                // 释放canvas内存
                canvas.width = 0;
                canvas.height = 0;
                
            } catch (error) {
                console.error(`文件 ${pdfFiles[i].name} 处理失败:`, error);
                continue;
            }
        }
        
        const dropZone = document.getElementById('dropZone');
        const feedbackArea = document.getElementById('feedbackArea');
        const successInfo = document.getElementById('successInfo');
        
        if (!dropZone || !feedbackArea || !successInfo) {
            throw new Error('必要的DOM元素不存在');
        }
        
        dropZone.style.display = 'none';
        feedbackArea.style.display = 'flex';
        successInfo.innerText = `✅ 已成功加载 ${AppState.invoiceFiles.length} 张发票 ✨`;
        
        // 更新文件列表
        updateFileList(pdfFiles);
        
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        
        if (exportBtn) exportBtn.disabled = false;
        if (printBtn) printBtn.disabled = false;
        
        renderPreview();
        
    } catch (error) {
        console.error('文件处理失败:', error);
        alert('文件处理失败，请重试！');
        resetApp();
    } finally {
        AppState.isProcessing = false;
        if (progressWrapper) {
            progressWrapper.style.display = 'none';
        }
    }
}

function renderPreview() {
    try {
        const grid = document.getElementById('previewGrid');
        if (!grid) {
            console.error('renderPreview: 预览容器不存在');
            return;
        }
        
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
        
        // 提供降级体验
        const grid = document.getElementById('previewGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e67e22;">
                    <p>⚠️ 预览渲染失败</p>
                    <p>请尝试调整设置或重新加载文件</p>
                </div>
            `;
        }
    }
}

function updateMargin(value) {
    try {
        AppState.currentMargin = parseInt(value);
        const marginVal = document.getElementById('marginVal');
        if (marginVal) {
            marginVal.innerText = value;
        }
        renderPreview();
    } catch (error) {
        console.error('更新边距时出错:', error);
    }
}

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

function toggleLines() {
    try {
        AppState.showLines = !AppState.showLines;
        const btn = document.getElementById('lineToggle');
        
        if (btn) {
            btn.innerText = AppState.showLines ? '已开启' : '已关闭';
            btn.className = `toggle-btn ${AppState.showLines ? 'btn-on' : 'btn-off'}`;
        }
        
        renderPreview();
    } catch (error) {
        console.error('切换裁剪线时出错:', error);
    }
}

function updateModeButtons() {
    try {
        const m2 = document.getElementById('m2');
        const m4 = document.getElementById('m4');
        
        if (m2) m2.classList.toggle('active', AppState.currentMode === 2);
        if (m4) m4.classList.toggle('active', AppState.currentMode === 4);
    } catch (error) {
        console.error('更新模式按钮时出错:', error);
    }
}

async function savePDF() {
    if (!AppState.invoiceFiles.length) {
        console.warn('savePDF: 没有可导出的文件');
        return;
    }
    
    try {
        const orientation = AppState.currentMode === 2 ? 'portrait' : 'landscape';
        
        const doc = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: 'a4'
        });
        
        if (!doc) {
            throw new Error('无法创建PDF文档');
        }
        
        const margin = AppState.currentMargin;
        
        for (let i = 0; i < AppState.invoiceFiles.length; i++) {
            if (i > 0 && i % AppState.currentMode === 0) {
                doc.addPage();
            }
            
            const slotIndex = i % AppState.currentMode;
            let x, y, slotWidth, slotHeight;
            
            if (AppState.currentMode === 2) {
                slotWidth = 210;
                slotHeight = 148.5;
                x = 0;
                y = slotIndex === 0 ? 0 : 148.5;
            } else {
                slotWidth = 148.5;
                slotHeight = 105;
                x = (slotIndex === 1 || slotIndex === 3) ? 148.5 : 0;
                y = slotIndex < 2 ? 0 : 105;
            }
            
            doc.addImage(
                AppState.invoiceFiles[i],
                'JPEG',
                x + margin,
                y + margin,
                slotWidth - (margin * 2),
                slotHeight - (margin * 2)
            );
            
            if (AppState.showLines && slotIndex === (AppState.currentMode - 1)) {
                doc.setDrawColor(120);
                doc.setLineWidth(0.1);
                
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
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        doc.save(`发票合版_${timestamp}.pdf`);
        
    } catch (error) {
        console.error('导出PDF失败:', error);
        
        // 提供更详细的错误信息
        let errorMsg = '导出PDF失败';
        if (error.message && error.message.includes('security')) {
            errorMsg += '：可能是浏览器安全策略限制，请尝试在其他浏览器中操作';
        } else if (error.message && error.message.includes('memory')) {
            errorMsg += '：文件过大导致内存不足，请减少文件数量';
        }
        
        alert(errorMsg + '，请重试！');
    }
}

function showPrintDialog() {
    if (!AppState.invoiceFiles.length) {
        console.warn('showPrintDialog: 没有可打印的文件');
        return;
    }
    
    try {
        const modeText = AppState.currentMode === 2 ? '1页2张(纵向)' : '1页4张(横向)';
        const orientationText = AppState.currentMode === 2 ? '纵向' : '横向';
        
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
    if (!AppState.invoiceFiles.length) {
        console.warn('handlePrint: 没有可打印的文件');
        return;
    }
    
    try {
        setTimeout(() => {
            window.print();
            
            setTimeout(() => {
                window.scrollTo(0, 0);
            }, 100);
        }, 100);
    } catch (error) {
        console.error('执行打印时出错:', error);
        alert('打印失败，请检查打印机设置！');
    }
}

function resetApp() {
    if (AppState.isProcessing) {
        if (!confirm('文件正在处理中，确定要重置吗？')) {
            return;
        }
    }
    
    try {
        AppState.invoiceFiles = [];
        AppState.originalFileNames = [];
        AppState.originalFiles = [];
        AppState.currentMargin = 2;
        AppState.showLines = true;
        AppState.isProcessing = false;
        
        const dropZone = document.getElementById('dropZone');
        const feedbackArea = document.getElementById('feedbackArea');
        const previewGrid = document.getElementById('previewGrid');
        const exportBtn = document.getElementById('exportBtn');
        const printBtn = document.getElementById('printBtn');
        const progressWrapper = document.getElementById('progressWrapper');
        const marginRange = document.getElementById('marginRange');
        const marginVal = document.getElementById('marginVal');
        const lineToggle = document.getElementById('lineToggle');
        const fileIn = document.getElementById('fileIn');
        
        if (dropZone) dropZone.style.display = 'flex';
        if (feedbackArea) feedbackArea.style.display = 'none';
        if (previewGrid) previewGrid.innerHTML = '';
        if (exportBtn) exportBtn.disabled = true;
        if (printBtn) printBtn.disabled = true;
        if (progressWrapper) progressWrapper.style.display = 'none';
        if (marginRange) marginRange.value = 2;
        if (marginVal) marginVal.innerText = '2';
        if (lineToggle) {
            lineToggle.innerText = '已开启';
            lineToggle.className = 'toggle-btn btn-on';
        }
        if (fileIn) fileIn.value = '';
        
        setMode(4);
        
        hidePrintDialog();
        
    } catch (error) {
        console.error('重置应用时出错:', error);
        alert('重置失败，请刷新页面重试！');
    }
}

function goToHomePage() {
    try {
        // 这里可以替换成您的主页网址
        const homeUrl = "https://888.topmer.top";
        
        // 在当前页跳转
        window.location.href = homeUrl;
        
    } catch (error) {
        console.error('返回首页时出错:', error);
        alert('无法返回首页，请稍后重试！');
    }
}

function openInvoiceTool() {
    try {
        // 这里可以替换成您的发票工具网址
        const invoiceUrl = "https://888.topmer.top/jt";
        
        // 在新标签页打开
        window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
        
    } catch (error) {
        console.error('打开发票工具时出错:', error);
        alert('无法打开图片工具，请稍后重试！');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    // 检查浏览器兼容性
    try {
        checkBrowserCompatibility();
    } catch (error) {
        console.error('检查浏览器兼容性时出错:', error);
    }
    
    // 获取DOM元素
    const fileIn = document.getElementById('fileIn');
    const dropZone = document.getElementById('dropZone');
    const marginRange = document.getElementById('marginRange');
    const lineToggle = document.getElementById('lineToggle');
    const m2 = document.getElementById('m2');
    const m4 = document.getElementById('m4');
    const exportBtn = document.getElementById('exportBtn');
    const printBtn = document.getElementById('printBtn');
    const resetBtn = document.getElementById('resetBtn');
    const homeBtn = document.getElementById('homeBtn');
    const invoiceBtn = document.getElementById('invoiceBtn');
    const helpBtn = document.getElementById('helpBtn');
    const helpClose = document.getElementById('helpClose');
    const confirmPrint = document.getElementById('confirmPrint');
    const cancelPrint = document.getElementById('cancelPrint');
    const browserWarningClose = document.getElementById('browserWarningClose');
    
    // 文件输入事件监听
    if (fileIn) {
        fileIn.addEventListener('change', function(e) {
            if (e.target && e.target.files) {
                handleFiles(e.target.files);
            }
        });
    }
    
    // 拖拽区域事件监听
    if (dropZone) {
        dropZone.addEventListener('click', function() {
            fileIn.click();
        });
        
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.4)';
            dropZone.style.borderColor = '#147a61';
        });
        
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
            dropZone.style.borderColor = '#4a6d7c';
        });
        
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
            dropZone.style.borderColor = '#4a6d7c';
            
            if (e.dataTransfer && e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
        });
    }
    
    // 边距滑块事件
    if (marginRange) {
        marginRange.addEventListener('input', function(e) {
            updateMargin(e.target.value);
        });
    }
    
    // 裁剪线切换事件
    if (lineToggle) {
        lineToggle.addEventListener('click', toggleLines);
    }
    
    // 布局模式切换事件
    if (m2) {
        m2.addEventListener('click', function() {
            setMode(2);
        });
    }
    
    if (m4) {
        m4.addEventListener('click', function() {
            setMode(4);
        });
    }
    
    // 按钮事件
    if (exportBtn) {
        exportBtn.addEventListener('click', savePDF);
    }
    
    if (printBtn) {
        printBtn.addEventListener('click', showPrintDialog);
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', resetApp);
    }
    
    if (homeBtn) {
        homeBtn.addEventListener('click', goToHomePage);
    }
    
    if (invoiceBtn) {
        invoiceBtn.addEventListener('click', openInvoiceTool);
    }
    
    if (helpBtn) {
        helpBtn.addEventListener('click', showHelp);
    }
    
    if (helpClose) {
        helpClose.addEventListener('click', closeHelp);
    }
    
    if (confirmPrint) {
        confirmPrint.addEventListener('click', function() {
            hidePrintDialog();
            handlePrint();
        });
    }
    
    if (cancelPrint) {
        cancelPrint.addEventListener('click', hidePrintDialog);
    }
    
    if (browserWarningClose) {
        browserWarningClose.addEventListener('click', closeBrowserWarning);
    }
    
    // 打印对话框点击外部关闭
    const printDialog = document.getElementById('printDialog');
    if (printDialog) {
        printDialog.addEventListener('click', function(e) {
            if (e.target === this) {
                hidePrintDialog();
            }
        });
    }
    
    // 帮助弹窗点击外部关闭
    const helpDialog = document.getElementById('helpDialog');
    if (helpDialog) {
        helpDialog.addEventListener('click', function(e) {
            if (e.target === this) {
                closeHelp();
            }
        });
    }
    
    // ESC键关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hidePrintDialog();
            closeHelp();
            closeBrowserWarning();
        }
    });
    
    // 全局错误监听
    window.addEventListener('error', function(event) {
        console.error('全局错误捕获:', event.error);
        
        // 不显示给用户（避免干扰），但记录到控制台
        if (event.error && event.error.message) {
            console.error('错误详情:', event.error.message);
            if (event.error.stack) {
                console.error('错误堆栈:', event.error.stack);
            }
        }
    });
    
    // 未处理的Promise拒绝
    window.addEventListener('unhandledrejection', function(event) {
        console.error('未处理的Promise拒绝:', event.reason);
        event.preventDefault(); // 防止控制台默认错误
    });
    
    // 初始化模式按钮
    updateModeButtons();
});