# python/main.py
import pandas as pd
import matplotlib.pyplot as plt
import squarify
import base64
import json
import numpy as np
from io import StringIO, BytesIO

def process_csv_data(csv_content, chart_type='treemap', size_column=None, label_column=None):
    """
    处理CSV数据并生成图表
    
    参数:
        csv_content: CSV文件内容字符串
        chart_type: 图表类型 ('treemap', 'bar', 'line')
        size_column: 数值列名
        label_column: 标签列名
    
    返回:
        dict: 包含结果和图像的字典
    """
    try:
        # 设置matplotlib中文字体（如果需要）
        plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial']
        plt.rcParams['axes.unicode_minus'] = False
        
        # 读取CSV数据
        df = pd.read_csv(StringIO(csv_content))
        
        # 数据清洗：移除空值
        df = df.dropna()
        
        # 如果未指定列，使用默认列
        if not size_column and len(df.columns) >= 2:
            size_column = df.columns[1]
        if not label_column and len(df.columns) >= 1:
            label_column = df.columns[0]
        
        # 确保数值列是数字类型
        df[size_column] = pd.to_numeric(df[size_column], errors='coerce')
        df = df.dropna(subset=[size_column])
        
        print(f"处理数据: {len(df)} 行, {len(df.columns)} 列")
        print(f"使用的列: 数值列='{size_column}', 标签列='{label_column}'")
        
        # 创建图表
        fig = create_chart(df, chart_type, size_column, label_column)
        
        # 将图表转换为base64图片
        img_base64 = fig_to_base64(fig)
        
        # 计算统计信息
        stats = calculate_stats(df, size_column)
        
        return {
            'success': True,
            'image': img_base64,
            'stats': stats,
            'message': f"成功处理 {len(df)} 行数据",
            'chart_type': chart_type
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'message': f"处理失败: {str(e)}"
        }

def create_chart(df, chart_type, size_column, label_column):
    """根据类型创建图表"""
    plt.figure(figsize=(12, 8))
    
    if chart_type == 'treemap':
        # 生成矩形树图
        if len(df) == 0:
            raise Exception("没有有效数据可生成图表")
        
        # 准备数据
        sizes = df[size_column].values
        labels = df[label_column].astype(str).values
        
        # 如果数据太多，只取前50个
        if len(sizes) > 50:
            sizes = sizes[:50]
            labels = labels[:50]
            print("数据量较大，只显示前50个项目")
        
        # 创建颜色映射
        colors = plt.cm.viridis(np.linspace(0, 1, len(sizes)))
        
        # 绘制矩形树图
        squarify.plot(sizes=sizes, label=labels, color=colors, alpha=0.7)
        plt.title(f'矩形树图 - {label_column} vs {size_column}', fontsize=16, pad=20)
        plt.axis('off')
        
    elif chart_type == 'bar':
        # 生成柱状图
        if len(df) == 0:
            raise Exception("没有有效数据可生成图表")
        
        # 如果数据太多，只取前20个
        display_df = df.head(20) if len(df) > 20 else df
        
        plt.bar(display_df[label_column].astype(str), display_df[size_column])
        plt.title(f'柱状图 - {label_column} vs {size_column}', fontsize=16)
        plt.xlabel(label_column)
        plt.ylabel(size_column)
        plt.xticks(rotation=45, ha='right')
        plt.tight_layout()
        
    elif chart_type == 'line':
        # 生成折线图
        if len(df) == 0:
            raise Exception("没有有效数据可生成图表")
        
        # 尝试将标签列转换为数值（如果是时间序列）
        try:
            x_data = pd.to_numeric(df[label_column])
        except:
            x_data = range(len(df))
        
        plt.plot(x_data, df[size_column], 'o-', linewidth=2, markersize=4)
        plt.title(f'折线图 - {label_column} vs {size_column}', fontsize=16)
        plt.xlabel(label_column)
        plt.ylabel(size_column)
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
    
    return plt.gcf()

def fig_to_base64(fig):
    """将matplotlib图形转换为base64字符串"""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=300, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close(fig)
    return img_base64

def calculate_stats(df, size_column):
    """计算统计信息"""
    return {
        'total_rows': len(df),
        'total_columns': len(df.columns),
        'column_names': df.columns.tolist(),
        'size_column_stats': {
            'mean': float(df[size_column].mean()),
            'median': float(df[size_column].median()),
            'min': float(df[size_column].min()),
            'max': float(df[size_column].max()),
            'sum': float(df[size_column].sum()),
            'std': float(df[size_column].std())
        }
    }

# 测试代码（本地运行时使用）
if __name__ == "__main__":
    # 示例CSV数据
    test_csv = """Category,Value
Technology,45
Finance,32
Healthcare,28
Education,51
Retail,23
Manufacturing,39"""
    
    result = process_csv_data(test_csv, 'treemap', 'Value', 'Category')
    if result['success']:
        print("处理成功!")
        print(f"数据行数: {result['stats']['total_rows']}")
    else:
        print(f"处理失败: {result['error']}")