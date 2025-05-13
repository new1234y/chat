// Initialize Supabase client
const supabaseUrl = "https://oadwuacpouppdynssxrw.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHd1YWNwb3VwcGR5bnNzeHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzMyMTEsImV4cCI6MjA1NjI0OTIxMX0.MF7Ijl8SHm7wzKt8XiD3EQVqikLaVqkhPAYkqiJHisA"
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Modifier la configuration pour inclure les paramètres des marqueurs
const config = {
  defaultCenter: [48.8566, 2.3522],
  defaultZoom: 150,
  globalBoundaryRadius: 1000,
  playerProximityRadius: 200,
  updateInterval: 20000, // 20 secondes
}

// Fonction pour charger les settings depuis la table "game_settings"
async function loadGameSettings() {
  try {
    const { data: settings, error } = await supabase.from("game_settings").select("*").limit(1).single()
    if (error) {
      console.error("Erreur lors du chargement des game settings :", error)
      return null
    }

    // S'assurer que playerProximityRadius est défini
    if (settings && !settings.player_proximityRadius) {
      settings.player_proximityRadius = 200 // Valeur par défaut
    }

    return settings
  } catch (err) {
    console.error("Erreur lors du chargement des game settings :", err)
    return null
  }
}

// Fonction pour charger les settings d'une partie spécifique par code
async function loadGameSettingsByCode(gameCode) {
  try {
    const { data: settings, error } = await supabase.from("game_settings").select("*").eq("code", gameCode).single()

    if (error) {
      console.error("Erreur lors du chargement des game settings par code :", error)
      return null
    }
    return settings
  } catch (err) {
    console.error("Erreur lors du chargement des game settings par code :", err)
    return null
  }
}

// Fonction pour vérifier si une partie existe et son statut
async function checkGameStatus(gameCode) {
  try {
    const { data: game, error } = await supabase
      .from("game_settings")
      .select("status, date, duration")
      .eq("code", gameCode)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        // Code de partie non trouvé
        return { exists: false, status: null }
      }
      console.error("Erreur lors de la vérification du statut de la partie :", error)
      return { exists: false, status: null }
    }

    return {
      exists: true,
      status: game.status,
      date: game.date,
      duration: game.duration,
    }
  } catch (err) {
    console.error("Erreur lors de la vérification du statut de la partie :", err)
    return { exists: false, status: null }
  }
}

// Modifier le gameState pour inclure la gestion des marqueurs
const gameState = {
  map: null,
  player: null,
  players: new Map(),
  cats: new Map(),
  globalBoundary: null,
  playerMarker: null,
  playerCircle: null,
  playerExactPositionMarker: null,
  playerCirclePosition: null,
  playerCatMarker: null,
  subscription: null,
  isOutsideBoundary: false,
  lastScoreUpdate: Date.now(),
  inZone: true,
  lastServerUpdate: Date.now(),
  pendingPositionUpdate: false,
  darkMode: true, // Default to dark mode
  gameCode: null, // Code de la partie actuelle
  gameStatus: "Pending", // Status par défaut: Pending ou Started
  gameCenterPosition: null, // Position centrale de la partie actuelle
}

// DOM Elements
const elements = {
  joinForm: document.getElementById("join-form"),
  createForm: document.getElementById("create-form"),
  playerName: document.getElementById("player-name"),
  creatorName: document.getElementById("creator-name"),
  playersList: document.getElementById("players"),
  catsList: document.getElementById("cats"),
  loginModal: document.getElementById("login-modal"),
  centerMapBtn: document.getElementById("center-map"),
  statusIndicator: document.getElementById("status-indicator"),
  statusText: document.getElementById("status-text"),
  themeToggle: document.getElementById("theme-toggle-button"),
  playerScore: document.getElementById("player-score"),
  playerCountBadge: document.getElementById("player-count-badge"),
  catCountBadge: document.getElementById("cat-count-badge"),
  switchToCatBtn: document.getElementById("switch-to-cat"),
  switchToCatContainer: document.getElementById("switch-to-cat-container"),
  quitGameBtn: document.getElementById("quit-game"),
  mapTab: document.getElementById("map-tab"),
  playersTab: document.getElementById("players-tab"),
  mapPage: document.getElementById("map-page"),
  playersPage: document.getElementById("players-page"),
  waitingScreen: document.getElementById("waiting-screen"),
  gameCode: document.getElementById("game-code"), // Champ de code pour rejoindre
  newGameCode: document.getElementById("new-game-code"), // Champ de code pour créer
  gameDuration: document.getElementById("game-duration"), // Durée de la partie
  boundaryRadius: document.getElementById("boundary-radius"), // Rayon global
  proximityRadius: document.getElementById("proximity-radius"), // Rayon de proximité
  tabButtons: document.querySelectorAll(".tab-btn"), // Boutons d'onglets
  tabContents: document.querySelectorAll(".tab-content"), // Contenus d'onglets
  qrButton: document.getElementById("qr-code-button"),
  qrModal: document.getElementById("qr-code-modal"),
  qrContainer: document.getElementById("qr-code"),
  closeModal: document.querySelector(".close"),
  joinButton: document.querySelector('[data-tab="join-tab"]'),
  createButton: document.querySelector('[data-tab="create-tab"]'),
  createTab: document.getElementById("create-tab"),
  joinTab: document.getElementById("join-tab"),
  scoreModule: document.getElementById("score-module"),
  markerProgress: document.createElement("div"), // Will be created dynamically
}

const sunIcon = `<svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#ffd43b"><circle r="5" cy="12" cx="12"></circle><path id="sun-icon" d="m21 13h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm-17 0h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm13.66-5.66a1 1 0 0 1 -.66-.29 1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1 -.75.29zm-12.02 12.02a1 1 0 0 1 -.71-.29 1 1 0 0 1 0-1.41l.71-.66a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1 -.7.24zm6.36-14.36a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm0 17a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm-5.66-14.66a1 1 0 0 1 -.7-.29l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.29zm12.02 12.02a1 1 0 0 1 -.7-.29l-.66-.71a1 1 0 0 1 1.36-1.36l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.24z"></path></g></svg>`

const moonIcon = `<svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="m223.5 32c-123.5 0-223.5 100.3-223.5 224s100 224 223.5 224c60.6 0 115.5-24.2 155.8-63.4 5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6-96.9 0-175.5-78.8-175.5-176 0-65.8 36-123.1 89.3-153.3 6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z"></path></svg> `

// Ajoutez ces variables globales
let scoreInterval
let gameDuration = 60 // Durée par défaut en minutes
let gameTimerInterval

// Declare L before using it
const L = window.L

// Ajouter la fonction generateCode qui est appelée mais non définie
function generateCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  document.getElementById("new-game-code").value = code
  document.getElementById("generated-code-display").textContent = code
}

// Ajouter la fonction updatePlayerTypeIndicator qui est appelée dans joinGame
function updatePlayerTypeIndicator() {
  if (!gameState.player) return

  const playerTypeIcon = document.getElementById("player-type-icon")
  const playerTypeText = document.getElementById("player-type-text")

  if (!playerTypeIcon || !playerTypeText) return

  if (gameState.player.type === "player") {
    playerTypeIcon.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    `
    playerTypeText.textContent = "Joueur"
  } else {
    playerTypeIcon.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"></path>
        <path d="M8 14v.5"></path>
        <path d="M16 14v.5"></path>
        <path d="M11.25 16.25h1.5L12 17l-.75-.75Z"></path>
      </svg>
    `
    playerTypeText.textContent = "Chat"
  }
}

// Ajouter la fonction checkGameStatusPeriodically qui est appelée mais non définie
function checkGameStatusPeriodically() {
  setInterval(async () => {
    if (gameState.gameCode) {
      const gameResult = await checkGameStatus(gameState.gameCode)
      if (gameResult.status === "Started" && gameState.gameStatus !== "Started") {
        gameState.gameStatus = "Started"
        gameDuration = gameResult.duration || 60
        startGameTimer()

        // Cacher l'écran d'attente et afficher la carte
        elements.waitingScreen.style.display = "none"
        elements.mapPage.style.display = "block"

        showNotification("La partie a commencé !", "success")
      }
    }
  }, 10000) // Vérifier toutes les 10 secondes
}

// Ajouter la fonction startGameTimer qui est appelée mais non définie
function startGameTimer() {
  const gameStartDate = new Date()
  const gameEndDate = new Date(gameStartDate.getTime() + gameDuration * 60000)

  gameTimerInterval = setInterval(() => {
    const now = new Date()
    const timeLeft = gameEndDate.getTime() - now.getTime()

    if (timeLeft <= 0) {
      clearInterval(gameTimerInterval)
      showNotification("La partie est terminée !", "info")
      return
    }

    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

    // Mettre à jour l'affichage du chronomètre
    const timerDisplay = document.getElementById("game-time")
    if (timerDisplay) {
      timerDisplay.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
    }
  }, 1000)
}

// Ajouter la fonction checkIfPlayerIsCreator qui est appelée mais non définie
async function checkIfPlayerIsCreator() {
  if (!gameState.gameCode || !gameState.player) return false

  try {
    const { data: gameSettings, error } = await supabase
      .from("game_settings")
      .select("is_creator")
      .eq("code", gameState.gameCode)
      .single()

    if (error) {
      console.error("Error fetching game settings:", error)
      return false
    }

    // Vérifier si le joueur actuel est le créateur
    const isCreator = gameSettings.is_creator === gameState.player.name

    // Afficher ou masquer le bouton de démarrage en fonction du statut et du rôle
    const startGameButton = document.getElementById("start-game-button")
    if (startGameButton) {
      if (gameState.gameStatus === "Pending" && isCreator) {
        startGameButton.style.display = "block"
      } else {
        startGameButton.style.display = "none"
      }
    }

    return isCreator
  } catch (error) {
    console.error("Error checking creator status:", error)
    return false
  }
}

// Ajouter la fonction handleEntityRemoval qui est appelée mais non définie
function handleEntityRemoval(oldRecord) {
  if (oldRecord.type === "player") {
    if (gameState.players.has(oldRecord.id)) {
      const playerData = gameState.players.get(oldRecord.id)
      if (playerData.circle) {
        gameState.map.removeLayer(playerData.circle)
      }
      gameState.players.delete(oldRecord.id)
    }
  } else if (oldRecord.type === "cat") {
    if (gameState.cats.has(oldRecord.id)) {
      const catData = gameState.cats.get(oldRecord.id)
      if (catData.marker) {
        gameState.map.removeLayer(catData.marker)
      }
      gameState.cats.delete(oldRecord.id)
    }
  }

  // Update count badges
  updateCountBadges()
}

