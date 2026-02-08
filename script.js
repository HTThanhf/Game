// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyC7325LppWWqEYzPVZ6MxSS8Awla8kg0vQ",
  authDomain: "rounds-e4de5.firebaseapp.com",
  databaseURL: "https://rounds-e4de5-default-rtdb.firebaseio.com",
  projectId: "rounds-e4de5",
  storageBucket: "rounds-e4de5.firebasestorage.app",
  messagingSenderId: "88519868474",
  appId: "1:88519868474:web:56fa89dc780917f8e73503",
  measurementId: "G-VQ8PP6RJWW"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Game Data and State
const gameState = {
    isAuthenticated: false,
    currentUser: null,
    currentSection: 'campaign',
    userId: null,
    playerData: {
        name: 'Player1',
        email: '',
        title: 'Tân Thủ',
        className: '',
        vnClassName: '',
        level: 1,
        exp: 50,
        maxExp: 100,
        rank: 'Đồng',
        power: 150,
        gold: 1000,
        lastLogin: null,
        playTime: 0,
        stats: {
            str: 10,
            vit: 8,
            end: 7,
            dex: 6,
            acc: 5,
            int: 4,
            dom: 3,
            divine: 0,
            demonic: 0,
            chaos: 0
        },
        statBonuses: {
            str: 2,
            vit: 1,
            end: 1,
            dex: 0,
            acc: 0,
            int: 0,
            dom: 0,
            divine: 0,
            demonic: 0,
            chaos: 0
        }
    },
    classes: [],
    rankings: [],
    lastSaveTime: 0,
    autoSaveInterval: null,
    isCheating: false,
    cheatDetection: {
        suspiciousActions: 0,
        lastDetection: 0
    }
};

