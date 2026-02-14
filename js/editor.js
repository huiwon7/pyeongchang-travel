// ============================================
// AI 평창 여행 관리자 에디터 - editor.js
// ============================================

let allPlaces = [];
let currentCategoryId = 1;
let editingId = null;

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', async () => {
    allPlaces = await initPlacesData();
    renderCategoryTabs();
    renderRegionOptions();
    loadAndRenderList();
});

// --- 카테고리 탭 렌더링 ---
function renderCategoryTabs() {
    const el = document.getElementById('categoryTabs');
    if (!el) return;
    el.innerHTML = CONFIG.CATEGORIES.map(cat =>
        `<button class="tab-btn ${cat.id === currentCategoryId ? 'active' : ''}"
                 onclick="switchCategory(${cat.id})" data-cat="${cat.id}">
            ${cat.icon} ${cat.name}
        </button>`
    ).join('');
}

// --- 지역 옵션 ---
function renderRegionOptions() {
    const el = document.getElementById('placeRegion');
    if (!el) return;
    el.innerHTML = '<option value="">선택</option>' +
        CONFIG.REGIONS.map(r => `<option value="${r.code}">${r.name}</option>`).join('');
}

// --- 카테고리 전환 ---
function switchCategory(catId) {
    currentCategoryId = catId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-cat="${catId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // 행사 필드 토글
    const eventFields = document.getElementById('eventFields');
    if (eventFields) eventFields.style.display = (catId === 4) ? 'block' : 'none';

    const catName = getCategoryName(catId);
    document.getElementById('formTitle').textContent = `➕ ${catName} 등록`;
    document.getElementById('listTitle').innerHTML = `📋 등록된 ${catName} <span class="count-badge" id="listCount">0</span>`;

    resetForm();
    loadAndRenderList();
}

// --- 목록 로드 및 렌더링 ---
function loadAndRenderList() {
    allPlaces = loadPlacesData() || [];
    const filtered = allPlaces.filter(p => p.category_id === currentCategoryId);
    renderPlaceList(filtered);
}