// Ajouter la fonction addCatMarker qui est appelée mais non définie
function addCatMarker(player) {
  if (gameState.playerCatMarker) {
    gameState.map.removeLayer(gameState.playerCatMarker)
  }

  gameState.playerCatMarker = L.marker([player.position.lat, player.position.lng], {
    icon: L.divIcon({
      className: "cat-marker",
      html: `
      <div style="background-color: #f59e0b; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"></path>
          <path d="M8 14v.5"></path>
          <path d="M16 14v.5"></path>
          <path d="M11.25 16.25h1.5L12 17l-.75-.75Z"></path>
        </svg>
      </div>
    `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  }).addTo(gameState.map)

  gameState.playerCatMarker.bindPopup(player.name)
}

// Ajouter la fonction updateSameGamePlayersCount qui est appelée mais non définie
async function updateSameGamePlayersCount() {
  if (!gameState.gameCode) return

  try {
    // Compter les joueurs avec le même code de partie
    const { data, error } = await supabase.from("player").select("id").eq("gameCode", gameState.gameCode)

    if (error) {
      console.error("Erreur lors du comptage des joueurs :", error)
      return
    }

    const playerCount = data.length

    // Mettre à jour l'affichage
    const sameGameCountElement = document.getElementById("same-game-count")
    if (sameGameCountElement) {
      sameGameCountElement.textContent = `Joueurs dans cette partie: ${playerCount}`
    }
  } catch (error) {
    console.error("Erreur lors du comptage des joueurs :", error)
  }
}

// Corriger la fonction switchToCat qui est définie mais incomplète
function switchToCat() {
  if (!gameState.player || gameState.player.type !== "player") return

  // Apply 500 point penalty
  gameState.player.score = Math.max(0, gameState.player.score - 500)

  // Update player type and score in database, and supprimer position_circle
  supabase
    .from("player")
    .update({
      type: "cat",
      score: Math.round(gameState.player.score),
      gameCode: gameState.gameCode,
      position_circle: null, // Supprimer position_circle quand on devient un chat
    })
    .eq("id", gameState.player.id)
    .then(({ error }) => {
      if (error) {
        console.error("Error switching to cat:", error)
        showNotification("Une erreur s'est produite lors du changement en chat. Veuillez réessayer.", "error")
        return
      }

      // Update game state
      gameState.player.type = "cat"
      gameState.player.position_circle = null // Supprimer aussi dans l'état local
      updatePlayerTypeIndicator()

      // Remove player circle
      if (gameState.playerCircle) {
        gameState.map.removeLayer(gameState.playerCircle)
        gameState.playerCircle = null
      }

      // Remove exact position marker
      if (gameState.playerExactPositionMarker) {
        gameState.map.removeLayer(gameState.playerExactPositionMarker)
        gameState.playerExactPositionMarker = null
      }

      // Add cat marker
      addCatMarker(gameState.player)

      // Update gameState.cats
      gameState.cats.set(gameState.player.id, {
        data: gameState.player,
        marker: gameState.playerCatMarker,
      })

      // Remove player from gameState.players
      gameState.players.delete(gameState.player.id)

      // Refresh map and lists
      refreshMapAndLists()

      // Hide "Become a cat" button
      elements.switchToCatContainer.style.display = "none"

      // Stop score interval
      clearInterval(scoreInterval)

      showNotification("Vous êtes maintenant un chat ! Votre score a été réduit de 500 points.", "info")
    })
    .catch((error) => {
      console.error("Error switching to cat:", error)
      showNotification("Une erreur s'est produite lors du changement en chat. Veuillez réessayer.", "error")
    })
}

// Corriger la fonction quitGame qui est définie mais incomplète
function quitGame() {
  if (gameState.player) {
    try {
      supabase
        .from("player")
        .delete()
        .eq("id", gameState.player.id)
        .then(() => {
          clearInterval(scoreInterval)
          location.reload()
        })
        .catch((error) => {
          console.error("Error deleting player:", error)
          showNotification("Une erreur s'est produite lors de la déconnexion. Veuillez réessayer.", "error")
        })
    } catch (error) {
      console.error("Error deleting player:", error)
      showNotification("Une erreur s'est produite lors de la déconnexion. Veuillez réessayer.", "error")
    }
  }
}

// Fonction pour afficher des notifications stylisées
function showNotification(message, type = "info") {
  // Créer l'élément de notification
  const notification = document.createElement("div")
  notification.className = `notification-toast ${type}`
  notification.textContent = message

  // Ajouter la notification au corps du document
  document.body.appendChild(notification)

  // Afficher la notification avec une animation
  setTimeout(() => {
    notification.classList.add("show")
  }, 100)

  // Supprimer la notification après un délai
  setTimeout(() => {
    notification.classList.remove("show")
    setTimeout(() => {
      notification.remove()
    }, 500)
  }, 3000)
}

// Initialize the game
function initGame() {
  // Set initial theme
  updateTheme(gameState.darkMode)

  // Initialize map with dark theme by default
  gameState.map = L.map("game-map").setView(config.defaultCenter, config.defaultZoom)

  // Ajouter la classe pour améliorer visuellement la carte
  document.getElementById("game-map").classList.add("map-enhanced")
  document.querySelector(".leaflet-control-zoom")?.remove()

  // Add tile layer (map style) - dark by default
  updateMapTheme(gameState.darkMode)

  // Add global boundary circle - will be updated with specific game settings later
  gameState.globalBoundary = L.circle(config.defaultCenter, {
    radius: config.globalBoundaryRadius,
    color: "#6c5ce7",
    fillColor: "#6c5ce7",
    fillOpacity: 0.1,
    weight: 2,
    dashArray: "5, 10",
  }).addTo(gameState.map)

  // Set up event listeners
  setupEventListeners()

  // Show login modal at start
  elements.loginModal.style.display = "flex"

  // ⚠️ FIX affichage grande map au démarrage (dans le DOM)
  setTimeout(() => {
    gameState.map.invalidateSize()
  }, 100)
}

// Ajouter des fonctions pour gérer l'overlay de chargement
function showLoading() {
  const loadingOverlay = document.getElementById("loading-overlay")
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex"
  }
}

function hideLoading() {
  const loadingOverlay = document.getElementById("loading-overlay")
  if (loadingOverlay) {
    loadingOverlay.style.display = "none"
  }
}

// Update theme function
function updateTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }

  // Update map theme if map exists
  if (gameState.map) {
    updateMapTheme(isDark)
  }
}

// Update map theme
function updateMapTheme(isDark) {
  if (!gameState.map) return

  // Remove current tile layer
  gameState.map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) {
      gameState.map.removeLayer(layer)
    }
  })

  // Add appropriate tile layer based on theme
  if (isDark) {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
    }).addTo(gameState.map)
  } else {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
    }).addTo(gameState.map)
  }
}

// Fonction pour basculer entre les onglets
function toggleTabs() {
  // Masquer les deux formulaires
  elements.joinTab.style.display = "none"
  elements.createTab.style.display = "none"

  // Afficher le formulaire correspondant
  if (elements.joinButton.classList.contains("active")) {
    elements.joinTab.style.display = "block"
  } else {
    elements.createTab.style.display = "block"
  }
}

// Initialisation : afficher "Rejoindre" par défaut
elements.joinButton.classList.add("active")
elements.joinTab.style.display = "block"
elements.createTab.style.display = "none"

// Ajout des écouteurs d'événements pour les boutons
elements.joinButton.addEventListener("click", () => {
  // Cacher le formulaire Créer et afficher le formulaire Rejoindre
  elements.joinButton.classList.add("active")
  elements.createButton.classList.remove("active")
  elements.joinTab.style.display = "block"
  elements.createTab.style.display = "none" // Cacher le formulaire Créer
})

elements.createButton.addEventListener("click", () => {
  // Cacher le formulaire Rejoindre et afficher le formulaire Créer
  elements.createButton.classList.add("active")
  elements.joinButton.classList.remove("active")
  elements.createTab.style.display = "block"
  elements.joinTab.style.display = "none" // Cacher le formulaire Rejoindre
})

function switchTabFn(tabId) {
  if (!tabId) return console.warn("T'as cliqué dans le vide fréro 😭")

  const tabButton = document.querySelector(`[data-tab="${tabId}"]`)
  const tabContent = document.getElementById(tabId)
  if (!tabButton || !tabContent) return console.warn(`Tab perdu dans le multiverse : ${tabId}`)

  const rootStyles = getComputedStyle(document.documentElement)
  const primaryColor = rootStyles.getPropertyValue("--primary-color").trim()

  // Reset tous les boutons et SVG
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.remove("active")
    const svg = btn.querySelector("svg")
    if (svg) svg.style.stroke = "#fff" // SVG des boutons inactifs = blanc
  })

  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active")
  })

  // Active le bon
  tabButton.classList.add("active")
  tabContent.classList.add("active")

  // Active la couleur sur le bon SVG
  const activeSvg = tabButton.querySelector("svg")
  if (activeSvg) activeSvg.style.stroke = primaryColor

  // Affichage spécifique map / joueurs
  if (elements.mapPage) elements.mapPage.style.display = tabId === "map-tab" ? "block" : "none"
  if (elements.playersPage) elements.playersPage.style.display = tabId === "players-tab" ? "block" : "none"

  // Refresh map si elle est affichée
  if (tabId === "map-tab" && gameState.map) {
    setTimeout(() => gameState.map.invalidateSize(), 100)
  }
  if (tabId === "create-tab" && window.createMap) {
    setTimeout(() => window.createMap.invalidateSize(), 100)
  }
}

// Add this function to update the UI when the game code changes
function onGameCodeChange() {
  const gameCode = elements.gameCode.value.trim().toUpperCase()
  if (gameCode.length >= 3) {
    checkGameStatus(gameCode)
  }
}

// Ajouter cette fonction pour extraire les paramètres de l'URL
function getUrlParameter(name) {
  name = name.replace(/\[/, "\\[").replace(/]/, "\\]")
  const regex = new RegExp("[\\?&]" + name + "=([^&#]*)")
  const results = regex.exec(location.search)
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "))
}

// Add a function to get current location for the form
function useCurrentLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        // Mettre à jour les champs cachés
        document.getElementById("game-latitude").value = lat
        document.getElementById("game-longitude").value = lng

        // Mettre à jour la carte si elle existe
        if (window.createMap && window.createMapCircle) {
          const newCenter = L.latLng(lat, lng)
          window.createMap.setView(newCenter, config.defaultZoom)

          // Mettre à jour le marqueur central
          window.createMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
              layer.setLatLng(newCenter)
            }
          })

          // Mettre à jour le cercle
          window.createMapCircle.setLatLng(newCenter)
        }

        showNotification("Position actuelle récupérée avec succès", "success")
      },
      (error) => {
        console.error("Erreur de géolocalisation:", error)
        showNotification("Impossible d'obtenir votre position actuelle", "error")
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    )
  } else {
    showNotification("La géolocalisation n'est pas prise en charge par votre navigateur", "error")
  }
}

