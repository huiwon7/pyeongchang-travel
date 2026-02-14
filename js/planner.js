// ============================================
// AI 평창 여행 플래너 - planner.js
// ============================================

let selectedDays = 0;
let currentPlanId = '';
let allPlaces = [];

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', async () => {
    allPlaces = await initPlacesData();
    initStyleGrid();
    initDayButtons();
    checkSharedPlan();
});

function initStyleGrid() {
    const grid = document.getElementById('styleGrid');
    if (!grid) return;
    grid.innerHTML = CONFIG.STYLES.map(s =>
        `<div class="style-check">
            <input type="checkbox" id="style_${s.value}" value="${s.value}">
            <label for="style_${s.value}">${s.icon} ${s.label}</label>
        </div>`
    ).join('');
}

function initDayButtons() {
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedDays = parseInt(this.dataset.days);
        });
    });
}

// --- URL 해시로 공유된 계획 확인 ---
function checkSharedPlan() {
    const hash = window.location.hash;
    if (hash.startsWith('#plan=')) {
        const planId = hash.substring(6);
        loadSharedPlan(planId);
    }
}

function loadSharedPlan(planId) {
    try {
        const plans = JSON.parse(localStorage.getItem(CONFIG.PLANS_STORAGE) || '{}');
        if (plans[planId]) {
            const saved = plans[planId];
            currentPlanId = planId;
            renderPlan(saved.plan, saved.region, saved.month, saved.days, saved.styles, saved.customStyle);
        }
    } catch { /* ignore */ }
}

