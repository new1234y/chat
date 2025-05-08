// Initialize Supabase client
const supabaseUrl = "https://oadwuacpouppdynssxrw.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHd1YWNwb3VwcGR5bnNzeHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzMyMTEsImV4cCI6MjA1NjI0OTIxMX0.MF7Ijl8SHm7wzKt8XiD3EQVqikLaVqkhPAYkqiJHisA"
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Modifier la configuration pour inclure les paramètres des marqueurs
const config = {
  defaultCenter: [48.8566, 2.3522],
  defaultZoom: 15,
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
  markers: new Map(), // To store active markers
  markerSubscription: null, // For real-time updates on markers
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
  gameStatusBadge: document.getElementById("game-status-badge"), // Élément pour afficher le statut
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

// Ajouter la fonction updateScoreDisplay qui est appelée mais non définie
function updateScoreDisplay() {
  if (elements.playerScore && gameState.player) {
    elements.playerScore.textContent = `Score: ${Math.round(gameState.player.score)}`
    elements.playerScore.style.display = "block"
  }
}

// Ajouter la fonction startScoreInterval qui est appelée mais non définie
function startScoreInterval() {
  // Update score at a reasonable interval
  scoreInterval = setInterval(updateScore, config.updateInterval)
}

// Ajouter la fonction updateScore qui est appelée mais non définie
async function updateScore() {
  if (!gameState.player || gameState.player.type !== "player") return

  const now = Date.now()
  const dt = (now - gameState.lastScoreUpdate) / 1000 // Time difference in seconds
  gameState.lastScoreUpdate = now

  // Check if there are cats on the map
  if (gameState.cats.size === 0) {
    // No cats on the map, no points to add
    console.log("No cats on the map, no points added")
    return
  }

  let maxFactor = 0
  let nearCat = false

  // Check all cats to find the closest
  gameState.cats.forEach((cat) => {
    if (!cat.data || !cat.data.position || !gameState.player.position) return

    // Si le jeu a commencé, ignorer les chats qui ne sont pas dans la même partie
    if (gameState.gameStatus === "Started" && cat.data.gameCode !== gameState.gameCode) {
      return
    }

    const distance = gameState.map.distance(
      [gameState.player.position.lat, gameState.player.position.lng],
      [cat.data.position.lat, cat.data.position.lng],
    )

    // Only if player is within 150 meters of a cat
    if (distance <= 150) {
      nearCat = true
      // The closer the player, the higher the factor (1 when distance = 0, 0 when distance = 150)
      const factor = (150 - distance) / 150
      maxFactor = Math.max(maxFactor, factor)
      console.log(`Near a cat at ${Math.round(distance)}m, factor: ${factor.toFixed(2)}`)
    }
  })

  // Only add points if player is near a cat
  if (nearCat) {
    const baseScore = 10 // Points per second when right next to a cat
    const scoreIncrement = baseScore * maxFactor * dt

    gameState.player.score += scoreIncrement
    console.log(`Points added: ${scoreIncrement.toFixed(2)}, factor: ${maxFactor.toFixed(2)}, time: ${dt.toFixed(2)}s`)

    // Update score in database
    const { error } = await supabase
      .from("player")
      .update({
        score: Math.round(gameState.player.score),
        gameCode: gameState.gameCode,
      })
      .eq("id", gameState.player.id)

    if (error) {
      console.error("Error updating score:", error)
    } else {
      updateScoreDisplay()
    }
  } else {
    console.log("Not close enough to a cat to earn points")
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

// Déclarer les fonctions manquantes
function updateGameStatusDisplay() {
  // Implémentez la logique pour mettre à jour l'affichage du statut du jeu
  // en utilisant gameState.gameStatus et elements.gameStatusBadge
  if (gameState.gameStatus === "Pending") {
    elements.gameStatusBadge.textContent = "En attente"
    elements.gameStatusBadge.className = "status-badge pending"
  } else if (gameState.gameStatus === "Started") {
    elements.gameStatusBadge.textContent = "En cours"
    elements.gameStatusBadge.className = "status-badge started"
  } else if (gameState.gameStatus === "Finished") {
    elements.gameStatusBadge.textContent = "Terminée"
    elements.gameStatusBadge.className = "status-badge finished"
  } else {
    elements.gameStatusBadge.textContent = "Inconnu"
    elements.gameStatusBadge.className = "status-badge unknown"
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

  // S'assurer que l'écran d'attente est visible quand le statut est "Pending"
  updateGameStatusDisplay()
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

// Fonction pour changer d'onglet
function switchTabFn(tabId) {
  // First check if the tab ID is valid
  if (!tabId) {
    console.warn("Invalid tab ID provided")
    return
  }

  // Get the tab button and content elements
  const tabButton = document.querySelector(`[data-tab="${tabId}"]`)
  const tabContent = document.getElementById(tabId)

  // Check if elements exist before accessing their properties
  if (!tabButton || !tabContent) {
    console.warn(`Tab ${tabId} not found`)
    return
  }

  // Safely deactivate all tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn) btn.classList.remove("active")
  })

  document.querySelectorAll(".tab-content").forEach((content) => {
    if (content) content.classList.remove("active")
  })

  // Activate the selected tab
  tabButton.classList.add("active")
  tabContent.classList.add("active")

  // Handle map tab specifically
  if (tabId === "map-tab") {
    if (elements.mapPage) elements.mapPage.style.display = "block"
    if (elements.playersPage) elements.playersPage.style.display = "none"

    // Refresh map size
    if (gameState.map) {
      setTimeout(() => {
        gameState.map.invalidateSize()
      }, 100)
    }
  }
  // Handle players tab
  else if (tabId === "players-tab") {
    if (elements.mapPage) elements.mapPage.style.display = "none"
    if (elements.playersPage) elements.playersPage.style.display = "block"
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
        document.getElementById("game-latitude").value = position.coords.latitude
        document.getElementById("game-longitude").value = position.coords.longitude
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

  // Map click for movement (only if player is joined)
  gameState.map.on("click", (e) => {
    if (gameState.player) {
      // Le déplacement manuel n'est plus autorisé, utilisation de la géolocalisation
      showNotification("Le déplacement manuel n'est plus autorisé. Utilisation de la géolocalisation.", "info")
    } else {
      // If player hasn't joined yet, show a message
      showNotification("Veuillez d'abord rejoindre la partie !", "warning")
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
    useLocationBtn.addEventListener("click", useCurrentLocation)
  }
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
      updateScoreDisplay()
    }
  }
}

// Handle create game form submission
async function handleCreateGame(e) {
  e.preventDefault()

  const name = elements.creatorName.value.trim()
  const gameCode = elements.newGameCode.value.trim().toUpperCase()
  const duration = Number.parseInt(elements.gameDuration.value)
  const boundaryRadius = Number.parseInt(elements.boundaryRadius.value)
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

    // Subscribe to marker updates
    subscribeToMarkerUpdates()

    // If game is already started, load markers
    if (gameState.gameStatus === "Started") {
      loadGameMarkers(gameCode)
    }

    // Update lists
    updatePlayersList()
    updateCatsList()
    updateCountBadges()

    // Mettre à jour le compteur de joueurs dans la même partie
    updateSameGamePlayersCount()

    // Start score update interval using config updateInterval
    startScoreInterval()

    // Update UI based on player type
    if (type === "player") {
      elements.switchToCatContainer.style.display = "block"
    }

    // Show quit button
    elements.quitGameBtn.style.display = "block"

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

    // Mettre à jour l'affichage du statut
    updateGameStatusDisplay()

    // Actualiser immédiatement la carte pour afficher tous les joueurs
    refreshMapAndLists()

    console.log("Successfully joined game")

    // Vérifier si le joueur est le créateur et afficher le bouton de démarrage si nécessaire
    checkIfPlayerIsCreator()
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

    // Create markers for the game
    if (gameState.gameCenterPosition) {
      const markersCreated = await createGameMarkers(
        gameState.gameCode,
        gameState.gameCenterPosition,
        config.globalBoundaryRadius,
      )

      if (!markersCreated) {
        showNotification("Erreur lors de la création des marqueurs", "error")
        return
      }
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

        // Load markers
        loadGameMarkers(gameState.gameCode)
      })
      .catch((error) => {
        console.error("Erreur lors du démarrage de la partie:", error)
        showNotification("Erreur lors du démarrage de la partie", "error")
      })
  })
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

            // Check if player can collect any markers
            if (gameState.gameStatus === "Started") {
              checkMarkerCollection()
            }
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
})