// Set up event listeners
function setupEventListeners() {
  // Gestion des onglets
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab")
      switchTabFn(tabId)
    })
  })

  // Join form submission
  elements.joinForm.addEventListener("submit", handleJoinGame)

  // Create form submission
  elements.createForm.addEventListener("submit", handleCreateGame)

  // Game code change event
  elements.gameCode.addEventListener("input", onGameCodeChange)
  elements.gameCode.addEventListener("change", onGameCodeChange)

  // Ajouter l'événement pour le texte cliquable
  const manualCodeToggle = document.getElementById("manual-code-toggle")
  if (manualCodeToggle) {
    manualCodeToggle.addEventListener("click", () => {
      document.getElementById("game-code-container").style.display = "block"
      manualCodeToggle.style.display = "none"
    })
  }

  // Center map button
  elements.centerMapBtn.addEventListener("click", () => {
    const bounds = []

    // Ajoute la position du joueur courant
    if (gameState.player && gameState.player.position) {
      bounds.push([gameState.player.position.lat, gameState.player.position.lng])
    }

    // Ajoute la position de tous les autres joueurs
    gameState.players.forEach((playerObj) => {
      if (playerObj.data.position && playerObj.data.gameCode === gameState.gameCode) {
        bounds.push([playerObj.data.position.lat, playerObj.data.position.lng])
      }
    })

    if (bounds.length > 0) {
      // Ajuste le zoom et le centrage pour afficher tous les joueurs avec une marge de 50 pixels
      gameState.map.fitBounds(bounds, { padding: [50, 50] })
    } else if (gameState.gameCenterPosition) {
      // Si aucune position de joueur n'est disponible, centrer sur la position du jeu
      gameState.map.setView([gameState.gameCenterPosition.lat, gameState.gameCenterPosition.lng], config.defaultZoom)
    } else {
      // Si aucune position n'est disponible, on centre sur la position par défaut
      gameState.map.setView(config.defaultCenter, config.defaultZoom)
    }
  })

  // Theme toggle
  elements.themeToggle.addEventListener("click", () => {
    gameState.darkMode = !gameState.darkMode
    elements.themeToggle.innerHTML = gameState.darkMode ? moonIcon : sunIcon
    updateTheme(gameState.darkMode)
  })

  // Switch to cat button
  if (elements.switchToCatBtn) {
    elements.switchToCatBtn.addEventListener("click", switchToCat)
  }

  // Quit game button
  if (elements.quitGameBtn) {
    elements.quitGameBtn.addEventListener("click", quitGame)
  }

  // Bottom navbar tab switching
  elements.mapTab.addEventListener("click", () => {
    switchTabFn("map-tab")
  })

  elements.playersTab.addEventListener("click", () => {
    switchTabFn("players-tab")
  })

  // Start game button
  const startGameButton = document.getElementById("start-game-button")
  if (startGameButton) {
    startGameButton.addEventListener("click", startGame)
  }

  // Add event listener for the use current location button
  const useLocationBtn = document.getElementById("use-current-location")

  if (useLocationBtn) {
    useLocationBtn.addEventListener("click", (e) => {
      e.preventDefault() // Empêche le comportement par défaut
      e.stopPropagation() // Empêche la propagation de l'événement

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude
            const lng = position.coords.longitude

            // Mettre à jour les champs cachés
            document.getElementById("game-latitude").value = lat
            document.getElementById("game-longitude").value = lng

            // Mettre à jour la carte si elle existe
            if (window.createMap && window.createMapCircle) {
              const newCenter = L.latLng(lat, lng)
              window.createMap.setView(newCenter, window.createMap.getZoom())

              // Mettre à jour le marqueur central
              window.createMap.eachLayer((layer) => {
                if (layer instanceof L.Marker) {
                  layer.setLatLng(newCenter)
                }
              })

              // Mettre à jour le cercle
              window.createMapCircle.setLatLng(newCenter)
            }

            showNotification("Position actuelle récupérée avec succès", "success")
          },
          (error) => {
            console.error("Erreur de géolocalisation:", error)
            showNotification("Impossible d'obtenir votre position actuelle", "error")
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          },
        )
      } else {
        showNotification("La géolocalisation n'est pas prise en charge par votre navigateur", "error")
      }
    })
  }

  // Initialiser la carte de création de partie
  initCreateMap()

  // Gérer le slider de rayon
  const boundaryRadiusSlider = document.getElementById("boundary-radius-slider")
  const boundaryRadiusValue = document.getElementById("boundary-radius-value")

  if (boundaryRadiusSlider && boundaryRadiusValue) {
    boundaryRadiusSlider.addEventListener("input", function () {
      const value = this.value
      boundaryRadiusValue.textContent = value

      // Mettre à jour le rayon du cercle sur la carte
      if (window.createMapCircle) {
        window.createMapCircle.setRadius(Number.parseInt(value))
      }
    })
  }

  // Gérer le slider de rayon de proximité
  const proximityRadiusSlider = document.getElementById("proximity-radius-slider")
  const proximityRadiusValue = document.getElementById("proximity-radius-value")
  const proximityRadiusHidden = document.getElementById("proximity-radius")

  if (proximityRadiusSlider && proximityRadiusValue && proximityRadiusHidden) {
    proximityRadiusSlider.addEventListener("input", function () {
      const value = this.value
      proximityRadiusValue.textContent = value
      proximityRadiusHidden.value = value
    })
  }

  // Add functionality to share the game code
  document.getElementById("share-game-code").addEventListener("click", () => {
    const gameCode = gameState.gameCode || elements.gameCode.value.trim().toUpperCase()
    if (gameCode) {
      const shareUrl = `https://new1234y.github.io/chat/?code=${gameCode}`
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          showNotification("Lien de partage copié dans le presse-papiers !", "success")
        })
        .catch(() => {
          showNotification("Impossible de copier le lien. Veuillez réessayer.", "error")
        })
    } else {
      showNotification("Aucun code de partie disponible à partager.", "error")
    }
  })

  // Add functionality to open the QR code modal
  document.getElementById("qr-code-button").addEventListener("click", () => {
    const gameCode = gameState.gameCode || elements.gameCode.value.trim().toUpperCase()
    if (gameCode) {
      const qrUrl = `https://new1234y.github.io/chat/?code=${gameCode}`
      const qrContainer = document.getElementById("qr-code-container")
      qrContainer.innerHTML = "" // Clear previous QR code
      new QRCode(qrContainer, {
        text: qrUrl,
        width: 200,
        height: 200,
      })
      document.getElementById("qr-code-modal").style.display = "flex"
    } else {
      showNotification("Aucun code de partie disponible pour générer un QR code.", "error")
    }
  })

  // Close the QR code modal
  document.getElementById("close-qr-modal").addEventListener("click", () => {
    document.getElementById("qr-code-modal").style.display = "none"
  })
}

// Initialiser la carte pour la création de partie
function initCreateMap() {
  const createMapContainer = document.getElementById("create-map-container")
  if (!createMapContainer) return

  // Initialiser la carte avec le thème actuel
  const createMap = L.map("create-map-container").setView(config.defaultCenter, config.defaultZoom)

  // Ajouter le fond de carte selon le thème
  updateCreateMapTheme(gameState.darkMode)

  // Créer un marqueur pour le centre
  const centerIcon = L.divIcon({
    className: "center-marker",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })

  const centerMarker = L.marker(config.defaultCenter, {
    icon: centerIcon,
    draggable: false,
  }).addTo(createMap)

  // Créer un cercle pour visualiser la zone de jeu
  window.createMapCircle = L.circle(config.defaultCenter, {
    radius: 1000, // Valeur initiale
    color: "#6c5ce7",
    fillColor: "#6c5ce7",
    fillOpacity: 0.1,
    weight: 2,
    dashArray: "5, 10",
  }).addTo(createMap)

  // Gérer les clics sur la carte
  createMap.on("click", (e) => {
    const newCenter = e.latlng

    // Mettre à jour la position du marqueur et du cercle
    centerMarker.setLatLng(newCenter)
    window.createMapCircle.setLatLng(newCenter)

    // Mettre à jour les champs cachés pour le formulaire
    document.getElementById("game-latitude").value = newCenter.lat
    document.getElementById("game-longitude").value = newCenter.lng
  })

  // Fonction pour mettre à jour le thème de la carte
  function updateCreateMapTheme(isDark) {
    // Supprimer les couches de tuiles existantes
    createMap.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        createMap.removeLayer(layer)
      }
    })

    // Ajouter la couche appropriée selon le thème
    if (isDark) {
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
      }).addTo(createMap)
    } else {
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
      }).addTo(createMap)
    }
  }

  // Mettre à jour la carte quand le thème change
  elements.themeToggle.addEventListener("click", () => {
    setTimeout(() => {
      updateCreateMapTheme(gameState.darkMode)
    }, 100)
  })

  // Ajouter la carte à la fenêtre pour y accéder ailleurs
  window.createMap = createMap

  setTimeout(() => {
    createMap.invalidateSize()
  }, 100)
}

// Function to switch between tabs
function switchTab(tabName) {
  if (tabName === "map") {
    elements.mapPage.classList.add("active")
    elements.playersPage.classList.remove("active")
    elements.mapTab.classList.add("active")
    elements.playersTab.classList.remove("active")

    // Refresh map size when switching to map tab
    if (gameState.map) {
      setTimeout(() => {
        gameState.map.invalidateSize()
      }, 100)
    }

    // Affiche l'onglet de la carte et cache celui des joueurs
    elements.playersPage.style.display = "none"

    // Cacher l'écran d'attente si le jeu a commencé
    if (gameState.gameStatus === "Started") {
      elements.waitingScreen.style.display = "none"
    } else {
      elements.waitingScreen.style.display = "flex"
    }
  } else if (tabName === "players") {
    elements.playersPage.classList.add("active")
    elements.mapPage.classList.remove("active")
    elements.playersTab.classList.add("active")
    elements.mapTab.classList.remove("active")

    // Affiche l'onglet des joueurs et cache celui de la carte
    elements.playersPage.style.display = "block" // Montre l'onglet des joueurs
    elements.waitingScreen.style.display = "none" // Toujours cacher l'écran d'attente dans l'onglet joueurs

    // Update score display when switching to players tab
    if (gameState.player) {
    }
  }
}

// Handle create game form submission
async function handleCreateGame(e) {
  e.preventDefault()

  const name = elements.creatorName.value.trim()
  const gameCode = elements.newGameCode.value.trim().toUpperCase()
  const duration = Number.parseInt(elements.gameDuration.value)
  const boundaryRadius = Number.parseInt(document.getElementById("boundary-radius-slider").value)
  const proximityRadius = Number.parseInt(elements.proximityRadius.value)

  if (!name) {
    showNotification("Veuillez entrer un nom de joueur !", "error")
    return
  }

  if (name.length < 2) {
    showNotification("Le nom doit contenir au moins 2 caractères !", "error")
    return
  }

  if (!gameCode || gameCode.length < 3) {
    showNotification("Veuillez entrer un code de partie valide (min. 3 caractères) !", "error")
    return
  }

  showLoading()

  try {
    // Vérifier si la partie existe déjà
    const gameResult = await checkGameStatus(gameCode)

    if (gameResult.exists) {
      showNotification(`Une partie avec le code ${gameCode} existe déjà. Veuillez choisir un autre code.`, "error")
      hideLoading()
      return
    }

    // Créer la nouvelle partie avec les paramètres personnalisés
    const now = new Date().toISOString()
    const mapCenterLat = Number.parseFloat(document.getElementById("game-latitude").value) || config.defaultCenter[0]
    const mapCenterLng = Number.parseFloat(document.getElementById("game-longitude").value) || config.defaultCenter[1]
    const { error: createError } = await supabase.from("game_settings").insert([
      {
        code: gameCode,
        date: now,
        status: "Pending",
        duration: duration,
        map_center_lat: mapCenterLat,
        map_center_lng: mapCenterLng,
        map_zoom_level: config.defaultZoom,
        player_proximity_radius: proximityRadius,
        global_boundary_radius: boundaryRadius,
        update_interval: config.updateInterval,
        is_creator: name,
      },
    ])

    if (createError) {
      console.error("Erreur lors de la création de la partie :", createError)
      showNotification("Erreur lors de la création de la partie. Veuillez réessayer.", "error")
      hideLoading()
      return
    }

    // Mettre à jour la configuration locale
    config.globalBoundaryRadius = boundaryRadius
    config.playerProximityRadius = proximityRadius
    gameDuration = duration

    // Définir le statut de jeu
    gameState.gameStatus = "Pending"
    gameState.gameCode = gameCode

    // Mettre à jour l'affichage du code de partie dans l'écran d'attente
    updateWaitingScreenGameCode()

    // Stocker la position centrale de cette partie
    gameState.gameCenterPosition = {
      lat: mapCenterLat,
      lng: mapCenterLng,
    }

    // Mettre à jour le cercle global avec la position spécifique à cette partie
    updateGlobalBoundary(mapCenterLat, mapCenterLng, boundaryRadius)

    showNotification(`Nouvelle partie créée avec le code ${gameCode}`, "success")

    // Rejoindre la partie créée
    const type = "player" // Le créateur est toujours un joueur

    // Utiliser la géolocalisation pour rejoindre
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const playerPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }

          // Initialize playerCirclePosition with the initial position
          gameState.playerCirclePosition = {
            lat: playerPosition.lat,
            lng: playerPosition.lng,
          }

          // Initialize isOutsideBoundary
          gameState.isOutsideBoundary = false

          await joinGame(name, type, playerPosition, gameCode)
          hideLoading()

          // Set up continuous position watching
          setupGeoLocationWatch()
        },
        (error) => {
          console.warn("Geolocation error:", error)
          // Use default position in case of error
          const defaultPosition = {
            lat: mapCenterLat,
            lng: mapCenterLng,
          }

          // Initialize playerCirclePosition with the default position
          gameState.playerCirclePosition = {
            lat: defaultPosition.lat,
            lng: defaultPosition.lng,
          }

          // Initialize isOutsideBoundary
          gameState.isOutsideBoundary = false

          joinGame(name, type, defaultPosition, gameCode).then(() => {
            hideLoading()
            // Set up continuous position watching
            setupGeoLocationWatch()
          })
        },
        {
          enableHighAccuracy: true,
          timeout: config.updateInterval * 2,
          maximumAge: 0,
        },
      )
    } else {
      showNotification("La géolocalisation n'est pas prise en charge par votre navigateur.", "error")
      hideLoading()
    }
  } catch (error) {
    console.error("Error in create game process:", error)
    showNotification("Une erreur s'est produite. Veuillez réessayer.", "error")
    hideLoading()
  }
}