// --- AI 여행 계획 생성 ---
async function generatePlan() {
    const region = document.getElementById('regionSelect').value;
    const month = document.getElementById('monthSelect').value;
    const customStyle = document.getElementById('customStyle').value.trim();

    if (!month) { showToast('여행 월을 선택해주세요.', 'error'); return; }
    if (selectedDays === 0) { showToast('여행 기간을 선택해주세요.', 'error'); return; }

    const apiKey = getApiKey();
    if (!apiKey) {
        showToast('AI API Key를 먼저 설정해주세요. (관리자 페이지 → AI 설정)', 'error');
        if (confirm('API Key가 설정되지 않았습니다.\n관리자 페이지에서 설정하시겠습니까?')) {
            window.location.href = 'admin/';
        }
        return;
    }

    const styles = [];
    document.querySelectorAll('.style-check input:checked').forEach(cb => styles.push(cb.value));

    // 데이터 새로고침
    allPlaces = loadPlacesData() || [];

    showLoading(true);
    document.getElementById('generateBtn').disabled = true;

    try {
        const filtered = filterPlaces(allPlaces, region, parseInt(month));
        const { system, user } = buildPrompt(region || 'all', parseInt(month), selectedDays, styles, customStyle, filtered);

        const provider = getApiProvider();
        let responseText;
        if (provider === 'openai') {
            responseText = await callOpenAIAPI(system, user, apiKey);
        } else {
            responseText = await callClaudeAPI(system, user, apiKey);
        }

        if (!responseText) throw new Error('AI 응답이 비어있습니다.');

        const plan = parseAIResponse(responseText);
        if (!plan) throw new Error('AI 응답을 파싱할 수 없습니다.');

        // 계획 저장
        currentPlanId = generateUID();
        savePlanToStorage(currentPlanId, plan, region, month, selectedDays, styles, customStyle);

        renderPlan(plan, region || 'all', parseInt(month), selectedDays, styles, customStyle);
        showToast('여행 계획이 생성되었습니다!', 'success');

    } catch (error) {
        console.error('Plan generation error:', error);
        showToast(error.message || 'AI 계획 생성에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
        showLoading(false);
        document.getElementById('generateBtn').disabled = false;
    }
}

// --- 데이터 필터링 ---
function filterPlaces(places, region, month) {
    let filtered = [...places];
    if (region && region !== 'all' && region !== '') {
        filtered = filtered.filter(p => p.region === region);
    }
    const season = getSeason(month);
    filtered.forEach(p => {
        p._seasonMatch = !p.season_tags || p.season_tags.includes(season);
    });
    filtered.sort((a, b) => (b._seasonMatch ? 1 : 0) - (a._seasonMatch ? 1 : 0));
    return filtered;
}

// --- 프롬프트 구성 ---
function buildPrompt(region, month, days, styles, customStyle, places) {
    const regionName = getRegionName(region);
    const seasonName = getSeasonName(month);
    const seasonKw = getSeasonKeywords(month);

    const selectedStyleNames = styles.map(s => getStyleLabel(s));
    if (customStyle) selectedStyleNames.push(customStyle);
    if (selectedStyleNames.length === 0) selectedStyleNames.push('균형 잡힌 여행');

    // 카테고리별 분류
    const categorized = {};
    CONFIG.CATEGORIES.forEach(c => categorized[c.name] = []);
    places.forEach(p => {
        const catName = getCategoryName(p.category_id);
        if (categorized[catName]) {
            categorized[catName].push({
                name: p.name,
                region: getRegionName(p.region),
                content: (p.content || '').substring(0, 500),
                operating_hours: p.operating_hours || '',
                admission_fee: p.admission_fee || '',
                duration_min: p.duration_min ? p.duration_min + '분' : '',
            });
        }
    });

    // 비어있는 카테고리 제거
    Object.keys(categorized).forEach(k => { if (categorized[k].length === 0) delete categorized[k]; });

    const dataJSON = JSON.stringify(categorized, null, 2);

    const system = `당신은 강원도 평창 지역 여행 전문 가이드입니다.
평창의 관광지, 맛집, 촬영지, 행사, 액티비티, 체험학습, 숙소를 모두 꿰뚫고 있으며,
계절과 여행 스타일에 따른 최적의 여행 코스를 추천하는 전문가입니다.

반드시 아래 규칙을 지켜주세요:
1. 하루 일정은 09:00~21:00 범위에서 구성하며, 장소 간 이동시간(평창 내 보통 15~30분)을 고려
2. 같은 지역 내 장소를 묶어서 배치하여 이동 시간 최소화 (동선 최적화)
3. 아침/점심/저녁 시간대에 맛집 데이터 배치 (하루 최소 2끼 이상)
4. 2일 이상 여행 시 숙소 추천 포함
5. 반드시 제공된 데이터에 있는 장소만 추천 (임의로 장소를 만들어내지 않음)
6. 각 장소의 운영시간 데이터가 있으면 반영하여 방문 시간 배치
7. 추천 소요시간 데이터가 있으면 이를 기반으로 시간 블록 배분
8. 복수 스타일 선택 시 균형 있게 배분

매우 중요: 응답은 반드시 순수 JSON만 출력하세요.
- 첫 글자는 반드시 { 로 시작하고 마지막 글자는 } 로 끝나야 합니다.
- JSON 앞뒤에 설명, 인사말, 마크다운 코드블록(\`\`\`) 등을 절대 넣지 마세요.
- 아래 JSON 구조를 정확히 따르세요:`;

    const outputFormat = `{
  "title": "여행 제목",
  "summary": "전체 여행 요약 (3~4문장)",
  "days": [
    {
      "day": 1,
      "theme": "이 날의 테마",
      "schedule": [
        {
          "time": "09:00",
          "end_time": "12:00",
          "place_name": "장소 이름 (반드시 데이터에 있는 이름)",
          "category": "카테고리명",
          "duration": "3시간",
          "description": "추천 이유와 활동 설명 (2~3문장)",
          "tip": "여행 팁 한 줄"
        }
      ]
    }
  ],
  "accommodation": {
    "name": "숙소명 (1일이면 null)",
    "description": "숙소 설명",
    "price_range": "가격대"
  },
  "tips": ["전체 여행 팁1", "팁2", "팁3"]
}`;

    const user = `아래 조건으로 평창 여행 계획을 만들어주세요.

[여행 조건]
- 여행 지역: ${regionName}
- 여행 월: ${month}월 (${seasonName})
- 여행 기간: ${days}일
- 여행 스타일: ${selectedStyleNames.join(', ')}
- 계절 키워드: ${seasonKw}

[이용 가능한 여행 데이터]
${dataJSON}

[출력 형식]
${outputFormat}

위 JSON 형식에 맞게 ${days}일간의 상세 여행 일정을 생성해주세요.
각 일별로 아침부터 저녁까지 시간순으로 장소를 배치하고, 이동 동선을 고려해주세요.
맛집은 하루에 최소 2곳 이상 포함해주세요.

중요: 반드시 { 로 시작하는 순수 JSON만 출력하세요. 다른 텍스트를 포함하지 마세요.`;

    return { system, user };
}

// --- Claude API 호출 ---
async function callClaudeAPI(systemPrompt, userPrompt, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: CONFIG.CLAUDE_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API 오류 (${response.status})`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || null;
}

// --- OpenAI API 호출 ---
async function callOpenAIAPI(systemPrompt, userPrompt, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: CONFIG.OPENAI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 8192,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API 오류 (${response.status})`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
}

// --- AI 응답 파싱 ---
function parseAIResponse(text) {
    if (!text) return null;

    // 전략 1: ```json ... ``` 블록 추출
    if (text.includes('```')) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
            const parsed = tryParseJSON(match[1].trim());
            if (parsed) return parsed;
        }
    }

    // 전략 2: 전체 텍스트를 직접 파싱
    const directParse = tryParseJSON(text.trim());
    if (directParse) return directParse;

    // 전략 3: 첫 번째 { 부터 마지막 } 까지 추출
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
        const parsed = tryParseJSON(jsonCandidate);
        if (parsed) return parsed;
    }

    // 전략 4: 잘린 JSON 복구 시도 (닫히지 않은 괄호 닫기)
    if (firstBrace !== -1) {
        let jsonStr = text.substring(firstBrace);
        jsonStr = repairTruncatedJSON(jsonStr);
        const parsed = tryParseJSON(jsonStr);
        if (parsed) return parsed;
    }

    return null;
}