// Fix the QR code button functionality
document.addEventListener("DOMContentLoaded", () => {
  // QR code setup
  const qrButton = document.getElementById("qr-code-button")
  const qrModal = document.getElementById("qr-code-modal")
  const closeModal = document.querySelector(".close")
  const codeToLeave = document.getElementById("code-to-leave")

  if (qrButton && qrModal && closeModal) {
    qrButton.addEventListener("click", () => {
      if (gameState.gameCode) {
        // Generate QR code with game URL
        const gameUrl = `${window.location.origin}${window.location.pathname}?code=${gameState.gameCode}`

        // Display game code
        if (codeToLeave) {
          codeToLeave.textContent = `Code de partie: ${gameState.gameCode}`
        }

        // Generate QR code
        const qrContainer = document.getElementById("qr-code")
        if (qrContainer) {
          qrContainer.innerHTML = ""
          // QRCode variable is undeclared. Please fix the import or declare the variable before using it.
          new QRCode(qrContainer, {
            text: gameUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H,
          })
        }

        // Show modal
        qrModal.style.display = "flex"
      } else {
        showNotification("Rejoignez d'abord une partie pour générer un QR code", "warning")
      }
    })

    // Close modal when clicking the X
    closeModal.addEventListener("click", () => {
      qrModal.style.display = "none"
    })

    // Close modal when clicking outside
    window.addEventListener("click", (event) => {
      if (event.target === qrModal) {
        qrModal.style.display = "none"
      }
    })
  }
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

        // Update score display if it changed
        if (oldScore !== player.score) {
          updateScoreDisplay()
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
    subscribeToMarkerUpdates()
    loadGameMarkers(gameState.gameCode)
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

    // Mettre à jour l'affichage du statut
    updateGameStatusDisplay()

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

// Fonction pour créer les marqueurs de jeu, un par un
async function createGameMarkers(gameCode, centerPosition, boundaryRadius) {
  try {
    // Créer un premier marqueur, les autres seront créés progressivement
    const marker = generateRandomMarker(gameCode, centerPosition, boundaryRadius)

    // Insérer le premier marqueur dans la base de données
    const { data, error } = await supabase.from("game_markers").insert([marker])

    if (error) {
      console.error("Erreur lors de la création du marqueur:", error)
      return false
    }

    console.log("Premier marqueur créé pour la partie:", gameCode)

    // Planifier la création des autres marqueurs avec un délai entre chaque
    scheduleNextMarker(gameCode, centerPosition, boundaryRadius, 1)

    return true
  } catch (error) {
    console.error("Erreur dans createGameMarkers:", error)
    return false
  }
}

// Fonction pour planifier la création du prochain marqueur
function scheduleNextMarker(gameCode, centerPosition, boundaryRadius, count) {
  if (count >= 10) return // Maximum 10 marqueurs

  // Délai aléatoire entre 30 et 90 secondes pour le prochain marqueur
  const delay = 30000 + Math.random() * 60000

  setTimeout(async () => {
    const marker = generateRandomMarker(gameCode, centerPosition, boundaryRadius)

    const { error } = await supabase.from("game_markers").insert([marker])

    if (error) {
      console.error("Erreur lors de la création du marqueur:", error)
    } else {
      console.log(`Marqueur #${count + 1} créé pour la partie ${gameCode}`)
      // Planifier le prochain marqueur
      scheduleNextMarker(gameCode, centerPosition, boundaryRadius, count + 1)
    }
  }, delay)
}

// Fonction pour générer un marqueur aléatoire
function generateRandomMarker(gameCode, centerPosition, boundaryRadius) {
  // Générer une position aléatoire dans la zone de jeu
  const angle = Math.random() * Math.PI * 2
  const distance = Math.random() * (boundaryRadius * 0.8) // Garder dans 80% du rayon
  const markerLat = centerPosition.lat + (Math.sin(angle) * distance) / 111000
  const markerLng =
    centerPosition.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((centerPosition.lat * Math.PI) / 180))

  // Rayon aléatoire entre 50 et 200 mètres
  const radius = Math.floor(50 + Math.random() * 150)

  // Points aléatoires entre 50 et 300
  const points = Math.floor(50 + Math.random() * 250)

  // Temps de capture aléatoire entre 10 et 60 secondes
  const captureTime = Math.floor(10 + Math.random() * 50)

  return {
    game_code: gameCode,
    lat: markerLat,
    lng: markerLng,
    radius: radius,
    points: points,
    capture_time: captureTime, // Temps en secondes pour capturer
    active: true,
  }
}

// Fonction pour ajouter un marqueur sur la carte
function addMarkerToMap(marker) {
  // Créer un cercle pour le marqueur
  const markerCircle = L.circle([marker.lat, marker.lng], {
    radius: marker.radius,
    color: "#f39c12",
    fillColor: "#f39c12",
    fillOpacity: 0.4,
    weight: 2,
    className: "game-marker",
  }).addTo(gameState.map)

  // Stocker le marqueur avec son cercle
  gameState.markers.set(marker.id, {
    data: marker,
    circle: markerCircle,
    captureProgress: 0,
    captureStartTime: null,
    captureInterval: null,
  })

  // Ajouter un popup avec les informations
  markerCircle.bindPopup(`Marqueur: ${marker.points} points<br>Temps de capture: ${marker.capture_time}s`)
}

// Fonction pour vérifier si le joueur peut collecter des marqueurs
function checkMarkerCollection() {
  if (!gameState.player || !gameState.player.position || gameState.player.type !== "player") return

  let insideAnyMarker = false

  gameState.markers.forEach((marker, markerId) => {
    const distance = gameState.map.distance(
      [gameState.player.position.lat, gameState.player.position.lng],
      [marker.data.lat, marker.data.lng],
    )

    // Si le joueur est dans le rayon du marqueur
    if (distance <= marker.data.radius) {
      insideAnyMarker = true

      // Si c'est la première fois qu'on entre dans ce marqueur
      if (marker.captureStartTime === null) {
        marker.captureStartTime = Date.now()
        marker.captureProgress = 0

        // Créer ou mettre à jour la barre de progression
        showMarkerProgressBar(marker)

        // Démarrer l'intervalle de mise à jour de la progression
        marker.captureInterval = setInterval(() => {
          updateMarkerCaptureProgress(markerId)
        }, 100) // Mise à jour toutes les 100ms
      }
    } else {
      // Si on sort du marqueur, réinitialiser la progression
      if (marker.captureStartTime !== null) {
        marker.captureStartTime = null
        marker.captureProgress = 0

        // Cacher la barre de progression
        hideMarkerProgressBar()

        // Arrêter l'intervalle
        if (marker.captureInterval) {
          clearInterval(marker.captureInterval)
          marker.captureInterval = null
        }
      }
    }
  })

  // Si on n'est dans aucun marqueur, cacher la barre de progression
  if (!insideAnyMarker) {
    hideMarkerProgressBar()
  }
}

// Fonction pour mettre à jour la progression de capture d'un marqueur
async function updateMarkerCaptureProgress(markerId) {
  const marker = gameState.markers.get(markerId)
  if (!marker || marker.captureStartTime === null) return

  // Calculer la progression
  const elapsedTime = (Date.now() - marker.captureStartTime) / 1000 // en secondes
  const progress = Math.min(100, (elapsedTime / marker.data.capture_time) * 100)
  marker.captureProgress = progress

  // Mettre à jour la barre de progression
  updateMarkerProgressBar(progress, marker.data.capture_time - elapsedTime)

  // Si la capture est terminée
  if (progress >= 100) {
    // Arrêter l'intervalle
    clearInterval(marker.captureInterval)
    marker.captureInterval = null

    // Cacher la barre de progression
    hideMarkerProgressBar()

    // Supprimer le marqueur de la carte
    if (marker.circle) {
      gameState.map.removeLayer(marker.circle)
    }

    // Supprimer du tableau local
    gameState.markers.delete(markerId)

    // Mettre à jour le marqueur dans la base de données
    const { error } = await supabase
      .from("game_markers")
      .update({
        active: false,
        collected_by: gameState.player.name,
        collected_at: new Date().toISOString(),
      })
      .eq("id", markerId)

    if (error) {
      console.error("Erreur lors de la mise à jour du marqueur:", error)
      return
    }

    // Ajouter des points au joueur
    gameState.player.score += marker.data.points

    // Mettre à jour le score du joueur dans la base de données
    await supabase
      .from("player")
      .update({
        score: Math.round(gameState.player.score),
      })
      .eq("id", gameState.player.id)

    // Mettre à jour l'affichage du score
    updateScoreDisplay()

    // Afficher une notification
    showNotification(`Marqueur collecté ! +${marker.data.points} points`, "success")
  }
}

// Fonction pour afficher la barre de progression de capture
function showMarkerProgressBar(marker) {
  // Créer la barre de progression si elle n'existe pas
  if (!elements.markerProgress.parentNode) {
    elements.markerProgress.className = "marker-progress"
    elements.markerProgress.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar"></div>
      </div>
      <div class="progress-text">Capture en cours: 0%</div>
    `
    document.body.appendChild(elements.markerProgress)
  }

  // Afficher la barre
  elements.markerProgress.style.display = "block"

  // Initialiser la progression
  updateMarkerProgressBar(0, marker.data.capture_time)
}

// Fonction pour mettre à jour la barre de progression
function updateMarkerProgressBar(progress, timeLeft) {
  if (!elements.markerProgress) return

  const progressBar = elements.markerProgress.querySelector(".progress-bar")
  const progressText = elements.markerProgress.querySelector(".progress-text")

  if (progressBar && progressText) {
    progressBar.style.width = `${progress}%`
    progressText.textContent = `Capture en cours: ${Math.round(progress)}% (${Math.ceil(timeLeft)}s)`
  }
}

// Fonction pour cacher la barre de progression
function hideMarkerProgressBar() {
  if (elements.markerProgress) {
    elements.markerProgress.style.display = "none"
  }
}

// This function needs to be modified to check the display_at and expire_at times
function loadGameMarkers(gameCode) {
  try {
    // Modified query to only get markers that should be displayed now
    // Only get markers where:
    // 1. They belong to the current game
    // 2. They are active
    // 3. Their display time has arrived (display_at <= now)
    // 4. They haven't expired yet (expire_at > now or expire_at is null)
    const now = new Date().toISOString()

    supabase
      .from("game_markers")
      .select("*")
      .eq("game_code", gameCode)
      .eq("active", true)
      .lte("display_at", now)
      .or(`expire_at.gt.${now},expire_at.is.null`)
      .then(({ data, error }) => {
        if (error) {
          console.error("Erreur lors du chargement des marqueurs:", error)
          return
        }

        if (data) {
          // Clear existing markers first
          gameState.markers.forEach((marker, id) => {
            if (marker.circle) {
              gameState.map.removeLayer(marker.circle)
            }
            if (marker.captureInterval) {
              clearInterval(marker.captureInterval)
            }
          })
          gameState.markers.clear()

          // Add the markers that should be visible now
          data.forEach((marker) => {
            addMarkerToMap(marker)
          })

          console.log(`Loaded ${data.length} active markers for game ${gameCode}`)
        }
      })
  } catch (error) {
    console.error("Erreur dans loadGameMarkers:", error)
  }
}

// Modify the handleMarkerUpdate function to check time constraints
function handleMarkerUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload
  const now = new Date()

  // Ne traiter que les marqueurs de la partie en cours
  if (newRecord && newRecord.game_code !== gameState.gameCode) return
  if (oldRecord && oldRecord.game_code !== gameState.gameCode) return

  switch (eventType) {
    case "INSERT":
      // Only add the marker if it should be displayed now
      if (newRecord.display_at && new Date(newRecord.display_at) > now) {
        console.log(`Marker ${newRecord.id} will be displayed later at ${newRecord.display_at}`)
        // Schedule the marker to appear when it's time
        scheduleMarkerAppearance(newRecord)
      } else if (!newRecord.expire_at || new Date(newRecord.expire_at) > now) {
        // Add the marker if it's time to display and hasn't expired
        addMarkerToMap(newRecord)
      }
      break

    case "UPDATE":
      // If the marker is no longer active or has expired, remove it
      if (newRecord.active === false || (newRecord.expire_at && new Date(newRecord.expire_at) <= now)) {
        if (gameState.markers.has(newRecord.id)) {
          const marker = gameState.markers.get(newRecord.id)

          // Arrêter l'intervalle de capture si nécessaire
          if (marker.captureInterval) {
            clearInterval(marker.captureInterval)
            marker.captureInterval = null
          }

          // Supprimer le cercle de la carte
          if (marker.circle) {
            gameState.map.removeLayer(marker.circle)
          }

          // Supprimer du tableau local
          gameState.markers.delete(newRecord.id)

          // Si collecté par quelqu'un d'autre, afficher une notification
          if (newRecord.collected_by && gameState.player && newRecord.collected_by !== gameState.player.name) {
            showNotification(`${newRecord.collected_by} a collecté un marqueur !`, "info")
          }
        }
      }
      break

    case "DELETE":
      // Supprimer le marqueur supprimé
      if (gameState.markers.has(oldRecord.id)) {
        const marker = gameState.markers.get(oldRecord.id)

        // Arrêter l'intervalle de capture si nécessaire
        if (marker.captureInterval) {
          clearInterval(marker.captureInterval)
          marker.captureInterval = null
        }

        // Supprimer le cercle de la carte
        if (marker.circle) {
          gameState.map.removeLayer(marker.circle)
        }

        // Supprimer du tableau local
        gameState.markers.delete(oldRecord.id)
      }
      break
  }
}

// Add a new function to schedule marker appearance
function scheduleMarkerAppearance(marker) {
  const now = new Date()
  const displayTime = new Date(marker.display_at)
  const timeUntilDisplay = displayTime - now

  if (timeUntilDisplay <= 0) {
    // If it's already time to display, add it immediately
    addMarkerToMap(marker)
    return
  }

  // Schedule the marker to appear at the right time
  setTimeout(() => {
    // Check if the game is still active before adding the marker
    if (gameState.gameStatus === "Started" && gameState.gameCode === marker.game_code) {
      // Check if the marker hasn't expired yet
      const currentTime = new Date()
      if (!marker.expire_at || new Date(marker.expire_at) > currentTime) {
        // Fetch the latest marker data to ensure it's still active
        supabase
          .from("game_markers")
          .select("*")
          .eq("id", marker.id)
          .eq("active", true)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              addMarkerToMap(data)
              showNotification("Un nouveau marqueur est apparu sur la carte !", "info")
            }
          })
      }
    }
  }, timeUntilDisplay)

  console.log(`Scheduled marker ${marker.id} to appear in ${Math.round(timeUntilDisplay / 1000)} seconds`)
}

// Add a function to check for marker expiration
function checkMarkerExpiration() {
  const now = new Date()

  gameState.markers.forEach((marker, id) => {
    if (marker.data.expire_at && new Date(marker.data.expire_at) <= now) {
      // Marker has expired, remove it
      if (marker.captureInterval) {
        clearInterval(marker.captureInterval)
        marker.captureInterval = null
      }

      if (marker.circle) {
        gameState.map.removeLayer(marker.circle)
      }

      gameState.markers.delete(id)
      console.log(`Marker ${id} expired and was removed`)
    }
  })
}

// Modify the createGameMarkers function to distribute markers over time
async function createGameMarkers(gameCode, centerPosition, boundaryRadius) {
  try {
    // Get the game duration to distribute markers
    const { data: gameSettings, error: settingsError } = await supabase
      .from("game_settings")
      .select("duration")
      .eq("code", gameCode)
      .single()

    if (settingsError) {
      console.error("Erreur lors de la récupération des paramètres de jeu:", settingsError)
      return false
    }

    const gameDuration = gameSettings.duration || 60 // Default to 60 minutes
    const totalMarkers = 10 // Total number of markers to create
    const intervalMinutes = Math.floor(gameDuration / totalMarkers)

    // Create the first marker immediately
    const now = new Date()
    const gameEndTime = new Date(now.getTime() + gameDuration * 60000)

    // Create the first marker with immediate display
    const firstMarker = generateRandomMarker(gameCode, centerPosition, boundaryRadius)
    firstMarker.display_at = now.toISOString()
    firstMarker.expire_at = new Date(now.getTime() + intervalMinutes * 60000).toISOString()

    // Insert the first marker
    const { error } = await supabase.from("game_markers").insert([firstMarker])

    if (error) {
      console.error("Erreur lors de la création du marqueur:", error)
      return false
    }

    console.log("Premier marqueur créé pour la partie:", gameCode)

    // Schedule creation of remaining markers
    for (let i = 1; i < totalMarkers; i++) {
      const displayTime = new Date(now.getTime() + i * intervalMinutes * 60000)
      const expireTime = new Date(displayTime.getTime() + intervalMinutes * 60000)

      // Don't create markers that would appear after game end
      if (displayTime >= gameEndTime) break

      const marker = generateRandomMarker(gameCode, centerPosition, boundaryRadius)
      marker.display_at = displayTime.toISOString()
      marker.expire_at = expireTime > gameEndTime ? gameEndTime.toISOString() : expireTime.toISOString()

      // Insert the marker with scheduled display/expire times
      supabase
        .from("game_markers")
        .insert([marker])
        .then(({ error }) => {
          if (error) {
            console.error(`Erreur lors de la création du marqueur #${i + 1}:`, error)
          } else {
            console.log(
              `Marqueur #${i + 1} créé pour la partie ${gameCode}, apparaîtra à ${displayTime.toLocaleTimeString()}`,
            )
          }
        })
    }

    return true
  } catch (error) {
    console.error("Erreur dans createGameMarkers:", error)
    return false
  }
}

