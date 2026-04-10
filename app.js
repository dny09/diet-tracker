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
    water: {}, // { "dateStr": glassCount }
    weightLog: [],
    streak: 0,
    lastCompletedDate: null
};

let chartInstance = null;
let currentAiMealId = null;
let currentHistoryPeriod = 'day';

// Initialization Boot
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('historyContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    
    // Period filter listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentHistoryPeriod = e.currentTarget.getAttribute('data-period');
            if (document.getElementById('historyContainer').style.display !== 'none') {
                 renderHistory();
            }
        });
    });
    
    initAuth();
});

function initAuth() {
    console.log("Configurando Auth Listener...");
    
    // Firebase Auth State Listener
    auth.onAuthStateChanged(async (user) => {
        console.log("Estado de Auth cambiado:", user ? "Conectado" : "Desconectado");
        if (user) {
            // User is signed in - Merge with existing or new
            const newUser = { 
                uid: user.uid,
                name: user.displayName || (appState.user ? appState.user.name : ''), 
                email: user.email,
                photoURL: user.photoURL 
            };
            appState.user = { ...appState.user, ...newUser };
            
            // Sync with Firestore
            await syncFromCloud();
            launchHistory();
        } else {
            // User is signed out or using local-only profile
            const localUser = localStorage.getItem('dt_user');
            if (localUser) {
                appState.user = JSON.parse(localUser);
                document.getElementById('authContainer').style.display = 'none';
                document.getElementById('historyContainer').style.display = 'flex';
            } else {
                appState.user = null;
                document.getElementById('authContainer').style.display = 'flex';
                document.getElementById('historyContainer').style.display = 'none';
                document.getElementById('appContainer').style.display = 'none';
            }
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

    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
        e.stopPropagation();
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

    document.getElementById('resetDataBtn').addEventListener('click', async (e) => {
        e.stopPropagation();
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
        const lastName = document.getElementById('regLastName').value.trim();
        const age = parseInt(document.getElementById('regAge').value);
        const height = parseFloat(document.getElementById('regHeight').value);
        const weight = document.getElementById('regWeight').value;
        
        if (name && weight && lastName && !isNaN(age) && !isNaN(height)) {
            const userProfile = { 
                name, 
                lastName, 
                age, 
                height, 
                initialWeight: parseFloat(weight) 
            };
            localStorage.setItem('dt_user', JSON.stringify(userProfile));
            appState.user = { ...appState.user, ...userProfile };
            
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
            alert("Por favor completa todos los campos (Nombres, Apellidos, Edad, Estatua y Peso) para comenzar.");
        }
    });

    // Profile Dropdown Toggle
    const profilePic = document.getElementById('historyProfilePic');
    const dropdown = document.getElementById('profileDropdown');
    
    if (profilePic) {
        profilePic.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
            if (dropdown.classList.contains('show')) {
                renderProfileSummary();
            }
        });
    }

    document.addEventListener('click', () => {
        if (dropdown) dropdown.classList.remove('show');
    });

    // Edit Profile Logic
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            console.log("Clic en Editar Perfil detectado");
            e.preventDefault();
            e.stopPropagation();
            
            if (!appState.user) {
                console.warn("No hay usuario cargado en appState");
                return;
            }

            // Populate fields
            document.getElementById('editName').value = appState.user.name || '';
            document.getElementById('editLastName').value = appState.user.lastName || '';
            document.getElementById('editAge').value = appState.user.age || '';
            document.getElementById('editHeight').value = appState.user.height || '';
            document.getElementById('editWeight').value = getCurrentWeight() || '';

            // Show modal
            const modal = document.getElementById('editProfileModal');
            if (modal) {
                console.log("Abriendo modal de edición...");
                modal.classList.add('show');
                // Ensure dropdown closes
                if (dropdown) dropdown.classList.remove('show');
            } else {
                console.error("No se encontró el modal editProfileModal");
            }
        });
    }

    document.getElementById('closeEditProfileBtn').addEventListener('click', () => {
        document.getElementById('editProfileModal').classList.remove('show');
    });

    document.getElementById('saveProfileBtn').addEventListener('click', () => {
        const name = document.getElementById('editName').value.trim();
        const lastName = document.getElementById('editLastName').value.trim();
        const age = parseInt(document.getElementById('editAge').value);
        const height = parseFloat(document.getElementById('editHeight').value);
        const weight = parseFloat(document.getElementById('editWeight').value);

        if (name && lastName && !isNaN(age) && !isNaN(height) && !isNaN(weight)) {
            appState.user.name = name;
            appState.user.lastName = lastName;
            appState.user.age = age;
            appState.user.height = height;
            appState.user.initialWeight = weight;
            
            // Also update the weight log if it exists to reflect the change immediately
            if (appState.weightLog && appState.weightLog.length > 0) {
                // Find the latest entry and update it, or add one if it's for today
                const todayStr = new Date().toLocaleDateString('es-ES');
                const lastIdx = appState.weightLog.length - 1;
                appState.weightLog[lastIdx].weight = weight;
            } else {
                // Create first entry if none exists
                appState.weightLog = [{
                    date: new Date().toLocaleDateString('es-ES'),
                    weight: weight
                }];
            }
            
            saveGlobalState().then(() => {
                renderProfileSummary();
                const firstName = name.split(' ')[0];
                document.getElementById('historyProfilePic').innerText = firstName.charAt(0).toUpperCase();
                document.getElementById('historyGreeting').innerText = `Hola, ${firstName}`;
                document.getElementById('editProfileModal').classList.remove('show');
            });
        } else {
            alert("Por favor completa todos los campos correctamente.");
        }
    });

    document.getElementById('aiCancelBtn').addEventListener('click', () => {
        document.getElementById('aiModal').classList.remove('show');
    });

    document.getElementById('aiSubmitBtn').addEventListener('click', () => {
        const text = document.getElementById('aiInput').value.trim();
        if (!text) {
            if (currentAiMealId && currentAiMealId !== 'exercise') {
                const meals = appState.history[appState.date];
                const meal = meals.find(m => m.id === currentAiMealId);
                if (meal && meal.isCustom) {
                    meal.isCustom = false;
                    meal.rawCustomText = '';
                    meal.customText = '';
                    meal.customKcal = 0;
                    meal.customTip = null;
                    saveGlobalState();
                    renderMeals();
                    updateProgress();
                }
            }
            document.getElementById('aiModal').classList.remove('show');
            return;
        }
        
        if (currentAiMealId) {
            analyzeWithAI(text, currentAiMealId);
        }
    });

    // Tab Logic
    document.getElementById('tabMeals').addEventListener('click', () => switchTab('meals'));
    document.getElementById('tabWater').addEventListener('click', () => switchTab('water'));
    document.getElementById('tabExercise').addEventListener('click', () => switchTab('exercise'));
    document.getElementById('tabProgress').addEventListener('click', () => switchTab('progress'));

    // Water Logic
    document.getElementById('btnAddWater').addEventListener('click', () => {
        if (!appState.date) return;
        const current = appState.water[appState.date] || 0;
        appState.water[appState.date] = current + 1;
        saveGlobalState();
        renderWater();
    });

    document.getElementById('btnRemoveWater').addEventListener('click', () => {
        if (!appState.date) return;
        const current = appState.water[appState.date] || 0;
        if (current > 0) {
            appState.water[appState.date] = current - 1;
            saveGlobalState();
            renderWater();
        }
    });
    
    document.getElementById('aiExerciseBtn').addEventListener('click', () => {
        currentAiMealId = 'exercise';
        document.getElementById('aiInput').value = '';
        document.getElementById('aiInput').placeholder = "Ej: Caminé media hora en el parque a paso estándar...";
        document.getElementById('aiModalTitle').innerText = "Registrar Ejercicio";
        document.getElementById('aiModalDesc').innerHTML = "Describe tu actividad y la IA calculará cuántas calorías quemaste.";
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

    // Initialize Foods Catalog
    initFoodsCatalog();
}

function switchTab(tab) {
    document.getElementById('tabMeals').classList.remove('active');
    document.getElementById('tabWater').classList.remove('active');
    document.getElementById('tabExercise').classList.remove('active');
    document.getElementById('tabProgress').classList.remove('active');
    
    document.getElementById('mealsView').style.display = 'none';
    document.getElementById('waterView').style.display = 'none';
    document.getElementById('exerciseView').style.display = 'none';
    document.getElementById('progressView').style.display = 'none';

    if (tab === 'meals') {
        document.getElementById('tabMeals').classList.add('active');
        document.getElementById('mealsView').style.display = 'block';
        if (appState.date) { renderMeals(); updateProgress(); }
    } else if (tab === 'water') {
        document.getElementById('tabWater').classList.add('active');
        document.getElementById('waterView').style.display = 'block';
        if (appState.date) renderWater();
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
        appState.water = cloudData.water || {};
        appState.weightLog = cloudData.weightLog || [];
        appState.streak = cloudData.streak || 0;
        appState.lastCompletedDate = cloudData.lastCompletedDate || null;
        
        // Map any legacy user profile info if missing
        if (cloudData.profile) {
            appState.user.initialWeight = cloudData.profile.initialWeight;
            appState.user.lastName = cloudData.profile.lastName || '';
            appState.user.age = cloudData.profile.age || null;
            appState.user.height = cloudData.profile.height || null;
        }
        // Merge cloud food catalog metadata with local (which has photos)
        if (cloudData.foodCatalog && cloudData.foodCatalog.length > 0) {
            loadFoodCatalog(); // Load local first (has photos)
            // Merge: for each cloud entry, keep local photo if present
            const localById = {};
            (appState.foodCatalog || []).forEach(f => { localById[f.id] = f; });
            appState.foodCatalog = cloudData.foodCatalog.map(cf => ({
                ...cf,
                photo: localById[cf.id] ? localById[cf.id].photo : null
            }));
        } else {
            loadFoodCatalog();
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
    
    let waterStr = localStorage.getItem('dt_water');
    if (waterStr) appState.water = JSON.parse(waterStr);
    if (!appState.water) appState.water = {};

    // Load food catalog (with photos) from localStorage
    loadFoodCatalog();
}

async function saveGlobalState() {
    // Local backup
    localStorage.setItem('dt_history', JSON.stringify(appState.history));
    localStorage.setItem('dt_exercises', JSON.stringify(appState.exercises));
    localStorage.setItem('dt_water', JSON.stringify(appState.water));
    localStorage.setItem('dt_weightLog', JSON.stringify(appState.weightLog));
    localStorage.setItem('dt_streak', appState.streak);
    if (appState.lastCompletedDate) localStorage.setItem('dt_lastCompletedDate', appState.lastCompletedDate);

    // Cloud Sync
    if (appState.user && appState.user.uid) {
        try {
            const userDocRef = db.collection("users").doc(appState.user.uid);
            // Prepare food catalog for cloud (remove potential local blobs, keep only metadata/URLs)
            const cloudFoodCatalog = (appState.foodCatalog || []).map(f => ({
                id: f.id,
                name: f.name,
                brand: f.brand || '',
                flavor: f.flavor || '',
                kcal: f.kcal || 0,
                protein: f.protein || 0,
                sugar: f.sugar || 0,
                rating: f.rating || 0,
                notes: f.notes || '',
                photo: f.photo && typeof f.photo === 'string' && f.photo.startsWith('http') ? f.photo : null // Only save URLs
            }));

            await userDocRef.set({
                history: appState.history,
                exercises: appState.exercises,
                water: appState.water,
                weightLog: appState.weightLog,
                streak: appState.streak,
                lastCompletedDate: appState.lastCompletedDate,
                foodCatalog: cloudFoodCatalog,
                profile: {
                    name: appState.user.name,
                    lastName: appState.user.lastName || '',
                    age: appState.user.age || null,
                    height: appState.user.height || null,
                    initialWeight: appState.user.initialWeight || (appState.weightLog[0] ? appState.weightLog[0].weight : 0)
                },
                updatedAt: new Date().toISOString()
            }); // No merge: true here to allow complete mirroring of local deletions
        } catch (e) {
            console.error("Error saving to cloud:", e);
        }
    }
}

function calculateBMI(weight, heightM) {
    if (!heightM || heightM <= 0) return 0;
    return weight / (heightM * heightM);
}

function getSuggestedWater(weight, age) {
    // Under 17: 40 ml/kg
    // 18 to 55: 35 ml/kg
    // 55 to 65: 30 ml/kg
    // Over 66: 25 ml/kg
    let factor = 35;
    if (age <= 17) factor = 40;
    else if (age >= 18 && age <= 55) factor = 35;
    else if (age >= 55 && age <= 65) factor = 30;
    else if (age >= 66) factor = 25;
    
    return weight * factor;
}

function getWaterStatus(consumedMl, recommendedMl) {
    if (recommendedMl <= 0) return { color: '#6b7280', dot: '●' };
    const pct = (consumedMl / recommendedMl) * 100;
    let color = '';
    // Escala de 5 colores desde rojo (0%) hasta verde (100%+)
    if (pct < 20) color = '#ef4444';      // Rojo
    else if (pct < 40) color = '#f97316'; // Naranja
    else if (pct < 70) color = '#facc15'; // Amarillo
    else if (pct < 90) color = '#a3e635'; // Lima
    else color = '#22c55e';               // Verde
    
    return { color, dot: '●' };
}

function getFoodStatus(consumed, goal) {
    if (goal <= 0) return { color: '#6b7280', dot: '●' };
    const pct = (consumed / goal) * 100;
    if (pct < 50) return { color: '#ef4444', dot: '●' }; // Rojo (Muy poco)
    if (pct < 75) return { color: '#f97316', dot: '●' }; // Naranja
    if (pct < 90) return { color: '#facc15', dot: '●' }; // Amarillo
    if (pct <= 110) return { color: '#22c55e', dot: '●' }; // Verde (Rango ideal)
    if (pct <= 125) return { color: '#f97316', dot: '●' }; // Naranja (Exceso ligero)
    return { color: '#ef4444', dot: '●' }; // Rojo (Exceso)
}

function getExerciseGoal() {
    return 300; // Meta estándar de 300 kcal quemadas por día
}

function getExerciseStatus(burned, goal) {
    if (goal <= 0) return { color: '#6b7280', dot: '●' };
    const pct = (burned / goal) * 100;
    if (pct < 20) return { color: '#ef4444', dot: '●' };
    if (pct < 40) return { color: '#f97316', dot: '●' };
    if (pct < 70) return { color: '#facc15', dot: '●' };
    if (pct < 100) return { color: '#a3e635', dot: '●' };
    return { color: '#22c55e', dot: '●' };
}

function getGlobalStatus(foodConsumed, foodGoal, burned, exGoal, waterConsumed, waterGoal) {
    // Puntuación de comida: penaliza exceso y defecto. Meta ideal = 100
    const foodPct = foodGoal > 0 ? (foodConsumed / foodGoal) * 100 : 0;
    let foodScore = 0;
    if (foodPct === 0 && foodConsumed === 0) foodScore = 0;
    else if (foodPct <= 100) foodScore = foodPct;
    else foodScore = Math.max(0, 100 - (foodPct - 100) * 1.5); // Penaliza más fuerte el exceso
    
    const waterScore = waterGoal > 0 ? Math.min(100, (waterConsumed / waterGoal) * 100) : 0;
    const exScore = exGoal > 0 ? Math.min(100, (burned / exGoal) * 100) : 0;
    
    const avg = (foodScore + waterScore + exScore) / 3;
    
    let label = "";
    let colorClass = "green";
    
    if (avg >= 95) { label = "🏆 Legendario"; colorClass = "green"; }
    else if (avg >= 85) { label = "🌟 Excelente"; colorClass = "green"; }
    else if (avg >= 70) { label = "✨ Muy bueno"; colorClass = "green"; }
    else if (avg >= 50) { label = "✅ Cumpliste"; colorClass = "yellow"; }
    else if (avg >= 25) { label = "🧱 En camino"; colorClass = "orange"; }
    else { label = "⚠️ Por mejorar"; colorClass = "red"; }
    
    return { score: Math.round(avg), label, colorClass };
}

function renderProfileSummary() {
    const container = document.getElementById('profileSummary');
    if (!container || !appState.user) return;

    try {
        const currentWeight = getCurrentWeight();
        const heightM = parseFloat(appState.user.height || 0);
        const age = parseInt(appState.user.age || 0);
        
        const bmi = calculateBMI(currentWeight, heightM);
        const suggestedWater = getSuggestedWater(currentWeight, age);
        
        container.innerHTML = `
            <div class="summary-name">${appState.user.name || 'Usuario'}</div>
            <div class="summary-lastname">${appState.user.lastName || ''}</div>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-label">Edad</div>
                    <div class="summary-value">${age > 0 ? age : '--'}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Peso</div>
                    <div class="summary-value">${currentWeight} kg</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">IMC</div>
                    <div class="summary-value">${bmi > 0 ? bmi.toFixed(1) : '--'}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Agua Id.</div>
                    <div class="summary-value water">${suggestedWater > 0 ? (suggestedWater / 1000).toFixed(1) + 'L' : '--'}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Calorías</div>
                    <div class="summary-value" style="font-size:12px; line-height:1.2;">
                        <span style="color:var(--yellow); font-size:10px; display:block;">Mínima</span>
                        ${Math.round((10 * currentWeight) + (6.25 * heightM * 100) - (5 * age) - 161)} kcal
                    </div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Calorías</div>
                    <div class="summary-value" style="font-size:12px; line-height:1.2;">
                        <span style="color:var(--green); font-size:10px; display:block;">Ideal</span>
                        ${getSuggestedGoal()} kcal
                    </div>
                </div>
            </div>
        `;
    } catch(e) {
        console.error("Error rendering profile summary:", e);
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
    if (typeof appState.water[todayStr] === 'undefined') {
        appState.water[todayStr] = 0;
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
    if (!appState.user) return 0;
    let currentWeight = parseFloat(appState.user.initialWeight || 0);
    
    if (appState.weightLog && appState.weightLog.length > 0) {
        try {
            const sortedLog = [...appState.weightLog].sort((a,b) => {
                const dateA = new Date(a.date.split('/').reverse().join('-'));
                const dateB = new Date(b.date.split('/').reverse().join('-'));
                return dateA - dateB;
            });
            const lastEntry = sortedLog[sortedLog.length - 1];
            if (lastEntry && !isNaN(lastEntry.weight)) {
                currentWeight = parseFloat(lastEntry.weight);
            }
        } catch(e) {
            console.warn("Error sorting weight log:", e);
        }
    }
    return isNaN(currentWeight) ? 0 : currentWeight;
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
    const adjustedGoal = goal + burned;
    
    let percentage = adjustedGoal > 0 ? (consumed / adjustedGoal) * 100 : 0;
    if (percentage > 100) percentage = 100;

    return { consumed, burned, netConsumed, goal, percentage, adjustedGoal };
}

function renderHistory() {
    ensureTodayInHistory();
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    
    const dates = Object.keys(appState.history).sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('/');
        const [dayB, monthB, yearB] = b.split('/');
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateB - dateA;
    });

    if (currentHistoryPeriod === 'day') {
        dates.forEach(date => {
            const meals = appState.history[date];
            const exList = appState.exercises[date] || [];
            if (!meals) return;

            const { consumed, burned, netConsumed, goal, adjustedGoal } = calculateProgressStats(meals, exList);
            const [dStr, mStr, yStr] = date.split('/');
            const formattedDate = `${yStr}/${mStr.padStart(2, '0')}/${dStr.padStart(2, '0')}`;
            
            const waterGlasses = appState.water[date] || 0;
            const waterMl = waterGlasses * 250;
            const recommendedWater = getSuggestedWater(getCurrentWeight(), appState.user.age);
            const exGoal = getExerciseGoal();
            
            const globalStatus = getGlobalStatus(consumed, adjustedGoal, burned, exGoal, waterMl, recommendedWater);
            const { score: globalPercentage, label: evaluationTxt, colorClass } = globalStatus;

            const card = document.createElement('div');
            card.className = 'history-card';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom: 12px;">
                    <div class="history-date" style="flex:1;">${formattedDate}</div>
                    <div class="history-pct ${colorClass}" style="flex:1; text-align:center; font-weight:800; font-size:17px; ${colorClass === 'red' ? 'color: var(--red);' : (colorClass === 'orange' ? 'color: var(--yellow);' : '')}">${globalPercentage}%</div>
                    <div style="flex:1; text-align:right;">
                        <span style="font-size:11px; font-weight:700; padding:4px 8px; border-radius:12px; background: rgba(255,255,255,0.05); color: ${colorClass === 'red' ? 'var(--red)' : (colorClass === 'orange' ? 'var(--yellow)' : `var(--${colorClass})`)}; border: 1px solid ${colorClass === 'gray' ? 'transparent' : (colorClass === 'red' || colorClass === 'orange' ? 'currentColor' : `var(--${colorClass})`)}; white-space:nowrap;">${evaluationTxt}</span>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:11px; color:var(--text-sec); background: rgba(0,0,0,0.15); padding: 8px 8px; border-radius: 8px; margin-bottom: 12px; gap: 4px;">
                    <div>🍎 ${consumed}/${goal} <span style="color:${getFoodStatus(consumed, goal).color}">${getFoodStatus(consumed, goal).dot}</span></div>
                    <div>💧 ${waterMl}/${Math.round(getSuggestedWater(getCurrentWeight(), appState.user.age))} <span style="color:${getWaterStatus(waterMl, getSuggestedWater(getCurrentWeight(), appState.user.age)).color}">${getWaterStatus(waterMl, getSuggestedWater(getCurrentWeight(), appState.user.age)).dot}</span></div>
                    <div>🔥 ${burned}/${getExerciseGoal()} <span style="color:${getExerciseStatus(burned, getExerciseGoal()).color}">${getExerciseStatus(burned, getExerciseGoal()).dot}</span></div>
                </div>
                
                <button class="delete-day-btn" title="Eliminar este día">🗑️</button>
            `;
            
            const delBtn = card.querySelector('.delete-day-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`¿Estás seguro de que deseas eliminar TODOS los registros del día ${date}?`)) {
                    // 1. Delete locally
                    delete appState.history[date];
                    if (appState.exercises) delete appState.exercises[date];
                    if (appState.water) delete appState.water[date];
                    
                    if (appState.lastCompletedDate === date) {
                        appState.lastCompletedDate = null;
                        appState.streak = Math.max(0, appState.streak - 1);
                    }
                    
                    // 2. Delete in Firestore (explicitly to handle merge behavior)
                    if (appState.user && appState.user.uid) {
                        try {
                            const userDocRef = db.collection("users").doc(appState.user.uid);
                            const updates = {};
                            updates[`history.${date.replace(/\//g, '_')}`] = firebase.firestore.FieldValue.delete(); // Note: Firestore dots can be tricky with slashes, but the app uses slashes
                            // Actually, if the key is "07/04/2026", Firestore might interpret slashes as paths if not careful.
                            // But usually, it works if passed as an object key. 
                            // However, the best way to overwrite a merged field is to send the whole object again but without merge? 
                            // No, let's just use saveGlobalState() WITHOUT merge for the history fields, OR set the whole object.
                            
                            // Re-saving the whole state but making sure we don't use merge for the collections
                            await saveGlobalState();
                        } catch (err) {
                            console.error("Error al eliminar en nube:", err);
                        }
                    } else {
                        saveGlobalState();
                    }
                    
                    renderHistory();
                }
            });

            card.addEventListener('click', () => {
                launchAppDay(date);
            });
            
            list.appendChild(card);
        });
    } else {
        // Group by period
        const groups = {};
        
        dates.forEach(date => {
            const parts = date.split('/');
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            let groupKey = '';
            
            if (currentHistoryPeriod === 'week') {
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                groupKey = 'Sem. ' + monday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            } else if (currentHistoryPeriod === 'month') {
                groupKey = d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
                groupKey = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
            } else if (currentHistoryPeriod === 'year') {
                groupKey = parts[2];
            }
            
            if (!groups[groupKey]) {
                groups[groupKey] = { totalNet: 0, totalGoal: 0, totalWater: 0, totalBurned: 0, count: 0 };
            }
            
            const meals = appState.history[date];
            const exList = appState.exercises[date] || [];
            const waterGlasses = appState.water[date] || 0;
            
            groups[groupKey].totalWater += (waterGlasses * 250);
            
            if (meals) {
                const stats = calculateProgressStats(meals, exList);
                groups[groupKey].totalNet += stats.consumed;
                groups[groupKey].totalGoal += stats.goal; 
                groups[groupKey].totalBurned += stats.burned;
                groups[groupKey].count++;
            }
        });
        
        // Since dates are ordered descending, the order of insertion into groups (which are objects properties) 
        // will just be in order of appearance of the keys. So an array mapping is cleaner to keep order.
        // Actually, just looping the groups will keep insertion order since node preserves it for string keys? Wait.
        // Better to extract keys and not sort again, just use the keys as they appear.
        Object.keys(groups).forEach(key => {
            const group = groups[key];
            const weight = getCurrentWeight();
            const age = appState.user.age;
            const recWater = getSuggestedWater(weight, age);
            const exGoal = getExerciseGoal();
            
            // Calculate global status based on averages for the period
            const globalStatus = getGlobalStatus(
                group.totalNet / group.count, 
                group.totalGoal / group.count, 
                group.totalBurned / group.count, 
                exGoal, 
                group.totalWater / group.count, 
                recWater
            );
            
            const { score: globalPercentage, label: evaluationTxt, colorClass } = globalStatus;
            
            const card = document.createElement('div');
            card.className = 'history-card';
            card.style.cursor = 'default';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom: 10px;">
                    <div class="history-date" style="flex:1;">${key}</div>
                    <div class="history-pct ${colorClass}" style="flex:1; text-align:center; font-weight:800; font-size:17px; ${colorClass === 'red' ? 'color: var(--red);' : (colorClass === 'orange' ? 'color: var(--yellow);' : '')}">${globalPercentage}%</div>
                    <div style="flex:1; text-align:right;">
                        <span style="font-size:11px; font-weight:700; padding:4px 8px; border-radius:12px; background: rgba(255,255,255,0.05); color: ${colorClass === 'red' ? 'var(--red)' : (colorClass === 'orange' ? 'var(--yellow)' : `var(--${colorClass})`)}; border: 1px solid ${colorClass === 'gray' ? 'transparent' : (colorClass === 'red' || colorClass === 'orange' ? 'currentColor' : `var(--${colorClass})`)}; white-space:nowrap;">${evaluationTxt}</span>
                    </div>
                </div>
                <div style="font-size: 11px; color: var(--text-sec); opacity: 0.8; margin-top: 6px; display: flex; gap: 8px;">
                    <span>🍎 ${Math.round(group.totalNet/group.count)}/${Math.round(group.totalGoal/group.count)} <span style="color:${getFoodStatus(group.totalNet/group.count, group.totalGoal/group.count).color}">${getFoodStatus(group.totalNet/group.count, group.totalGoal/group.count).dot}</span></span>
                    <span>💧 ${Math.round(group.totalWater/group.count)}/${Math.round(getSuggestedWater(getCurrentWeight(), appState.user.age))} <span style="color:${getWaterStatus(group.totalWater/group.count, getSuggestedWater(getCurrentWeight(), appState.user.age)).color}">${getWaterStatus(group.totalWater/group.count, getSuggestedWater(getCurrentWeight(), appState.user.age)).dot}</span></span>
                    <span>🔥 ${Math.round(group.totalBurned/group.count || 0)}/${getExerciseGoal()} <span style="color:${getExerciseStatus(group.totalBurned/group.count || 0, getExerciseGoal()).color}">${getExerciseStatus(group.totalBurned/group.count || 0, getExerciseGoal()).dot}</span></span>
                </div>
            `;
            
            list.appendChild(card);
        });
    }
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
        populateProgressTab();
        renderWater();
        initChart();
    }
}

function renderWater() {
    if (!appState.date) return;
    const glasses = appState.water[appState.date] || 0;
    const consumedMl = glasses * 250;
    
    const weight = getCurrentWeight();
    const age = appState.user ? parseInt(appState.user.age || 0) : 0;
    const suggestedMl = Math.round(getSuggestedWater(weight, age));
    
    const status = getWaterStatus(consumedMl, suggestedMl);
    
    document.getElementById('waterGlassCount').innerText = glasses;
    document.getElementById('waterMlCount').innerHTML = `${consumedMl}/${suggestedMl} ml <span style="color:${status.color}; margin-left:4px;">${status.dot}</span>`;
}

function populateProgressTab() {
    if (!appState.date) return;
    const existingLog = appState.weightLog.find(w => w.date === appState.date);
    if (existingLog) {
        document.getElementById('weightInput').value = existingLog.weight || '';
        document.getElementById('waistInput').value = existingLog.waist || '';
    } else {
        document.getElementById('weightInput').value = '';
        document.getElementById('waistInput').value = '';
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
        
        const activeTip = meal.isCustom && meal.customTip ? `💡 Tip: ${meal.customTip}` : MEAL_SUGGESTIONS[meal.id];
        const suggestionBlock = activeTip ? `<div class="meal-suggestion">${activeTip}</div>` : '';
        
        let dynamicFormatHtml = '';
        if (meal.isCustom) {
            const rawLines = meal.customText ? meal.customText.split('\n').filter(l => l.trim().length > 0) : [];
            const formattedItemsHtml = rawLines.map((line, lineIndex) => {
                const match = line.match(/^(\d+)\s+(.+)/);
                if (match) {
                    const lineKcal = match[1];
                    const desc = match[2];
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 14px;">
                            <span style="color: var(--text-main); flex:1; padding-right:12px;">${desc}</span>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color: var(--accent); font-weight: 600; font-size:13px; white-space:nowrap; background: rgba(56, 185, 255, 0.1); padding: 2px 8px; border-radius: 6px;">${lineKcal} kcal</span>
                                <button class="delete-ai-item-btn" data-meal="${meal.id}" data-line="${lineIndex}" style="background:transparent; border:none; color:var(--red); font-size:10px; cursor:pointer; padding:0; display:flex; align-items:center; opacity:0.8; transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'" title="Eliminar alimento">🔴</button>
                            </div>
                        </div>`;
                }
                return `<div style="padding: 6px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.05);">${line}</div>`;
            }).join('');

            dynamicFormatHtml = `
                <div style="color: var(--accent); margin-bottom: 8px; font-size: 13px; display: flex; align-items: center; gap: 4px;">✨ Desglose IA</div>
                <div style="margin-bottom: 12px; background: rgba(0,0,0,0.15); border-radius: 8px; padding: 4px 12px;">
                    ${formattedItemsHtml}
                </div>
                ${suggestionBlock}
                <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="ai-btn trigger-catalog" data-meal="${meal.id}">📓 Buscar en Alimentos</button>
                    <button class="ai-btn edit-ai-btn" data-meal="${meal.id}">✏️ Editar</button>
                </div>
            `;
        } else {
            dynamicFormatHtml = meal.itemsHtml + `
                ${suggestionBlock}
                <div style="margin-top: 14px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="ai-btn trigger-catalog" data-meal="${meal.id}">📓 Buscar en Alimentos</button>
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
    
    list.querySelectorAll('.trigger-catalog').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mealId = e.target.getAttribute('data-meal');
            openCatalogSelection(mealId);
        });
    });
    
    list.querySelectorAll('.delete-ai-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mealId = e.currentTarget.getAttribute('data-meal');
            const lineIdx = parseInt(e.currentTarget.getAttribute('data-line'), 10);
            
            const meal = meals.find(m => m.id === mealId);
            if (!meal || !meal.customText) return;
            
            const rawLines = meal.customText.split('\n').filter(l => l.trim().length > 0);
            const match = rawLines[lineIdx].match(/^(\d+)\s+(.+)/);
            if (match) {
                const kcalToRemove = parseInt(match[1], 10);
                meal.customKcal = Math.max(0, meal.customKcal - kcalToRemove);
            }
            
            rawLines.splice(lineIdx, 1);
            
            if (rawLines.length === 0) {
                meal.isCustom = false;
                meal.customText = '';
                meal.rawCustomText = '';
                meal.customKcal = 0;
                meal.customTip = null;
            } else {
                meal.customText = rawLines.join('\n');
            }
            
            saveGlobalState();
            renderMeals();
            updateProgress();
        });
    });
    
    list.querySelectorAll('.trigger-ai').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentAiMealId = e.target.getAttribute('data-meal');
            const mealTitle = meals.find(m => m.id === currentAiMealId)?.title || 'Comida';
            document.getElementById('aiInput').value = '';
            document.getElementById('aiModalTitle').innerText = "Registro con IA: " + mealTitle;
            document.getElementById('aiModalDesc').innerHTML = "Escribe qué comida realizaste y la IA la evaluará.<br><small style='color:var(--yellow);'>Nota: Aquí NO se registra el ejercicio.</small>";
            document.getElementById('aiModal').classList.add('show');
        });
    });
    
    list.querySelectorAll('.edit-ai-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mealId = e.target.getAttribute('data-meal');
            const meal = meals.find(m => m.id === mealId);
            if (meal && meal.isCustom) {
                currentAiMealId = mealId;
                const mealTitle = meal.title || 'Comida';
                document.getElementById('aiInput').value = meal.rawCustomText || meal.customText || '';
                document.getElementById('aiModalTitle').innerText = "Editar Registro: " + mealTitle;
                document.getElementById('aiModalDesc').innerHTML = "Modifica lo que comiste y la IA actualizará el cálculo.<br><small style='color:var(--yellow);'>Nota: Dejar en blanco borrará tu registro y lo dejará vacío.</small>";
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
    
    const exGoal = getExerciseGoal();
    const exStatus = getExerciseStatus(totalBurned, exGoal);
    document.getElementById('totalBurnedDisplay').innerHTML = `${totalBurned}/${exGoal} <span style="color:${exStatus.color}; margin-left:4px;">${exStatus.dot}</span>`;
    
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

let currentCatalogMealId = null;

function openCatalogSelection(mealId) {
    currentCatalogMealId = mealId;
    const modal = document.getElementById('catalogSelectionModal');
    const catalogList = document.getElementById('catalogSelectionList');
    catalogList.innerHTML = '';
    
    if (!appState.foodCatalog || appState.foodCatalog.length === 0) {
        catalogList.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding: 20px;">No tienes alimentos registrados aún.<br>Ve a Perfil > Mis Alimentos.</div>';
    } else {
        appState.foodCatalog.forEach(food => {
            const btn = document.createElement('div');
            btn.style.cssText = "display:flex; justify-content:space-between; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; align-items:center;";
            btn.innerHTML = `
                <div>
                    <div style="font-weight:600;">${food.name} ${food.brand ? `<span style="font-size:12px; color:var(--text-sec);">- ${food.brand}</span>` : ''}</div>
                    <div style="font-size:12px; color:var(--text-sec);">${food.flavor || ''}</div>
                </div>
                <div style="color:var(--accent); font-weight:600;">${food.kcal ? food.kcal + ' kcal' : '--'}</div>
            `;
            btn.addEventListener('click', () => {
                addCatalogItemToMeal(currentCatalogMealId, food);
                modal.classList.remove('show');
            });
            catalogList.appendChild(btn);
        });
    }
    modal.classList.add('show');
}

function addCatalogItemToMeal(mealId, food) {
    const meals = appState.history[appState.date];
    const meal = meals.find(m => m.id === mealId);
    
    meal.isCustom = true;
    
    const kcal = food.kcal || 0;
    const itemName = `${food.name} ${food.brand ? `(${food.brand})` : ''}`;
    const newLine = `${kcal} 1 porción de ${itemName}`;
    
    if (meal.customText) {
        meal.customText += `\n${newLine}`;
        meal.customKcal = (meal.customKcal || 0) + kcal;
    } else {
        meal.customText = newLine;
        meal.customKcal = kcal;
    }
    
    saveGlobalState();
    renderMeals();
    updateProgress();
}

function updateProgress() {
    if (!appState.date) return;
    const meals = appState.history[appState.date];
    const exercises = appState.exercises[appState.date];
    const { consumed, burned, netConsumed, goal, percentage, adjustedGoal } = calculateProgressStats(meals, exercises);

    const foodStatus = getFoodStatus(consumed, goal);
    document.getElementById('calsConsumed').innerHTML = `${consumed}/${goal} <small style="display:block; font-size:10px; opacity:0.6;">kcal <span style="color:${foodStatus.color};">${foodStatus.dot}</span></small>`;
    // Hide original goal span as it's now integrated
    document.getElementById('calsGoal').parentElement.style.display = 'none';
    
    const remaining = adjustedGoal - consumed;
    let rootMsg = remaining > 0 ? `Faltan ${remaining} kcal` : (remaining === 0 ? "¡Objetivo cumplido!" : `Excedido por ${Math.abs(remaining)} kcal`);
    if (burned > 0 && remaining > 0) {
        rootMsg += ` (Incluye +${burned} de ejercicio)`;
    }

    document.getElementById('calsRemainingMsg').innerText = rootMsg;

    const bar = document.getElementById('progressBar');
    bar.style.width = `${percentage}%`;

    if (consumed > adjustedGoal) {
        bar.style.backgroundColor = 'var(--red)';
    } else if (consumed >= adjustedGoal * 0.9) {
        bar.style.backgroundColor = 'var(--yellow)';
    } else {
        bar.style.backgroundColor = 'var(--green)';
    }

    // Daily Balance Badge Update
    const weight = getCurrentWeight();
    const age = appState.user.age;
    const recWater = getSuggestedWater(weight, age);
    const exGoal = getExerciseGoal();
    const waterMl = (appState.water[appState.date] || 0) * 250;
    
    const globalStatus = getGlobalStatus(consumed, adjustedGoal, burned, exGoal, waterMl, recWater);
    const badge = document.getElementById('dailyBalanceBadge');

    badge.innerText = `${globalStatus.label} (${globalStatus.score}%)`;
    badge.style.color = globalStatus.colorClass === 'red' ? 'var(--red)' : (globalStatus.colorClass === 'orange' ? 'var(--yellow)' : `var(--${globalStatus.colorClass})`);
    badge.style.backgroundColor = globalStatus.colorClass === 'red' ? 'rgba(239,68,68,0.2)' : (globalStatus.colorClass === 'orange' ? 'rgba(245,158,11,0.2)' : `rgba(0,0,0,0.2)`);
    badge.style.display = 'block';
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
        : `Eres un nutriólogo experto. El usuario reporta: "${text}". Estima las calorías ingeridas. Devuelve un JSON: {"kcal": [entero suma total], "descripcion_limpia": "Lista cada alimento separado por un salto de linea (\\n). Por cada renglón pon primero las calorías estimadas, y después la cantidad y nombre del alimento. No uses guiones ni viñetas. Ejemplo: 215 2 Tacos de huevo\\n45 1 Coca Cola 600ml", "tip": "Breve consejo nutricional de máximo 15 palabras relacionado específicamente a lo que comió (a favor o en contra de los alimentos reportados). E.g. 'Tip: Excelente combinación' o 'Tip: Cuidado con la cantidad de azúcares y harinas refinadas'"}`;

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
            meal.customTip = result.tip ? result.tip.replace(/^Tip:\s*/i, '') : null;
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
            const saveDateStr = appState.date || new Date().toLocaleDateString('es-ES');
            
            const existingIdx = appState.weightLog.findIndex(w => w.date === saveDateStr);
            let entry = existingIdx >= 0 ? appState.weightLog[existingIdx] : { date: saveDateStr };
            
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

// =====================================================
//  FOODS CATALOG FEATURE
// =====================================================

// Foods state — array stored in appState.foodCatalog
// Each food: { id, name, brand, flavor, kcal, rating, notes, photo (base64 or null), createdAt }

let currentFoodId = null;   // null = new, string = edit
let currentFoodRating = 0;

const RATING_LABELS = ['Sin calificación', '😐 No me convence', '🙂 Está bien', '😊 Me gusta', '😍 Muy bueno', '🤩 ¡Lo amo!'];

function openFoodsScreen() {
    document.getElementById('historyContainer').style.display = 'none';
    document.getElementById('foodsScreen').style.display = 'flex';
    renderFoodsGrid();
}

function closeFoodsScreen() {
    document.getElementById('foodsScreen').style.display = 'none';
    document.getElementById('historyContainer').style.display = 'flex';
}

// -- Init foods catalog UI listeners (called once from initAuth) --
function initFoodsCatalog() {


    // "Mis Alimentos" from profile menu → open foods screen
    document.getElementById('menuFoodsBtn').addEventListener('click', () => {
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown) dropdown.classList.remove('show');
        openFoodsScreen();
    });

    // Back button from foods screen
    document.getElementById('backFromFoodsBtn').addEventListener('click', () => {
        closeFoodsScreen();
    });

    // Open modal for new food
    document.getElementById('addFoodBtn').addEventListener('click', () => openFoodModal(null));

    // Close food product modal
    document.getElementById('closeFoodModalBtn').addEventListener('click', closeFoodModal);
    document.getElementById('foodProductModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('foodProductModal')) closeFoodModal();
    });

    // --- Photo source toggle (file / URL) ---
    let photoMode = 'file'; // 'file' | 'url'

    function setPhotoMode(mode) {
        photoMode = mode;
        document.getElementById('photoSrcFile').classList.toggle('active', mode === 'file');
        document.getElementById('photoSrcUrl').classList.toggle('active', mode === 'url');
        document.getElementById('photoUrlGroup').style.display = mode === 'url' ? 'block' : 'none';
    }

    document.getElementById('photoSrcFile').addEventListener('click', () => setPhotoMode('file'));
    document.getElementById('photoSrcUrl').addEventListener('click', () => setPhotoMode('url'));

    // Expose so openFoodModal can reset it
    window._setPhotoMode = setPhotoMode;

    // Photo preview click → trigger file input ONLY in file mode
    document.getElementById('foodPhotoPreview').addEventListener('click', () => {
        if (photoMode === 'file') document.getElementById('foodPhotoInput').click();
    });

    // File selected → preview as base64
    document.getElementById('foodPhotoInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('foodPhotoImg').src = ev.target.result;
            document.getElementById('foodPhotoImg').style.display = 'block';
            document.getElementById('foodPhotoPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });

    // URL → load image directly (no base64 conversion, much lighter)
    document.getElementById('loadUrlBtn').addEventListener('click', () => {
        const url = document.getElementById('foodPhotoUrl').value.trim();
        if (!url) return;
        const img = document.getElementById('foodPhotoImg');
        img.onload = () => {
            img.style.display = 'block';
            document.getElementById('foodPhotoPlaceholder').style.display = 'none';
        };
        img.onerror = () => {
            alert('No se pudo cargar la imagen desde esa URL. Verifica que sea una imagen pública.');
            img.src = '';
        };
        img.src = url;
    });

    // Also load on Enter key inside URL field
    document.getElementById('foodPhotoUrl').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loadUrlBtn').click();
    });

    // Star rating
    document.getElementById('starRating').addEventListener('click', (e) => {
        const btn = e.target.closest('.star-btn');
        if (!btn) return;
        const val = parseInt(btn.getAttribute('data-star'), 10);
        currentFoodRating = (currentFoodRating === val) ? 0 : val;
        updateStarUI(currentFoodRating);
    });

    // Hover effect on stars
    document.getElementById('starRating').addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.star-btn');
        if (!btn) return;
        highlightStars(parseInt(btn.getAttribute('data-star'), 10));
    });
    document.getElementById('starRating').addEventListener('mouseleave', () => {
        updateStarUI(currentFoodRating);
    });

    // Save food
    document.getElementById('saveFoodBtn').addEventListener('click', saveFood);

    // Cancel Catalog Selection
    document.getElementById('closeCatalogSelectBtn').addEventListener('click', () => {
        document.getElementById('catalogSelectionModal').classList.remove('show');
    });

    // Delete food
    document.getElementById('deleteFoodBtn').addEventListener('click', () => {
        if (!currentFoodId) return;
        if (!confirm('¿Eliminar este alimento de tu catálogo?')) return;
        appState.foodCatalog = (appState.foodCatalog || []).filter(f => f.id !== currentFoodId);
        saveFoodCatalog();
        closeFoodModal();
        renderFoodsGrid();
    });
}

function openFoodModal(foodId) {
    currentFoodId = foodId;
    currentFoodRating = 0;

    // Reset form
    document.getElementById('foodName').value = '';
    document.getElementById('foodBrand').value = '';
    document.getElementById('foodFlavor').value = '';
    document.getElementById('foodKcal').value = '';
    document.getElementById('foodProtein').value = '';
    document.getElementById('foodSugar').value = '';
    document.getElementById('foodNotes').value = '';
    document.getElementById('foodPhotoImg').style.display = 'none';
    document.getElementById('foodPhotoImg').src = '';
    document.getElementById('foodPhotoPlaceholder').style.display = 'flex';
    document.getElementById('foodPhotoInput').value = '';
    document.getElementById('foodPhotoUrl').value = '';
    if (window._setPhotoMode) window._setPhotoMode('file');
    updateStarUI(0);

    if (foodId) {
        // Edit mode: populate form
        const food = (appState.foodCatalog || []).find(f => f.id === foodId);
        if (!food) return;
        document.getElementById('foodModalTitle').innerText = '✏️ Editar Alimento';
        document.getElementById('deleteFoodBtn').style.display = 'block';
        document.getElementById('foodName').value = food.name || '';
        document.getElementById('foodBrand').value = food.brand || '';
        document.getElementById('foodFlavor').value = food.flavor || '';
        document.getElementById('foodKcal').value = food.kcal || '';
        document.getElementById('foodProtein').value = food.protein || '';
        document.getElementById('foodSugar').value = food.sugar || '';
        document.getElementById('foodNotes').value = food.notes || '';
        currentFoodRating = food.rating || 0;
        updateStarUI(currentFoodRating);
        if (food.photo) {
            document.getElementById('foodPhotoImg').src = food.photo;
            document.getElementById('foodPhotoImg').style.display = 'block';
            document.getElementById('foodPhotoPlaceholder').style.display = 'none';
            // If it's a URL (not base64), switch toggle to URL mode
            if (food.photo.startsWith('http') && window._setPhotoMode) {
                window._setPhotoMode('url');
                document.getElementById('foodPhotoUrl').value = food.photo;
            }
        }
    } else {
        document.getElementById('foodModalTitle').innerText = '➕ Nuevo Alimento';
        document.getElementById('deleteFoodBtn').style.display = 'none';
    }

    document.getElementById('foodProductModal').classList.add('show');
}

function closeFoodModal() {
    document.getElementById('foodProductModal').classList.remove('show');
}

function updateStarUI(rating) {
    highlightStars(rating);
    document.getElementById('ratingLabel').innerText = RATING_LABELS[rating] || 'Sin calificación';
}

function highlightStars(upTo) {
    document.querySelectorAll('.star-btn').forEach(btn => {
        const val = parseInt(btn.getAttribute('data-star'), 10);
        btn.classList.toggle('active', val <= upTo);
    });
}

function saveFood() {
    const name = document.getElementById('foodName').value.trim();
    if (!name) {
        alert('Por favor ingresa el nombre del producto.');
        document.getElementById('foodName').focus();
        return;
    }

    const photoImg = document.getElementById('foodPhotoImg');
    const photo = photoImg.style.display !== 'none' && photoImg.src ? photoImg.src : null;

    const foodData = {
        name,
        brand: document.getElementById('foodBrand').value.trim(),
        flavor: document.getElementById('foodFlavor').value.trim(),
        kcal: document.getElementById('foodKcal').value ? parseInt(document.getElementById('foodKcal').value, 10) : null,
        protein: document.getElementById('foodProtein').value ? parseFloat(document.getElementById('foodProtein').value) : null,
        sugar: document.getElementById('foodSugar').value ? parseFloat(document.getElementById('foodSugar').value) : null,
        notes: document.getElementById('foodNotes').value.trim(),
        rating: currentFoodRating,
        photo,
        updatedAt: new Date().toISOString()
    };

    if (!appState.foodCatalog) appState.foodCatalog = [];

    if (currentFoodId) {
        // Update existing
        const idx = appState.foodCatalog.findIndex(f => f.id === currentFoodId);
        if (idx >= 0) {
            appState.foodCatalog[idx] = { ...appState.foodCatalog[idx], ...foodData };
        }
    } else {
        // New entry
        foodData.id = `food_${Date.now()}`;
        foodData.createdAt = foodData.updatedAt;
        appState.foodCatalog.push(foodData);
    }

    saveFoodCatalog();
    closeFoodModal();
    renderFoodsGrid();
}

async function saveFoodCatalog() {
    // Photos are large (base64); store them separately in localStorage to avoid
    // Firestore 1MB document limit. Only metadata goes to the cloud.
    const catalogMeta = (appState.foodCatalog || []).map(f => {
        const { photo, ...meta } = f;
        return meta;
    });

    // Save full catalog (with photos) to localStorage
    try {
        localStorage.setItem('dt_foodCatalog', JSON.stringify(appState.foodCatalog));
    } catch(e) {
        console.warn('localStorage full – saving without photos');
        localStorage.setItem('dt_foodCatalog', JSON.stringify(catalogMeta));
    }

    // Push metadata-only to Firestore
    if (appState.user && appState.user.uid) {
        try {
            await db.collection('users').doc(appState.user.uid).set(
                { foodCatalog: catalogMeta },
                { merge: true }
            );
        } catch(e) {
            console.error('Error saving food catalog to cloud:', e);
        }
    }
}

function loadFoodCatalog() {
    const saved = localStorage.getItem('dt_foodCatalog');
    if (saved) {
        try { appState.foodCatalog = JSON.parse(saved); } catch(e) { appState.foodCatalog = []; }
    } else {
        appState.foodCatalog = [];
    }
}

function renderFoodsGrid() {
    const grid = document.getElementById('foodsGrid');
    grid.innerHTML = '';
    const catalog = appState.foodCatalog || [];

    if (catalog.length === 0) {
        grid.innerHTML = `
            <div class="foods-empty-state">
                <div class="empty-icon">🥤</div>
                <p>Aún no tienes alimentos registrados.<br>¡Agrega tu primera barra de proteína u otro producto favorito!</p>
            </div>`;
        return;
    }

    catalog.forEach(food => {
        const stars = buildStarsHtml(food.rating || 0);
        const photoHtml = food.photo
            ? `<img src="${food.photo}" alt="${food.name}">`
            : `<span>🍫</span>`;

        const card = document.createElement('div');
        card.className = 'food-card';
        card.innerHTML = `
            <div class="food-card-photo">${photoHtml}</div>
            <div class="food-card-body">
                <div class="food-card-name">${food.name}</div>
                ${food.brand ? `<div class="food-card-brand">${food.brand}</div>` : ''}
                ${food.flavor ? `<div class="food-card-flavor">🍬 ${food.flavor}</div>` : ''}
                <div class="food-card-stars">${stars}</div>
                ${food.kcal ? `<div class="food-card-kcal">🔥 ${food.kcal} kcal/porción</div>` : ''}
            </div>
        `;
        card.addEventListener('click', () => openFoodModal(food.id));
        grid.appendChild(card);
    });
}

function buildStarsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= rating ? '★' : '☆';
    }
    return html;
}

