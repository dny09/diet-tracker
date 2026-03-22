// Firebase Configuration (TO BE FILLED BY USER)
const firebaseConfig = {
    apiKey: "AIzaSyBmOHtPRRYgktRtAYjpMCmHDJcm3jm-Dpw",
    authDomain: "diet-tracker-4abee.firebaseapp.com",
    projectId: "diet-tracker-4abee",
    storageBucket: "diet-tracker-4abee.firebasestorage.app",
    messagingSenderId: "143464950808",
    appId: "1:143464950808:web:c3bb032c26e54e5691676d",
    measurementId: "G-N3JZH635CE"
};

// OpenAI Configuration (Will be stored only in User's Browser for Security)
let OPENAI_API_KEY = localStorage.getItem('dt_openai_key') || "";

// Initialize Firebase (Compat Mode)
console.log("Iniciando Firebase (Compat)...");
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Food tracking definitions
const INGREDIENT_OPTIONS = {
    protein: {
        pollo: { name: "Pollo (150-200g)", kcal: 330 },
        res: { name: "Res (150g)", kcal: 375 },
        atun: { name: "Atún (1 lata)", kcal: 116 },
        huevo: { name: "Huevo (3 pzas)", kcal: 234 }
    },
    carbs: {
        arroz: { name: "Arroz (1 taza)", kcal: 205 },
        tortillas: { name: "Tortillas (3 pzas)", kcal: 156 }
    },
    cheese: {
        panela: { name: "Panela (50g)", kcal: 145 },
        fresco: { name: "Fresco (50g)", kcal: 150 },
        oaxaca: { name: "Oaxaca (50g)", kcal: 160 },
        cheddar: { name: "Cheddar (40g)", kcal: 160 }
    }
};

const DEFAULT_MEALS = [
    {
        id: 'desayuno',
        title: 'Desayuno',
        time: '7:00 a.m.',
        itemsHtml: '<p class="empty-meal-text">Aún no has registrado tu alimentación</p>',
        baseKcal: 0,
        completed: false,
        selections: {},
        isCustom: false,
        customText: '',
        customKcal: 0
    },
    {
        id: 'snack1',
        title: 'Snack 1',
        time: '10:00–10:30 a.m.',
        itemsHtml: '<p class="empty-meal-text">Aún no has registrado tu alimentación</p>',
        baseKcal: 0,
        completed: false,
        snackCount: 0,
        selections: {},
        isCustom: false,
        customText: '',
        customKcal: 0
    },
    {
        id: 'comida',
        title: 'Comida',
        time: '12:00–1:00 p.m.',
        itemsHtml: '<p class="empty-meal-text">Aún no has registrado tu alimentación</p>',
        baseKcal: 0,
        completed: false,
        selections: {},
        isCustom: false,
        customText: '',
        customKcal: 0
    },
    {
        id: 'snack2',
        title: 'Snack 2',
        time: '4:00–5:00 p.m.',
        itemsHtml: '<p class="empty-meal-text">Aún no has registrado tu alimentación</p>',
        baseKcal: 0,
        completed: false,
        snackCount: 0,
        selections: {},
        isCustom: false,
        customText: '',
        customKcal: 0
    },
    {
        id: 'cena',
        title: 'Cena',
        time: '7:30–8:30 p.m.',
        itemsHtml: '<p class="empty-meal-text">Aún no has registrado tu alimentación</p>',
        baseKcal: 0,
        completed: false,
        selections: {},
        isCustom: false,
        customText: '',
        customKcal: 0
    }
];

// App State
let appState = {
    user: null, 
    date: null, 
    history: {}, 
    exercises: {},
    weightLog: [],
    streak: 0,
    lastCompletedDate: null
};

let chartInstance = null;
let currentAiMealId = null;

// Initialization Boot
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('historyContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    
    initAuth();
});