// DOM Elements
const authPopup = document.getElementById('auth-popup');
const gameContainer = document.getElementById('game-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const menuButtons = document.querySelectorAll('.menu-btn');
const contentSections = document.querySelectorAll('.content-section');
const hallOfFameBtn = document.getElementById('hall-of-fame-btn');
const hallOfFame = document.getElementById('hall-of-fame');
const rankingBody = document.getElementById('ranking-body');
const classTreeContainer = document.getElementById('class-tree');
const battleLog = document.getElementById('battle-log');
const battleContent = document.getElementById('battle-content');
const closeBattleBtn = document.getElementById('close-battle');
const confirmLogoutBtn = document.getElementById('confirm-logout');
const classSelectPopup = document.getElementById('class-select-popup');
const classOptions = document.querySelectorAll('.class-option');

// Anti-Cheat System
const antiCheatSystem = {
    // Validate player data integrity
    validateData(data) {
        const checks = {
            level: data.level > 0 && data.level <= 1000,
            exp: data.exp >= 0 && data.exp <= data.maxExp,
            maxExp: data.maxExp >= 100 && data.maxExp <= 1000000,
            power: data.power >= 0 && data.power <= 1000000,
            gold: data.gold >= 0 && data.gold <= 1000000000,
            stats: this.validateStats(data.stats)
        };
        
        return Object.values(checks).every(check => check === true);
    },
    
    // Validate stats within reasonable limits
    validateStats(stats) {
        const maxStat = 999;
        for (const [stat, value] of Object.entries(stats)) {
            if (value < 0 || value > maxStat) return false;
        }
        return true;
    },
    
    // Detect rapid progression
    detectRapidProgression(oldData, newData) {
        const timeDiff = Date.now() - gameState.lastSaveTime;
        const reasonableTime = 30000; // 30 seconds minimum
        
        // Level jump detection
        if (newData.level - oldData.level > 1 && timeDiff < reasonableTime) {
            this.logSuspiciousAction('Rapid level progression detected');
            return false;
        }
        
        // Power jump detection
        const powerIncrease = newData.power - oldData.power;
        const maxPowerIncrease = 1000; // Max power increase per save
        if (powerIncrease > maxPowerIncrease && timeDiff < reasonableTime) {
            this.logSuspiciousAction('Rapid power increase detected');
            return false;
        }
        
        return true;
    },
    
    // Log suspicious actions
    logSuspiciousAction(reason) {
        gameState.cheatDetection.suspiciousActions++;
        gameState.cheatDetection.lastDetection = Date.now();
        
        console.warn(`[ANTI-CHEAT] ${reason}. Suspicious actions: ${gameState.cheatDetection.suspiciousActions}`);
        
        // If too many suspicious actions, mark as cheating
        if (gameState.cheatDetection.suspiciousActions >= 3) {
            gameState.isCheating = true;
            this.handleCheating();
        }
    },
    
    // Handle cheating detection
    handleCheating() {
        console.error('[ANTI-CHEAT] Cheating detected! Account flagged.');
        
        // In production, you might want to:
        // 1. Send notification to server
        // 2. Temporarily disable account
        // 3. Rollback suspicious changes
        // 4. Show warning to user
        
        // For demo, just show alert and reset suspicious counter
        if (gameState.cheatDetection.suspiciousActions >= 5) {
            alert('Hệ thống phát hiện hành vi bất thường. Vui lòng chơi game một cách công bằng!');
            this.resetPlayerData();
        }
    },
    
    // Reset player data if cheating is confirmed
    resetPlayerData() {
        // Rollback to last valid save
        this.loadLastValidSave();
        gameState.cheatDetection.suspiciousActions = 0;
        gameState.isCheating = false;
    },
    
    // Load last valid save from backup
    loadLastValidSave() {
        const backup = localStorage.getItem('rpg_game_backup');
        if (backup) {
            try {
                const backupData = JSON.parse(backup);
                gameState.playerData = backupData.playerData;
                console.log('[ANTI-CHEAT] Rolled back to last valid save');
            } catch (e) {
                console.error('[ANTI-CHEAT] Failed to load backup');
            }
        }
    },
    
    // Create backup of valid data
    createBackup() {
        const backupData = {
            playerData: gameState.playerData,
            timestamp: Date.now()
        };
        localStorage.setItem('rpg_game_backup', JSON.stringify(backupData));
    }
};

// Storage System with Auto-Save
const storageSystem = {
    // Save player data with anti-cheat validation
    async savePlayerData(force = false) {
        if (!gameState.isAuthenticated || !gameState.userId) return;
        
        // Only save if enough time has passed (prevent spam saving)
        const now = Date.now();
        const timeSinceLastSave = now - gameState.lastSaveTime;
        
        if (!force && timeSinceLastSave < 5000) { // 5 seconds cooldown
            return;
        }
        
        // Anti-cheat validation
        if (!antiCheatSystem.validateData(gameState.playerData)) {
            console.error('[SAVE] Invalid data detected, saving blocked');
            antiCheatSystem.logSuspiciousAction('Invalid data format');
            return;
        }
        
        // Create backup before saving
        antiCheatSystem.createBackup();
        
        // Prepare data for saving
        const saveData = {
            ...gameState.playerData,
            lastSave: now,
            version: '1.0'
        };
        
        try {
            // Save to localStorage for offline access
            localStorage.setItem(`rpg_game_${gameState.userId}`, JSON.stringify(saveData));
            
            // Save to Firebase if authenticated
            if (gameState.userId) {
                await db.collection('players').doc(gameState.userId).set({
                    ...saveData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            gameState.lastSaveTime = now;
            console.log('[SAVE] Data saved successfully');
        } catch (error) {
            console.error('[SAVE] Error saving data:', error);
        }
    },
    
    // Load player data with anti-cheat checks
    async loadPlayerData() {
        if (!gameState.userId) return false;
        
        try {
            let loadedData = null;
            
            // Try to load from Firebase first
            if (gameState.userId) {
                const doc = await db.collection('players').doc(gameState.userId).get();
                if (doc.exists) {
                    loadedData = doc.data();
                    console.log('[LOAD] Data loaded from Firebase');
                }
            }
            
            // If no Firebase data, try localStorage
            if (!loadedData) {
                const localData = localStorage.getItem(`rpg_game_${gameState.userId}`);
                if (localData) {
                    loadedData = JSON.parse(localData);
                    console.log('[LOAD] Data loaded from localStorage');
                }
            }
            
            if (loadedData) {
                // Validate loaded data
                if (!antiCheatSystem.validateData(loadedData)) {
                    console.error('[LOAD] Invalid data loaded, using default');
                    antiCheatSystem.logSuspiciousAction('Invalid saved data');
                    return false;
                }
                
                // Merge with current data
                gameState.playerData = { ...gameState.playerData, ...loadedData };
                
                // Update last save time
                if (loadedData.lastSave) {
                    gameState.lastSaveTime = loadedData.lastSave;
                }
                
                return true;
            }
        } catch (error) {
            console.error('[LOAD] Error loading data:', error);
        }
        
        return false;
    },
    
    // Clear all data
    clearData() {
        if (gameState.userId) {
            localStorage.removeItem(`rpg_game_${gameState.userId}`);
        }
        localStorage.removeItem('rpg_game_backup');
        console.log('[CLEAR] All data cleared');
    },
    
    // Start auto-save system
    startAutoSave() {
        // Clear any existing interval
        if (gameState.autoSaveInterval) {
            clearInterval(gameState.autoSaveInterval);
        }
        
        // Save every 30 seconds
        gameState.autoSaveInterval = setInterval(() => {
            if (gameState.isAuthenticated) {
                this.savePlayerData();
            }
        }, 30000);
        
        // Also save on page unload
        window.addEventListener('beforeunload', () => {
            if (gameState.isAuthenticated) {
                this.savePlayerData(true); // Force save
            }
        });
    },
    
    // Stop auto-save
    stopAutoSave() {
        if (gameState.autoSaveInterval) {
            clearInterval(gameState.autoSaveInterval);
            gameState.autoSaveInterval = null;
        }
    }
};

// Firebase Authentication
const firebaseAuth = {
    // Initialize auth state listener
    initAuthListener() {
        auth.onAuthStateChanged((user) => {
            if (user) {
                // User is signed in
                this.handleUserSignedIn(user);
            } else {
                // User is signed out
                this.handleUserSignedOut();
            }
        });
    },
    
    // Handle user sign in
    async handleUserSignedIn(user) {
        gameState.isAuthenticated = true;
        gameState.currentUser = user.displayName || user.email;
        gameState.userId = user.uid;
        gameState.playerData.email = user.email;
        gameState.playerData.name = user.displayName || user.email.split('@')[0];
        
        // Load player data
        const hasData = await storageSystem.loadPlayerData();
        
        if (hasData && gameState.playerData.className) {
            // User has existing data and class
            gameContainer.classList.remove('hidden');
            authPopup.classList.add('hidden');
            updatePlayerDisplay();
            renderClassTree();
            highlightClassStats(gameState.playerData.className);
        } else {
            // New user or no class selected
            showClassSelection();
            authPopup.classList.add('hidden');
        }
        
        // Start auto-save
        storageSystem.startAutoSave();
        
        // Update last login
        gameState.playerData.lastLogin = Date.now();
        storageSystem.savePlayerData(true);
    },
    
    // Handle user sign out
    handleUserSignedOut() {
        gameState.isAuthenticated = false;
        gameState.currentUser = null;
        gameState.userId = null;
        
        // Stop auto-save
        storageSystem.stopAutoSave();
        
        // Save before logout if needed
        storageSystem.savePlayerData(true);
        
        // Show auth popup
        gameContainer.classList.add('hidden');
        authPopup.classList.remove('hidden');
        
        // Clear forms
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-captcha').value = '';
        
        generateCaptcha();
    },
    
    // Sign in with email/password
    async signIn(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: this.getErrorMessage(error) };
        }
    },
    
    // Sign up with email/password
    async signUp(email, password, username) {
        try {
            // Create user
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // Update display name
            await userCredential.user.updateProfile({
                displayName: username
            });
            
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: this.getErrorMessage(error) };
        }
    },
    
    // Sign out
    async signOut() {
        try {
            await auth.signOut();
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get user-friendly error messages
    getErrorMessage(error) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'Email đã được sử dụng!';
            case 'auth/invalid-email':
                return 'Email không hợp lệ!';
            case 'auth/operation-not-allowed':
                return 'Tính năng này tạm thời bị vô hiệu hóa!';
            case 'auth/weak-password':
                return 'Mật khẩu quá yếu!';
            case 'auth/user-disabled':
                return 'Tài khoản đã bị vô hiệu hóa!';
            case 'auth/user-not-found':
                return 'Không tìm thấy tài khoản!';
            case 'auth/wrong-password':
                return 'Sai mật khẩu!';
            default:
                return 'Đã xảy ra lỗi! Vui lòng thử lại.';
        }
    }
};

// Hiển thị popup chọn class
function showClassSelection() {
    classSelectPopup.classList.remove('hidden');
}

// Ẩn popup chọn class
function hideClassSelection() {
    classSelectPopup.classList.add('hidden');
}

// Thiết lập sự kiện chọn class
function setupClassSelection() {
    classOptions.forEach(option => {
        option.addEventListener('click', function() {
            const className = this.getAttribute('data-class');
            selectStartingClass(className);
        });
    });
}

// Highlight stats based on class
function highlightClassStats(className) {
    // Xóa highlight cũ
    document.querySelectorAll('.stat-row').forEach(row => {
        row.classList.remove('highlight-str', 'highlight-dex', 'highlight-int', 
                            'highlight-acc', 'highlight-dom');
    });
    
    // Thêm highlight mới
    switch(className) {
        case 'Warrior':
            document.getElementById('stat-str').parentElement.classList.add('highlight-str');
            document.getElementById('stat-vit').parentElement.classList.add('highlight-str');
            break;
        case 'Rogue':
            document.getElementById('stat-dex').parentElement.classList.add('highlight-dex');
            document.getElementById('stat-acc').parentElement.classList.add('highlight-acc');
            break;
        case 'Mage':
            document.getElementById('stat-int').parentElement.classList.add('highlight-int');
            document.getElementById('stat-dom').parentElement.classList.add('highlight-dom');
            break;
        case 'Archer':
            document.getElementById('stat-acc').parentElement.classList.add('highlight-acc');
            document.getElementById('stat-dex').parentElement.classList.add('highlight-dex');
            break;
        case 'Cleric':
            document.getElementById('stat-dom').parentElement.classList.add('highlight-dom');
            document.getElementById('stat-vit').parentElement.classList.add('highlight-str');
            break;
    }
}

// Xử lý khi chọn class khởi đầu
async function selectStartingClass(className) {
    // Tìm class trong data
    const classData = gameState.classes.find(cls => cls.name === className);
    
    if (classData) {
        // Cập nhật thông tin player
        gameState.playerData.className = className;
        gameState.playerData.vnClassName = classData.vnName;
        
        // Cập nhật stats dựa trên class
        updateStatsForClass(className);
        
        // Ẩn popup chọn class
        hideClassSelection();
        
        // Hiển thị game
        gameContainer.classList.remove('hidden');
        
        // Cập nhật hiển thị
        updatePlayerDisplay();
        renderClassTree();
        
        console.log(`Đã chọn class: ${className}`);
        highlightClassStats(className);
        
        // Lưu dữ liệu sau khi chọn class
        await storageSystem.savePlayerData(true);
    }
}

// Cập nhật stats theo class
function updateStatsForClass(className) {
    const baseStats = {
        str: 10,
        vit: 8,
        end: 7,
        dex: 6,
        acc: 5,
        int: 4,
        dom: 3,
        divine: 0,
        demonic: 0,
        chaos: 0
    };
    
    // Điều chỉnh stats theo class
    switch(className) {
        case 'Warrior':
            baseStats.str = 12;
            baseStats.vit = 10;
            baseStats.end = 9;
            break;
        case 'Rogue':
            baseStats.dex = 12;
            baseStats.acc = 10;
            baseStats.str = 8;
            break;
        case 'Mage':
            baseStats.int = 12;
            baseStats.dom = 10;
            baseStats.vit = 6;
            break;
        case 'Archer':
            baseStats.acc = 12;
            baseStats.dex = 10;
            baseStats.int = 6;
            break;
        case 'Cleric':
            baseStats.dom = 12;
            baseStats.vit = 10;
            baseStats.int = 8;
            break;
    }
    
    gameState.playerData.stats = baseStats;
}

// Initialize the game
async function initGame() {
    // Update HTML for Firebase auth
    updateAuthFormsForFirebase();
    
    // Initialize Firebase auth listener
    firebaseAuth.initAuthListener();
    
    await loadGameData();
    setupEventListeners();
    generateCaptcha();
    generateRankings();
    
    console.log('Game initialized');
}

// Update auth forms for Firebase (replace username with email)
function updateAuthFormsForFirebase() {
    // Update login form
    const loginUsername = document.getElementById('login-username');
    if (loginUsername) {
        loginUsername.placeholder = "Nhập email";
        loginUsername.type = "email";
        loginUsername.id = "login-email";
    }
    
    // Update register form labels
    const regUsername = document.getElementById('reg-username');
    if (regUsername) {
        const label = regUsername.previousElementSibling;
        if (label && label.tagName === 'LABEL') {
            label.textContent = "Email";
        }
        regUsername.type = "email";
        regUsername.placeholder = "Nhập email";
    }
}

// Load game data from JSON
async function loadGameData() {
    try {
        // In a real game, you would fetch from data.json
        // For this example, we'll use the provided class data
        gameState.classes = [
            {
                tier: 1,
                name: "Warrior",
                vnName: "Chiến Binh",
                weapon: "Kiếm",
                next: ["Knight", "Berserker"]
            },
            {
                tier: 1,
                name: "Rogue",
                vnName: "Đạo Tặc",
                weapon: "Song Dao",
                next: ["Assassin", "Duelist"]
            },
            {
                tier: 1,
                name: "Mage",
                vnName: "Pháp Sư",
                weapon: "Trượng Phép",
                next: ["Elementalist", "Warlock"]
            },
            // Add more classes as needed for demo
            {
                tier: 2,
                name: "Knight",
                vnName: "Kỵ Sĩ",
                weapon: "Kiếm & Khiên",
                power: "Thần Lực",
                next: ["Crusader", "Warden"]
            },
            {
                tier: 2,
                name: "Berserker",
                vnName: "Cuồng Chiến",
                weapon: "Đại Rìu",
                power: "Quỷ Lực",
                next: ["Bloodreaver", "Juggernaut"]
            },
            {
                tier: 3,
                name: "Crusader",
                vnName: "Chiến Thánh",
                power: "Thần Lực",
                next: ["Divine Champion", "Valkyrion"]
            },
            {
                tier: 4,
                name: "Valkyrion",
                vnName: "Nữ Chiến Thần",
                power: "Thần Lực",
                next: ["Ascended Crusader", "Heaven's Blade"]
            },
            {
                tier: 5,
                name: "Ascended Crusader",
                vnName: "Chiến Thánh Siêu Việt",
                power: "Thần Lực"
            }
        ];
        
        renderClassTree();
    } catch (error) {
        console.error('Error loading game data:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching in auth popup
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding form
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.getElementById(`${tab}-form`).classList.add('active');
            
            generateCaptcha();
        });
    });
    
    // Login button with Firebase
    loginBtn.addEventListener('click', async function() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const captcha = document.getElementById('login-captcha').value;
        
        if (!email || !password || !captcha) {
            alert('Vui lòng điền đầy đủ thông tin!');
            return;
        }
        
        // Simple captcha check
        const captchaText = document.getElementById('captcha-text').textContent;
        if (captcha !== captchaText) {
            alert('Mã xác nhận không đúng!');
            generateCaptcha();
            return;
        }
        
        // Show loading
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang đăng nhập...';
        
        // Firebase authentication
        const result = await firebaseAuth.signIn(email, password);
        
        if (!result.success) {
            alert(result.error);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Đăng nhập';
            generateCaptcha();
        }
    });
    
    // Register button with Firebase
    registerBtn.addEventListener('click', async function() {
        const email = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirmPass = document.getElementById('reg-confirm').value;
        const captcha = document.getElementById('reg-captcha').value;
        const recoveryCode = document.getElementById('recovery-code').value;
        const agreeTerms = document.getElementById('agree-terms').checked;
        
        if (!email || !password || !confirmPass || !captcha || !recoveryCode) {
            alert('Vui lòng điền đầy đủ thông tin!');
            return;
        }
        
        if (password !== confirmPass) {
            alert('Mật khẩu xác nhận không khớp!');
            return;
        }
        
        if (!agreeTerms) {
            alert('Bạn cần đồng ý với điều khoản!');
            return;
        }
        
        // Simple captcha check
        const captchaText = document.getElementById('reg-captcha-text').textContent;
        if (captcha !== captchaText) {
            alert('Mã xác nhận không đúng!');
            generateCaptcha();
            return;
        }
        
        // Show loading
        registerBtn.disabled = true;
        registerBtn.textContent = 'Đang đăng ký...';
        
        // Firebase registration
        const username = email.split('@')[0]; // Use email prefix as username
        const result = await firebaseAuth.signUp(email, password, username);
        
        if (!result.success) {
            alert(result.error);
            registerBtn.disabled = false;
            registerBtn.textContent = 'Đăng ký';
            generateCaptcha();
        }
    });
    
    // Menu navigation
    menuButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            
            if (section === 'logout') {
                switchSection('logout');
                return;
            }
            
            // Update active menu button
            menuButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding section
            switchSection(section);
        });
    });
    
    // Hall of Fame button
    hallOfFameBtn.addEventListener('click', function() {
        hallOfFame.classList.toggle('hidden');
    });
    
    // Hall of Fame tabs
    document.querySelectorAll('.hall-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            
            // Update active tab
            document.querySelectorAll('.hall-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding content
            document.querySelectorAll('.hall-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');
        });
    });
    
    // Close battle log
    closeBattleBtn.addEventListener('click', function() {
        battleLog.classList.add('hidden');
    });
    
    // Logout confirmation
    confirmLogoutBtn.addEventListener('click', async function() {
        await firebaseAuth.signOut();
    });
    
    // Add auto-save triggers for various actions
    setupAutoSaveTriggers();
}