// Fonction pour mettre à jour le cercle global avec les coordonnées spécifiques à une partie
function updateGlobalBoundary(lat, lng, radius) {
  if (!gameState.map) return

  // Si le cercle existe déjà, mettre à jour sa position et son rayon
  if (gameState.globalBoundary) {
    gameState.globalBoundary.setLatLng([lat, lng])
    gameState.globalBoundary.setRadius(radius)
  } else {
    // Sinon, créer un nouveau cercle
    gameState.globalBoundary = L.circle([lat, lng], {
      radius: radius,
      color: "#6c5ce7",
      fillColor: "#6c5ce7",
      fillOpacity: 0.1,
      weight: 2,
      dashArray: "5, 10",
    }).addTo(gameState.map)
  }

  console.log(`Cercle global mis à jour pour la partie: [${lat}, ${lng}], rayon: ${radius}m`)
}

// Handle join game form submission
async function handleJoinGame(e) {
  e.preventDefault()
  console.log("Join form submitted")

  const name = elements.playerName.value.trim()
  // Le type sera déterminé plus tard de façon aléatoire
  let type = "player" // Valeur par défaut

  // Get the game code from URL parameter or input field
  let gameCode = urlGameCode

  // Si pas de code dans l'URL, utiliser le champ de texte
  if (!gameCode) {
    gameCode = elements.gameCode.value.trim().toUpperCase()
  }

  if (!name) {
    showNotification("Veuillez entrer un nom de joueur !", "error")
    return
  }

  if (name.length < 2) {
    showNotification("Le nom doit contenir au moins 2 caractères !", "error")
    return
  }

  if (!gameCode) {
    showNotification("Veuillez entrer un code de partie !", "error")
    return
  }

  showLoading()

  try {
    // Vérifier si la partie existe et son statut
    const gameResult = await checkGameStatus(gameCode)

    if (!gameResult.exists) {
      // Si la partie n'existe pas, basculer vers l'onglet de création
      hideLoading()

      // Pré-remplir les champs du formulaire de création
      elements.creatorName.value = name
      elements.newGameCode.value = gameCode

      // Basculer vers l'onglet de création
      switchTabFn("create-tab")

      showNotification(`La partie avec le code ${gameCode} n'existe pas. Vous pouvez la créer.`, "warning")
      return
    }

    // La partie existe, vérifier son statut
    gameState.gameStatus = gameResult.status
    gameState.gameCode = gameCode

    // Mettre à jour l'affichage du code de partie dans l'écran d'attente
    updateWaitingScreenGameCode()

    if (gameResult.status === "Started") {
      // Définir la durée de jeu
      gameDuration = gameResult.duration || 60

      // Calculer le temps restant
      const startDate = new Date(gameResult.date)
      const endDate = new Date(startDate.getTime() + gameDuration * 60000)
      const now = new Date()

      if (now > endDate) {
        showNotification("Cette partie est terminée.", "error")
        hideLoading()
        return
      }
    }

    // Charger les paramètres de la partie
    const gameSettings = await loadGameSettingsByCode(gameCode)
    if (gameSettings) {
      // Mettre à jour la configuration avec les paramètres spécifiques à cette partie
      config.globalBoundaryRadius = gameSettings.global_boundary_radius
      config.playerProximityRadius = gameSettings.player_proximity_radius
      gameDuration = gameSettings.duration

      // Stocker la position centrale de cette partie
      gameState.gameCenterPosition = {
        lat: gameSettings.map_center_lat,
        lng: gameSettings.map_center_lng,
      }

      // Mettre à jour le cercle global avec la position spécifique à cette partie
      updateGlobalBoundary(
        gameSettings.map_center_lat,
        gameSettings.map_center_lng,
        gameSettings.global_boundary_radius,
      )
    } else {
      console.warn("Using default settings.")
    }

    // Déterminer le type de joueur de façon aléatoire ou selon les règles
    const determinePlayerType = async () => {
      // Vérifier s'il y a déjà un chat dans la partie
      const { data: existingPlayers, error } = await supabase.from("player").select("type").eq("gameCode", gameCode)

      if (error) {
        console.error("Erreur lors de la vérification des joueurs existants:", error)
        return "player" // Par défaut, joueur en cas d'erreur
      }

      // Vérifier s'il y a déjà un chat
      const hasCat = existingPlayers.some((player) => player.type === "cat")

      if (hasCat) {
        // S'il y a déjà un chat, le nouveau joueur sera un joueur
        console.log("Il y a déjà un chat dans la partie, vous serez un joueur")
        return "player"
      } else {
        // Sinon, choix aléatoire (70% chance d'être joueur, 30% chance d'être chat)
        const randomType = Math.random() < 0.1 ? "player" : "cat"
        console.log(`Choix aléatoire (70/30): vous serez un ${randomType}`)
        return randomType
      }
    }

    // Déterminer le type avant de continuer
    type = await determinePlayerType()

    const { data: existingPlayer, error: checkError } = await supabase
      .from("player")
      .select("id, name")
      .eq("name", name)
      .eq("gameCode", gameCode)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking player:", checkError)
      showNotification("Erreur lors de la vérification du joueur. Veuillez réessayer.", "error")
      hideLoading()
      return
    }

    if (existingPlayer) {
      const { error: deleteError } = await supabase.from("player").delete().eq("id", existingPlayer.id)

      if (deleteError) {
        console.error("Error deleting existing player:", deleteError)
        showNotification("Erreur lors de la récupération du nom d'utilisateur. Veuillez réessayer.", "error")
        hideLoading()
        return
      }
    }

    // Use geolocation
    if ("geolocation" in navigator) {
      // Use a default position in case of geolocation error
      const useDefaultPosition = () => {
        console.log("Using default position")
        // Utiliser la position centrale de la partie comme position par défaut
        const defaultPosition = gameState.gameCenterPosition
          ? {
              lat: gameState.gameCenterPosition.lat,
              lng: gameState.gameCenterPosition.lng,
            }
          : {
              lat: config.defaultCenter[0],
              lng: config.defaultCenter[1],
            }

        // Initialize playerCirclePosition with the default position
        gameState.playerCirclePosition = {
          lat: defaultPosition.lat,
          lng: defaultPosition.lng,
        }

        // Initialize isOutsideBoundary
        gameState.isOutsideBoundary = false

        joinGame(name, type, defaultPosition, gameCode).then(() => {
          hideLoading()
          // Set up continuous position watching
          setupGeoLocationWatch()
        })
      }

      // Try to get the current position
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const playerPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }

          // Initialize playerCirclePosition with the initial position
          gameState.playerCirclePosition = {
            lat: playerPosition.lat,
            lng: playerPosition.lng,
          }

          // Initialize isOutsideBoundary
          gameState.isOutsideBoundary = false

          await joinGame(name, type, playerPosition, gameCode)
          hideLoading()

          // Set up continuous position watching
          setupGeoLocationWatch()
        },
        (error) => {
          console.warn("Geolocation error:", error)
          // Use default position in case of error
          useDefaultPosition()
        },
        {
          enableHighAccuracy: true,
          timeout: config.updateInterval * 2,
          maximumAge: 0,
        },
      )
    } else {
      showNotification("La géolocalisation n'est pas prise en charge par votre navigateur.", "error")
      hideLoading()
    }
  } catch (error) {
    console.error("Error in join process:", error)
    showNotification("Une erreur s'est produite. Veuillez réessayer.", "error")
    hideLoading()
  }
}

