// Initialize Supabase client
const supabaseUrl = "https://oadwuacpouppdynssxrw.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHd1YWNwb3VwcGR5bnNzeHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzMyMTEsImV4cCI6MjA1NjI0OTIxMX0.MF7Ijl8SHm7wzKt8XiD3EQVqikLaVqkhPAYkqiJHisA"
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Config par défaut (au cas où le chargement de la DB planterait)
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

// Game state
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
}

const sunIcon = `<svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#ffd43b"><circle r="5" cy="12" cx="12"></circle><path id="sun-icon" d="m21 13h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm-17 0h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm13.66-5.66a1 1 0 0 1 -.66-.29 1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1 -.75.29zm-12.02 12.02a1 1 0 0 1 -.71-.29 1 1 0 0 1 0-1.41l.71-.66a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1 -.7.24zm6.36-14.36a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm0 17a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm-5.66-14.66a1 1 0 0 1 -.7-.29l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.29zm12.02 12.02a1 1 0 0 1 -.7-.29l-.66-.71a1 1 0 0 1 1.36-1.36l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.24z"></path></g></svg>`

const moonIcon = `<svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="m223.5 32c-123.5 0-223.5 100.3-223.5 224s100   viewBox="0 0 384 512"><path d="m223.5 32c-123.5 0-223.5 100.3-223.5 224s100 224 223.5 224c60.6 0 115.5-24.2 155.8-63.4 5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6-96.9 0-175.5-78.8-175.5-176 0-65.8 36-123.1 89.3-153.3 6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z"></path></svg>`

// Ajoutez ces variables globales
let scoreInterval
let gameDuration = 60 // Durée par défaut en minutes
let gameTimerInterval
const pointsToAdd = 0