function initAuth() {
    console.log("Configurando Auth Listener...");
    
    // Firebase Auth State Listener
    auth.onAuthStateChanged((user) => {
        console.log("Estado de Auth cambiado:", user ? "Conectado" : "Desconectado");
        if (user) {
            // User is signed in
            appState.user = { 
                uid: user.uid,
                name: user.displayName, 
                email: user.email,
                photoURL: user.photoURL 
            };
            
            // Sync with Firestore
            syncFromCloud().then(() => {
                launchHistory();
            });
        } else {
            // User is signed out
            appState.user = null;
            document.getElementById('authContainer').style.display = 'flex';
            document.getElementById('historyContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'none';
        }
    });

    // Google Login Handler
    document.getElementById('googleLoginBtn').addEventListener('click', async () => {
        try {
            console.log("Iniciando Login con Google...");
            await auth.signInWithPopup(googleProvider);
        } catch (error) {
            console.error("Error signing in with Google:", error);
            alert("No se pudo iniciar sesión con Google.\n\nError: " + error.code + "\n\n" + error.message);
        }
    });

    const savedUser = localStorage.getItem('dt_user');
    if (savedUser) {
        appState.user = JSON.parse(savedUser);
        document.getElementById('regName').value = appState.user.name || '';
        document.getElementById('regWeight').value = appState.user.initialWeight || '';
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
            try {
                // Remove user-specific session data but KEEP the OpenAI API Key
                localStorage.removeItem('dt_user');
                localStorage.removeItem('dt_weightLog');
                localStorage.removeItem('dt_history');
                
                await auth.signOut();
                location.reload();
            } catch (error) {
                console.error("Error signing out:", error);
            }
        }
    });

    document.getElementById('resetDataBtn').addEventListener('click', async () => {
        const confirm1 = confirm("⚠️ ¿ESTÁS SEGURO? Esto borrará TODO TU HISTORIAL de la nube y de este dispositivo de forma permanente.");
        if (confirm1) {
            const confirm2 = confirm("🔥 ÚLTIMA ADVERTENCIA: No hay vuelta atrás. ¿Realmente quieres borrar todos tus datos?");
            if (confirm2) {
                try {
                    // 1. Clear Firestore
                    if (appState.user && appState.user.uid) {
                        await db.collection("users").doc(appState.user.uid).delete();
                    }
                    // 2. Clear LocalStorage
                    localStorage.clear();
                    alert("Todos tus datos han sido eliminados. La página se reiniciará.");
                    location.reload();
                } catch (error) {
                    console.error("Error deleting data:", error);
                    alert("Hubo un error al borrar los datos de la nube.");
                }
            }
        }
    });

    document.getElementById('registerBtn').addEventListener('click', () => {
        const name = document.getElementById('regName').value.trim();
        const weight = document.getElementById('regWeight').value;
        
        if (name && weight) {
            const userProfile = { name, initialWeight: parseFloat(weight) };
            localStorage.setItem('dt_user', JSON.stringify(userProfile));
            appState.user = userProfile;
            
            const storedLog = localStorage.getItem('dt_weightLog');
            if (!storedLog || JSON.parse(storedLog).length === 0) {
                appState.weightLog = [{ 
                    date: new Date().toLocaleDateString('es-ES'), 
                    weight: parseFloat(weight) 
                }];
                localStorage.setItem('dt_weightLog', JSON.stringify(appState.weightLog));
            }
            
            loadGlobalState();
            launchHistory();
            
        } else {
            alert("Por favor ingresa tu nombre y peso actual para comenzar.");
        }
    });

    document.getElementById('aiCancelBtn').addEventListener('click', () => {
        document.getElementById('aiModal').classList.remove('show');
    });

    document.getElementById('aiSubmitBtn').addEventListener('click', () => {
        const text = document.getElementById('aiInput').value.trim();
        if (text && currentAiMealId) {
            analyzeWithAI(text, currentAiMealId);
        }
    });

    // Tab Logic
    document.getElementById('tabMeals').addEventListener('click', () => switchTab('meals'));
    document.getElementById('tabExercise').addEventListener('click', () => switchTab('exercise'));
    document.getElementById('tabProgress').addEventListener('click', () => switchTab('progress'));
    
    document.getElementById('aiExerciseBtn').addEventListener('click', () => {
        currentAiMealId = 'exercise';
        document.getElementById('aiInput').value = '';
        document.getElementById('aiInput').placeholder = "Ej: Caminé media hora en el parque a paso estándar...";
        document.getElementById('aiModalTitle').innerText = "Registrar Ejercicio";
        document.getElementById('aiModalDesc').innerText = "Describe tu actividad y calcularé cuántas calorías quemaste.";
        document.getElementById('aiModal').classList.add('show');
    });

    // Manual Exercise Logic
    document.getElementById('manualExBtn').addEventListener('click', () => {
        document.getElementById('manualExDesc').value = '';
        document.getElementById('manualExKcal').value = '';
        document.getElementById('manualExModal').classList.add('show');
    });

    document.getElementById('manualExCancelBtn').addEventListener('click', () => {
        document.getElementById('manualExModal').classList.remove('show');
    });

    document.getElementById('manualExSubmitBtn').addEventListener('click', () => {
        const desc = document.getElementById('manualExDesc').value.trim();
        const kcal = parseInt(document.getElementById('manualExKcal').value, 10);
        
        if (desc && kcal && !isNaN(kcal)) {
            if (!appState.exercises[appState.date]) appState.exercises[appState.date] = [];
            
            appState.exercises[appState.date].push({
                rawText: "Registro Manual",
                descripcion: desc,
                burned_kcal: kcal
            });
            
            saveGlobalState();
            renderExercises();
            updateProgress();
            
            document.getElementById('manualExModal').classList.remove('show');
        } else {
            alert("Por favor ingresa un formato válido para la descripción y las Kcal reportadas.");
        }
    });
}