// Join the game
async function joinGame(name, type, position, gameCode) {
  console.log(`Joining game as ${type} named ${name} at position:`, position)

  if (!position || isNaN(position.lat) || isNaN(position.lng)) {
    console.error("Invalid position:", position)
    showNotification("Position invalide. Utilisation de la position par défaut.", "warning")

    // Utiliser la position centrale de la partie comme position par défaut
    position = gameState.gameCenterPosition
      ? {
          lat: gameState.gameCenterPosition.lat,
          lng: gameState.gameCenterPosition.lng,
        }
      : {
          lat: config.defaultCenter[0],
          lng: config.defaultCenter[1],
        }
  }

  // Generate a unique ID
  const playerId = Date.now().toString()

  // Charger les paramètres spécifiques à cette partie si ce n'est déjà fait
  if (!gameState.gameCenterPosition) {
    const gameSettings = await loadGameSettingsByCode(gameCode)
    if (gameSettings) {
      gameState.gameCenterPosition = {
        lat: gameSettings.map_center_lat,
        lng: gameSettings.map_center_lng,
      }

      // Mettre à jour le cercle global avec la position spécifique à cette partie
      updateGlobalBoundary(
        gameSettings.map_center_lat,
        gameSettings.map_center_lng,
        gameSettings.global_boundary_radius,
      )
    }
  }

  // Check if the initial position is inside the global boundary
  const centerPosition = gameState.gameCenterPosition || { lat: config.defaultCenter[0], lng: config.defaultCenter[1] }
  const isInZone = gameState.map
    ? gameState.map.distance([position.lat, position.lng], [centerPosition.lat, centerPosition.lng]) <=
      config.globalBoundaryRadius
    : true

  // Créer une position pour le cercle si c'est un joueur
  let position_circle = null
  if (type === "player") {
    // Générer une position aléatoire pour le cercle à proximité de la position réelle
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * (config.playerProximityRadius * 0.7) // Rester bien à l'intérieur du rayon
    const circleLat = position.lat + (Math.sin(angle) * distance) / 111000
    const circleLng = position.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((position.lat * Math.PI) / 180))

    position_circle = {
      lat: circleLat,
      lng: circleLng,
    }
  }

  // Create player object with inZone status and game code
  const playerData = {
    id: playerId,
    name: name,
    type: type,
    position: position,
    position_circle: position_circle,
    score: 0,
    inZone: isInZone,
    gameCode: gameCode,
  }

  try {
    // Insert player into database
    const { data, error } = await supabase.from("player").insert([playerData])

    if (error) {
      console.error("Error joining game:", error)
      showNotification("Erreur lors de la connexion au jeu. Veuillez réessayer.", "error")
      hideLoading()
      return
    }

    // Set player in game state
    gameState.player = playerData
    updatePlayerTypeIndicator()
    gameState.inZone = isInZone
    gameState.lastServerUpdate = Date.now()

    // Hide login modal
    elements.loginModal.style.display = "none"

    // Show success message
    showNotification(`Vous avez rejoint la partie en tant que ${type === "player" ? "joueur" : "chat"} !`, "success")

    // Center map on player position
    gameState.map.setView([position.lat, position.lng], config.defaultZoom)

    // Add player marker and circle
    addPlayerToMap(playerData)

    // Subscribe to real-time updates
    subscribeToUpdates()

    // Update lists
    updatePlayersList()
    updateCatsList()
    updateCountBadges()

    // Mettre à jour le compteur de joueurs dans la même partie
    updateSameGamePlayersCount()

    // Update UI based on player type
    if (type === "player") {
      elements.switchToCatContainer.style.display = "block"
    }

    // Show quit button
    elements.quitGameBtn.style.display = "block"

    document.getElementById("score-module").style.display = "block"
    document.getElementById("player-type-indicator").style.display = "block"

    // Configurer l'intervalle de synchronisation avec le serveur
    setInterval(syncWithServer, config.updateInterval)

    // Si le statut est "Started", démarrer le chronomètre
    if (gameState.gameStatus === "Started") {
      startGameTimer()

      // Afficher l'onglet de la carte et cacher l'écran d'attente
      elements.waitingScreen.style.display = "none"
      elements.mapPage.style.display = "block"
      // Dans la fonction handleGameSettingsUpdate, après la ligne "if (newRecord.status === "Started") {",
      // ajoutez cette ligne pour afficher le score-module:
      if (elements.scoreModule) {
        elements.scoreModule.style.display = "block"
      }
    } else {
      // Sinon, vérifier régulièrement si le jeu a démarré
      checkGameStatusPeriodically()

      // Afficher l'écran d'attente
      elements.waitingScreen.style.display = "flex"
      elements.mapPage.style.display = "none"
    }
    // Actualiser immédiatement la carte pour afficher tous les joueurs
    refreshMapAndLists()

    console.log("Successfully joined game")

    // Vérifier si le joueur est le créateur et afficher le bouton de démarrage si nécessaire
    checkIfPlayerIsCreator()

    // Mettre à jour l'affichage du code de partie dans l'écran d'attente
    updateWaitingScreenGameCode()

    gameState.map.invalidateSize()
  } catch (error) {
    console.error("Error in joinGame:", error)
    showNotification("Une erreur s'est produite lors de la connexion. Veuillez réessayer.", "error")
  }
}

// Modifier la fonction addPlayerToMap pour utiliser position_circle
function addPlayerToMap(entity) {
  const isCurrentPlayer = gameState.player && entity.id === gameState.player.id
  const isPlayer = entity.type === "player"

  // Ne pas afficher les joueurs d'autres parties si le jeu a commencé
  if (gameState.gameStatus === "Started" && entity.gameCode !== gameState.gameCode && !isCurrentPlayer) {
    return
  }

  if (isPlayer) {
    const isInZone = entity.inZone !== undefined ? entity.inZone : true

    // Utiliser position_circle pour les joueurs si disponible, sinon utiliser position
    const circlePosition = entity.position_circle || entity.position

    // Pour les joueurs, on n'affiche pas leur position exacte, seulement le cercle
    // Sauf pour le joueur actuel, on affiche un petit marqueur à sa position exacte pour qu'il puisse se repérer
    if (isCurrentPlayer) {
      // Ajouter un petit marqueur pour la position exacte du joueur actuel (visible uniquement par lui)
      const exactPositionMarker = L.marker([entity.position.lat, entity.position.lng], {
        icon: L.divIcon({
          className: "player-exact-position",
          html: `<div style="width: 6px; height: 6px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
          iconSize: [6, 6],
          iconAnchor: [3, 3],
        }),
      }).addTo(gameState.map)

      gameState.playerExactPositionMarker = exactPositionMarker
    }

    // Ajout d'un cercle pour représenter la zone du joueur
    const playerCircle = L.circle([circlePosition.lat, circlePosition.lng], {
      radius: config.playerProximityRadius,
      color: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
      fillColor: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
      fillOpacity: 0.2,
      weight: 1,
    }).addTo(gameState.map)

    // Ajouter une animation au cercle lors de sa création
    if (isCurrentPlayer) {
      const circles = document.querySelectorAll(".leaflet-interactive")
      if (circles.length > 0) {
        const lastCircle = circles[circles.length - 1]
        lastCircle.style.animation = "circlePulse 2s infinite"
      }
    }

    if (isCurrentPlayer) {
      gameState.playerCircle = playerCircle
      gameState.playerCirclePosition = circlePosition
    } else {
      gameState.players.set(entity.id, {
        data: entity,
        circle: playerCircle,
      })
    }

    // Afficher le nom du joueur dans le popup du cercle
    playerCircle.bindPopup(`${entity.name}`)
  } else {
    // Ajout du marqueur pour les chats (sans cercle)
    const marker = L.marker([entity.position.lat, entity.position.lng], {
      icon: L.divIcon({
        className: "cat-marker",
        html: `
        <div style="background-color: #f59e0b; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center;
        justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7
        </svg>
      </div>
    `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(gameState.map)

    // Ne pas afficher le score dans le popup
    marker.bindPopup(`${entity.name}`)

    gameState.cats.set(entity.id, {
      data: entity,
      marker: marker,
    })
  }
}

// Modifier la fonction updateCurrentPlayerPosition pour gérer position_circle
function updateCurrentPlayerPosition(position) {
  if (!gameState.player) return

  gameState.player.position = position

  // Vérifier si nous avons une position centrale pour cette partie
  const centerPosition = gameState.gameCenterPosition || {
    lat: config.defaultCenter[0],
    lng: config.defaultCenter[1],
  }

  // Check if the player is outside the global boundary
  const distanceToCenter = gameState.map.distance(
    [position.lat, position.lng],
    [centerPosition.lat, centerPosition.lng],
  )
  const isOutsideGlobalBoundary = distanceToCenter > config.globalBoundaryRadius

  // Store the previous state to detect changes
  const wasOutsideBoundary = gameState.isOutsideBoundary
  gameState.isOutsideBoundary = isOutsideGlobalBoundary

  // Update inZone status
  const newInZone = !isOutsideGlobalBoundary
  const inZoneChanged = gameState.inZone !== newInZone

  if (inZoneChanged) {
    console.log(`Player zone status changed: ${wasOutsideBoundary ? "Entering" : "Leaving"} the global circle`)
    gameState.inZone = newInZone
    gameState.player.inZone = newInZone

    // Marquer qu'une mise à jour est nécessaire
    gameState.pendingPositionUpdate = true

    // Forcer une synchronisation immédiate avec le serveur si le statut de zone a changé
    syncWithServer()
  }

  // If the player is a regular player (not a cat)
  if (gameState.player.type === "player") {
    // Always update exact position marker for current player
    if (gameState.playerExactPositionMarker) {
      // Ajouter une animation au marqueur
      const markerElement = gameState.playerExactPositionMarker.getElement()
      if (markerElement) {
        markerElement.classList.add("player-marker-animation")
        setTimeout(() => {
          markerElement.classList.remove("player-marker-animation")
        }, 500)
      }
      gameState.playerExactPositionMarker.setLatLng([position.lat, position.lng])
    } else {
      // Create exact position marker if it doesn't exist
      gameState.playerExactPositionMarker = L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          className: "player-exact-position",
          html: `<div style="width: 6px; height: 6px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
          iconSize: [6, 6],
          iconAnchor: [3, 3],
        }),
      }).addTo(gameState.map)
    }

    // If the zone status changed, update the display
    if (inZoneChanged) {
      // Remove existing circles
      if (gameState.playerCircle) {
        gameState.map.removeLayer(gameState.playerCircle)
        gameState.playerCircle = null
      }

      // Handle zone entry - create circle with proper delay to avoid visual glitches
      if (newInZone) {
        // When re-entering the circle, wait a brief moment before showing the circle
        // to ensure database sync completes and prevent flickering
        setTimeout(() => {
          if (gameState.inZone) {
            // Double-check we're still in zone after the delay
            // Generate a new circle position near the player
            const angle = Math.random() * Math.PI * 2
            const distance = Math.random() * config.playerProximityRadius * 0.7 // Stay well within circle
            const newCircleLat = position.lat + (Math.sin(angle) * distance) / 111000
            const newCircleLng =
              position.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((position.lat * Math.PI) / 180))

            // Mettre à jour position_circle
            gameState.player.position_circle = { lat: newCircleLat, lng: newCircleLng }
            gameState.playerCirclePosition = gameState.player.position_circle

            // Marquer qu'une mise à jour est nécessaire pour envoyer position_circle au serveur
            gameState.pendingPositionUpdate = true

            // Create the circle
            gameState.playerCircle = L.circle(
              [gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng],
              {
                radius: config.playerProximityRadius,
                color: "#6c5ce7",
                fillColor: "#6c5ce7",
                fillOpacity: 0.2,
                weight: 1,
              },
            ).addTo(gameState.map)

            gameState.playerCircle.bindPopup(gameState.player.name)
          }
        }, 200) // Réponse rapide pour une meilleure expérience utilisateur
      }
    } else {
      // No zone change, just check if we need to update the circle

      if (!isOutsideGlobalBoundary) {
        // Inside global boundary - handle circle movement only if needed

        // Initialize circle position if needed
        if (!gameState.playerCirclePosition && !gameState.player.position_circle) {
          // Générer une position aléatoire pour le cercle
          const angle = Math.random() * Math.PI * 2
          const distance = Math.random() * (config.playerProximityRadius * 0.7)
          const circleLat = position.lat + (Math.sin(angle) * distance) / 111000
          const circleLng =
            position.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((position.lat * Math.PI) / 180))

          gameState.player.position_circle = { lat: circleLat, lng: circleLng }
          gameState.playerCirclePosition = gameState.player.position_circle
          gameState.pendingPositionUpdate = true
        } else if (gameState.player.position_circle) {
          gameState.playerCirclePosition = gameState.player.position_circle
        }

        // Calculate distance between player and circle center
        const distanceToCircleCenter = gameState.playerCirclePosition
          ? gameState.map.distance(
              [position.lat, position.lng],
              [gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng],
            )
          : 0

        // Calculate distance to circle edge (radius - distance to center)
        const distanceToBorder = config.playerProximityRadius - distanceToCircleCenter

        // If player is close to the edge of their circle or outside it, move the circle
        if (distanceToBorder < 10 || distanceToCircleCenter > config.playerProximityRadius || !gameState.playerCircle) {
          // Generate new position centered on player's current position
          const angle = Math.random() * Math.PI * 2
          const distance = Math.random() * (config.playerProximityRadius * 0.7)
          const circleLat = position.lat + (Math.sin(angle) * distance) / 111000
          const circleLng =
            position.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((position.lat * Math.PI) / 180))

          gameState.player.position_circle = { lat: circleLat, lng: circleLng }
          gameState.playerCirclePosition = gameState.player.position_circle
          gameState.pendingPositionUpdate = true

          // Update or create circle
          if (!gameState.playerCircle) {
            gameState.playerCircle = L.circle(
              [gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng],
              {
                radius: config.playerProximityRadius,
                color: "#6c5ce7",
                fillColor: "#6c5ce7",
                fillOpacity: 0.2,
                weight: 1,
              },
            ).addTo(gameState.map)

            gameState.playerCircle.bindPopup(gameState.player.name)
          } else {
            gameState.playerCircle.setLatLng([gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng])
            gameState.playerCircle.setRadius(config.playerProximityRadius)
          }
        }
      }
    }
  } else if (gameState.player.type === "cat") {
    // For cats, always show exact position (no change when leaving/entering circle)
    if (gameState.playerCatMarker) {
      gameState.playerCatMarker.setLatLng([position.lat, position.lng])
    } else {
      addCatMarker(gameState.player)
    }

    // Marquer qu'une mise à jour est nécessaire
    gameState.pendingPositionUpdate = true
  }
}

