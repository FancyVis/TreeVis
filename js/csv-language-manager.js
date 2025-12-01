class CSVLanguageManager {
    constructor() {
        this.currentLang = 'en-US';
        this.translations = {};
        this.availableLanguages = [];
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        console.log('正在初始化CSV语言管理器...');
        
        // 1. 加载用户偏好设置
        this.loadUserPreferences();
        
        // 2. 从CSV加载翻译
        await this.loadTranslationsFromCSV();
        
        // 3. 应用翻译到页面
        this.applyTranslations();
        
        // 4. 创建语言切换器UI
        this.createLanguageSwitcher();
        
        this.isInitialized = true;
        console.log('CSV语言管理器初始化完成，当前语言:', this.currentLang);
        
        // 触发初始化完成事件
        window.dispatchEvent(new CustomEvent('translationsReady'));
    }

    loadUserPreferences() {
        // 从LocalStorage读取
        const savedLang = localStorage.getItem('preferredLanguage');
        if (savedLang && this.isLanguageAvailable(savedLang)) {
            this.currentLang = savedLang;
            return;
        }
        
        // 根据浏览器语言自动选择
        const browserLang = this.getBrowserLanguage();
        if (this.isLanguageAvailable(browserLang)) {
            this.currentLang = browserLang;
        }
    }

    getBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage;
        // 简化映射：支持的语言代码
        const langMap = {
            'zh': 'zh-CN',
            'zh-CN': 'zh-CN',
            'zh-TW': 'zh-CN',
            'en': 'en-US',
            'en-US': 'en-US',
            'en-GB': 'en-US',
            'es': 'es-ES',
            'es-ES': 'es-ES',
            'ja': 'ja-JP',
            'ja-JP': 'ja-JP'
        };
        
        return langMap[browserLang] || langMap[browserLang.split('-')[0]] || 'en-US';
    }

    async loadTranslationsFromCSV() {
        try {
            console.log('正在从CSV加载翻译...');
            
            // 使用fetch加载CSV文件
            const response = await fetch('data/translations.csv');
            if (!response.ok) {
                throw new Error(`无法加载翻译文件: HTTP ${response.status}`);
            }
            
            const csvText = await response.text();
            const parsedData = this.parseCSV(csvText);
            
            // 转换CSV数据为翻译对象
            this.translations = this.convertCSVToTranslations(parsedData);
            
            // 提取可用的语言列表（从CSV第一行获取）
            this.availableLanguages = this.getAvailableLanguages(parsedData);
            
            console.log(`加载了 ${Object.keys(this.translations).length} 个翻译项`);
            console.log('可用语言:', this.availableLanguages);
            
        } catch (error) {
            console.error('加载CSV翻译文件失败:', error);
            
            // 使用默认的紧急回退翻译
            this.useFallbackTranslations();
        }
    }

    // CSV解析函数
    parseCSV(csvText) {
        
        const lines = csvText.trim().split('\n');
        const result = [];
        
        for (let line of lines) {
            line = line.trim();
            if (line === '') continue; // 跳过空行
            
            const columns = [];
            let currentColumn = '';
            let inQuotes = false;
            let quoteChar = '';
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1] || '';
                
                if ((char === '"' || char === "'") && !inQuotes) {
                    // 开始引号
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar && inQuotes && nextChar !== quoteChar) {
                    // 结束引号
                    inQuotes = false;
                } else if (char === quoteChar && inQuotes && nextChar === quoteChar) {
                    // 转义引号（双引号）
                    currentColumn += char;
                    i++; // 跳过下一个引号
                } else if (char === ',' && !inQuotes) {
                    // 列分隔符
                    columns.push(currentColumn);
                    currentColumn = '';
                } else {
                    currentColumn += char;
                }
            }
            
            // 添加最后一列
            columns.push(currentColumn);
            result.push(columns);
        }
        
        console.log('解析后的CSV数据:', result);
        return result;
    }

    convertCSVToTranslations(csvData) {
        console.log('CSV原始数据:', csvData); // 添加这行
        
        if (csvData.length < 2) {
            throw new Error('CSV文件格式不正确：至少需要标题行和数据行');
        }
        
        const headers = csvData[0];
        const translations = {};
        
        console.log('CSV标题行:', headers); // 添加这行
        console.log('CSV数据行数:', csvData.length); // 添加这行
        
        // 跳过标题行，从第一行数据开始
        for (let i = 1; i < csvData.length; i++) {
            const row = csvData[i];
            const key = row[0]; // 第一列是key
            
            // 为每个语言创建翻译条目
            for (let j = 1; j < headers.length; j++) {
                const langCode = headers[j];
                const translation = row[j] || ''; // 如果没有翻译，使用空字符串
                
                if (!translations[langCode]) {
                    translations[langCode] = {};
                }
                
                // 支持嵌套键（如 "uploadArea.title"）
                this.setNestedKey(translations[langCode], key, translation);
            }
        }
        
        return translations;
    }

    setNestedKey(obj, key, value) {
        const keys = key.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const keyPart = keys[i];
            if (!current[keyPart]) {
                current[keyPart] = {};
            }
            current = current[keyPart];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    getAvailableLanguages(csvData) {
        if (csvData.length === 0) return [];
        
        // 第一行是标题行，第一列是"key"，其余列是语言代码
        return csvData[0].slice(1);
    }

    isLanguageAvailable(langCode) {
        return this.availableLanguages.includes(langCode);
    }

    async switchLanguage(langCode) {
        if (!this.isLanguageAvailable(langCode)) {
            console.warn(`语言 "${langCode}" 不可用`);
            return false;
        }
        
        if (langCode === this.currentLang) return true;
        
        console.log(`切换到语言: ${langCode}`);
        
        // 保存用户选择
        localStorage.setItem('preferredLanguage', langCode);
        this.currentLang = langCode;
        
        // 更新页面翻译
        this.applyTranslations();
        
        // 更新语言切换器UI（保持英文第一的顺序）
        this.updateLanguageSwitcher();
        
        // 触发语言切换事件
        window.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { 
                language: langCode,
                translations: this.translations[langCode]
            }
        }));
        
        // 更新HTML lang属性
        document.documentElement.lang = langCode.split('-')[0]; // 只取语言部分
        
        return true;
    }

    applyTranslations() {
        if (!this.translations[this.currentLang]) {
            console.error(`没有找到语言 "${this.currentLang}" 的翻译`);
            console.error('可用语言:', Object.keys(this.translations)); // 添加这行
            return;
        }
        
        console.log(`当前语言 "${this.currentLang}" 的翻译对象:`, 
                    this.translations[this.currentLang]); // 添加这行
        
        // 翻译带 data-i18n 属性的元素
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.getTranslation(key);
            
            if (translation !== undefined && translation !== '') {
                this.applyTranslationToElement(element, translation);
            } else {
                console.warn(`找不到翻译: ${key} (语言: ${this.currentLang})`);
            }
        });
        
        // 更新页面标题
        const titleKey = document.title === document.documentElement.title ? 'appTitle' : null;
        if (titleKey) {
            const titleTranslation = this.getTranslation(titleKey);
            if (titleTranslation) {
                document.title = titleTranslation;
            }
        }
    }

    getTranslation(key) {
        const langTranslations = this.translations[this.currentLang];
        if (!langTranslations) return undefined;
        
        // 支持嵌套键查找
        return key.split('.').reduce((obj, i) => obj && obj[i], langTranslations);
    }

    applyTranslationToElement(element, translation) {
        const tagName = element.tagName.toLowerCase();
        
        switch (tagName) {
            case 'input':
            case 'textarea':
                if (element.type === 'submit' || element.type === 'button') {
                    element.value = translation;
                } else {
                    element.placeholder = translation;
                }
                break;
                
            case 'img':
                element.alt = translation;
                break;
                
            case 'option':
                element.textContent = translation;
                break;
                
            case 'meta':
                if (element.name === 'description' || element.name === 'keywords') {
                    element.content = translation;
                }
                break;
                
            default:
                element.textContent = translation;
                break;
        }
    }

    createLanguageSwitcher() {
        // 移除已存在的切换器
        const existingSwitcher = document.getElementById('csv-language-switcher');
        if (existingSwitcher) {
            existingSwitcher.remove();
        }
        
        // 创建新的切换器
        const switcher = document.createElement('div');
        switcher.id = 'csv-language-switcher';
        switcher.className = 'csv-language-switcher';
        
        // 添加到页面顶部
        document.body.insertBefore(switcher, document.body.firstChild);
        
        // 更新UI
        this.updateLanguageSwitcher();
    }

    updateLanguageSwitcher() {
        const switcher = document.getElementById('csv-language-switcher');
        if (!switcher || this.availableLanguages.length === 0) return;
        
        // 可配置的语言顺序（英文第一，中文第二，其他按字母排序）
        const PREFERRED_ORDER = ['en-US', 'zh-CN'];
        
        const languageNames = {
            'en-US': 'English',
            'zh-CN': '中文',
            'es-ES': 'Español',
            'ja-JP': '日本語',
            'fr-FR': 'Français',
            'de-DE': 'Deutsch'
        };
        
        // 排序函数
        const sortLanguages = (langs) => {
            const sorted = [];
            
            // 1. 添加优先语言（按PREFERRED_ORDER顺序）
            PREFERRED_ORDER.forEach(prefLang => {
                if (langs.includes(prefLang)) {
                    sorted.push(prefLang);
                }
            });
            
            // 2. 添加其他语言（按字母排序）
            const otherLangs = langs
                .filter(lang => !sorted.includes(lang))
                .sort((a, b) => {
                    const nameA = languageNames[a] || a;
                    const nameB = languageNames[b] || b;
                    return nameA.localeCompare(nameB);
                });
            
            return [...sorted, ...otherLangs];
        };
        
        const sortedLanguages = sortLanguages(this.availableLanguages);
        
        console.log('语言按钮顺序:', sortedLanguages);
        
        // 生成按钮HTML
        const buttonsHTML = sortedLanguages.map(lang => {
            const displayName = languageNames[lang] || lang;
            const isActive = lang === this.currentLang;
            
            return `
                <button class="csv-lang-btn ${isActive ? 'active' : ''}" 
                        data-lang="${lang}"
                        title="${this.getTranslation('appTitle') || lang}"
                        onclick="csvLanguageManager.switchLanguage('${lang}')">
                    ${displayName}
                </button>
            `;
        }).join('<span class="csv-lang-separator">|</span>');
        
        switcher.innerHTML = `
            <div class="csv-lang-label" title="Select language">🌐 </div>
            <div class="csv-lang-buttons">${buttonsHTML}</div>
        `;
    }

    // 添加新语言的实用方法
    async addNewLanguage(langCode, displayName) {
        // 这里可以实现动态添加新语言的功能
        // 可以通过界面让用户上传新的翻译CSV或编辑现有CSV
        console.log(`添加新语言: ${langCode} (${displayName})`);
        
        // 在实际应用中，这里可以：
        // 1. 打开一个翻译编辑界面
        // 2. 让用户上传新的翻译文件
        // 3. 通过API更新CSV文件
    }

    // 获取所有可用的语言（用于动态生成语言选择器）
    getLanguages() {
        return this.availableLanguages;
    }

    // 获取当前语言的翻译对象（用于JavaScript动态内容）
    getCurrentTranslations() {
        return this.translations[this.currentLang] || {};
    }

    // 紧急回退翻译（当CSV加载失败时使用）
    useFallbackTranslations() {
        console.log('使用紧急回退翻译');
        
        this.translations = {
            'zh-CN': {
                appTitle: '数据可视化工具',
                uploadArea: {
                    title: '拖放文件到此处或点击选择',
                    button: '选择文件'
                }
            },
            'en-US': {
                appTitle: 'Data Visualization Tool',
                uploadArea: {
                    title: 'Drag & drop file here or click to select',
                    button: 'Select File'
                }
            }
        };
        
        this.availableLanguages = Object.keys(this.translations);
    }
}

