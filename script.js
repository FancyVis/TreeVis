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
    if (!file) return;

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('请选择CSV格式的文件');
        return;
    }

    try {
        // 显示文件信息
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileInfo').style.display = 'block';

        // 读取文件内容
        fileContent = await readFileAsText(file);
        
        // 显示文件预览
        await showFilePreview(fileContent);
        
        // 更新列选择器
        updateColumnSelectors(fileContent);

    } catch (error) {
        console.error('文件读取失败:', error);
        alert('文件读取失败，请重试');
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
        ${lines.length >= 6 ? '<p style="margin-top: 10px; color: #666;">仅显示前6行...</p>' : ''}
    `;
}

function updateColumnSelectors(csvContent) {
    const lines = csvContent.split('\n');
    if (lines.length === 0) return;

    const headers = lines[0].split(',').map(h => h.trim());
    
    const sizeColumn = document.getElementById('sizeColumn');
    const labelColumn = document.getElementById('labelColumn');
    
    // 清空现有选项
    sizeColumn.innerHTML = '';
    labelColumn.innerHTML = '';
    
    // 添加新选项
    headers.forEach(header => {
        const option1 = new Option(header, header);
        const option2 = new Option(header, header);
        sizeColumn.add(option1);
        labelColumn.add(option2);
    });
    
    // 设置默认选择
    if (headers.length >= 2) {
        sizeColumn.value = headers[1]; // 假设第二列是数值
        labelColumn.value = headers[0]; // 假设第一列是标签
    }
}

// 主要处理函数
async function processData() {
    if (!isPyodideReady || !fileContent) {
        alert('请等待Python环境初始化完成并选择文件');
        return;
    }

    const processBtn = document.getElementById('processBtn');
    const btnText = processBtn.querySelector('.btn-text');
    const btnLoading = processBtn.querySelector('.btn-loading');
    const output = document.getElementById('output');

    // 显示加载状态
    processBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    // 获取用户选择的参数
    const chartType = document.getElementById('chartType').value;
    const sizeColumn = document.getElementById('sizeColumn').value;
    const labelColumn = document.getElementById('labelColumn').value;

    try {
        // 准备Python代码
        const pythonCode = preparePythonCode(fileContent, chartType, sizeColumn, labelColumn);
        
        // 在Pyodide中执行Python代码
        console.log('开始执行Python代码...');
        const startTime = performance.now();
        
        const resultJson = await pyodide.runPythonAsync(pythonCode);
        const result = JSON.parse(resultJson);
        
        const endTime = performance.now();
        console.log(`Python代码执行完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);

        // 显示结果
        displayResults(result);

    } catch (error) {
        console.error('处理失败:', error);
        output.innerHTML = `
            <div class="error-message">
                <h3>❌ 处理失败</h3>
                <p>错误信息: ${error.message}</p>
                <p>请检查文件格式和参数设置，然后重试。</p>
            </div>
        `;
    } finally {
        // 恢复按钮状态
        processBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

function preparePythonCode(csvContent, chartType, sizeColumn, labelColumn) {
    // 转义CSV内容中的特殊字符
    const escapedCsvContent = csvContent.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    return `
import pandas as pd
import matplotlib.pyplot as plt
import squarify
import base64
import json
from io import StringIO, BytesIO
import numpy as np

try:
    # 设置matplotlib中文字体（如果需要）
    plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial']
    plt.rcParams['axes.unicode_minus'] = False
    
    # 读取CSV数据
    csv_data = """${escapedCsvContent}"""
    df = pd.read_csv(StringIO(csv_data))
    
    # 数据清洗：移除空值
    df = df.dropna()
    
    # 确保数值列是数字类型
    df['${sizeColumn}'] = pd.to_numeric(df['${sizeColumn}'], errors='coerce')
    df = df.dropna(subset=['${sizeColumn}'])
    
    print(f"处理数据: {len(df)} 行, {len(df.columns)} 列")
    print("列名:", list(df.columns))
    
    # 创建图表
    plt.figure(figsize=(12, 8))
    
    if '${chartType}' == 'treemap':
        # 生成矩形树图
        if len(df) > 0:
            # 准备数据
            sizes = df['${sizeColumn}'].values
            labels = df['${labelColumn}'].astype(str).values
            
            # 如果数据太多，只取前50个
            if len(sizes) > 50:
                sizes = sizes[:50]
                labels = labels[:50]
                print("数据量较大，只显示前50个项目")
            
            # 创建颜色映射
            colors = plt.cm.viridis(np.linspace(0, 1, len(sizes)))
            
            # 绘制矩形树图
            squarify.plot(sizes=sizes, label=labels, color=colors, alpha=0.7)
            plt.title('矩形树图 - ${labelColumn} vs ${sizeColumn}', fontsize=16, pad=20)
            plt.axis('off')
            
        else:
            raise Exception("没有有效数据可生成图表")
            
    elif '${chartType}' == 'bar':
        # 生成柱状图
        if len(df) > 0:
            # 如果数据太多，只取前20个
            display_df = df.head(20) if len(df) > 20 else df
            
            plt.bar(display_df['${labelColumn}'].astype(str), display_df['${sizeColumn}'])
            plt.title('柱状图 - ${labelColumn} vs ${sizeColumn}', fontsize=16)
            plt.xlabel('${labelColumn}')
            plt.ylabel('${sizeColumn}')
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()
            
        else:
            raise Exception("没有有效数据可生成图表")
            
    elif '${chartType}' == 'line':
        # 生成折线图
        if len(df) > 0:
            # 尝试将标签列转换为数值（如果是时间序列）
            try:
                x_data = pd.to_numeric(df['${labelColumn}'])
            except:
                x_data = range(len(df))
            
            plt.plot(x_data, df['${sizeColumn}'], 'o-', linewidth=2, markersize=4)
            plt.title('折线图 - ${labelColumn} vs ${sizeColumn}', fontsize=16)
            plt.xlabel('${labelColumn}')
            plt.ylabel('${sizeColumn}')
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            
        else:
            raise Exception("没有有效数据可生成图表")
    
    # 将图表转换为base64图片
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close()
    
    # 计算统计信息
    stats = {
        'total_rows': len(df),
        'total_columns': len(df.columns),
        'column_names': df.columns.tolist(),
        'size_column_stats': {
            'mean': float(df['${sizeColumn}'].mean()),
            'median': float(df['${sizeColumn}'].median()),
            'min': float(df['${sizeColumn}'].min()),
            'max': float(df['${sizeColumn}'].max()),
            'sum': float(df['${sizeColumn}'].sum())
        }
    }
    
    # 返回结果
    result = {
        'success': True,
        'image': img_base64,
        'stats': stats,
        'message': f"成功处理 {len(df)} 行数据"
    }
    
except Exception as e:
    result = {
        'success': False,
        'error': str(e),
        'message': f"处理失败: {str(e)}"
    }

json.dumps(result)
`;
}

function displayResults(result) {
    const output = document.getElementById('output');
    
    if (result.success) {
        output.innerHTML = `
            <div class="results">
                <h2>🎉 处理完成！</h2>
                <p class="success-message">${result.message}</p>
                
                <div class="stats">
                    <div class="stat-card">
                        <h3>${result.stats.total_rows}</h3>
                        <p>数据行数</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.total_columns}</h3>
                        <p>数据列数</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.size_column_stats.mean.toFixed(2)}</h3>
                        <p>平均值</p>
                    </div>
                    <div class="stat-card">
                        <h3>${result.stats.size_column_stats.sum.toFixed(2)}</h3>
                        <p>总和</p>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>📈 生成的可视化图表</h3>
                    <img src="data:image/png;base64,${result.image}" alt="生成的可视化图表">
                </div>
                
                <div class="data-stats">
                    <h3>📊 数值列统计详情</h3>
                    <div class="stats-details">
                        <p><strong>最小值:</strong> ${result.stats.size_column_stats.min.toFixed(2)}</p>
                        <p><strong>最大值:</strong> ${result.stats.size_column_stats.max.toFixed(2)}</p>
                        <p><strong>中位数:</strong> ${result.stats.size_column_stats.median.toFixed(2)}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        output.innerHTML = `
            <div class="error-message">
                <h3>❌ 处理失败</h3>
                <p><strong>错误信息:</strong> ${result.error}</p>
                <p><strong>详细信息:</strong> ${result.message}</p>
                <p>请检查：</p>
                <ul>
                    <li>文件格式是否正确（应为CSV格式）</li>
                    <li>选择的列名是否存在</li>
                    <li>数值列是否包含有效的数字</li>
                    <li>数据是否包含空值</li>
                </ul>
            </div>
        `;
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