// Add a debounce function to avoid too many database updates
let updatePositionDebounceTimer = null
function debounceUpdatePlayerPosition() {
  if (updatePositionDebounceTimer) {
    clearTimeout(updatePositionDebounceTimer)
  }

  updatePositionDebounceTimer = setTimeout(() => {
    // Ne mettre à jour que si une synchronisation n'est déjà prévue
    if (!gameState.pendingPositionUpdate) {
      gameState.pendingPositionUpdate = true
    }

    updatePositionDebounceTimer = null
  }, 500) // Délai court pour marquer les mises à jour en attente
}

// Improve the updatePlayerInZoneStatus function to include better error handling
async function updatePlayerInZoneStatus(inZone) {
  if (!gameState.player) return

  try {
    const { error } = await supabase.from("player").update({ inZone: inZone }).eq("id", gameState.player.id)

    if (error) {
      console.error("Error updating inZone status:", error)
      // Try again after a delay if there was an error
      setTimeout(() => {
        updatePlayerInZoneStatus(inZone)
      }, 1000)
    } else {
      console.log(`Player inZone status updated to: ${inZone}`)
    }
  } catch (error) {
    console.error("Exception updating inZone status:", error)
  }
}

function subscribeToUpdates() {
  gameState.subscription = supabase
    .channel("player-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "player" }, (payload) => {
      handleRealtimeUpdate(payload)
    })
    .subscribe()

  // Souscrire aussi aux changements de game_settings pour détecter les changements de statut
  supabase
    .channel("game-settings-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "game_settings" }, (payload) => {
      handleGameSettingsUpdate(payload)
    })
    .subscribe()
}

// Modifier la fonction startGame pour générer les marqueurs au démarrage
async function startGame() {
  if (!gameState.player || !gameState.gameCode) return

  // Vérifier si le joueur est le créateur
  checkIfPlayerIsCreator().then(async (isCreator) => {
    if (!isCreator) {
      showNotification("Seul le créateur de la partie peut la démarrer", "error")
      return
    }

    // Mettre à jour le statut de la partie
    supabase
      .from("game_settings")
      .update({
        status: "Started",
      })
      .eq("code", gameState.gameCode)
      .then(({ error }) => {
        if (error) {
          console.error("Erreur lors du démarrage de la partie:", error)
          showNotification("Erreur lors du démarrage de la partie", "error")
          return
        }

        showNotification("La partie a commencé!", "success")

        // Mettre à jour le statut local
        gameState.gameStatus = "Started"

        // Cacher l'écran d'attente et afficher la carte
        elements.waitingScreen.style.display = "none"
        elements.mapPage.style.display = "block"

        // Démarrer le chronomètre
        startGameTimer()
        // ⚠️ FIX affichage grande map au démarrage (dans le DOM)
        setTimeout(() => {
          gameState.map.invalidateSize()
        }, 100)
      })
      .catch((error) => {
        console.error("Erreur lors du démarrage de la partie:", error)
        showNotification("Erreur lors du démarrage de la partie", "error")
      })
  })
  // ⚠️ FIX affichage grande map au démarrage (dans le DOM)
  setTimeout(() => {
    gameState.map.invalidateSize()
  }, 100)
}

// Handle real-time updates
function handleRealtimeUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload

  // Skip if it's the current player's update
  if (gameState.player && newRecord && newRecord.id === gameState.player.id) {
    return
  }

  switch (eventType) {
    case "INSERT":
      handleNewEntity(newRecord)
      break
    case "UPDATE":
      handleEntityUpdate(newRecord)
      break
    case "DELETE":
      handleEntityRemoval(oldRecord)
      break
  }

  // Actualiser la carte et les listes après chaque mise à jour
  updateMap()
  updatePlayersList()
  updateCatsList()
  updateCountBadges()
}

// Update count badges in navbar
function updateCountBadges() {
  // Ne compter que les joueurs de la même partie si le jeu a commencé
  let playerCount = 0
  let catCount = 0

  if (gameState.gameStatus === "Started") {
    playerCount = Array.from(gameState.players.values()).filter(
      (p) => p.data.type === "player" && p.data.gameCode === gameState.gameCode,
    ).length

    catCount = Array.from(gameState.cats.values()).filter((c) => c.data.gameCode === gameState.gameCode).length
  } else {
    playerCount = Array.from(gameState.players.values()).filter((p) => p.data.type === "player").length

    catCount = Array.from(gameState.cats.values()).length
  }

  // Update the display with exact counts
  elements.playerCountBadge.textContent = `Joueurs: ${playerCount}`
  elements.catCountBadge.textContent = `Chats: ${catCount}`
}

// Modification de updateMap pour éviter de supprimer le cercle global
function updateMap() {
  gameState.map.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Circle) {
      if (
        (gameState.globalBoundary && layer === gameState.globalBoundary) ||
        (gameState.player && layer === gameState.playerCircle) ||
        (gameState.player && layer === gameState.playerExactPositionMarker) ||
        (gameState.player && layer === gameState.playerCatMarker) ||
        layer instanceof L.TileLayer
      ) {
        return
      }
      gameState.map.removeLayer(layer)
    }
  })

  // Si le jeu est en attente, n'afficher que les joueurs de la même partie
  if (gameState.gameStatus === "Pending") {
    // Afficher le joueur actuel
    if (gameState.player) {
      if (gameState.player.type === "player") {
        if (!gameState.playerCircle || !gameState.playerExactPositionMarker) {
          addPlayerToMap(gameState.player)
        }
      } else if (gameState.player.type === "cat") {
        if (!gameState.playerCatMarker) {
          addCatMarker(gameState.player)
        }
      }
    }

    // Afficher tous les joueurs de la même partie
    gameState.players.forEach((player) => {
      if (!gameState.player || player.data.name !== gameState.player.name) {
        if (player.data.gameCode === gameState.gameCode) {
          addPlayerToMap(player.data)
        }
      }
    })

    gameState.cats.forEach((cat) => {
      if (!gameState.player || cat.data.name !== gameState.player.name) {
        if (cat.data.gameCode === gameState.gameCode) {
          addPlayerToMap(cat.data)
        }
      }
    })

    return
  }

  // Si le jeu a commencé, n'afficher que les joueurs de la même partie
  gameState.players.forEach((player) => {
    if (!gameState.player || player.data.name !== gameState.player.name) {
      if (player.data.gameCode === gameState.gameCode) {
        addPlayerToMap(player.data)
      }
    }
  })

  gameState.cats.forEach((cat) => {
    if (!gameState.player || cat.data.name !== gameState.player.name) {
      if (gameState.gameStatus === "Started" && cat.data.gameCode === gameState.gameCode) {
        addPlayerToMap(cat.data)
      }
    }
  })

  if (gameState.player) {
    if (gameState.player.type === "player") {
      if (!gameState.playerCircle || !gameState.playerExactPositionMarker) {
        addPlayerToMap(gameState.player)
      }
    } else if (gameState.player.type === "cat") {
      if (!gameState.playerCatMarker) {
        addCatMarker(gameState.player)
      }
    }
  }
}

// Handle new entity
function handleNewEntity(entity) {
  // Si le jeu a commencé, ignorer les entités d'autres parties
  if (gameState.gameStatus === "Started" && entity.gameCode !== gameState.gameCode) {
    return
  }

  if (entity.type === "player") {
    if (!gameState.players.has(entity.id)) {
      addPlayerToMap(entity)
    }
  } else if (entity.type === "cat") {
    if (!gameState.cats.has(entity.id)) {
      addPlayerToMap(entity)
    }
  }

  // Update count badges
  updateCountBadges()
}

// Improve handleEntityUpdate to handle transitions better
function handleEntityUpdate(entity) {
  // Si le jeu a commencé, ignorer les mises à jour des entités d'autres parties
  if (gameState.gameStatus === "Started" && entity.gameCode !== gameState.gameCode) {
    // Si l'entité était déjà dans la liste, la supprimer
    if (entity.type === "player" && gameState.players.has(entity.id)) {
      const playerData = gameState.players.get(entity.id)
      if (playerData.circle) {
        gameState.map.removeLayer(playerData.circle)
      }
      gameState.players.delete(entity.id)
    } else if (entity.type === "cat" && gameState.cats.has(entity.id)) {
      const catData = gameState.cats.get(entity.id)
      if (catData.marker) {
        gameState.map.removeLayer(catData.marker)
      }
      gameState.cats.delete(entity.id)
    }
    updateCountBadges()
    return
  }

  if (entity.type === "player") {
    const playerData = gameState.players.get(entity.id)
    if (playerData) {
      // Check if inZone status has changed
      const inZoneChanged = playerData.data.inZone !== entity.inZone
      // Check if position_circle has changed
      const circlePositionChanged =
        !playerData.data.position_circle ||
        !entity.position_circle ||
        playerData.data.position_circle.lat !== entity.position_circle.lat ||
        playerData.data.position_circle.lng !== entity.position_circle.lng

      // Update player data
      playerData.data = entity

      // If inZone status or circle position changed, ensure smooth transition
      if (inZoneChanged || circlePositionChanged) {
        // Remove existing circle
        if (playerData.circle) {
          gameState.map.removeLayer(playerData.circle)
          playerData.circle = null
        }

        // Remove from collection temporarily
        gameState.players.delete(entity.id)

        // Re-add with new status after a small delay to ensure clean transition
        setTimeout(() => {
          addPlayerToMap(entity)
        }, 50)
      } else {
        // Just update position if needed
        if (entity.inZone && playerData.circle && entity.position_circle) {
          playerData.circle.setLatLng([entity.position_circle.lat, entity.position_circle.lng])
          playerData.circle.bindPopup(`${entity.name}`)
        }
      }
    } else {
      // New player, add to map
      addPlayerToMap(entity)
    }
  } else if (entity.type === "cat") {
    const catData = gameState.cats.get(entity.id)
    if (catData) {
      catData.data = entity
      catData.marker.setLatLng([entity.position.lat, entity.position.lng])
      catData.marker.bindPopup(entity.name)
    } else {
      // New cat, add to map
      addPlayerToMap(entity)
    }
  }

  // Update count badges
  updateCountBadges()
}

// Update the geolocation watch to use proper interval timing
function setupGeoLocationWatch() {
  if ("geolocation" in navigator) {
    try {
      navigator.geolocation.watchPosition(
        (newPosition) => {
          const newPlayerPosition = {
            lat: newPosition.coords.latitude,
            lng: newPosition.coords.longitude,
          }

          if (gameState.player) {
            gameState.player.position = newPlayerPosition
            updateCurrentPlayerPosition(newPlayerPosition)
          }
        },
        (error) => {
          console.warn("Geolocation watch error:", error)
          // Make sure loading is hidden in case of geolocation error
          hideLoading()
        },
        {
          enableHighAccuracy: true,
          timeout: 5000, // Timeout plus court pour une meilleure réactivité
          maximumAge: 0, // Toujours obtenir la position la plus récente
        },
      )
    } catch (error) {
      console.error("Error setting up geolocation watch:", error)
      hideLoading()
    }
  } else {
    console.warn("Geolocation is not supported")
    hideLoading()
  }
}

