// Pyodide实例和状态管理
let pyodide = null;
let isPyodideReady = false;
let fileContent = null;

// 初始化Pyodide
async function initializePyodide() {
    const loading = document.getElementById('loading');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    try {
        loading.style.display = 'flex';
        progressText.textContent = '正在加载Python运行时...';
        progressBar.style.width = '20%';

        // 加载Pyodide
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
            stdout: console.log,
            stderr: console.error
        });

        progressBar.style.width = '40%';
        progressText.textContent = '正在加载核心包...';

        // 加载必要的Python包
        await pyodide.loadPackage(['micropip', 'numpy', 'pandas']);
        
        progressBar.style.width = '60%';
        progressText.textContent = '正在安装matplotlib...';

        // 安装matplotlib
        await pyodide.loadPackage('matplotlib');
        
        progressBar.style.width = '80%';
        progressText.textContent = '正在安装squarify...';

        // 使用micropip安装squarify
        await pyodide.runPythonAsync(`
            import micropip
            await micropip.install('squarify')
        `);

        progressBar.style.width = '100%';
        progressText.textContent = '初始化完成！';

        // 设置完成状态
        isPyodideReady = true;
        document.getElementById('processBtn').disabled = false;
        
        // 延迟隐藏加载界面，让用户看到完成状态
        setTimeout(() => {
            loading.style.display = 'none';
        }, 1000);

        console.log('Pyodide初始化完成');

    } catch (error) {
        console.error('Pyodide初始化失败:', error);
        progressText.textContent = `初始化失败: ${error.message}`;
        progressBar.style.background = '#e74c3c';
    }
}