// Declare L before using it
const L = window.L

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
function switchTab(tabId) {
  // Désactiver tous les onglets
  elements.tabButtons.forEach((btn) => {
    btn.classList.remove("active")
  })

  elements.tabContents.forEach((content) => {
    content.classList.remove("active")
  })

  // Activer l'onglet sélectionné
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active")
  document.getElementById(tabId).classList.add("active")
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
      switchTab(tabId)
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
      movePlayer(e.latlng)
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
    switchTab("map")
  })

  elements.playersTab.addEventListener("click", () => {
    switchTab("players")
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
  } else if (tabName === "players") {
    elements.playersPage.classList.add("active")
    elements.mapPage.classList.remove("active")
    elements.playersTab.classList.add("active")
    elements.mapTab.classList.remove("active")

    // Affiche l'onglet des joueurs et cache celui de la carte
    elements.playersPage.style.display = "block" // Montre l'onglet des joueurs

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
      switchTab("create-tab")

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
// Modifier la fonction joinGame pour actualiser la carte immédiatement
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

  // Charger les paramètres spécifiques à cette partie si ce n'est pas déjà fait
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

  // Create player object with inZone status and game code
  const playerData = {
    id: playerId,
    name: name,
    type: type,
    position: position,
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
    } else {
      // Sinon, vérifier régulièrement si le jeu a démarré
      checkGameStatusPeriodically()
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

// Fonction pour vérifier périodiquement le statut de la partie
function checkGameStatusPeriodically() {
  // Mettre à jour le compteur immédiatement
  updateSameGamePlayersCount()

  const interval = setInterval(async () => {
    if (!gameState.gameCode) {
      clearInterval(interval)
      return
    }

    // Mettre à jour le compteur de joueurs
    updateSameGamePlayersCount()

    const gameResult = await checkGameStatus(gameState.gameCode)
    if (gameResult.exists && gameResult.status !== gameState.gameStatus) {
      gameState.gameStatus = gameResult.status
      updateGameStatusDisplay()

      if (gameResult.status === "Started") {
        // La partie vient de démarrer
        gameDuration = gameResult.duration || 60
        startGameTimer()
        clearInterval(interval)

        // Rafraîchir la carte et les listes
        refreshMapAndLists()

        // Notification sans alert
        showNotification("La partie a commencé !", "success")
      }
    }
  }, 5000) // Vérifier toutes les 5 secondes
}

// Fonction pour démarrer le chronomètre de jeu
function startGameTimer() {
  if (gameTimerInterval) {
    clearInterval(gameTimerInterval)
  }

  // Obtenir la date de début et calculer la date de fin
  const checkGameEndTime = async () => {
    try {
      const { data: game, error } = await supabase
        .from("game_settings")
        .select("date, duration")
        .eq("code", gameState.gameCode)
        .single()

      if (error) {
        console.error("Erreur lors de la récupération de la date de début :", error)
        return
      }

      const startTime = new Date(game.date)
      const duration = game.duration || gameDuration
      const endTime = new Date(startTime.getTime() + duration * 60000)
      const now = new Date()

      // Calculer le temps restant
      const remainingTime = endTime - now

      if (remainingTime <= 0) {
        // La partie est terminée
        showNotification("La partie est terminée !", "info")
        clearInterval(gameTimerInterval)

        // Déconnecter le joueur
        if (gameState.player) {
          quitGame()
        }
      } else {
        // Mettre à jour l'affichage du temps restant
        const minutes = Math.floor(remainingTime / 60000)
        const seconds = Math.floor((remainingTime % 60000) / 1000)
        const timeDisplay = document.getElementById("game-time")
        if (timeDisplay) {
          timeDisplay.textContent = `Temps restant: ${minutes}:${seconds < 10 ? "0" : ""}${seconds}`
        }
      }
    } catch (error) {
      console.error("Erreur lors de la vérification du temps de jeu :", error)
    }
  }

  // Vérifier immédiatement
  checkGameEndTime()

  // Puis vérifier toutes les secondes
  gameTimerInterval = setInterval(checkGameEndTime, 1000)
}

// Fonction pour vérifier si le joueur actuel est le créateur de la partie
async function checkIfPlayerIsCreator() {
  if (!gameState.player || !gameState.gameCode) return false

  try {
    const { data, error } = await supabase
      .from("game_settings")
      .select("is_creator")
      .eq("code", gameState.gameCode)
      .single()

    if (error) {
      console.error("Erreur lors de la vérification du créateur:", error)
      return false
    }

    const isCreator = data.is_creator === gameState.player.name

    // Afficher ou masquer le bouton de démarrage selon le statut
    const startGameButton = document.getElementById("start-game-button")
    if (startGameButton) {
      if (isCreator && gameState.gameStatus === "Pending") {
        startGameButton.style.display = "block"
      } else {
        startGameButton.style.display = "none"
      }
    }

    return isCreator
  } catch (error) {
    console.error("Erreur lors de la vérification du créateur:", error)
    return false
  }
}

// Fonction pour démarrer la partie
async function startGame() {
  if (!gameState.player || !gameState.gameCode) return

  try {
    // Vérifier si le joueur est le créateur
    const isCreator = await checkIfPlayerIsCreator()

    if (!isCreator) {
      showNotification("Seul le créateur de la partie peut la démarrer", "error")
      return
    }

    // Mettre à jour le statut de la partie
    const { error } = await supabase.from("game_settings").update({ status: "Started" }).eq("code", gameState.gameCode)

    if (error) {
      console.error("Erreur lors du démarrage de la partie:", error)
      showNotification("Erreur lors du démarrage de la partie", "error")
      return
    }

    showNotification("La partie a commencé!", "success")
  } catch (error) {
    console.error("Erreur lors du démarrage de la partie:", error)
    showNotification("Erreur lors du démarrage de la partie", "error")
  }
}

// Fonction pour mettre à jour l'affichage du statut de jeu
function updateGameStatusDisplay() {
  if (elements.gameStatusBadge) {
    elements.gameStatusBadge.textContent = gameState.gameStatus
    elements.gameStatusBadge.className = "badge status-badge"

    if (gameState.gameStatus === "Pending") {
      elements.gameStatusBadge.classList.add("status-pending")

      // Afficher l'écran d'attente et masquer la carte
      document.getElementById("waiting-screen").classList.add("active")
      document.getElementById("map-page").classList.remove("active")

      // Vérifier si le joueur est le créateur pour afficher le bouton de démarrage
      checkIfPlayerIsCreator()
    } else if (gameState.gameStatus === "Started") {
      elements.gameStatusBadge.classList.add("status-started")

      // Masquer l'écran d'attente et afficher la carte
      document.getElementById("waiting-screen").classList.remove("active")
      document.getElementById("map-page").classList.add("active")
    }
  }

  // Si la partie est "Started", montrer la carte et masquer les joueurs qui ne sont pas dans la même partie
  if (gameState.gameStatus === "Started") {
    // Passer à l'onglet carte
    switchTab("map")

    // Rafraîchir la carte pour n'afficher que les joueurs de la même partie
    updateMap()
  }
}

// Add player or cat to the map
function addPlayerToMap(entity) {
  const isCurrentPlayer = gameState.player && entity.id === gameState.player.id
  const isPlayer = entity.type === "player"

  // Ne pas afficher les joueurs d'autres parties si le jeu a commencé
  if (gameState.gameStatus === "Started" && entity.gameCode !== gameState.gameCode && !isCurrentPlayer) {
    return
  }

  if (isPlayer) {
    const isInZone = entity.inZone !== undefined ? entity.inZone : true
    const markerPosition = entity.position

    // Ajout du marqueur du joueur
    const exactPositionMarker = L.marker([markerPosition.lat, markerPosition.lng], {
      icon: L.divIcon({
        className: "player-exact-position",
        html: `<div style="width: 10px; height: 10px; background-color: ${isCurrentPlayer ? "#6c5ce7" : "#00cec9"}; border-radius: 50%;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    }).addTo(gameState.map)

    // Ajout d'un cercle autour du joueur
    const playerCircle = L.circle([markerPosition.lat, markerPosition.lng], {
      radius: config.playerProximityRadius,
      color: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
      fillColor: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
      fillOpacity: 0.2,
      weight: 1,
    }).addTo(gameState.map)

    if (isCurrentPlayer) {
      gameState.playerExactPositionMarker = exactPositionMarker
      gameState.playerCircle = playerCircle
    } else {
      gameState.players.set(entity.id, {
        data: entity,
        marker: exactPositionMarker,
        circle: playerCircle,
      })
    }

    // Ne pas afficher le score dans le popup
    exactPositionMarker.bindPopup(`${entity.name}`)
  } else {
    // Ajout du marqueur pour les chats (sans cercle)
    const marker = L.marker([entity.position.lat, entity.position.lng], {
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

    // Ne pas afficher le score dans le popup
    marker.bindPopup(`${entity.name}`)

    gameState.cats.set(entity.id, {
      data: entity,
      marker: marker,
    })
  }
}

// Update player position
function movePlayer(latlng) {
  // Cette fonction ne fait plus rien, car nous n'autorisons plus le déplacement manuel
  console.log("Manual movement is no longer allowed.")
}

// Nouvelle fonction pour synchroniser avec le serveur
async function syncWithServer() {
  if (!gameState.player) return

  console.log("Synchronizing with server...")

  // Mettre à jour la position du joueur sur le serveur
  await updatePlayerPosition()

  // Rafraîchir la carte et les listes
  await refreshMapAndLists()

  gameState.lastServerUpdate = Date.now()
  gameState.pendingPositionUpdate = false
}

// Update player position in database
async function updatePlayerPosition() {
  if (!gameState.player) return

  const { error } = await supabase
    .from("player")
    .update({
      position: gameState.player.position,
      inZone: gameState.inZone,
      gameCode: gameState.gameCode,
    })
    .eq("id", gameState.player.id)

  if (error) {
    console.error("Error updating position:", error)
    elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
    elements.statusText.textContent = "Connection error"
  } else {
    elements.statusIndicator.style.backgroundColor = "var(--success-color)"
    elements.statusText.textContent = "Connected"
  }
}

// Replace the existing updateCurrentPlayerPosition function with this improved version
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
      gameState.playerExactPositionMarker.setLatLng([position.lat, position.lng])
    } else {
      // Create exact position marker if it doesn't exist
      gameState.playerExactPositionMarker = L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          className: "player-exact-position",
          html: `<div style="width: 10px; height: 10px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      }).addTo(gameState.map)
    }

    // If the zone status changed, update the display
    if (inZoneChanged) {
      // Remove existing markers/circles
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

            gameState.playerCirclePosition = { lat: newCircleLat, lng: newCircleLng }

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
        if (!gameState.playerCirclePosition) {
          gameState.playerCirclePosition = position
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

        // If player is close to the edge of their circle, move the circle
        if (distanceToBorder < 10 || !gameState.playerCircle) {
          // Generate new position centered on player's current position
          gameState.playerCirclePosition = { lat: position.lat, lng: position.lng }
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

// Subscribe to real-time updates
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

// Gérer les mises à jour de la table game_settings
function handleGameSettingsUpdate(payload) {
  const { eventType, new: newRecord } = payload

  // Ignorer si ce n'est pas notre partie
  if (!gameState.gameCode || newRecord.code !== gameState.gameCode) {
    return
  }

  if (eventType === "UPDATE") {
    // Si le statut a changé
    if (newRecord.status !== gameState.gameStatus) {
      gameState.gameStatus = newRecord.status
      updateGameStatusDisplay()

      // Si la partie vient de démarrer
      if (newRecord.status === "Started") {
        gameDuration = newRecord.duration || 60
        startGameTimer()

        // Rafraîchir la carte pour n'afficher que les joueurs de la même partie
        refreshMapAndLists()

        // Notification sans alert pour éviter le rechargement
        showNotification("La partie a commencé !", "success")
      }
    }

    // Vérifier si les coordonnées du cercle global ont changé
    if (
      gameState.gameCenterPosition &&
      (gameState.gameCenterPosition.lat !== newRecord.map_center_lat ||
        gameState.gameCenterPosition.lng !== newRecord.map_center_lng ||
        config.globalBoundaryRadius !== newRecord.global_boundary_radius)
    ) {
      // Mettre à jour la position centrale et le rayon
      gameState.gameCenterPosition = {
        lat: newRecord.map_center_lat,
        lng: newRecord.map_center_lng,
      }
      config.globalBoundaryRadius = newRecord.global_boundary_radius

      // Mettre à jour le cercle global
      updateGlobalBoundary(newRecord.map_center_lat, newRecord.map_center_lng, newRecord.global_boundary_radius)

      console.log("Cercle global mis à jour suite à une modification des paramètres de la partie")
    }
  }
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
      if (playerData.marker) {
        gameState.map.removeLayer(playerData.marker)
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

      // Update player data
      playerData.data = entity

      // If inZone status changed, ensure smooth transition
      if (inZoneChanged) {
        // Remove existing markers/circles
        if (playerData.circle) {
          gameState.map.removeLayer(playerData.circle)
          playerData.circle = null
        }
        if (playerData.marker) {
          gameState.map.removeLayer(playerData.marker)
          playerData.marker = null
        }

        // Remove from collection temporarily
        gameState.players.delete(entity.id)

        // Re-add with new status after a small delay to ensure clean transition
        setTimeout(() => {
          addPlayerToMap(entity)
        }, 50)
      } else {
        // Just update position
        if (entity.inZone && playerData.circle) {
          playerData.circle.setLatLng([entity.position.lat, entity.position.lng])
          playerData.circle.bindPopup(`${entity.name}`)
        } else if (!entity.inZone && playerData.marker) {
          playerData.marker.setLatLng([entity.position.lat, entity.position.lng])
          playerData.marker.bindPopup(`${entity.name}`)
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

// Handle entity removal
function handleEntityRemoval(entity) {
  if (entity.type === "player") {
    const playerData = gameState.players.get(entity.id)
    if (playerData) {
      // Remove from map
      if (gameState.map.hasLayer(playerData.circle)) {
        gameState.map.removeLayer(playerData.circle)
      }
      if (gameState.map.hasLayer(playerData.marker)) {
        gameState.map.removeLayer(playerData.marker)
      }

      // Remove from collection
      gameState.players.delete(entity.id)

      // Update list
      updatePlayersList()
    }
  } else if (entity.type === "cat") {
    const catData = gameState.cats.get(entity.id)
    if (catData) {
      // Remove from map
      if (gameState.map.hasLayer(catData.marker)) {
        gameState.map.removeLayer(catData.marker)
      }

      // Remove from collection
      gameState.cats.delete(entity.id)

      // Update list
      updateCatsList()
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
  let playerQuery = supabase.from("player").select("*").eq("type", "player")
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
          switchTab("map")
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
          switchTab("map")
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
  } catch (error) {
    console.error("Error in refreshMapAndLists:", error)
  }
}

// Add cat marker
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

// Switch to cat function
async function switchToCat() {
  if (!gameState.player || gameState.player.type !== "player") return

  // Apply 500 point penalty
  gameState.player.score = Math.max(0, gameState.player.score - 500)

  // Update player type and score in database
  const { error } = await supabase
    .from("player")
    .update({
      type: "cat",
      score: Math.round(gameState.player.score),
      gameCode: gameState.gameCode,
    })
    .eq("id", gameState.player.id)

  if (error) {
    console.error("Error switching to cat:", error)
    showNotification("Une erreur s'est produite lors du changement en chat. Veuillez réessayer.", "error")
    return
  }

  // Update game state
  gameState.player.type = "cat"

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
}

// Start score interval
function startScoreInterval() {
  // Update score at a reasonable interval
  scoreInterval = setInterval(updateScore, config.updateInterval)
}

// Quit game function
async function quitGame() {
  if (gameState.player) {
    try {
      await supabase.from("player").delete().eq("id", gameState.player.id)
      clearInterval(scoreInterval)
      location.reload()
    } catch (error) {
      console.error("Error deleting player:", error)
      showNotification("Une erreur s'est produite lors de la déconnexion. Veuillez réessayer.", "error")
    }
  }
}

// Calculate and update score
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

// Update score display
function updateScoreDisplay() {
  if (elements.playerScore && gameState.player) {
    elements.playerScore.textContent = `Score: ${Math.round(gameState.player.score)}`

    // Make sure score is visible regardless of which page is active
    elements.playerScore.style.display = "block"
  }
}

// Ajouter une fonction pour afficher le nombre de joueurs dans la même partie
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

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("qr-code-modal")
  const btn = document.getElementById("qr-code-button")
  const closeBtn = document.querySelector(".close")

  btn.addEventListener("click", () => {
    modal.style.display = "block"

    // Générer le QR Code seulement si ce n'est déjà fait
    if (!document.getElementById("qr-code").hasChildNodes()) {
      new QRCode(document.getElementById("qr-code"), {
        text: "https://new1234y.github.io/chat/",
        width: 150,
        height: 150,
      })
    }
  })

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none"
  })

  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none"
    }
  })
})