// Fetch existing entities
async function fetchExistingEntities() {
  // Si le jeu est démarré, ne récupérer que les joueurs de la même partie
  let playerQuery = supabase.from("player").select("*").eq("type", "player").order("score", { ascending: false })
  let catQuery = supabase.from("player").select("*").eq("type", "cat")

  if (gameState.gameStatus === "Started" && gameState.gameCode) {
    playerQuery = playerQuery.eq("gameCode", gameState.gameCode)
    catQuery = catQuery.eq("gameCode", gameState.gameCode)
  }

  // Fetch players
  const { data: players, error: playersError } = await playerQuery

  if (playersError) {
    console.error("Error fetching players:", playersError)
  } else if (players) {
    // Add existing players to map
    players.forEach((player) => {
      // Skip if it's the current player
      if (gameState.player && player.id === gameState.player.id) return

      addPlayerToMap(player)
    })
  }

  // Fetch cats
  const { data: cats, error: catsError } = await catQuery

  if (catsError) {
    console.error("Error fetching cats:", catsError)
  } else if (cats) {
    // Add existing cats to map
    cats.forEach((cat) => {
      addPlayerToMap(cat)
    })
  }

  // Update count badges
  updateCountBadges()
}

// Update players list in sidebar
function updatePlayersList() {
  elements.playersList.innerHTML = ""
  const addedPlayers = new Set()

  if (gameState.player && gameState.player.type === "player") {
    const li = document.createElement("li")
    li.textContent = `${gameState.player.name} (Vous)`
    li.style.fontWeight = "bold"
    elements.playersList.appendChild(li)
    addedPlayers.add(gameState.player.name)
  }

  // Filtrer les joueurs selon le code de partie si le jeu a commencé
  gameState.players.forEach((player) => {
    if (!addedPlayers.has(player.data.name)) {
      // Si le jeu a commencé, vérifier que le joueur est dans la même partie
      if (gameState.gameStatus === "Started" && player.data.gameCode !== gameState.gameCode) {
        return
      }

      const li = document.createElement("li")
      li.textContent = player.data.name
      if (gameState.player && player.data.name === gameState.player.name) {
        li.textContent += " (Vous)"
        li.style.fontWeight = "bold"
      }

      // Add click to center map on player
      li.addEventListener("click", () => {
        if (player.data.position) {
          gameState.map.setView([player.data.position.lat, player.data.position.lng], 18)
          // Switch to map tab after clicking
          switchTabFn("map")
        }
      })

      elements.playersList.appendChild(li)
      addedPlayers.add(player.data.name)
    }
  })
}

// Update cats list in sidebar
function updateCatsList() {
  elements.catsList.innerHTML = ""
  const addedCats = new Set()

  if (gameState.player && gameState.player.type === "cat") {
    const li = document.createElement("li")
    li.textContent = `${gameState.player.name} (Vous)`
    li.style.fontWeight = "bold"
    elements.catsList.appendChild(li)
    addedCats.add(gameState.player.name)
  }

  // Filtrer les chats selon le code de partie si le jeu a commencé
  gameState.cats.forEach((cat) => {
    if (!addedCats.has(cat.data.name)) {
      // Si le jeu a commencé, vérifier que le chat est dans la même partie
      if (gameState.gameStatus === "Started" && cat.data.gameCode !== gameState.gameCode) {
        return
      }

      const li = document.createElement("li")
      li.textContent = cat.data.name
      if (gameState.player && cat.data.name === gameState.player.name) {
        li.textContent += " (Vous)"
        li.style.fontWeight = "bold"
      }

      // Add click to center map on cat
      li.addEventListener("click", () => {
        if (cat.data.position) {
          gameState.map.setView([cat.data.position.lat, cat.data.position.lng], 18)
          // Switch to map tab after clicking
          switchTabFn("map")
        }
      })

      elements.catsList.appendChild(li)
      addedCats.add(cat.data.name)
    }
  })
}

// Clean up when leaving the page
window.addEventListener("beforeunload", async () => {
  // Remove player from database when leaving
  if (gameState.player) {
    await supabase.from("player").delete().eq("id", gameState.player.id)
  }

  // Unsubscribe from real-time updates
  if (gameState.subscription) {
    supabase.removeChannel(gameState.subscription)
  }

  // Arrêter les intervalles
  clearInterval(scoreInterval)
  clearInterval(gameTimerInterval)
})

// Check Supabase connection at startup
async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase.from("player").select("count").limit(1)

    if (error) {
      console.error("Supabase connection error:", error)
      elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
      elements.statusText.textContent = "Connection error"
      return false
    }

    console.log("Supabase connected successfully")
    elements.statusIndicator.style.backgroundColor = "var(--success-color)"
    elements.statusText.textContent = "Connected"
    return true
  } catch (error) {
    console.error("Error checking Supabase connection:", error)
    elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
    elements.statusText.textContent = "Erreur de connexion"
    return false
  }
}

let urlGameCode = ""

document.addEventListener("DOMContentLoaded", async () => {
  const meta = document.createElement("meta")
  meta.name = "viewport"
  meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
  document.getElementsByTagName("head")[0].appendChild(meta)

  // Ajouter des champs cachés pour la latitude et longitude
  const createForm = document.getElementById("create-form")
  if (createForm) {
    const latInput = document.createElement("input")
    latInput.type = "hidden"
    latInput.id = "game-latitude"
    latInput.value = config.defaultCenter[0]

    const lngInput = document.createElement("input")
    lngInput.type = "hidden"
    lngInput.id = "game-longitude"
    lngInput.value = config.defaultCenter[1]

    createForm.appendChild(latInput)
    createForm.appendChild(lngInput)
  }

  // Récupérer le code de partie depuis l'URL
  urlGameCode = getUrlParameter("code").toUpperCase()

  // Configurer l'interface en fonction de la présence d'un code dans l'URL
  const gameCodeContainer = document.getElementById("game-code-container")
  const manualCodeToggle = document.getElementById("manual-code-toggle")

  if (urlGameCode) {
    // Si un code est présent dans l'URL, masquer le toggle et pré-remplir le champ
    manualCodeToggle.style.display = "block"
    if (elements.gameCode) {
      elements.gameCode.value = urlGameCode
    }

    // Pré-remplir aussi le champ de création si besoin
    if (elements.newGameCode) {
      elements.newGameCode.value = urlGameCode
    }
  } else {
    // Si pas de code dans l'URL, afficher le toggle et le champ de saisie
    manualCodeToggle.style.display = "none"
    gameCodeContainer.style.display = "block"
  }

  // S'assurer que la modal de login est visible au démarrage
  const loginModal = document.getElementById("login-modal")
  if (loginModal) {
    loginModal.style.display = "flex"
  }

  // The rest of your initialization code...
  const isConnected = await checkSupabaseConnection()

  if (isConnected) {
    // Load settings from DB and update config object
    const settings = await loadGameSettings()
    if (settings) {
      config.defaultCenter = [settings.map_center_lat, settings.map_center_lng]
      config.defaultZoom = settings.map_zoom_level
      config.playerProximityRadius = settings.player_proximityRadius
      config.globalBoundaryRadius = settings.global_boundary_radius
      config.updateInterval = 20000 // Force to 20 seconds as requested
      console.log("Game settings loaded from DB:", config)
    } else {
      console.warn("Using default settings.")
    }
    initGame()
  } else {
    showNotification("Erreur de connexion à la base de données. Veuillez rafraîchir la page et réessayer.", "error")
  }

  // Générer un code aléatoire au chargement de la page
  generateCode()
})

// Modify the refreshMapAndLists function to be more reliable
async function refreshMapAndLists() {
  console.log("Refreshing map and lists...")

  try {
    // Si nous avons un code de partie, charger les paramètres spécifiques à cette partie
    if (gameState.gameCode) {
      const gameSettings = await loadGameSettingsByCode(gameState.gameCode)
      if (gameSettings) {
        // Save old radius to detect changes
        const oldPlayerProximityRadius = config.playerProximityRadius
        const oldGlobalBoundaryRadius = config.globalBoundaryRadius

        // Update configuration
        config.playerProximityRadius = gameSettings.player_proximity_radius
        config.updateInterval = 20000 // Force to 20 seconds as requested

        // Mettre à jour la position centrale de cette partie
        const newCenterLat = gameSettings.map_center_lat
        const newCenterLng = gameSettings.map_center_lng
        const newRadius = gameSettings.global_boundary_radius

        // Vérifier si la position centrale ou le rayon ont changé
        const centerChanged =
          !gameState.gameCenterPosition ||
          gameState.gameCenterPosition.lat !== newCenterLat ||
          gameState.gameCenterPosition.lng !== newCenterLng

        const radiusChanged = oldGlobalBoundaryRadius !== newRadius

        if (centerChanged || radiusChanged) {
          // Mettre à jour la position centrale
          gameState.gameCenterPosition = {
            lat: newCenterLat,
            lng: newCenterLng,
          }

          config.globalBoundaryRadius = newRadius

          // Mettre à jour le cercle global
          updateGlobalBoundary(newCenterLat, newCenterLng, newRadius)

          console.log(`Cercle global mis à jour: [${newCenterLat}, ${newCenterLng}], rayon: ${newRadius}m`)
        }

        console.log("Game settings reloaded:", config)

        // If player proximity radius changed and player has a circle, update the radius
        if (oldPlayerProximityRadius !== config.playerProximityRadius && gameState.playerCircle) {
          gameState.playerCircle.setRadius(config.playerProximityRadius)
          console.log("Player circle radius updated:", config.playerProximityRadius)
        }

        // If player exists, check if their inZone status needs updating due to boundary change
        if (gameState.player && gameState.player.position && (centerChanged || radiusChanged)) {
          const distanceToCenter = gameState.map.distance(
            [gameState.player.position.lat, gameState.player.position.lng],
            [gameState.gameCenterPosition.lat, gameState.gameCenterPosition.lng],
          )
          const isOutside = distanceToCenter > config.globalBoundaryRadius

          // If inZone status would change due to boundary update, update the player position
          if (isOutside !== gameState.isOutsideBoundary) {
            updateCurrentPlayerPosition(gameState.player.position)
          }
        }
      } else {
        console.warn("Using default settings.")
      }
    }

    // Fetch latest player data based on game status
    let playerQuery = supabase.from("player").select("*").order("score", { ascending: false })

    // Si le jeu a commencé, filtrer par le code de partie
    if (gameState.gameStatus === "Started" && gameState.gameCode) {
      playerQuery = playerQuery.eq("gameCode", gameState.gameCode)
    }

    const { data: players, error: playersError } = await playerQuery

    if (playersError) {
      console.error("Error fetching players:", playersError)
      return
    }

    // Clear current lists
    gameState.players.clear()
    gameState.cats.clear()

    // Update lists and map
    players.forEach((player) => {
      if (gameState.player && player.id === gameState.player.id) {
        // Update current player's score without affecting their position
        const oldScore = gameState.player.score

        gameState.player = {
          ...gameState.player,
          score: player.score,
          inZone: player.inZone,
        }

        if (player.type === "cat" && !gameState.playerCatMarker) {
          addCatMarker(player)
        }
      } else if (player.type === "player") {
        gameState.players.set(player.id, { data: player })
      } else if (player.type === "cat") {
        gameState.cats.set(player.id, { data: player })
      }
    })

    updateMap()
    updatePlayersList()
    updateCatsList()
    updateCountBadges()
    // ⚠️ FIX affichage grande map au démarrage (dans le DOM)
    setTimeout(() => {
      gameState.map.invalidateSize()
    }, 100)
  } catch (error) {
    console.error("Error in refreshMapAndLists:", error)
  }
}