// Setup auto-save triggers for game actions
function setupAutoSaveTriggers() {
    // Save after level up
    const originalUpdatePlayerDisplay = updatePlayerDisplay;
    updatePlayerDisplay = function() {
        originalUpdatePlayerDisplay.call(this);
        
        // Auto-save when player data changes
        if (gameState.isAuthenticated) {
            storageSystem.savePlayerData();
        }
    };
}

// Generate random captcha
function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let captcha = '';
    for (let i = 0; i < 6; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    document.getElementById('captcha-text').textContent = captcha;
    document.getElementById('reg-captcha-text').textContent = captcha;
}

// Switch between content sections
function switchSection(section) {
    contentSections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');
    gameState.currentSection = section;
}

// Update player display
function updatePlayerDisplay() {
    const p = gameState.playerData;
    
    // Player info in sidebar
    document.getElementById('player-name').textContent = p.name;
    document.getElementById('player-class').textContent = p.vnClassName;
    document.getElementById('player-level').textContent = p.level;
    document.getElementById('player-power').textContent = p.power;
    
    // Player stats in player section
    document.getElementById('stat-name').textContent = p.name;
    document.getElementById('stat-title').textContent = p.title;
    document.getElementById('stat-class').textContent = p.vnClassName;
    document.getElementById('stat-level').textContent = p.level;
    document.getElementById('stat-rank').textContent = p.rank;
    document.getElementById('stat-power').textContent = p.power;
    
    // Experience
    const expPercent = (p.exp / p.maxExp) * 100;
    document.getElementById('exp-fill').style.width = `${expPercent}%`;
    document.getElementById('exp-text').textContent = `${p.exp}/${p.maxExp} [${Math.round(expPercent)}%]`;
    
    // Stats with bonuses
    document.getElementById('stat-str').textContent = `${p.stats.str} [+${p.statBonuses.str}]`;
    document.getElementById('stat-vit').textContent = `${p.stats.vit} [+${p.statBonuses.vit}]`;
    document.getElementById('stat-end').textContent = `${p.stats.end} [+${p.statBonuses.end}]`;
    document.getElementById('stat-dex').textContent = `${p.stats.dex} [+${p.statBonuses.dex}]`;
    document.getElementById('stat-acc').textContent = `${p.stats.acc} [+${p.statBonuses.acc}]`;
    document.getElementById('stat-int').textContent = `${p.stats.int} [+${p.statBonuses.int}]`;
    document.getElementById('stat-dom').textContent = `${p.stats.dom} [+${p.statBonuses.dom}]`;
    document.getElementById('stat-divine').textContent = `${p.stats.divine} [+${p.statBonuses.divine}]`;
    document.getElementById('stat-demonic').textContent = `${p.stats.demonic} [+${p.statBonuses.demonic}]`;
    document.getElementById('stat-chaos').textContent = `${p.stats.chaos} [+${p.statBonuses.chaos}]`;
    
    // Show/hide special stats based on class
    const divineStat = document.getElementById('divine-stat');
    const demonicStat = document.getElementById('demonic-stat');
    const chaosStat = document.getElementById('chaos-stat');
    
    // Demo logic for showing stats
    if (p.className === 'Knight' || p.className === 'Crusader') {
        divineStat.classList.remove('hidden');
        demonicStat.classList.add('hidden');
        chaosStat.classList.add('hidden');
    } else if (p.className === 'Berserker') {
        divineStat.classList.add('hidden');
        demonicStat.classList.remove('hidden');
        chaosStat.classList.add('hidden');
    } else {
        divineStat.classList.add('hidden');
        demonicStat.classList.add('hidden');
        chaosStat.classList.add('hidden');
    }
}