function tryParseJSON(str) {
    try {
        const data = JSON.parse(str);
        if (data && data.days && Array.isArray(data.days)) return data;
        return null;
    } catch {
        return null;
    }
}

function repairTruncatedJSON(str) {
    // 불완전한 문자열 닫기
    let inString = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
        if (escaped) { escaped = false; continue; }
        if (str[i] === '\\') { escaped = true; continue; }
        if (str[i] === '"') inString = !inString;
    }
    if (inString) str += '"';

    // 마지막 불완전한 key-value 쌍 제거
    str = str.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
    str = str.replace(/,\s*$/, '');

    // 닫히지 않은 괄호 닫기
    const opens = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < str.length; i++) {
        if (escaped) { escaped = false; continue; }
        if (str[i] === '\\') { escaped = true; continue; }
        if (str[i] === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (str[i] === '{' || str[i] === '[') opens.push(str[i]);
        if (str[i] === '}' || str[i] === ']') opens.pop();
    }

    while (opens.length > 0) {
        const last = opens.pop();
        str += (last === '{') ? '}' : ']';
    }

    return str;
}

// --- 여행 계획 렌더링 ---
function renderPlan(plan, region, month, days, styles, customStyle) {
    document.getElementById('plannerForm').style.display = 'none';
    document.getElementById('planResult').classList.add('active');

    const regionName = getRegionName(region);
    const selectedStyles = (styles || []).filter(s => s).map(s => getStyleLabel(s));
    if (customStyle) selectedStyles.push(customStyle);

    // 헤더
    document.getElementById('planHeader').innerHTML = `
        <h2>${escapeHtml(plan.title || '평창 여행 계획')}</h2>
        <div class="plan-meta">
            <span class="plan-meta-tag">📍 ${escapeHtml(regionName)}</span>
            <span class="plan-meta-tag">📅 ${month}월</span>
            <span class="plan-meta-tag">🕐 ${days}일</span>
            ${selectedStyles.map(s => `<span class="plan-meta-tag">💜 ${escapeHtml(s)}</span>`).join('')}
        </div>`;

    // 요약
    document.getElementById('planSummary').textContent = plan.summary || '';

    // 일별 탭
    document.getElementById('dayTabs').innerHTML = plan.days.map((d, i) =>
        `<button class="day-tab ${i === 0 ? 'active' : ''}" onclick="switchDay(${i})" data-day="${i}">Day ${d.day}</button>`
    ).join('');

    // 일별 내용
    let html = '';
    plan.days.forEach((day, index) => {
        html += `<div class="day-content" id="dayContent_${index}" style="display:${index === 0 ? 'block' : 'none'}">`;
        html += `<div class="day-theme">${escapeHtml(day.theme || 'Day ' + day.day)}</div>`;
        html += '<div class="timeline">';
        if (day.schedule) {
            day.schedule.forEach(item => {
                html += `
                <div class="timeline-item">
                    <div class="schedule-card">
                        <div class="schedule-card-header">
                            <span class="schedule-time">${escapeHtml(item.time || '')}${item.end_time ? ' ~ ' + escapeHtml(item.end_time) : ''}</span>
                            <span class="category-badge badge-${item.category || '관광지'}">${escapeHtml(item.category || '')}</span>
                            <span class="schedule-duration">${escapeHtml(item.duration || '')}</span>
                        </div>
                        <div class="schedule-place">${escapeHtml(item.place_name || '')}</div>
                        <div class="schedule-desc">${escapeHtml(item.description || '')}</div>
                        ${item.tip ? `<div class="schedule-tip">${escapeHtml(item.tip)}</div>` : ''}
                    </div>
                </div>`;
            });
        }
        html += '</div></div>';
    });
    document.getElementById('dayContents').innerHTML = html;

    // 숙소
    if (plan.accommodation && plan.accommodation.name && plan.accommodation.name !== 'null') {
        document.getElementById('accommodationCard').innerHTML = `
            <div class="accommodation-card">
                <h3>${escapeHtml(plan.accommodation.name)}</h3>
                <p style="color:#78350f;margin-bottom:6px;">${escapeHtml(plan.accommodation.description || '')}</p>
                ${plan.accommodation.price_range ? `<p style="font-weight:600;color:#92400e;">💰 ${escapeHtml(plan.accommodation.price_range)}</p>` : ''}
            </div>`;
    } else {
        document.getElementById('accommodationCard').innerHTML = '';
    }

    // 팁
    if (plan.tips && plan.tips.length > 0) {
        document.getElementById('travelTips').innerHTML = `
            <div class="travel-tips">
                <h3>여행 팁</h3>
                <ul>${plan.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>`;
    } else {
        document.getElementById('travelTips').innerHTML = '';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 일별 탭 전환 ---
function switchDay(index) {
    document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.day-tab[data-day="${index}"]`).classList.add('active');
    document.querySelectorAll('.day-content').forEach(c => c.style.display = 'none');
    document.getElementById(`dayContent_${index}`).style.display = 'block';
}

// --- 다시 만들기 ---
function goBack() {
    document.getElementById('planResult').classList.remove('active');
    document.getElementById('plannerForm').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', window.location.pathname);
}

// --- 공유 ---
function sharePlan() {
    if (!currentPlanId) { showToast('공유할 계획이 없습니다.', 'error'); return; }
    const url = window.location.origin + window.location.pathname + '#plan=' + currentPlanId;
    navigator.clipboard.writeText(url).then(() => {
        showToast('공유 링크가 복사되었습니다! (같은 브라우저에서만 열 수 있습니다)', 'success');
    }).catch(() => {
        prompt('아래 링크를 복사하세요:', url);
    });
}

// --- 저장소 ---
function savePlanToStorage(id, plan, region, month, days, styles, customStyle) {
    const plans = JSON.parse(localStorage.getItem(CONFIG.PLANS_STORAGE) || '{}');
    plans[id] = { plan, region, month, days, styles, customStyle, created: new Date().toISOString() };
    // 최대 20개만 유지
    const keys = Object.keys(plans);
    if (keys.length > 20) {
        const oldest = keys.sort((a, b) => new Date(plans[a].created) - new Date(plans[b].created))[0];
        delete plans[oldest];
    }
    localStorage.setItem(CONFIG.PLANS_STORAGE, JSON.stringify(plans));
}

// --- 유틸 ---
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) overlay.classList.add('active');
    else overlay.classList.remove('active');
}

function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