// 文件处理相关函数
function setupFileHandlers() {
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const uploadArea = document.getElementById('uploadArea');

    // 点击选择文件按钮
    selectFileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择变化
    fileInput.addEventListener('change', handleFileSelect);

    // 拖放功能
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect({ target: fileInput });
        }
    });
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('没有选择文件');
        return;
    }

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Please select a CSV format file');
        return;
    }

    try {
        console.log('处理文件:', file.name);
        
        // 显示文件信息
        const fileNameElement = document.getElementById('fileName');
        const fileInfoElement = document.getElementById('fileInfo');
        
        if (fileNameElement) {
            fileNameElement.textContent = file.name;
        }
        
        if (fileInfoElement) {
            fileInfoElement.style.display = 'block';
        }

        // 读取文件内容
        const fileContent = await readFileAsText(file);
        console.log('文件读取成功，大小:', fileContent.length, '字符');
        
        // 显示文件预览
        await showFilePreview(fileContent);
        
        // 更新列选择器
        updateColumnSelectors(fileContent);

    } catch (error) {
        console.error('文件读取失败:', error);
        alert('File reading failed, please try again');
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function showFilePreview(csvContent) {
    const lines = csvContent.split('\n').slice(0, 6); // 只显示前6行
    const previewHtml = lines.map((line, index) => {
        const cells = line.split(',').map(cell => cell.trim());
        if (index === 0) {
            // 表头
            return `<tr>${cells.map(cell => `<th>${cell}</th>`).join('')}</tr>`;
        } else {
            // 数据行
            return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
        }
    }).join('');

    document.getElementById('filePreview').innerHTML = `
        <table class="preview-table">
            ${previewHtml}
        </table>
        ${lines.length >= 5 ? '<p style="margin-top: 10px; color: #666;" data-i18n="ui.showingTopRows">Showing top 5 rows...</p>' : ''}
    `;
}

function updateColumnSelectors(csvContent) {
    console.log('更新列选择器...');
    
    const sizeColumn = document.getElementById('sizeColumn');
    const labelColumn = document.getElementById('labelColumn');
    
    // 安全检查
    if (!sizeColumn || !labelColumn) {
        console.error('列选择器元素未找到:', {
            sizeColumn: !!sizeColumn,
            labelColumn: !!labelColumn
        });
        return;
    }
    
    const lines = csvContent.split('\n');
    if (lines.length === 0) {
        console.warn('CSV内容为空');
        return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    
    console.log('检测到的列标题:', headers);
    
    // 清空现有选项
    sizeColumn.innerHTML = '';
    labelColumn.innerHTML = '';
    
    // 添加"请选择"选项
    const pleaseSelectOption = '<option value="">Please select...</option>';
    sizeColumn.innerHTML = pleaseSelectOption;
    labelColumn.innerHTML = pleaseSelectOption;
    
    // 添加列选项
    headers.forEach(header => {
        if (header && header.trim() !== '') {
            const option1 = document.createElement('option');
            option1.value = header;
            option1.textContent = header;
            sizeColumn.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = header;
            option2.textContent = header;
            labelColumn.appendChild(option2);
        }
    });
    
    // 设置默认选择
    if (headers.length >= 2) {
        sizeColumn.value = headers[1];
        labelColumn.value = headers[0];
    }
    
    console.log('列选择器更新完成');
}

// 主要处理函数
async function processData() {
    if (!isPyodideReady || !fileContent) {
        showError('请等待Python环境初始化完成并选择文件');
        return;
    }

    const processBtn = document.getElementById('processBtn');
    const output = document.getElementById('output');

    // 显示加载状态
    setButtonLoading(processBtn, true);
    output.innerHTML = ''; // 清空之前的输出

    try {
        // 获取用户选择的参数
        const chartType = document.getElementById('chartType').value;
        const sizeColumn = document.getElementById('sizeColumn').value;
        const labelColumn = document.getElementById('labelColumn').value;

        // 准备Python代码（现在会读取python/main.py）
        console.log('正在加载Python主文件...');
        const pythonCode = await preparePythonCode(fileContent, chartType, sizeColumn, labelColumn);
        
        // 在Pyodide中执行Python代码
        console.log('开始执行Python代码...');
        const startTime = performance.now();
        
        const resultJson = await pyodide.runPythonAsync(pythonCode);
        const result = JSON.parse(resultJson);
        
        const endTime = performance.now();
        console.log(`Python代码执行完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);

        // 显示结果或错误
        if (result.success) {
            displayResults(result);
        } else {
            displayError(result);
        }

    } catch (error) {
        console.error('处理失败:', error);
        showError(`处理过程发生错误: ${error.message}`);
    } finally {
        // 恢复按钮状态
        setButtonLoading(processBtn, false);
    }
}

// 新的辅助函数：显示错误
function displayError(errorInfo) {
    const output = document.getElementById('output');
    
    let detailsHtml = '';
    if (errorInfo.details) {
        detailsHtml = `
            <div class="error-details">
                <h4>详细错误信息：</h4>
                <pre class="error-pre">${escapeHtml(errorInfo.details)}</pre>
            </div>
        `;
    }
    
    let troubleshootingHtml = '';
    if (errorInfo.type === 'FileLoadError') {
        troubleshootingHtml = `
            <div class="troubleshooting">
                <h4>故障排除建议：</h4>
                <ul>
                    <li>检查 <code>python/main.py</code> 文件是否存在</li>
                    <li>确认文件路径正确（相对于网站根目录）</li>
                    <li>确保文件已正确上传到GitHub仓库</li>
                    <li>检查浏览器控制台的网络选项卡查看文件加载状态</li>
                </ul>
            </div>
        `;
    } else if (errorInfo.type === 'ImportError') {
        troubleshootingHtml = `
            <div class="troubleshooting">
                <h4>故障排除建议：</h4>
                <ul>
                    <li>检查 <code>python/main.py</code> 是否正确定义了 <code>process_csv_data</code> 函数</li>
                    <li>确认函数名称拼写正确</li>
                    <li>确保函数有正确的参数签名：<code>process_csv_data(csv_content, chart_type, size_column, label_column)</code></li>
                </ul>
            </div>
        `;
    }
    
    output.innerHTML = `
        <div class="error-container">
            <div class="error-header">
                <h2>❌ ${errorInfo.error || '处理失败'}</h2>
                <p class="error-message">${errorInfo.message || '未知错误'}</p>
            </div>
            
            ${detailsHtml}
            ${troubleshootingHtml}
            
            <div class="error-actions">
                <button onclick="location.reload()" class="btn-retry">🔄 刷新页面重试</button>
                <button onclick="showFileCheck()" class="btn-secondary">📁 检查文件状态</button>
            </div>
        </div>
    `;
}

// 显示文件检查界面
function showFileCheck() {
    const output = document.getElementById('output');
    
    output.innerHTML = `
        <div class="file-check">
            <h3>📁 文件状态检查</h3>
            <p>正在检查 <code>python/main.py</code> 文件状态...</p>
            <div id="fileCheckResult"></div>
            <button onclick="performFileCheck()" class="btn-primary">开始检查</button>
        </div>
    `;
    
    // 延迟执行检查，让UI先更新
    setTimeout(performFileCheck, 100);
}

// 执行文件检查
async function performFileCheck() {
    const resultDiv = document.getElementById('fileCheckResult');
    
    try {
        resultDiv.innerHTML = '<p>正在检查文件...</p>';
        
        // 尝试加载文件
        const response = await fetch('python/main.py');
        
        if (response.ok) {
            const content = await response.text();
            const fileSize = new Blob([content]).size;
            
            resultDiv.innerHTML = `
                <div class="check-success">
                    <p data-i18n="ui.fileSelected">✅ File loaded successfully! </p>
                    <ul>
                        <li>HTTP状态码: ${response.status} ${response.statusText}</li>
                        <li>文件大小: ${fileSize} 字节</li>
                        <li>内容预览: <pre>${escapeHtml(content.substring(0, 200))}...</pre></li>
                    </ul>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="check-failure">
                    <p>❌ 文件加载失败</p>
                    <ul>
                        <li>HTTP状态码: ${response.status} ${response.statusText}</li>
                        <li>可能原因: 
                            <ul>
                                <li>文件不存在于服务器</li>
                                <li>路径不正确</li>
                                <li>服务器配置问题</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="check-error">
                <p>⚠️ 检查过程中发生错误</p>
                <p><strong>错误信息:</strong> ${error.message}</p>
                <p>请检查浏览器控制台获取更多信息。</p>
            </div>
        `;
    }
}

// 辅助函数：设置按钮加载状态
function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    button.disabled = isLoading;
    if (btnText) btnText.style.display = isLoading ? 'none' : 'inline';
    if (btnLoading) btnLoading.style.display = isLoading ? 'inline' : 'none';
}

// 辅助函数：显示简单错误
function showError(message) {
    const output = document.getElementById('output');
    output.innerHTML = `
        <div class="simple-error">
            <h3>❌ 错误</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

// 辅助函数：HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// preparePythonCode 函数 
async function preparePythonCode(csvContent, chartType, sizeColumn, labelColumn) {
    try {
        // 1. 尝试加载 python/main.py 文件内容
        const response = await fetch('python/main.py');
        if (!response.ok) {
            throw new Error(`无法加载Python主文件: HTTP ${response.status} ${response.statusText}`);
        }
        
        const pythonMainCode = await response.text();
        
        // 2. 验证文件内容是否为空或无效
        if (!pythonMainCode || pythonMainCode.trim().length === 0) {
            throw new Error('Python主文件内容为空');
        }
        
        // 3. 检查文件是否包含必要的函数
        if (!pythonMainCode.includes('def process_csv_data')) {
            console.warn('Python主文件中未找到 process_csv_data 函数');
            // 这里可以继续执行，因为函数可能在主文件中以其他方式定义
        }
        
        // 4. 转义CSV内容中的特殊字符
        const escapedCsvContent = csvContent
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
        
        // 5. 创建包装代码，调用 main.py 中的函数
        return `
# =========== 加载外部Python主文件 ===========
${pythonMainCode}

# =========== 主执行逻辑 ===========
import json
import traceback
import sys

try:
    # 检查是否成功导入了必要的函数
    if 'process_csv_data' not in locals() and 'process_csv_data' not in globals():
        # 尝试从可能的模块中导入
        try:
            from __main__ import process_csv_data
        except ImportError:
            # 尝试动态查找函数
            for name, obj in globals().items():
                if callable(obj) and name == 'process_csv_data':
                    process_csv_data = obj
                    break
            else:
                raise ImportError("未找到 process_csv_data 函数")
    
    print("✓ Python主文件加载成功")
    print(f"✓ 图表类型: {chartType}")
    print(f"✓ 数值列: {sizeColumn}")
    print(f"✓ 标签列: {labelColumn}")
    
    # 调用处理函数
    csv_content = """${escapedCsvContent}"""
    chart_type = """${chartType}"""
    size_column = """${sizeColumn}""" if """${sizeColumn}""" else None
    label_column = """${labelColumn}""" if """${labelColumn}""" else None
    
    print("开始处理CSV数据...")
    result = process_csv_data(csv_content, chart_type, size_column, label_column)
    
    # 确保返回的是字典
    if not isinstance(result, dict):
        raise TypeError(f"process_csv_data 应返回字典，但返回了 {type(result)}")
    
    print("✓ 数据处理完成")
    json.dumps(result)
    
except ImportError as e:
    error_msg = f"导入错误: {str(e)}\\n请确保python/main.py中定义了process_csv_data函数"
    error_result = {
        'success': False,
        'error': 'Python函数未定义',
        'message': error_msg,
        'details': str(e),
        'type': 'ImportError'
    }
    json.dumps(error_result)
    
except Exception as e:
    # 获取完整的错误追踪信息
    exc_type, exc_value, exc_traceback = sys.exc_info()
    traceback_details = traceback.format_exception(exc_type, exc_value, exc_traceback)
    
    error_result = {
        'success': False,
        'error': 'Python执行错误',
        'message': f"Python代码执行失败: {str(e)}",
        'details': ''.join(traceback_details),
        'type': exc_type.__name__
    }
    json.dumps(error_result)
`;
        
    } catch (error) {
        // 不再提供备选方案，直接抛出错误
        console.error('加载python/main.py失败:', error);
        
        // 创建一个特殊的错误返回，而不是内联代码
        const errorResult = {
            success: false,
            error: '文件加载失败',
            message: `无法加载Python主文件: ${error.message}`,
            details: '请确保python/main.py文件存在且可访问',
            type: 'FileLoadError'
        };
        
        // 直接返回一个会立即报错的Python代码
        return `
import json

error_result = ${JSON.stringify(errorResult)}
json.dumps(error_result)
`;
    }
}


function displayResults(result) {
    const output = document.getElementById('output');
    
    if (result.success) {
        // 获取当前语言的翻译
        const currentTranslations = csvLanguageManager ? csvLanguageManager.getCurrentTranslations() : {};
        
        // 辅助函数：安全获取翻译
        const t = (key) => {
            const value = key.split('.').reduce((obj, i) => obj && obj[i], currentTranslations);
            return value || key;
        };
        
        // 创建下载按钮的HTML（使用base64数据）
        const downloadButtonHTML = `
            <button id="downloadImageBtn" class="btn-download" 
                    onclick="downloadChartImage('${result.image}', '${result.stats.total_rows}_rows_chart.png')">
                📥 ${t('actions.download') || 'Download Image'}
            </button>
        `;
        
        output.innerHTML = `
            <div class="results">
                <h2>${t('results.success')}</h2>
                <p class="success-message">${result.message}</p>
                
                <div class="stats">
                    <div class="stat-card">
                        <h3>${result.stats.total_rows}</h3>
                        <p>${t('results.dataRows')}</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.total_columns}</h3>
                        <p>${t('results.dataColumns')}</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.size_column_stats.mean.toFixed(2)}</h3>
                        <p>${t('results.average')}</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.size_column_stats.sum.toFixed(2)}</h3>
                        <p>${t('results.total')}</p>
                    </div>
                </div>
                
                <div class="chart-container">
                    <div class="chart-header">
                        <h3>${t('results.visualization')}</h3>
                        ${downloadButtonHTML}
                    </div>
                    <img src="data:image/png;base64,${result.image}" 
                         alt="${t('results.visualization')}"
                         id="generatedChart">
                </div>
                
                <div class="data-stats">
                    <h3>${t('results.statsDetails')}</h3>
                    <div class="stats-details">
                        <p><strong>${t('results.min')}</strong> ${result.stats.size_column_stats.min.toFixed(2)}</p>
                        <p><strong>${t('results.max')}</strong> ${result.stats.size_column_stats.max.toFixed(2)}</p>
                        <p><strong>${t('results.median')}</strong> ${result.stats.size_column_stats.median.toFixed(2)}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        // 错误处理保持不变
        output.innerHTML = createErrorDisplay(result);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，开始初始化Pyodide...');
    
    // 设置文件处理器
    setupFileHandlers();
    
    // 绑定处理按钮事件
    document.getElementById('processBtn').addEventListener('click', processData);
    
    // 初始化Pyodide
    initializePyodide();
});

// 错误处理
window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
});


// 在页面加载时检查Python文件状态
async function checkPythonFileStatus() {
    try {
        console.log('检查Python文件状态...');
        const response = await fetch('python/main.py');
        
        if (response.ok) {
            console.log('✅ python/main.py 文件可访问');
            return true;
        } else {
            console.warn(`⚠️ python/main.py 文件访问失败: HTTP ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('❌ 检查Python文件状态时出错:', error);
        return false;
    }
}

// 在Pyodide初始化完成后检查
async function initializePyodide() {
    // ... 原有初始化代码 ...
    
    // 在初始化完成后检查文件状态
    const isFileAccessible = await checkPythonFileStatus();
    if (!isFileAccessible) {
        console.warn('Python文件可能无法访问，应用功能可能受限');
    }
    
    // ... 继续原有初始化 ...
}