// Render class tree
function renderClassTree() {
    classTreeContainer.innerHTML = '';
    
    // Group classes by tier
    const tiers = {};
    gameState.classes.forEach(cls => {
        if (!tiers[cls.tier]) {
            tiers[cls.tier] = [];
        }
        tiers[cls.tier].push(cls);
    });
    
    // Render each tier
    for (let tier = 1; tier <= 5; tier++) {
        if (tiers[tier]) {
            const tierDiv = document.createElement('div');
            tierDiv.className = 'tier-row';
            tierDiv.innerHTML = `<h4>Tier ${tier}</h4>`;
            
            tiers[tier].forEach(cls => {
                const classNode = document.createElement('div');
                classNode.className = `class-node tier-${tier}`;
                classNode.innerHTML = `
                    <h4>${cls.vnName}</h4>
                    <p>${cls.name}</p>
                    <p>Vũ khí: ${cls.weapon || 'N/A'}</p>
                    ${cls.power ? `<p>Sức mạnh: ${cls.power}</p>` : ''}
                `;
                
                // Highlight current class
                if (cls.name === gameState.playerData.className) {
                    classNode.style.background = 'rgba(33, 150, 243, 0.3)';
                    classNode.style.boxShadow = '0 0 10px rgba(33, 150, 243, 0.5)';
                }
                
                tierDiv.appendChild(classNode);
            });
            
            classTreeContainer.appendChild(tierDiv);
        }
    }
}

