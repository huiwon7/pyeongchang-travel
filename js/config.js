// ============================================
// AI 평창 여행 가이드 - 설정 및 상수
// ============================================

const CONFIG = {
    // localStorage 키
    STORAGE_KEY: 'pyeongchang_places',
    API_KEY_STORAGE: 'pyeongchang_ai_key',
    API_PROVIDER_STORAGE: 'pyeongchang_ai_provider',
    PLANS_STORAGE: 'pyeongchang_plans',

    // 기본 AI 설정
    DEFAULT_PROVIDER: 'claude',
    CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',
    OPENAI_MODEL: 'gpt-4o',

    // 지역 정보
    REGIONS: [
        { code: 'daegwallyeong', name: '대관령' },
        { code: 'bongpyeong', name: '봉평' },
        { code: 'yongpyeong', name: '용평' },
        { code: 'pyeongchang_eup', name: '평창읍' },
        { code: 'bio_pyeongchang', name: '바이오평창' },
        { code: 'jinbu', name: '진부' },
        { code: 'other', name: '기타' },
    ],

    // 카테고리
    CATEGORIES: [
        { id: 1, name: '관광지', icon: '🏞️' },
        { id: 2, name: '맛집', icon: '🍴' },
        { id: 3, name: '촬영지', icon: '🎥' },
        { id: 4, name: '행사', icon: '📅' },
        { id: 5, name: '액티비티', icon: '⛷️' },
        { id: 6, name: '체험학습', icon: '🎓' },
        { id: 7, name: '숙소', icon: '🏨' },
    ],

    // 여행 스타일
    STYLES: [
        { value: 'nature', label: '자연/힐링', icon: '🌿' },
        { value: 'activity', label: '액티비티/레저', icon: '🏄' },
        { value: 'food', label: '맛집 탐방', icon: '🍽️' },
        { value: 'culture', label: '문화/역사', icon: '🏛️' },
        { value: 'photo', label: '사진/인생샷', icon: '📸' },
        { value: 'relax', label: '휴양/휴식', icon: '🧘' },
        { value: 'family', label: '가족 여행', icon: '👨‍👩‍👧‍👦' },
        { value: 'couple', label: '커플 여행', icon: '💑' },
        { value: 'ski', label: '스키/겨울스포츠', icon: '⛷️' },
        { value: 'hiking', label: '등산/트레킹', icon: '🥾' },
    ],

    // 스타일 → 카테고리 매핑
    STYLE_CATEGORY_MAP: {
        nature:   { primary: ['관광지', '촬영지'], secondary: ['맛집', '숙소'] },
        activity: { primary: ['액티비티'], secondary: ['관광지', '맛집'] },
        food:     { primary: ['맛집'], secondary: ['관광지', '촬영지'] },
        culture:  { primary: ['관광지', '체험학습'], secondary: ['맛집'] },
        photo:    { primary: ['촬영지', '관광지'], secondary: ['맛집'] },
        relax:    { primary: ['숙소', '관광지'], secondary: ['맛집'] },
        family:   { primary: ['체험학습', '관광지'], secondary: ['맛집', '액티비티'] },
        couple:   { primary: ['촬영지', '관광지'], secondary: ['맛집', '숙소'] },
        ski:      { primary: ['액티비티', '숙소'], secondary: ['맛집'] },
        hiking:   { primary: ['액티비티', '관광지'], secondary: ['맛집'] },
    },

    // 계절 매핑
    SEASONS: {
        spring: { months: [3, 4, 5],   name: '봄', keywords: '봄꽃, 트레킹, 자연, 체험학습, 신록' },
        summer: { months: [6, 7, 8],   name: '여름', keywords: '계곡, 래프팅, 캠핑, 페스티벌, 시원함' },
        fall:   { months: [9, 10, 11], name: '가을', keywords: '단풍, 산책, 목장, 페스티벌, 가을정취' },
        winter: { months: [12, 1, 2],  name: '겨울', keywords: '스키, 눈꽃, 온천, 겨울축제, 설경' },
    },
};

// --- 유틸 함수 ---
function getSeason(month) {
    month = parseInt(month);
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
}

function getSeasonName(month) {
    return CONFIG.SEASONS[getSeason(month)].name;
}

function getSeasonKeywords(month) {
    return CONFIG.SEASONS[getSeason(month)].keywords;
}

function getRegionName(code) {
    if (!code || code === 'all') return '평창 전체';
    const r = CONFIG.REGIONS.find(r => r.code === code);
    return r ? r.name : '평창 전체';
}

function getCategoryName(id) {
    const c = CONFIG.CATEGORIES.find(c => c.id === parseInt(id));
    return c ? c.name : '';
}

function getCategoryIcon(id) {
    const c = CONFIG.CATEGORIES.find(c => c.id === parseInt(id));
    return c ? c.icon : '';
}

function getStyleLabel(value) {
    const s = CONFIG.STYLES.find(s => s.value === value);
    return s ? s.label : value;
}

// --- 데이터 관리 (localStorage) ---
function loadPlacesData() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (stored) {
        try { return JSON.parse(stored); } catch { /* fall through */ }
    }
    return null;
}

function savePlacesData(places) {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(places));
}

async function initPlacesData() {
    let places = loadPlacesData();
    if (!places || places.length === 0) {
        // JSON 파일에서 초기 데이터 로드
        try {
            const res = await fetch('data/places.json');
            const data = await res.json();
            places = data.places || [];
            savePlacesData(places);
        } catch {
            places = [];
        }
    }
    return places;
}

// --- AI API Key 관리 ---
function getApiKey() {
    return localStorage.getItem(CONFIG.API_KEY_STORAGE) || '';
}

function setApiKey(key) {
    localStorage.setItem(CONFIG.API_KEY_STORAGE, key);
}

function getApiProvider() {
    return localStorage.getItem(CONFIG.API_PROVIDER_STORAGE) || CONFIG.DEFAULT_PROVIDER;
}

function setApiProvider(provider) {
    localStorage.setItem(CONFIG.API_PROVIDER_STORAGE, provider);
}

// --- 토스트 알림 ---
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- HTML 이스케이프 ---
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