// Améliorer la fonction syncWithServer pour vérifier l'état des marqueurs
function syncWithServer() {
  if (!gameState.player) return

  console.log("Synchronizing with server...")

  // Mettre à jour la position du joueur sur le serveur
  updatePlayerPosition()
    .then(() => {
      // Rafraîchir la carte et les listes
      return refreshMapAndLists()
    })
    .then(() => {
      gameState.lastServerUpdate = Date.now()
      gameState.pendingPositionUpdate = false
    })
    .catch((error) => {
      console.error("Error during server sync:", error)
    })
}

// Fonction pour mettre à jour la position du joueur
async function updatePlayerPosition() {
  if (!gameState.player) return

  const updateData = {
    position: gameState.player.position,
    inZone: gameState.inZone,
    gameCode: gameState.gameCode,
  }

  // Ajouter position_circle si c'est un joueur
  if (gameState.player.type === "player" && gameState.player.position_circle) {
    updateData.position_circle = gameState.player.position_circle
  }

  const { error } = await supabase.from("player").update(updateData).eq("id", gameState.player.id)

  if (error) {
    console.error("Error updating position:", error)
    elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
    elements.statusText.textContent = "Connection error"
  } else {
    elements.statusIndicator.style.backgroundColor = "var(--success-color)"
    elements.statusText.textContent = "Connected"
  }
}

// Créer la table SQL pour les marqueurs
// CREATE TABLE game_markers (
//   id SERIAL PRIMARY KEY,
//   game_code TEXT NOT NULL,
//   lat FLOAT NOT NULL,
//   lng FLOAT NOT NULL,
//   radius INTEGER NOT NULL,
//   points INTEGER NOT NULL,
//   active BOOLEAN DEFAULT true,
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//   collected_by TEXT,
//   collected_at TIMESTAMP WITH TIME ZONE
// );

// Declare handleGameSettingsUpdate
function handleGameSettingsUpdate(payload) {
  const { eventType, new: newRecord } = payload

  if (eventType === "UPDATE" && newRecord.code === gameState.gameCode) {
    // Mettre à jour le statut local
    gameState.gameStatus = newRecord.status

    if (newRecord.status === "Started") {
      gameDuration = newRecord.duration || 60
      startGameTimer()

      // Cacher l'écran d'attente et afficher la carte
      elements.waitingScreen.style.display = "none"
      elements.mapPage.style.display = "block"
      if (elements.scoreModule) {
        elements.scoreModule.style.display = "block"
      }
      showNotification("La partie a commencé !", "success")
    }
  }
}

// Make sure to call startMarkerManagement when the game status changes to Started
function handleGameSettingsUpdate(payload) {
  const { eventType, new: newRecord } = payload

  if (eventType === "UPDATE" && newRecord.code === gameState.gameCode) {
    // Mettre à jour le statut local
    gameState.gameStatus = newRecord.status

    if (newRecord.status === "Started") {
      gameDuration = newRecord.duration || 60
      startGameTimer()

      // Cacher l'écran d'attente et afficher la carte
      elements.waitingScreen.style.display = "none"
      elements.mapPage.style.display = "block"
      if (elements.scoreModule) {
        elements.scoreModule.style.display = "block"
      }

      showNotification("La partie a commencé !", "success")
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const manualLocationToggle = document.getElementById("manual-location-toggle")
  const manualLocationFields = document.getElementById("manual-location-fields")
  const manualLatitudeInput = document.getElementById("manual-latitude")
  const manualLongitudeInput = document.getElementById("manual-longitude")

  // Afficher/masquer les champs latitude/longitude
  manualLocationToggle.addEventListener("click", () => {
    const isVisible = manualLocationFields.style.display === "block"
    manualLocationFields.style.display = isVisible ? "none" : "block"
  })

  // Mettre à jour la carte en temps réel lorsque les valeurs changent
  const updateMapWithManualLocation = () => {
    const manualLat = Number.parseFloat(manualLatitudeInput.value)
    const manualLng = Number.parseFloat(manualLongitudeInput.value)

    if (!isNaN(manualLat) && !isNaN(manualLng)) {
      // Mettre à jour les champs cachés pour le formulaire
      document.getElementById("game-latitude").value = manualLat
      document.getElementById("game-longitude").value = manualLng

      // Mettre à jour la carte si elle existe
      if (window.createMap && window.createMapCircle) {
        const newCenter = L.latLng(manualLat, manualLng)
        window.createMap.setView(newCenter, window.createMap.getZoom())

        // Mettre à jour le marqueur central
        window.createMap.eachLayer((layer) => {
          if (layer instanceof L.Marker) {
            layer.setLatLng(newCenter)
          }
        })

        // Mettre à jour le cercle
        window.createMapCircle.setLatLng(newCenter)
      }
    }
  }

  // Ajouter des écouteurs d'événements sur les champs de latitude et longitude
  manualLatitudeInput.addEventListener("input", updateMapWithManualLocation)
  manualLongitudeInput.addEventListener("input", updateMapWithManualLocation)

  // Prendre en compte les valeurs saisies dans les champs lors de la soumission du formulaire
  const createForm = document.getElementById("create-form")
  createForm.addEventListener("submit", (e) => {
    const manualLat = Number.parseFloat(manualLatitudeInput.value)
    const manualLng = Number.parseFloat(manualLongitudeInput.value)

    if (!isNaN(manualLat) && !isNaN(manualLng)) {
      document.getElementById("game-latitude").value = manualLat
      document.getElementById("game-longitude").value = manualLng
    }
  })
})

// Ajouter la fonction openAvatarModal
function openAvatarModal(playerId) {
  const modal = document.getElementById("avatar-modal")
  const emojiList = document.getElementById("emoji-list")
  modal.style.display = "flex"

  // Ajouter les émojis prédéfinis
  const emojis = [
    "😀",
    "😎",
    "🐱",
    "🐶",
    "🦊",
    "🐻",
    "🐼",
    "🐨",
    "🐯",
    "🦁",
    "🐸",
    "🐵",
    "🐔",
    "🐧",
    "🐦",
    "🐤",
    "🐣",
    "🐥",
    "🦄",
    "🐝",
    "🐞",
    "🐢",
  ]
  emojiList.innerHTML = ""
  emojis.forEach((emoji) => {
    const emojiButton = document.createElement("button")
    emojiButton.textContent = emoji
    emojiButton.style.fontSize = "24px"
    emojiButton.style.cursor = "pointer"
    emojiButton.addEventListener("click", () => {
      saveAvatar(playerId, emoji)
      modal.style.display = "none"
    })
    emojiList.appendChild(emojiButton)
  })

  // Gérer le bouton pour télécharger une image
  const uploadButton = document.getElementById("upload-image-button")
  uploadButton.addEventListener("click", () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.addEventListener("change", (event) => {
      const file = event.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => {
          saveAvatar(playerId, reader.result) // Base64
          modal.style.display = "none"
        }
        reader.readAsDataURL(file)
      }
    })
    input.click()
  })

  // Gérer le bouton pour prendre une photof
  const takePhotoButton = document.getElementById("take-photo-button")
  takePhotoButton.addEventListener("click", () => {
    // Implémentation pour prendre une photo (nécessite une API caméra)
    alert("Prendre une photo n'est pas encore implémenté.")
  })

  // Fermer la modal
  const closeButton = document.getElementById("close-avatar-modal")
  closeButton.addEventListener("click", () => {
    modal.style.display = "none"
  })
}

// Ajouter la fonction saveAvatar
async function saveAvatar(playerId, avatar) {
  try {
    const { error } = await supabase
      .from("player")
      .update({ image: avatar }) // Sauvegarde l'émoji ou l'image en base64
      .eq("id", playerId)

    if (error) {
      console.error("Erreur lors de la sauvegarde de l'avatar :", error)
      showNotification("Erreur lors de la sauvegarde de l'avatar.", "error")
    } else {
      showNotification("Avatar mis à jour avec succès !", "success")
      refreshMapAndLists() // Met à jour l'interface
    }
  } catch (err) {
    console.error("Erreur :", err)
  }
}

// Ajouter des écouteurs d'événements pour les boutons d'ajout d'image
document.getElementById("add-player-icon-join").addEventListener("click", (e) => {
  e.preventDefault()
  openImageSelector("player-name")
})

document.getElementById("add-player-icon-create").addEventListener("click", (e) => {
  e.preventDefault()
  openImageSelector("creator-name")
})

// Fonction pour ouvrir le sélecteur d'image
function openImageSelector(associatedInputId) {
  // Créer un élément input de type file
  const fileInput = document.createElement("input")
  fileInput.type = "file"
  fileInput.accept = "image/*"

  // Sur mobile, cela ouvrira automatiquement les options de caméra/galerie
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    fileInput.capture = "environment" // Permet de suggérer l'utilisation de la caméra
  }

  // Gérer la sélection de fichier
  fileInput.addEventListener("change", function () {
    if (this.files && this.files[0]) {
      const file = this.files[0]
      const reader = new FileReader()

      reader.onload = (e) => {
        // Convertir l'image en base64 (Data URL)
        const imageBase64 = e.target.result

        // Stocker l'image dans le tableau player
        const playerName = document.getElementById(associatedInputId).value

        // Si nous sommes en train de rejoindre ou créer une partie
        if (gameState.player) {
          // Mettre à jour le joueur existant
          gameState.player.image = imageBase64

          // Mettre à jour dans la base de données
          supabase
            .from("player")
            .update({ image: imageBase64 })
            .eq("id", gameState.player.id)
            .then(({ error }) => {
              if (error) {
                console.error("Erreur lors de la mise à jour de l'image:", error)
                showNotification("Erreur lors de l'enregistrement de l'image", "error")
              } else {
                showNotification("Image ajoutée avec succès", "success")
              }
            })
        } else {
          // Stocker temporairement l'image pour l'utiliser lors de la création/jonction
          sessionStorage.setItem("playerImage", imageBase64)
          showNotification("Image sélectionnée", "success")
        }
      }

      // Lire le fichier comme Data URL (base64)
      reader.readAsDataURL(file)
    }
  })

  // Déclencher le clic sur l'input file
  fileInput.click()
}

// Modifier la fonction joinGame pour inclure l'image
const originalJoinGame = joinGame
joinGame = async (name, type, position, gameCode) => {
  // Récupérer l'image stockée temporairement, si disponible
  const playerImage = sessionStorage.getItem("playerImage")

  // Appeler la fonction originale
  const result = await originalJoinGame(name, type, position, gameCode)

  // Si une image a été sélectionnée, l'ajouter au joueur
  if (playerImage && gameState.player) {
    gameState.player.image = playerImage

    // Mettre à jour dans la base de données
    supabase
      .from("player")
      .update({ image: playerImage })
      .eq("id", gameState.player.id)
      .then(({ error }) => {
        if (error) {
          console.error("Erreur lors de la mise à jour de l'image:", error)
        } else {
          // Effacer l'image temporaire
          sessionStorage.removeItem("playerImage")
        }
      })
  }

  return result
}

// Ajouter cette fonction pour mettre à jour l'affichage du code de partie dans l'écran d'attente
function updateWaitingScreenGameCode() {
  const waitingGameCodeElement = document.getElementById("waiting-game-code")
  if (waitingGameCodeElement && gameState.gameCode) {
    waitingGameCodeElement.textContent = gameState.gameCode
  }
}