// Generate random rankings
function generateRankings() {
    const names = ['Player1', 'DarkKnight', 'MageLord', 'ShadowAssassin', 'HolyPaladin', 
                   'BerserkerKing', 'ArcherQueen', 'NecroMaster', 'DragonSlayer', 'Legend27'];
    
    gameState.rankings = [];
    
    for (let i = 0; i < 10; i++) {
        gameState.rankings.push({
            rank: i + 1,
            name: names[i],
            level: Math.floor(Math.random() * 100) + 1,
            power: Math.floor(Math.random() * 5000) + 1000,
            hours: Math.floor(Math.random() * 500) + 50,
            rankTitle: ['Đồng', 'Bạc', 'Vàng', 'Bạch Kim', 'Kim Cương'][Math.floor(Math.random() * 5)]
        });
    }
    
    // Update ranking table
    rankingBody.innerHTML = '';
    gameState.rankings.forEach(player => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.rank}</td>
            <td>${player.name}</td>
            <td>${player.level}</td>
            <td>${player.power}</td>
            <td>${player.hours}h</td>
            <td>${player.rankTitle}</td>
        `;
        
        // Highlight current player
        if (player.name === gameState.playerData.name) {
            row.style.background = 'rgba(33, 150, 243, 0.2)';
        }
        
        rankingBody.appendChild(row);
    });
}

// Auto battle system with auto-save
async function startAutoBattle() {
    // Show battle log
    battleLog.classList.remove('hidden');
    
    // Add initial battle message
    addBattleMessage('Hệ thống', 'Trận chiến bắt đầu!', 'system');
    
    // Simulate auto battle
    const battleInterval = setInterval(() => {
        if (gameState.currentSection !== 'campaign' && !battleLog.classList.contains('hidden')) {
            clearInterval(battleInterval);
            return;
        }
        
        // Random battle events
        const events = [
            { actor: 'Bạn', action: 'tấn công', target: 'Goblin', damage: Math.floor(Math.random() * 50) + 20, type: 'player' },
            { actor: 'Goblin', action: 'tấn công', target: 'Bạn', damage: Math.floor(Math.random() * 30) + 10, type: 'enemy' },
            { actor: 'Bạn', action: 'sử dụng kỹ năng', target: 'Goblin', skill: 'Chém mạnh', damage: Math.floor(Math.random() * 80) + 30, type: 'player' },
            { actor: 'Bạn', action: 'hồi phục', amount: Math.floor(Math.random() * 40) + 20, type: 'player' },
            { actor: 'Goblin Chúa', action: 'xuất hiện', type: 'system' }
        ];
        
        const event = events[Math.floor(Math.random() * events.length)];
        
        let message = '';
        if (event.action === 'tấn công') {
            message = `${event.actor} ${event.action} ${event.target}, gây ${event.damage} sát thương!`;
        } else if (event.action === 'sử dụng kỹ năng') {
            message = `${event.actor} ${event.action} ${event.skill} lên ${event.target}, gây ${event.damage} sát thương!`;
        } else if (event.action === 'hồi phục') {
            message = `${event.actor} ${event.action} ${event.amount} HP!`;
        } else if (event.action === 'xuất hiện') {
            message = `${event.actor} ${event.action}!`;
        }
        
        addBattleMessage(event.actor, message, event.type);
        
        // Randomly end battle
        if (Math.random() < 0.1) {
            addBattleMessage('Hệ thống', 'Trận chiến kết thúc! Nhận 50 EXP và 100 Vàng.', 'system');
            clearInterval(battleInterval);
            
            // Update player exp
            gameState.playerData.exp += 50;
            gameState.playerData.gold += 100;
            
            // Check for level up with anti-cheat
            const oldLevel = gameState.playerData.level;
            if (gameState.playerData.exp >= gameState.playerData.maxExp) {
                gameState.playerData.level++;
                gameState.playerData.exp = gameState.playerData.exp - gameState.playerData.maxExp;
                gameState.playerData.maxExp = Math.floor(gameState.playerData.maxExp * 1.5);
                gameState.playerData.power += 50;
                addBattleMessage('Hệ thống', `Bạn đã tăng lên cấp ${gameState.playerData.level}!`, 'system');
                
                // Anti-cheat check for level jumps
                if (gameState.playerData.level - oldLevel > 1) {
                    antiCheatSystem.logSuspiciousAction('Multiple level jump in one battle');
                }
            }
            
            updatePlayerDisplay();
            
            // Auto-save after battle
            storageSystem.savePlayerData();
        }
    }, 2000);
}

// Add message to battle log
function addBattleMessage(actor, message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `battle-message ${type}`;
    messageDiv.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    battleContent.appendChild(messageDiv);
    battleContent.scrollTop = battleContent.scrollHeight;
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', initGame);