// 创建全局实例
const csvLanguageManager = new CSVLanguageManager();


// async loadTranslationsFromCSV() {
//     try {
//         console.log('正在从CSV加载翻译...');
        
//         const response = await fetch('data/translations.csv');
//         if (!response.ok) {
//             throw new Error(`无法加载翻译文件: HTTP ${response.status}`);
//         }
        
//         const csvText = await response.text();
//         console.log('CSV文件内容（前500字符）:', csvText.substring(0, 500));
        
//         const parsedData = this.parseCSV(csvText);
//         console.log('解析后的CSV数据:', parsedData);
        
//         // 转换CSV数据为翻译对象
//         this.translations = this.convertCSVToTranslations(parsedData);
        
//         // 提取可用的语言列表
//         this.availableLanguages = this.getAvailableLanguages(parsedData);
        
//         console.log(`加载了 ${Object.keys(this.translations).length} 个翻译项`);
//         console.log('可用语言:', this.availableLanguages);
//         console.log('翻译对象结构:', this.translations);
        
//         // 特别检查西班牙语和日语是否存在
//         if (this.translations['es-ES']) {
//             console.log('西班牙语翻译存在，示例:', this.translations['es-ES']['appTitle']);
//         } else {
//             console.warn('西班牙语翻译不存在！');
//         }
        
//         if (this.translations['ja-JP']) {
//             console.log('日语翻译存在，示例:', this.translations['ja-JP']['appTitle']);
//         } else {
//             console.warn('日语翻译不存在！');
//         }
        
//     } catch (error) {
//         console.error('加载CSV翻译文件失败:', error);
//         this.useFallbackTranslations();
//     }
// }
