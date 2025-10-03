class PiyoLogAnalyzer {
    constructor() {
        this.sleepData = [];
        this.chart = null;
        this.timeChart = null;
        this.tabs = [];
        this.activeTabIndex = 0;
        this.tabCounter = 0;
        this.initializeEventListeners();
        this.initializeTabs();
    }

    initializeEventListeners() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.addEventListener('click', () => this.analyzeLogs());
        
        const periodSelect = document.getElementById('periodSelect');
        periodSelect.addEventListener('change', () => this.generateTabs());
        
        // ダウンロードボタンのイベントリスナー
        const downloadTimeChartBtn = document.getElementById('downloadTimeChart');
        const downloadSleepChartBtn = document.getElementById('downloadSleepChart');
        
        downloadTimeChartBtn.addEventListener('click', () => this.downloadChart('timeChart'));
        downloadSleepChartBtn.addEventListener('click', () => this.downloadChart('sleepChart'));
    }

    /**
     * 日付の妥当性をチェックする
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     * @param {number} day - 日
     * @returns {boolean} - 有効な日付かどうか
     */
    validateDate(year, month, day) {
        // 基本的な範囲チェック
        if (year < 1900 || year > 2100) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        
        // Dateオブジェクトを使用した厳密なチェック
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && 
               date.getMonth() === month - 1 && 
               date.getDate() === day;
    }

    /**
     * 時刻の妥当性をチェックする
     * @param {number} hour - 時（0-23）
     * @param {number} minute - 分（0-59）
     * @returns {boolean} - 有効な時刻かどうか
     */
    validateTime(hour, minute) {
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    }

    initializeTabs() {
        // 初期タブを生成
        this.generateTabs();
        
        // ダウンロードボタンを初期状態で無効化
        this.disableDownloadButtons();
    }

    analyzeLogs() {
        try {
            this.hideError();
            this.showLoading();
            
            // 全タブのデータを解析
            const allTabsData = this.parseAllTabs();
            
            if (allTabsData.length === 0) {
                this.showError('有効な睡眠データが見つかりませんでした。正しいぴよログの形式で入力してください。');
                return;
            }

            // データを統合
            this.sleepData = this.mergeTabsData(allTabsData);
            
            // 結果を表示
            this.displayResults();
            this.hideLoading();
            
        } catch (error) {
            console.error('解析エラー:', error);
            this.showError('データの解析中にエラーが発生しました。ログの形式を確認してください。');
            this.hideLoading();
        }
    }

    parseLogText(text) {
        const lines = text.split('\n');
        const sleepData = [];
        const dailySleepTotals = new Map(); // 日別の睡眠合計を保存
        let currentDate = null;
        let currentSleepStart = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 日付行を検出
            const dateMatch = line.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]+\)/);
            if (dateMatch) {
                const year = parseInt(dateMatch[1]);
                const month = parseInt(dateMatch[2]);
                const day = parseInt(dateMatch[3]);
                
                // 日付の妥当性をチェック
                if (this.validateDate(year, month, day)) {
                    currentDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                } else {
                    console.warn(`無効な日付をスキップしました: ${year}/${month}/${day}`);
                    currentDate = null; // 無効な日付の場合はnullに設定
                }
                continue;
            }
            
            if (!currentDate) continue;
            
            // 睡眠合計を検出
            const sleepTotalMatch = line.match(/睡眠合計\s+(\d+)時間(\d+)分/);
            if (sleepTotalMatch) {
                const hours = parseInt(sleepTotalMatch[1]);
                const minutes = parseInt(sleepTotalMatch[2]);
                const totalMinutes = hours * 60 + minutes;
                dailySleepTotals.set(currentDate, totalMinutes);
                console.log(`${currentDate}: 睡眠合計 ${hours}時間${minutes}分 (${totalMinutes}分)`);
                continue;
            }
            
            // 時間と活動を検出（睡眠時間帯チャート用）
            const timeMatch = line.match(/^(\d{1,2}):(\d{2})\s+(.+)/);
            if (timeMatch) {
                const hour = parseInt(timeMatch[1]);
                const minute = parseInt(timeMatch[2]);
                const activity = timeMatch[3];
                
                // 時刻の妥当性をチェック
                if (!this.validateTime(hour, minute)) {
                    console.warn(`無効な時刻をスキップしました: ${hour}:${minute}`);
                    continue;
                }
                
                // 「寝る」を検出
                if (activity.includes('寝る')) {
                    currentSleepStart = {
                        date: currentDate,
                        hour: hour,
                        minute: minute,
                        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
                    };
                }
                
                // 「起きる」を検出
                if (activity.includes('起きる') && currentSleepStart) {
                    const sleepDurationMatch = activity.match(/\((\d+)時間(\d+)分\)/);
                    let duration = 0;
                    
                    if (sleepDurationMatch) {
                        const hours = parseInt(sleepDurationMatch[1]);
                        const minutes = parseInt(sleepDurationMatch[2]);
                        duration = hours * 60 + minutes;
                    } else {
                        // 時間計算による推定
                        duration = this.calculateSleepDuration(currentSleepStart, {
                            date: currentDate,
                            hour: hour,
                            minute: minute
                        });
                    }
                    
                    if (duration > 0) {
                        sleepData.push({
                            date: currentSleepStart.date,
                            sleepTime: currentSleepStart.time,
                            wakeTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                            duration: duration,
                            durationHours: (duration / 60).toFixed(2)
                        });
                    }
                    
                    currentSleepStart = null;
                }
            }
        }
        
        // 睡眠合計データを保存（日別チャート用）
        this.dailySleepTotals = dailySleepTotals;
        
        return sleepData.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    calculateSleepDuration(sleepStart, wakeEnd) {
        try {
            // より安全な日付処理
            const sleepDate = new Date(sleepStart.date);
            const wakeDate = new Date(wakeEnd.date);
            
            // 日付の妥当性をチェック
            if (isNaN(sleepDate.getTime()) || isNaN(wakeDate.getTime())) {
                console.warn('無効な日付が検出されました:', sleepStart.date, wakeEnd.date);
                return 0;
            }
            
            // 時刻を設定（setHoursを使用してより安全に）
            const sleepDateTime = new Date(sleepDate);
            sleepDateTime.setHours(sleepStart.hour, sleepStart.minute, 0, 0);
            
            let wakeDateTime = new Date(wakeDate);
            wakeDateTime.setHours(wakeEnd.hour, wakeEnd.minute, 0, 0);
            
            // 日をまたぐ場合の処理（より安全な方法）
            if (wakeDateTime <= sleepDateTime) {
                // 24時間を加算（ミリ秒単位で安全に計算）
                wakeDateTime = new Date(wakeDateTime.getTime() + 24 * 60 * 60 * 1000);
            }
            
            const diffMs = wakeDateTime - sleepDateTime;
            const durationMinutes = Math.round(diffMs / (1000 * 60));
            
            // 異常に長い睡眠時間（24時間以上）をチェック
            if (durationMinutes > 24 * 60) {
                console.warn('異常に長い睡眠時間が検出されました:', durationMinutes, '分');
                return 0;
            }
            
            // 負の値をチェック
            if (durationMinutes < 0) {
                console.warn('負の睡眠時間が検出されました:', durationMinutes, '分');
                return 0;
            }
            
            return durationMinutes;
            
        } catch (error) {
            console.error('睡眠時間計算エラー:', error, sleepStart, wakeEnd);
            return 0;
        }
    }

    displayResults() {
        // サマリー情報を計算
        const avgSleepMinutes = this.sleepData.reduce((sum, item) => sum + item.duration, 0) / this.sleepData.length;
        const dailyAvgSleepMinutes = this.calculateDailyAverageSleep();
        const dateRange = this.getDateRange();
        
        // サマリーカードを更新
        document.getElementById('analysisDate').textContent = dateRange;
        document.getElementById('avgSleep').textContent = this.formatDuration(avgSleepMinutes);
        document.getElementById('dailyAvgSleep').textContent = this.formatDuration(dailyAvgSleepMinutes);
        
        // チャートを作成
        this.createChart();
        
        // 睡眠時間帯チャートを作成
        this.createTimeChart();
        
        // 結果セクションを表示
        document.getElementById('resultsSection').style.display = 'block';
        
        // ダウンロードボタンを有効化
        this.enableDownloadButtons();
        
        // 結果セクションまでスクロール
        document.getElementById('resultsSection').scrollIntoView({ 
            behavior: 'smooth' 
        });
    }

    getDateRange() {
        if (this.sleepData.length === 0) return '-';
        
        const dates = this.sleepData.map(item => new Date(item.date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        const formatDate = (date) => {
            return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        };
        
        if (minDate.getTime() === maxDate.getTime()) {
            return formatDate(minDate);
        }
        
        return `${formatDate(minDate)} ～ ${formatDate(maxDate)}`;
    }

    
    generateTabs() {
        const periodSelect = document.getElementById('periodSelect');
        const periodMonths = parseInt(periodSelect.value);
        
        // 既存のタブをクリア
        this.clearAllTabs();
        
        // 新しいタブを生成
        this.tabs = [];
        
        for (let i = 0; i < periodMonths; i++) {
            const tab = {
                id: i,
                name: `${i + 1}ヶ月目`,
                data: null,
                status: null,
                errors: []
            };
            
            this.tabs.push(tab);
            this.createTabElements(tab, i === 0);
        }
        
        // 最初のタブをアクティブに
        this.activeTabIndex = 0;
    }
    
    clearAllTabs() {
        const tabButtons = document.getElementById('tabButtons');
        const tabsContent = document.getElementById('tabsContent');
        
        tabButtons.innerHTML = '';
        tabsContent.innerHTML = '';
    }
    
    createTabElements(tab, isActive = false) {
        // タブボタンを作成
        const tabButtons = document.getElementById('tabButtons');
        const tabButton = document.createElement('button');
        tabButton.className = `tab-button ${isActive ? 'active' : ''}`;
        tabButton.setAttribute('data-tab', tab.id);
        tabButton.textContent = tab.name;
        tabButton.addEventListener('click', () => this.switchTab(tab.id));
        tabButtons.appendChild(tabButton);
        
        // タブコンテンツを作成
        const tabsContent = document.getElementById('tabsContent');
        const tabContent = document.createElement('div');
        tabContent.className = `tab-content ${isActive ? 'active' : ''}`;
        tabContent.setAttribute('data-tab', tab.id);
        
        tabContent.innerHTML = `
            <div class="input-container">
                <label for="logText${tab.id}">${tab.name}のぴよログテキストを貼り付けてください：</label>
                <textarea 
                    id="logText${tab.id}" 
                    class="log-textarea"
                    placeholder="【ログテキストのみほん】2025年7月&#10;&#10;----------&#10;2025/7/1(火)&#10;おなまえ (0か月10日)&#10;&#10;00:15   起きる (1時間15分)&#10;00:15   おしっこ&#10;00:30   ミルク 100ml&#10;01:00   寝る&#10;..."
                    rows="10"
                ></textarea>
                <div class="tab-status" id="tabStatus${tab.id}"></div>
            </div>
        `;
        tabsContent.appendChild(tabContent);
    }
    
    switchTab(tabId) {
        // 全てのタブを非アクティブに
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // 指定されたタブをアクティブに
        const targetButton = document.querySelector(`[data-tab="${tabId}"].tab-button`);
        const targetContent = document.querySelector(`[data-tab="${tabId}"].tab-content`);
        
        if (targetButton && targetContent) {
            targetButton.classList.add('active');
            targetContent.classList.add('active');
            this.activeTabIndex = tabId;
        }
    }
    
    parseAllTabs() {
        const allTabsData = [];
        const errors = [];
        let combinedLogText = '';
        let hasValidTab = false;
        
        // 1. 全タブのテキストを結合
        for (const tab of this.tabs) {
            const textarea = document.getElementById(`logText${tab.id}`);
            if (!textarea) continue;
            
            let logText = textarea.value.trim();
            if (!logText) {
                this.updateTabStatus(tab.id, '', 'empty');
                continue;
            }
            
            // 月ヘッダーを削除
            logText = logText.replace(/^【ぴよログ】.*?\n-+\n*/g, '');
            
            // タブ間の区切りを追加（連続した空行を1つに正規化）
            if (combinedLogText) {
                combinedLogText += '\n\n';
            }
            combinedLogText += logText;
            
            hasValidTab = true;
            this.updateTabStatus(tab.id, '✓ データを読み込みました', 'success');
        }
        
        if (!hasValidTab) {
            throw new Error('有効なデータが入力されていません');
        }
        
        try {
            // 2. 結合したテキストを一度だけ解析
            const combinedData = this.parseLogText(combinedLogText);
            
            if (combinedData.length === 0) {
                throw new Error('睡眠データが見つかりませんでした');
            }
            
            // 3. 結果を1つのタブデータとして返す
            const tab = {
                tabId: 0,
                tabName: '結合データ',
                monthInfo: null, // 結合データでは月情報は使用しない
                sleepData: combinedData,
                dailySleepTotals: this.dailySleepTotals
            };
            
            allTabsData.push(tab);
            
        } catch (error) {
            console.error('データの解析中にエラーが発生しました:', error);
            throw new Error(`データの解析に失敗しました: ${error.message}`);
        }
        
        return allTabsData;
    }
    
    extractMonthInfo(logText) {
        // ログテキストから年月情報を抽出
        const headerMatch = logText.match(/【ぴよログ】(\d{4})年(\d{1,2})月/);
        if (headerMatch) {
            return {
                year: parseInt(headerMatch[1]),
                month: parseInt(headerMatch[2])
            };
        }
        
        // 日付行から推定
        const dateMatch = logText.match(/(\d{4})\/(\d{1,2})\/\d{1,2}/);
        if (dateMatch) {
            return {
                year: parseInt(dateMatch[1]),
                month: parseInt(dateMatch[2])
            };
        }
        
        return null;
    }
    
    mergeTabsData(allTabsData) {
        if (allTabsData.length === 0) {
            return [];
        }
        
        // 結合済みデータを取得（parseAllTabsで1つのタブデータにまとめている）
        const tabData = allTabsData[0];
        
        // 日別睡眠合計を保存
        this.dailySleepTotals = tabData.dailySleepTotals || new Map();
        
        // 月境界情報は使用しない（結合済みデータのため）
        this.monthBoundaries = [];
        
        // 日付順にソートして返す
        return [...tabData.sleepData].sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    checkMonthContinuity(allTabsData) {
        const warnings = [];
        
        for (let i = 1; i < allTabsData.length; i++) {
            const prevMonth = allTabsData[i - 1].monthInfo;
            const currentMonth = allTabsData[i].monthInfo;
            
            if (!prevMonth || !currentMonth) continue;
            
            // 年をまたぐ場合の処理
            let expectedMonth = prevMonth.month + 1;
            let expectedYear = prevMonth.year;
            
            if (expectedMonth > 12) {
                expectedMonth = 1;
                expectedYear++;
            }
            
            // 月が連続していない場合
            if (currentMonth.year !== expectedYear || currentMonth.month !== expectedMonth) {
                const gap = this.calculateMonthGap(prevMonth, currentMonth);
                if (gap > 1) {
                    warnings.push(`${prevMonth.year}年${prevMonth.month}月と${currentMonth.year}年${currentMonth.month}月の間に${gap - 1}ヶ月のギャップがあります`);
                }
            }
        }
        
        if (warnings.length > 0) {
            console.warn('月の連続性に関する警告:', warnings);
            // 必要に応じてUIに警告を表示
        }
    }
    
    calculateMonthGap(month1, month2) {
        const date1 = new Date(month1.year, month1.month - 1);
        const date2 = new Date(month2.year, month2.month - 1);
        
        const yearDiff = date2.getFullYear() - date1.getFullYear();
        const monthDiff = date2.getMonth() - date1.getMonth();
        
        return yearDiff * 12 + monthDiff;
    }
    
    calculateMonthBoundaries(allTabsData) {
        const boundaries = [];
        const sortedDates = Array.from(this.dailySleepTotals.keys()).sort();
        
        if (sortedDates.length === 0) return boundaries;
        
        // 各月の最初の日を特定
        const monthStarts = new Map();
        
        sortedDates.forEach(dateStr => {
            const date = new Date(dateStr);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (!monthStarts.has(monthKey)) {
                monthStarts.set(monthKey, dateStr);
            }
        });
        
        // 2番目以降の月の開始位置を境界として記録
        const monthKeys = Array.from(monthStarts.keys()).sort();
        
        for (let i = 1; i < monthKeys.length; i++) {
            const monthStartDate = monthStarts.get(monthKeys[i]);
            const dayIndex = sortedDates.indexOf(monthStartDate);
            
            if (dayIndex !== -1) {
                boundaries.push({
                    dayIndex: dayIndex,
                    monthKey: monthKeys[i],
                    date: monthStartDate
                });
            }
        }
        
        return boundaries;
    }
    
    updateTabStatus(tabId, message, type) {
        const statusDiv = document.getElementById(`tabStatus${tabId}`);
        if (!statusDiv) return;
        
        statusDiv.textContent = message;
        statusDiv.className = `tab-status ${type}`;
        
        if (type === 'empty') {
            statusDiv.style.display = 'none';
        } else {
            statusDiv.style.display = 'block';
        }
    }

    calculateDailyAverageSleep() {
        // 日別の睡眠合計時間から1日の平均睡眠時間を計算
        if (this.dailySleepTotals.size === 0) return 0;
        
        const totalDailyMinutes = Array.from(this.dailySleepTotals.values()).reduce((sum, minutes) => sum + minutes, 0);
        return totalDailyMinutes / this.dailySleepTotals.size;
    }

    calculateAspectRatio() {
        // 期間選択から月数を取得
        const periodSelect = document.getElementById('periodSelect');
        const periodMonths = parseInt(periodSelect.value);
        
        // 基本のaspectRatio（1ヶ月分）
        const baseRatio = 1;
        
        // 期間に応じて縦長に調整（月数が多いほど縦長に）
        return baseRatio / periodMonths;
    }

    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}時間${mins}分`;
    }

    createChart() {
        const ctx = document.getElementById('sleepChart').getContext('2d');
        
        // 既存のチャートを破棄
        if (this.chart) {
            this.chart.destroy();
        }
        if (this.timeChart) {
            this.timeChart.destroy();
        }
        
        // 日付ごとのデータを準備
        const dailyData = this.prepareDailyData();
        
        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dailyData.labels,
                datasets: [{
                    label: '睡眠時間（時間）',
                    data: dailyData.sleepHours,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2,
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',  // 横向きの棒グラフにして日付を縦軸に
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: this.calculateAspectRatio(),  // 期間に応じて動的に調整
                plugins: {
                    title: {
                        display: true,
                        text: '日別睡眠時間',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false,
                        //position: 'top'
                    },
                    monthBoundary: {
                        boundaries: this.monthBoundaries || []
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        display: true,
                        position: 'bottom',
                        title: {
                            display: true,
                            text: '睡眠時間（時間）'
                        },
                        min: 0,
                        max: 24
                    },
                    y: {
                        title: {
                            display: true,
                            text: '日数'
                        }
                    }
                }
            }
        });
    }

    prepareDailyData() {
        const dailyMap = new Map();
        
        // 睡眠合計時間を設定
        this.dailySleepTotals.forEach((totalMinutes, date) => {
            dailyMap.set(date, {
                totalMinutes: totalMinutes
            });
        });
        
        // 日別合計をログ出力
        dailyMap.forEach((data, date) => {
            console.log(`${date}: 合計${data.totalMinutes}分 (${(data.totalMinutes/60).toFixed(1)}時間)`);
        });
        
        // ソートされた日付配列を作成
        const sortedDates = Array.from(dailyMap.keys()).sort();
        
        return {
            labels: sortedDates.map((date, index) => `${index + 1}`),
            sleepHours: sortedDates.map(date => (dailyMap.get(date).totalMinutes / 60).toFixed(1))
        };
    }

    createTimeChart() {
        const ctx = document.getElementById('sleepTimeChart').getContext('2d');
        
        // 睡眠時間帯データを準備
        const timeData = this.prepareSleepTimeData();
        
        this.timeChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: timeData.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: this.calculateAspectRatio() * 1,  // 時間帯チャートは少し縦長に
                plugins: {
                    title: {
                        display: true,
                        text: '日別睡眠時間帯',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    },
                    monthBoundary: {
                        boundaries: this.monthBoundaries || []
                    },
                    tooltip: {
                        position: 'nearest',
                        intersect: true,
                        callbacks: {
                            title: function(context) {
                                return `${context[0].parsed.y + 1}日目`;
                            },
                            label: function(context) {
                                const startTime = context.raw.startTime;
                                const endTime = context.raw.endTime;
                                const duration = context.raw.duration;
                                
                                const formatDecimalTime = (decimal) => {
                                    let hours = Math.floor(decimal);
                                    let minutes = Math.round((decimal - hours) * 60);
                                    
                                    // 24時間を超える場合の処理
                                    if (hours >= 24) {
                                        hours -= 24;
                                    }
                                    
                                    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                };
                                
                                const durationText = Math.floor(duration) + '時間' + Math.round((duration % 1) * 60) + '分';
                                
                                return [
                                    `睡眠時間: ${formatDecimalTime(startTime)} - ${formatDecimalTime(endTime)}`,
                                    `睡眠時間: ${durationText}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: 0,
                        max: 24,
                        reverse: false, // 左が0時、右が24時
                        ticks: {
                            stepSize: 2,
                            callback: function(value) {
                                return value + ':00';
                            }
                        },
                        title: {
                            display: true,
                            text: '時刻'
                        }
                    },
                    y: {
                        type: 'linear',
                        reverse: true, // 上が1日目、下が最終日
                        title: {
                            display: true,
                            text: '日数'
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 0
                    },
                    line: {
                        borderWidth: 12,
                        tension: 0
                    }
                }
            }
        });
    }

    prepareSleepTimeData() {
        // 日付ごとにデータを整理
        const dateMap = new Map();
        
        this.sleepData.forEach(item => {
            const date = item.date;
            if (!dateMap.has(date)) {
                dateMap.set(date, []);
            }
            
            // 睡眠開始時刻と終了時刻を時間（小数）に変換
            const sleepStart = this.timeToDecimal(item.sleepTime);
            const wakeEnd = this.timeToDecimal(item.wakeTime);
            
            // 日をまたぐ場合の処理
            let sleepEnd = wakeEnd;
            if (wakeEnd <= sleepStart) {
                sleepEnd = wakeEnd + 24;
            }
            
            dateMap.get(date).push({
                start: sleepStart,
                end: sleepEnd,
                duration: sleepEnd - sleepStart
            });
        });
        
        // ソートされた日付配列を作成
        const sortedDates = Array.from(dateMap.keys()).sort();
        const dateLabels = sortedDates.map((date, index) => `${index + 1}`);
        
        // 全ての睡眠セッションを収集して睡眠時間の範囲を取得
        const allSessions = [];
        dateMap.forEach((sessions, date) => {
            sessions.forEach(session => {
                allSessions.push(session);
            });
        });
        
        // 睡眠時間の最小値と最大値を取得
        const minDuration = Math.min(...allSessions.map(s => s.duration));
        const maxDuration = Math.max(...allSessions.map(s => s.duration));
        
        // 睡眠時間に応じた色の濃淡を計算する関数
        const getSleepColor = (duration) => {
            // 睡眠時間を0-1の範囲に正規化
            const normalizedDuration = (duration - minDuration) / (maxDuration - minDuration);
            
            // 透明度を0.3（薄い）から0.9（濃い）の範囲で調整
            const alpha = 0.3 + (normalizedDuration * 0.6);
            
            return `rgba(102, 126, 234, ${alpha})`;
        };
        
        // データセットを作成
        const datasets = [];
        
        sortedDates.forEach((date, dateIndex) => {
            const sleepSessions = dateMap.get(date);
            
            sleepSessions.forEach((session, sessionIndex) => {
                // 睡眠時間に応じた色を取得
                const sleepColor = getSleepColor(session.duration);
                
                if (session.end <= 24) {
                    // 日をまたがない睡眠: 通常の表示
                    const lineData = [
                        {
                            x: session.start,
                            y: dateIndex,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        },
                        {
                            x: session.end,
                            y: dateIndex,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        }
                    ];
                    
                    datasets.push({
                        label: `${dateIndex + 1}日目 - 睡眠${sessionIndex + 1} (${this.formatDuration(session.duration * 60)})`,
                        data: lineData,
                        backgroundColor: sleepColor,
                        borderColor: sleepColor,
                        borderWidth: 8,
                        showLine: true,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    });
                } else {
                    // 日をまたぐ睡眠: 2つのバーに分割
                    
                    // 1つ目: 開始日の睡眠開始時刻から24:00まで
                    const firstDayData = [
                        {
                            x: session.start,
                            y: dateIndex,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        },
                        {
                            x: 24,
                            y: dateIndex,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        }
                    ];
                    
                    datasets.push({
                        label: `${dateIndex + 1}日目 - 睡眠${sessionIndex + 1} (${this.formatDuration(session.duration * 60)})`,
                        data: firstDayData,
                        backgroundColor: sleepColor,
                        borderColor: sleepColor,
                        borderWidth: 8,
                        showLine: true,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    });
                    
                    // 2つ目: 翌日の0:00から起床時刻まで（翌日が存在する場合のみ）
                    const secondDayData = [
                        {
                            x: 0,
                            y: dateIndex + 1,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        },
                        {
                            x: session.end - 24,
                            y: dateIndex + 1,
                            startTime: session.start,
                            endTime: session.end,
                            duration: session.duration
                        }
                    ];
                    
                    // 翌日が存在する場合のみ
                    if (dateIndex + 1 < sortedDates.length) {
                        datasets.push({
                            label: `${dateIndex + 2}日目 - 睡眠${sessionIndex + 1}続き (${this.formatDuration(session.duration * 60)})`,
                            data: secondDayData,
                            backgroundColor: sleepColor,
                            borderColor: sleepColor,
                            borderWidth: 8,
                            showLine: true,
                            pointRadius: 0,
                            pointHoverRadius: 0
                        });
                    }
                }
            });
        });
        
        return {
            dateLabels: dateLabels,
            datasets: datasets
        };
    }

    timeToDecimal(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours + minutes / 60;
    }

    showLoading() {
        const btn = document.getElementById('analyzeBtn');
        btn.innerHTML = '<span class="loading"></span> 解析中...';
        btn.disabled = true;
    }

    hideLoading() {
        const btn = document.getElementById('analyzeBtn');
        btn.innerHTML = '📊 睡眠パターンを可視化する';
        btn.disabled = false;
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
        
        // エラーセクションまでスクロール
        document.getElementById('errorSection').scrollIntoView({ 
            behavior: 'smooth' 
        });
    }

    /**
     * 詳細なエラーメッセージを表示する
     * @param {string} errorType - エラーの種類
     * @param {Object} details - エラーの詳細情報
     */
    showDetailedError(errorType, details = {}) {
        const errorMessages = {
            'invalid_date': `無効な日付が検出されました: ${details.date || '不明'}`,
            'invalid_time': `無効な時刻が検出されました: ${details.time || '不明'}`,
            'missing_sleep_data': `${details.tabName || 'タブ'}に睡眠データが見つかりません`,
            'calculation_error': '睡眠時間の計算中にエラーが発生しました',
            'parse_error': 'ログデータの解析中にエラーが発生しました'
        };
        
        const message = errorMessages[errorType] || `エラーが発生しました: ${errorType}`;
        console.error(`詳細エラー [${errorType}]:`, details);
        this.showError(message);
    }

    hideError() {
        document.getElementById('errorSection').style.display = 'none';
    }

    downloadChart(chartType) {
        let chart, filename;
        
        if (chartType === 'timeChart') {
            chart = this.timeChart;
            filename = 'ぴよログ_睡眠時間帯チャート.png';
        } else if (chartType === 'sleepChart') {
            chart = this.chart;
            filename = 'ぴよログ_日別睡眠時間チャート.png';
        }
        
        if (!chart) {
            alert('チャートが生成されていません。まず睡眠データを解析してください。');
            return;
        }
        
        try {
            // 一時的に背景色を設定してPNG画像を生成
            const originalBackgroundColor = chart.options.plugins.backgroundColor?.color;
            
            // 背景色プラグインの設定を追加
            if (!chart.options.plugins.backgroundColor) {
                chart.options.plugins.backgroundColor = {};
            }
            chart.options.plugins.backgroundColor.color = '#ffffff';
            chart.update('none'); // アニメーションなしで更新
            
            // Chart.jsの標準機能でPNG画像を生成
            const url = chart.toBase64Image('image/png', 1.0);
            
            // 背景色設定を元に戻す
            if (originalBackgroundColor) {
                chart.options.plugins.backgroundColor.color = originalBackgroundColor;
            } else {
                delete chart.options.plugins.backgroundColor.color;
            }
            chart.update('none');
            
            // ダウンロードリンクを作成
            const link = document.createElement('a');
            link.download = filename;
            link.href = url;
            
            // 一時的にDOMに追加してクリック
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 成功メッセージ（オプション）
            this.showDownloadSuccess(filename);
            
        } catch (error) {
            console.error('チャートのダウンロードに失敗しました:', error);
            alert('チャートのダウンロードに失敗しました。もう一度お試しください。');
        }
    }

    showDownloadSuccess(filename) {
        // 簡単な成功通知（3秒後に消える）
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #48bb78;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            font-weight: 600;
        `;
        notification.textContent = `✅ ${filename} をダウンロードしました`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    enableDownloadButtons() {
        const downloadTimeChartBtn = document.getElementById('downloadTimeChart');
        const downloadSleepChartBtn = document.getElementById('downloadSleepChart');
        
        downloadTimeChartBtn.disabled = false;
        downloadSleepChartBtn.disabled = false;
    }

    disableDownloadButtons() {
        const downloadTimeChartBtn = document.getElementById('downloadTimeChart');
        const downloadSleepChartBtn = document.getElementById('downloadSleepChart');
        
        downloadTimeChartBtn.disabled = true;
        downloadSleepChartBtn.disabled = true;
    }
}

// 背景色プラグインを登録
Chart.register({
    id: 'backgroundColor',
    beforeDraw: function(chart, args, options) {
        if (options.color) {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            
            ctx.save();
            ctx.fillStyle = options.color;
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    }
});

// 月境界線描画プラグインを登録
Chart.register({
    id: 'monthBoundary',
    afterDraw: function(chart, args, options) {
        if (!options.boundaries || options.boundaries.length === 0) return;
        
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        
        ctx.save();
        ctx.strokeStyle = '#ff8888';
        ctx.lineWidth = 1;
        
        options.boundaries.forEach(boundary => {
            // Y軸が反転している（indexAxis: 'y'）ので、dayIndexをY座標に変換
            const yPosition = chart.scales.y.getPixelForValue(boundary.dayIndex - 0.5);
            
            ctx.beginPath();
            ctx.moveTo(chartArea.left, yPosition);
            ctx.lineTo(chartArea.right, yPosition);
            ctx.stroke();
        });
        
        ctx.restore();
    }
});

// アプリケーションを初期化
let analyzer;
document.addEventListener('DOMContentLoaded', () => {
    analyzer = new PiyoLogAnalyzer();
    
    // モバイルでのアコーディオン機能を初期化
    initializeInstructionsToggle();
});

// 手順説明のアコーディオン機能
function initializeInstructionsToggle() {
    const toggle = document.querySelector('.instructions-toggle');
    const steps = document.getElementById('instructionsSteps');
    
    if (!toggle || !steps) return;
    
    // モバイルかどうかを判定する関数
    function isMobile() {
        return window.innerWidth <= 768;
    }
    
    // 初期状態を設定
    function setInitialState() {
        if (isMobile()) {
            steps.classList.add('collapsed');
            toggle.classList.add('collapsed');
        } else {
            steps.classList.remove('collapsed');
            toggle.classList.remove('collapsed');
        }
    }
    
    // クリックイベントを追加
    toggle.addEventListener('click', () => {
        if (isMobile()) {
            steps.classList.toggle('collapsed');
            toggle.classList.toggle('collapsed');
        }
    });
    
    // ウィンドウリサイズ時の処理
    window.addEventListener('resize', setInitialState);
    
    // 初期状態を設定
    setInitialState();
}