function switchTab(tab) {
    document.getElementById('tabMeals').classList.remove('active');
    document.getElementById('tabExercise').classList.remove('active');
    document.getElementById('tabProgress').classList.remove('active');
    
    document.getElementById('mealsView').style.display = 'none';
    document.getElementById('exerciseView').style.display = 'none';
    document.getElementById('progressView').style.display = 'none';

    if (tab === 'meals') {
        document.getElementById('tabMeals').classList.add('active');
        document.getElementById('mealsView').style.display = 'block';
        if (appState.date) { renderMeals(); updateProgress(); }
    } else if (tab === 'exercise') {
        document.getElementById('tabExercise').classList.add('active');
        document.getElementById('exerciseView').style.display = 'block';
        if (appState.date) renderExercises(); 
    } else if (tab === 'progress') {
        document.getElementById('tabProgress').classList.add('active');
        document.getElementById('progressView').style.display = 'block';
        if (appState.date) {
            updateChart(); // Refresh to catch any new states implicitly
        }
    }
}

async function syncFromCloud() {
    if (!appState.user) return;
    
    console.log("Sincronizando desde la nube...");
    const userDocRef = db.collection("users").doc(appState.user.uid);
    const docSnap = await userDocRef.get();
    
    if (docSnap.exists) {
        const cloudData = docSnap.data();
        appState.history = cloudData.history || {};
        appState.exercises = cloudData.exercises || {};
        appState.weightLog = cloudData.weightLog || [];
        appState.streak = cloudData.streak || 0;
        appState.lastCompletedDate = cloudData.lastCompletedDate || null;
        
        // Map any legacy user profile info if missing
        if (cloudData.profile) {
            appState.user.initialWeight = cloudData.profile.initialWeight;
        }
    } else {
        // First time cloud user? Try to migrate local data if any
        loadGlobalState();
        await saveGlobalState(); // Push local to cloud
    }
}

function loadGlobalState() {
    const savedWeightLog = localStorage.getItem('dt_weightLog');
    if (savedWeightLog) appState.weightLog = JSON.parse(savedWeightLog);
    
    const savedStreak = localStorage.getItem('dt_streak');
    if (savedStreak) appState.streak = parseInt(savedStreak);
    
    appState.lastCompletedDate = localStorage.getItem('dt_lastCompletedDate');

    let historyStr = localStorage.getItem('dt_history');
    if (!historyStr) {
        appState.history = {};
    } else {
        appState.history = JSON.parse(historyStr);
        const todayStr = new Date().toLocaleDateString('es-ES');
        if (appState.history[todayStr] && appState.history[todayStr].length < 5) {
            appState.history[todayStr] = JSON.parse(JSON.stringify(DEFAULT_MEALS));
            localStorage.setItem('dt_history', JSON.stringify(appState.history));
        }
    }
    
    let exerciseStr = localStorage.getItem('dt_exercises');
    if (exerciseStr) appState.exercises = JSON.parse(exerciseStr);
}