function renderPlaceList(places) {
    const listEl = document.getElementById('placeList');
    const countEl = document.getElementById('listCount');
    if (countEl) countEl.textContent = places.length;

    if (places.length === 0) {
        const catName = getCategoryName(currentCategoryId);
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>등록된 ${catName} 데이터가 없습니다.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = places.map(p => {
        const regionName = getRegionName(p.region);
        return `
        <div class="place-item" id="item_${p.id}">
            <div class="place-item-info">
                <div class="place-item-name">${escapeHtml(p.name)}</div>
                <span class="place-item-region">${escapeHtml(regionName)}</span>
                <div class="place-item-content">${escapeHtml(truncate(p.content, 100))}</div>
            </div>
            <div class="place-item-actions">
                <button class="icon-btn icon-btn-edit" onclick="editPlace(${p.id})" title="수정">✏️</button>
                <button class="icon-btn icon-btn-delete" onclick="deletePlace(${p.id})" title="삭제">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

// --- 저장 (등록/수정) ---
function savePlace() {
    const name = document.getElementById('placeName').value.trim();
    const region = document.getElementById('placeRegion').value;
    const content = document.getElementById('placeContent').value.trim();

    if (!name) { showToast('명칭을 입력해주세요.', 'error'); return; }
    if (!region) { showToast('지역을 선택해주세요.', 'error'); return; }
    if (!content) { showToast('상세 내용을 입력해주세요.', 'error'); return; }

    // 중복 확인 (같은 카테고리 내)
    const duplicate = allPlaces.find(p =>
        p.name === name && p.category_id === currentCategoryId && p.id !== editingId
    );
    if (duplicate) {
        showToast('같은 카테고리에 동일한 이름이 이미 있습니다.', 'error');
        return;
    }

    const placeData = {
        category_id: currentCategoryId,
        region: region,
        name: name,
        content: content,
        lat: parseFloat(document.getElementById('placeLat').value) || null,
        lng: parseFloat(document.getElementById('placeLng').value) || null,
        operating_hours: document.getElementById('placeHours').value.trim(),
        admission_fee: document.getElementById('placeFee').value.trim(),
        duration_min: parseInt(document.getElementById('placeDuration').value) || null,
        season_tags: document.getElementById('placeSeasonTags').value.trim(),
        style_tags: document.getElementById('placeStyleTags').value.trim(),
    };

    // 행사 필드
    if (currentCategoryId === 4) {
        placeData.event_start = document.getElementById('eventStart').value.trim();
        placeData.event_end = document.getElementById('eventEnd').value.trim();
    }

    if (editingId !== null) {
        // 수정
        const index = allPlaces.findIndex(p => p.id === editingId);
        if (index !== -1) {
            placeData.id = editingId;
            allPlaces[index] = placeData;
            showToast('수정되었습니다.', 'success');
        }
    } else {
        // 등록 - 새 ID 생성
        const maxId = allPlaces.reduce((max, p) => Math.max(max, p.id || 0), 0);
        placeData.id = maxId + 1;
        allPlaces.push(placeData);
        showToast('등록되었습니다.', 'success');
    }

    savePlacesData(allPlaces);
    resetForm();
    loadAndRenderList();
}

// --- 수정 로드 ---
function editPlace(id) {
    const place = allPlaces.find(p => p.id === id);
    if (!place) return;

    editingId = id;
    document.getElementById('placeName').value = place.name || '';
    document.getElementById('placeRegion').value = place.region || '';
    document.getElementById('placeContent').value = place.content || '';
    document.getElementById('placeLat').value = place.lat || '';
    document.getElementById('placeLng').value = place.lng || '';
    document.getElementById('placeHours').value = place.operating_hours || '';
    document.getElementById('placeFee').value = place.admission_fee || '';
    document.getElementById('placeDuration').value = place.duration_min || '';
    document.getElementById('placeSeasonTags').value = place.season_tags || '';
    document.getElementById('placeStyleTags').value = place.style_tags || '';

    if (place.event_start) document.getElementById('eventStart').value = place.event_start;
    if (place.event_end) document.getElementById('eventEnd').value = place.event_end;

    const catName = getCategoryName(currentCategoryId);
    document.getElementById('formTitle').textContent = `✏️ ${catName} 수정`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 삭제 ---
function deletePlace(id) {
    const place = allPlaces.find(p => p.id === id);
    if (!place) return;
    if (!confirm(`"${place.name}"을(를) 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

    allPlaces = allPlaces.filter(p => p.id !== id);
    savePlacesData(allPlaces);

    if (editingId === id) resetForm();
    loadAndRenderList();
    showToast('삭제되었습니다.', 'success');
}

// --- 폼 초기화 ---
function resetForm() {
    editingId = null;
    document.getElementById('placeName').value = '';
    document.getElementById('placeRegion').value = '';
    document.getElementById('placeContent').value = '';
    document.getElementById('placeLat').value = '';
    document.getElementById('placeLng').value = '';
    document.getElementById('placeHours').value = '';
    document.getElementById('placeFee').value = '';
    document.getElementById('placeDuration').value = '';
    document.getElementById('placeSeasonTags').value = '';
    document.getElementById('placeStyleTags').value = '';
    document.getElementById('eventStart').value = '';
    document.getElementById('eventEnd').value = '';

    const catName = getCategoryName(currentCategoryId);
    document.getElementById('formTitle').textContent = `➕ ${catName} 등록`;
}

// --- 데이터 내보내기 ---
function exportData() {
    const data = {
        exported_at: new Date().toISOString(),
        categories: CONFIG.CATEGORIES,
        regions: CONFIG.REGIONS,
        places: allPlaces,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pyeongchang_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('데이터가 내보내기 되었습니다.', 'success');
}

// --- 데이터 가져오기 ---
function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            const places = data.places || data;
            if (!Array.isArray(places)) throw new Error('올바른 형식이 아닙니다.');

            if (confirm(`${places.length}개 데이터를 가져올까요?\n기존 데이터를 대체합니다.`)) {
                allPlaces = places;
                savePlacesData(allPlaces);
                loadAndRenderList();
                showToast(`${places.length}개 데이터를 가져왔습니다.`, 'success');
            }
        } catch (err) {
            showToast('파일 형식이 올바르지 않습니다.', 'error');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// --- 기본 데이터로 초기화 ---
async function resetToDefault() {
    if (!confirm('모든 데이터를 기본값으로 초기화하시겠습니까?\n현재 데이터가 모두 삭제됩니다.')) return;

    try {
        const res = await fetch('data/places.json');
        const data = await res.json();
        allPlaces = data.places || [];
        savePlacesData(allPlaces);
        loadAndRenderList();
        showToast('기본 데이터로 초기화되었습니다.', 'success');
    } catch {
        showToast('기본 데이터 로드에 실패했습니다.', 'error');
    }
}

// --- 유틸 ---
function truncate(str, maxLen) {
    if (!str) return '';
    str = str.replace(/\*\*/g, '').replace(/^- /gm, '');
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