// Add a periodic check for marker expiration and new markers
function startMarkerManagement() {
  // Check for expired markers every 30 seconds
  setInterval(checkMarkerExpiration, 30000)

  // Refresh markers from the database every 2 minutes
  setInterval(() => {
    if (gameState.gameStatus === "Started" && gameState.gameCode) {
      loadGameMarkers(gameState.gameCode)
    }
  }, 120000)
}

// Call this function when the game starts
function startGame() {
  if (!gameState.player || !gameState.gameCode) return

  // Vérifier si le joueur est le créateur
  checkIfPlayerIsCreator().then(async (isCreator) => {
    if (!isCreator) {
      showNotification("Seul le créateur de la partie peut la démarrer", "error")
      return
    }

    // Create markers for the game with time distribution
    if (gameState.gameCenterPosition) {
      const markersCreated = await createGameMarkers(
        gameState.gameCode,
        gameState.gameCenterPosition,
        config.globalBoundaryRadius,
      )

      if (!markersCreated) {
        showNotification("Erreur lors de la création des marqueurs", "error")
        return
      }
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

        // Start marker management
        startMarkerManagement()

        // Load initial markers
        loadGameMarkers(gameState.gameCode)
      })
      .catch((error) => {
        console.error("Erreur lors du démarrage de la partie:", error)
        showNotification("Erreur lors du démarrage de la partie", "error")
      })
  })
}

// Make sure to call startMarkerManagement when the game status changes to Started
function handleGameSettingsUpdate(payload) {
  const { eventType, new: newRecord } = payload

  if (eventType === "UPDATE" && newRecord.code === gameState.gameCode) {
    // Mettre à jour le statut local
    gameState.gameStatus = newRecord.status

    // Mettre à jour l'affichage du statut
    updateGameStatusDisplay()

    if (newRecord.status === "Started") {
      gameDuration = newRecord.duration || 60
      startGameTimer()

      // Cacher l'écran d'attente et afficher la carte
      elements.waitingScreen.style.display = "none"
      elements.mapPage.style.display = "block"
      if (elements.scoreModule) {
        elements.scoreModule.style.display = "block"
      }

      // Start marker management when game starts
      startMarkerManagement()

      // Load initial markers
      loadGameMarkers(gameState.gameCode)

      showNotification("La partie a commencé !", "success")
    }
  }
}

// Subscribe to marker updates
function subscribeToMarkerUpdates() {
  gameState.markerSubscription = supabase
    .channel("game_markers")
    .on("postgres_changes", { event: "*", schema: "public", table: "game_markers" }, (payload) =>
      handleMarkerUpdate(payload),
    )
    .subscribe()
}