async function saveGlobalState() {
    // Local backup
    localStorage.setItem('dt_history', JSON.stringify(appState.history));
    localStorage.setItem('dt_exercises', JSON.stringify(appState.exercises));
    localStorage.setItem('dt_weightLog', JSON.stringify(appState.weightLog));
    localStorage.setItem('dt_streak', appState.streak);
    if (appState.lastCompletedDate) localStorage.setItem('dt_lastCompletedDate', appState.lastCompletedDate);

    // Cloud Sync
    if (appState.user && appState.user.uid) {
        try {
            const userDocRef = db.collection("users").doc(appState.user.uid);
            await userDocRef.set({
                history: appState.history,
                exercises: appState.exercises,
                weightLog: appState.weightLog,
                streak: appState.streak,
                lastCompletedDate: appState.lastCompletedDate,
                profile: {
                    name: appState.user.name,
                    initialWeight: appState.user.initialWeight || (appState.weightLog[0] ? appState.weightLog[0].weight : 0)
                },
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) {
            console.error("Error saving to cloud:", e);
        }
    }
}

function ensureTodayInHistory() {
    const todayStr = new Date().toLocaleDateString('es-ES');
    if (!appState.history[todayStr] || appState.history[todayStr].length < 5) {
        appState.history[todayStr] = JSON.parse(JSON.stringify(DEFAULT_MEALS));
    }
    if (!appState.exercises[todayStr]) {
        appState.exercises[todayStr] = [];
    }
    saveGlobalState();
}

function launchHistory() {
    switchTab('meals'); // Reset view to meals
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('historyContainer').style.display = 'flex';
    
    if (appState.user && appState.user.name) {
        const firstName = appState.user.name.split(' ')[0];
        document.getElementById('historyProfilePic').innerText = firstName.charAt(0).toUpperCase();
        document.getElementById('historyGreeting').innerText = `Hola, ${firstName}`;
    }
    
    document.getElementById('newDayBtn').onclick = () => {
        const todayStr = new Date().toLocaleDateString('es-ES');
        launchAppDay(todayStr);
    };
    
    renderHistory();
}

function getCurrentWeight() {
    let currentWeight = appState.user.initialWeight;
    if (appState.weightLog && appState.weightLog.length > 0) {
        const sortedLog = [...appState.weightLog].sort((a,b) => new Date(a.date.split('/').reverse().join('-')) - new Date(b.date.split('/').reverse().join('-')));
        currentWeight = sortedLog[sortedLog.length - 1].weight;
    }
    return currentWeight;
}

function getSuggestedGoal() {
    if (appState.user && appState.user.initialWeight) {
        let suggested = Math.round((getCurrentWeight() * 20) - 600);
        return Math.max(suggested, 1200); 
    }
    return 2000;
}

function calculateProgressStats(meals, exercises) {
    let consumed = 0;
    let burned = 0;
    const goal = getSuggestedGoal();

    if (meals) {
        meals.forEach(meal => {
            if (meal.completed) {
                const kcal = calculateMealCalories(meal);
                if (meal.id.startsWith('snack') && meal.snackCount > 1) {
                    consumed += (meal.baseKcal * meal.snackCount);
                } else {
                    consumed += kcal;
                }
            }
        });
    }

    if (exercises) {
        exercises.forEach(ex => {
            burned += ex.burned_kcal;
        });
    }
    
    let netConsumed = consumed - burned;
    if (netConsumed < 0) netConsumed = 0;
    
    let percentage = goal > 0 ? (netConsumed / goal) * 100 : 0;
    if (percentage > 100) percentage = 100;

    return { consumed, burned, netConsumed, goal, percentage };
}

function renderHistory() {
    ensureTodayInHistory();
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    
    const dates = Object.keys(appState.history).sort((a, b) => {
        const aReversed = a.split('/').reverse().join('');
        const bReversed = b.split('/').reverse().join('');
        return aReversed < bReversed ? 1 : -1;
    });

    dates.forEach(date => {
        const meals = appState.history[date];
        const exList = appState.exercises[date] || [];
        if (!meals) return;

        const { netConsumed, goal, percentage } = calculateProgressStats(meals, exList);
        
        let colorClass = 'green';
        if (netConsumed > goal) colorClass = 'red';
        else if (netConsumed >= goal * 0.9) colorClass = 'yellow';
        
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-date">${date}</div>
            <div class="history-pct ${colorClass}">${Math.round(percentage)}%</div>
        `;
        card.addEventListener('click', () => {
            launchAppDay(date);
        });
        
        list.appendChild(card);
    });
}

function launchAppDay(dateStr) {
    appState.date = dateStr;
    
    document.getElementById('historyContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    
    document.getElementById('backToHistoryBtn').onclick = () => {
        launchHistory();
    };
    
    renderDateInApp();
    if (appState.date) {
        renderMeals();
        updateProgress();
        initChart();
    }
}

function renderDateInApp() {
    const todayStr = new Date().toLocaleDateString('es-ES');
    document.getElementById('streakCount').innerText = appState.streak;
    
    if (appState.date === todayStr) {
        document.getElementById('dateDisplay').innerText = "Hoy";
    } else {
        document.getElementById('dateDisplay').innerText = appState.date;
    }
}

function getMealEvaluationColor(mealId, kcal, dailyGoal) {
    let targetPct = 0.25; 
    if (mealId === 'desayuno') targetPct = 0.20;
    if (mealId === 'comida') targetPct = 0.35;
    if (mealId.startsWith('snack')) targetPct = 0.10;

    const targetKcal = dailyGoal * targetPct;
    
    if (kcal <= targetKcal * 1.15) return 'var(--green)';
    if (kcal <= targetKcal * 1.30) return 'var(--yellow)';
    return 'var(--red)';
}

function calculateMealCalories(meal) {
    if (meal.isCustom) return meal.customKcal * (meal.id.startsWith('snack') ? (meal.snackCount || 1) : 1);
    
    if (meal.id === 'desayuno') return meal.baseKcal;
    if (meal.id.startsWith('snack')) return meal.baseKcal * (meal.snackCount || 1);
    
    let total = meal.baseKcal;
    if (meal.selections.protein) total += INGREDIENT_OPTIONS.protein[meal.selections.protein].kcal;
    if (meal.selections.carbs) total += INGREDIENT_OPTIONS.carbs[meal.selections.carbs].kcal;
    if (meal.selections.cheese) total += INGREDIENT_OPTIONS.cheese[meal.selections.cheese].kcal;
    
    return total;
}

const MEAL_SUGGESTIONS = {
    'desayuno': '💡 Tip: Un buen aporte de proteína al despertar estabiliza tu energía y evita antojos después.',
    'snack1': '💡 Tip: Tomar un vaso de agua junto a tu snack maximiza la sensación de saciedad.',
    'comida': '💡 Tip: Intenta que la mitad de tu plato siempre sean vegetales frescos o al vapor. ¡Pónle color!',
    'snack2': '💡 Tip: Los pistaches aportan grasas excelentes para tu cerebro. Mastícalos y disfrútalos despacio.',
    'cena': '💡 Tip: Una cena moderada como esta te asegura una digestión ligera y un descanso reparador.'
};

function renderMeals() {
    const list = document.getElementById('mealsList');
    list.innerHTML = '';
    
    if (!appState.date || !appState.history[appState.date]) return;
    
    const meals = appState.history[appState.date];
    const dailyGoal = getSuggestedGoal();
    
    meals.forEach((meal, index) => {
        const kcal = calculateMealCalories(meal);
        const statusColor = getMealEvaluationColor(meal.id, kcal, dailyGoal);
        const colorDot = statusColor === 'var(--green)' ? '🟢' : (statusColor === 'var(--yellow)' ? '🟡' : '🔴');
        
        const card = document.createElement('div');
        card.className = `meal-card ${meal.completed ? 'completed' : ''}`;
        
        const suggestionBlock = MEAL_SUGGESTIONS[meal.id] ? `<div class="meal-suggestion">${MEAL_SUGGESTIONS[meal.id]}</div>` : '';
        
        let dynamicFormatHtml = '';
        if (meal.isCustom) {
            dynamicFormatHtml = `
                <div style="color: var(--accent); margin-bottom: 8px; font-size: 13px; display: flex; align-items: center; gap: 4px;">✨ Ingresado IA</div>
                <div style="margin-bottom: 12px; font-style: italic;">"${meal.customText}"</div>
                ${suggestionBlock}
                <div style="margin-top: 12px;">
                    <button class="ai-btn edit-ai-btn" data-meal="${meal.id}">✏️ Editar</button>
                </div>
            `;
        } else {
            dynamicFormatHtml = meal.itemsHtml + `
                ${suggestionBlock}
                <div style="margin-top: 14px; text-align: right;">
                    <button class="ai-btn trigger-ai" data-meal="${meal.id}">✨ Capturar texto por IA</button>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="meal-header">
                <div class="meal-info">
                    <h3>${meal.title} <span class="meal-time">${meal.time}</span></h3>
                    <div class="meal-calories" style="color: ${statusColor};">${colorDot} ~${kcal} kcal</div>
                </div>
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="custom-checkbox" data-index="${index}" ${meal.completed ? 'checked' : ''}>
                </div>
            </div>
            <div class="food-items">
                ${dynamicFormatHtml}
            </div>
        `;
        list.appendChild(card);
        
        if (!meal.isCustom && meal.selections) {
            const selects = card.querySelectorAll('select');
            selects.forEach(sel => {
                const type = sel.getAttribute('data-type');
                if (meal.selections[type]) sel.value = meal.selections[type];
            });
        }
    });

    list.querySelectorAll('.custom-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = e.target.getAttribute('data-index');
            handleCheckboxToggle(idx, e.target.checked);
        });
    });

    list.querySelectorAll('.food-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const mealId = e.target.getAttribute('data-meal');
            const type = e.target.getAttribute('data-type');
            const val = e.target.value;
            
            const meal = meals.find(m => m.id === mealId);
            if (meal) {
                meal.selections[type] = val;
                saveGlobalState();
                renderMeals(); 
                updateProgress();
            }
        });
    });
    
    list.querySelectorAll('.trigger-ai').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentAiMealId = e.target.getAttribute('data-meal');
            document.getElementById('aiInput').value = '';
            document.getElementById('aiModalTitle').innerText = "Registro Inteligente";
            document.getElementById('aiModalDesc').innerText = "Escribe qué comida realizaste y ChatGPT la evaluará.";
            document.getElementById('aiModal').classList.add('show');
        });
    });
    
    list.querySelectorAll('.edit-ai-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mealId = e.target.getAttribute('data-meal');
            const meal = meals.find(m => m.id === mealId);
            if (meal && meal.isCustom) {
                currentAiMealId = mealId;
                document.getElementById('aiInput').value = meal.rawCustomText || meal.customText || '';
                document.getElementById('aiModalTitle').innerText = "Editar Registro";
                document.getElementById('aiModal').classList.add('show');
            }
        });
    });
}

function renderExercises() {
    const list = document.getElementById('exerciseList');
    list.innerHTML = '';
    
    if (!appState.date) return;
    
    let totalBurned = 0;
    const todayEx = appState.exercises[appState.date] || [];
    
    todayEx.forEach((ex, index) => {
        totalBurned += ex.burned_kcal;
        
        const card = document.createElement('div');
        card.className = 'meal-card completed';
        card.innerHTML = `
            <div class="meal-header" style="align-items: center;">
                <div class="meal-info">
                    <h3>${ex.descripcion}</h3>
                    <div class="meal-calories" style="color: var(--green);">🔥 -${ex.burned_kcal} kcal quemadas</div>
                </div>
                <button class="btn-delete-ex" data-index="${index}">🗑️</button>
            </div>
            <div style="font-size:13px; color:var(--text-sec); font-style:italic; margin-top:8px;">"${ex.rawText}"</div>
        `;
        list.appendChild(card);
    });
    
    document.getElementById('totalBurnedDisplay').innerText = totalBurned;
    
    list.querySelectorAll('.btn-delete-ex').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.currentTarget.getAttribute('data-index');
            todayEx.splice(idx, 1);
            saveGlobalState();
            renderExercises();
            updateProgress(); // Because it affects net cals
        });
    });
}

function handleCheckboxToggle(index, isChecked) {
    const meals = appState.history[appState.date];
    const meal = meals[index];
    
    if (meal.id.startsWith('snack') && isChecked) {
        meal.snackCount = (meal.snackCount || 0) + 1;
        if (meal.snackCount > 1) {
            showSnackWarning();
        }
    }
    if (!isChecked && meal.id.startsWith('snack')) { meal.snackCount = 0; }

    meal.completed = isChecked;
    saveGlobalState();
    
    renderMeals();
    updateProgress();
    checkStreakUpdate();
}

function showSnackWarning() {
    const modal = document.getElementById('snackWarningModal');
    modal.classList.add('show');
    document.getElementById('closeModalBtn').onclick = () => { modal.classList.remove('show'); };
}

function updateProgress() {
    if (!appState.date) return;
    const meals = appState.history[appState.date];
    const exercises = appState.exercises[appState.date];
    const { consumed, burned, netConsumed, goal, percentage } = calculateProgressStats(meals, exercises);

    document.getElementById('calsConsumed').innerText = netConsumed;
    document.getElementById('calsGoal').innerText = goal;
    
    const remaining = goal - netConsumed;
    let rootMsg = remaining > 0 ? `Faltan ${remaining} kcal` : (remaining === 0 ? "¡Objetivo cumplido!" : `Excedido por ${Math.abs(remaining)} kcal`);
    if (burned > 0 && remaining > 0) {
        rootMsg += ` (¡El ejercicio te dio +${burned} extra!)`;
    }

    document.getElementById('calsRemainingMsg').innerText = rootMsg;

    const bar = document.getElementById('progressBar');
    bar.style.width = `${percentage}%`;

    if (netConsumed > goal) {
        bar.style.backgroundColor = 'var(--red)';
    } else if (netConsumed >= goal * 0.9) {
        bar.style.backgroundColor = 'var(--yellow)';
    } else {
        bar.style.backgroundColor = 'var(--green)';
    }
}

function checkStreakUpdate() {
    const todayStr = new Date().toLocaleDateString('es-ES');
    if (!appState.history[todayStr]) return;
    
    const todayMeals = appState.history[todayStr];
    const allDone = todayMeals.every(m => m.completed);
    
    if (allDone && appState.lastCompletedDate !== todayStr) {
        appState.streak++;
        appState.lastCompletedDate = todayStr;
        saveGlobalState();
        document.getElementById('streakCount').innerText = appState.streak;
    } else if (!allDone && appState.lastCompletedDate === todayStr) {
        appState.streak--;
        appState.lastCompletedDate = null;
        saveGlobalState();
        document.getElementById('streakCount').innerText = Math.max(0, appState.streak);
    }
}

// AI Integration Code
async function analyzeWithAI(text, contextId) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.length < 10) {
        const inputKey = prompt("Por favor ingresa tu API Key de OpenAI para usar las funciones de IA (se guardará solo en este dispositivo):");
        if (inputKey && inputKey.length > 20) {
            localStorage.setItem('dt_openai_key', inputKey);
            OPENAI_API_KEY = inputKey;
        } else {
            alert("No se ingresó una clave válida. El análisis de IA no funcionará.");
            return;
        }
    }
    
    const apiKey = OPENAI_API_KEY;

    const loader = document.getElementById('aiLoading');
    const submitBtn = document.getElementById('aiSubmitBtn');
    loader.style.display = 'block';
    submitBtn.style.display = 'none';

    const isExercise = contextId === 'exercise';
    const weight = getCurrentWeight();

    const promptText = isExercise
        ? `Eres un entrenador personal. El usuario pesa ${weight}kg y reporta: "${text}". Basado en tablas MET estima las calorías quemadas. Devuelve un JSON: {"kcal": [entero], "descripcion_limpia": "breve"}`
        : `Eres un nutriólogo experto. El usuario reporta: "${text}". Estima las calorías ingeridas. Devuelve un JSON: {"kcal": [entero], "descripcion_limpia": "breve"}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a helpful data extraction bot that strictly outputs JSON." },
                    { role: "user", content: promptText }
                ],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (data.error) {
            alert("Error de API OpenAI: " + data.error.message);
            if (data.error.code === 'invalid_api_key' || response.status === 401) {
                localStorage.removeItem('dt_openai_key'); 
            }
            return;
        }

        const rawJson = data.choices[0].message.content.trim();
        const result = JSON.parse(rawJson);
        
        if (isExercise) {
            if (!appState.exercises[appState.date]) appState.exercises[appState.date] = [];
            appState.exercises[appState.date].push({
                rawText: text,
                descripcion: result.descripcion_limpia,
                burned_kcal: parseInt(result.kcal, 10)
            });
            saveGlobalState();
            renderExercises();
        } else {
            const meals = appState.history[appState.date];
            const meal = meals.find(m => m.id === contextId);
            meal.isCustom = true;
            meal.rawCustomText = text; 
            meal.customText = result.descripcion_limpia;
            meal.customKcal = parseInt(result.kcal, 10);
            saveGlobalState();
            renderMeals();
        }

        updateProgress();
        document.getElementById('aiModal').classList.remove('show');
        
    } catch (e) {
        alert("Hubo un error interpretando los datos. Intenta de nuevo.");
        console.error(e);
    } finally {
        loader.style.display = 'none';
        submitBtn.style.display = 'block';
    }
}

// Chart.js Tracking Functionality
function initChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy(); 
    }
    
    const sortedLog = [...appState.weightLog].sort((a,b) => new Date(a.date.split('/').reverse().join('-')) - new Date(b.date.split('/').reverse().join('-')));
    
    const labels = sortedLog.map(log => log.date.substring(0, 5)); 
    const weightData = sortedLog.map(log => log.weight);
    const waistData = sortedLog.map(log => log.waist || null);

    // Check if we have any valid waist data to show axis
    const hasWaist = waistData.some(d => d !== null);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Peso (kg)',
                    data: weightData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false, /* Disabled fill to keep graph clean for dual axis */
                    pointBackgroundColor: '#10B981',
                    pointRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Cintura (cm)',
                    data: waistData,
                    borderColor: '#F59E0B',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointBackgroundColor: '#F59E0B',
                    pointRadius: 4,
                    spanGaps: true,
                    hidden: !hasWaist,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af', font: {family: "'Inter', sans-serif"} }
                },
                y1: {
                    type: 'linear',
                    display: hasWaist,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#F59E0B', font: {family: "'Inter', sans-serif"} }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af', font: {family: "'Inter', sans-serif"} }
                }
            },
            plugins: { 
                legend: { 
                    display: true, 
                    labels: { color: '#fff', font: {family: "'Inter', sans-serif"} } 
                } 
            }
        }
    });

    const saveBtn = document.getElementById('saveWeightBtn');
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);

    newBtn.addEventListener('click', () => {
        const weightVal = document.getElementById('weightInput').value;
        const waistVal = document.getElementById('waistInput').value;
        
        if (weightVal && !isNaN(weightVal)) {
            const todayStr = new Date().toLocaleDateString('es-ES');
            
            const existingIdx = appState.weightLog.findIndex(w => w.date === todayStr);
            let entry = existingIdx >= 0 ? appState.weightLog[existingIdx] : { date: todayStr };
            
            entry.weight = parseFloat(weightVal);
            if (waistVal) entry.waist = parseFloat(waistVal);

            if (existingIdx < 0) {
                appState.weightLog.push(entry);
                if (appState.weightLog.length > 20) appState.weightLog.shift();
            }
            
            saveGlobalState();
            updateChart();
            renderHistory(); 
            
            document.getElementById('weightInput').value = '';
            document.getElementById('waistInput').value = '';
            alert("Registro de progreso guardado exitosamente.");
        }
    });
}

function updateChart() {
    if (!chartInstance) return;
    const sortedLog = [...appState.weightLog].sort((a,b) => new Date(a.date.split('/').reverse().join('-')) - new Date(b.date.split('/').reverse().join('-')));
    
    chartInstance.data.labels = sortedLog.map(log => log.date.substring(0, 5));
    chartInstance.data.datasets[0].data = sortedLog.map(log => log.weight);
    
    const waistData = sortedLog.map(log => log.waist || null);
    chartInstance.data.datasets[1].data = waistData;
    
    const hasWaist = waistData.some(d => d !== null);
    chartInstance.options.scales.y1.display = hasWaist;
    chartInstance.data.datasets[1].hidden = !hasWaist;
    
    chartInstance.update();
}
