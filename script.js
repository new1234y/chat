// Initialize Supabase client
const supabaseUrl = "https://oadwuacpouppdynssxrw.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHd1YWNwb3VwcGR5bnNzeHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzMyMTEsImV4cCI6MjA1NjI0OTIxMX0.MF7Ijl8SHm7wzKt8XiD3EQVqikLaVqkhPAYkqiJHisA"
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Import Leaflet library

// Game configuration
const config = {
  defaultCenter: [48.8566, 2.3522], // Paris as default center
  defaultZoom: 15,
  globalBoundaryRadius: 1000, // meters
  playerProximityRadius: 200, // meters
  updateInterval: 2000, // ms
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
  subscription: null,
  isOutsideBoundary: false,
}

// DOM Elements
const elements = {
  joinForm: document.getElementById("join-form"),
  playerName: document.getElementById("player-name"),
  playerType: document.getElementById("player-type"),
  playersList: document.getElementById("players"),
  catsList: document.getElementById("cats"),
  welcomeModal: document.getElementById("welcome-modal"),
  startGameBtn: document.getElementById("start-game"),
  centerMapBtn: document.getElementById("center-map"),
  statusIndicator: document.getElementById("status-indicator"),
  statusText: document.getElementById("status-text"),
}

// Initialize the game
function initGame() {
  // Initialize map
  gameState.map = L.map("game-map").setView(config.defaultCenter, config.defaultZoom)

  // Add tile layer (map style)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(gameState.map)

  // Add global boundary circle
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

  // Fetch existing players and cats
  fetchExistingEntities()

  // Ensure welcome modal is visible at start
  elements.welcomeModal.style.display = "flex"
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

// Ajouter une fonction pour vérifier si le clic est à l'intérieur d'un élément
function isClickInsideElement(event, element) {
  return element.contains(event.target)
}

// Améliorer la gestion des événements de la modale
function setupModalEvents() {
  const modal = elements.welcomeModal
  const modalContent = modal.querySelector(".modal-content")
  const startButton = elements.startGameBtn

  // Fermer la modale quand on clique en dehors du contenu
  modal.addEventListener("click", (e) => {
    if (!isClickInsideElement(e, modalContent)) {
      modal.style.display = "none"
    }
  })

  // S'assurer que le bouton ferme la modale
  startButton.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Start game button clicked")
    modal.style.display = "none"
  })

  // Empêcher la propagation des clics depuis le contenu de la modale
  modalContent.addEventListener("click", (e) => {
    e.stopPropagation()
  })

  // Fermer la modale avec la touche Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none"
    }
  })
}

// Set up event listeners
function setupEventListeners() {
  // Join form submission
  elements.joinForm.addEventListener("submit", handleJoinGame)

  // Set up modal events
  setupModalEvents()

  // Center map button
  elements.centerMapBtn.addEventListener("click", () => {
    if (gameState.player && gameState.player.position) {
      gameState.map.setView([gameState.player.position.lat, gameState.player.position.lng], config.defaultZoom)
    } else {
      gameState.map.setView(config.defaultCenter, config.defaultZoom)
    }
  })

  // Map click for movement (only if player is joined)
  gameState.map.on("click", (e) => {
    if (gameState.player) {
      movePlayer(e.latlng)
    } else {
      // If player hasn't joined yet, show a message
      alert("Veuillez d'abord rejoindre la partie !")
    }
  })
}

// Handle join game form submission
async function handleJoinGame(e) {
  e.preventDefault()
  console.log("Join form submitted")

  const name = elements.playerName.value.trim()
  const type = elements.playerType.value

  if (!name) {
    alert("Veuillez entrer un nom de joueur !")
    return
  }

  if (name.length < 2) {
    alert("Le nom doit contenir au moins 2 caractères !")
    return
  }

  // Show loading overlay
  showLoading()

  try {
    // Check if player with same name already exists
    const { data: existingPlayer, error: checkError } = await supabase
      .from("player")
      .select("id, name")
      .eq("name", name)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking player:", checkError)
      alert("Erreur lors de la vérification du joueur. Veuillez réessayer.")
      hideLoading()
      return
    }

    if (existingPlayer) {
      alert(`Un joueur avec le nom "${name}" existe déjà. Veuillez choisir un autre nom.`)
      hideLoading()
      return
    }

    // Get user's current position or use default
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const playerPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        await joinGame(name, type, playerPosition)
        hideLoading()
      },
      async (error) => {
        console.warn("Geolocation error:", error)
        // Use default position if geolocation fails
        await joinGame(name, type, { lat: config.defaultCenter[0], lng: config.defaultCenter[1] })
        hideLoading()
      },
      { timeout: 10000 }, // 10 second timeout for geolocation
    )
  } catch (error) {
    console.error("Error in join process:", error)
    alert("Une erreur est survenue. Veuillez réessayer.")
    hideLoading()
  }
}

// Join the game
async function joinGame(name, type, position) {
  console.log(`Joining game as ${type} named ${name} at position:`, position)

  // Generate a unique ID
  const playerId = Date.now().toString()

  // Create player object
  const playerData = {
    id: playerId,
    name: name,
    type: type,
    position: position,
  }

  try {
    // Insert player into database
    const { data, error } = await supabase.from("player").insert([playerData])

    if (error) {
      console.error("Error joining game:", error)
      alert("Erreur lors de la connexion au jeu. Veuillez réessayer.")
      return
    }

    // Set player in game state
    gameState.player = playerData

    // Update UI
    elements.joinForm.style.display = "none"
    elements.playerName.disabled = true
    elements.playerType.disabled = true

    // Show success message
    alert(`Vous avez rejoint la partie en tant que ${type === "player" ? "joueur" : "chat"} !`)

    // Center map on player position
    gameState.map.setView([position.lat, position.lng], config.defaultZoom)

    // Add player marker and circle
    addPlayerToMap(playerData)

    // Subscribe to real-time updates
    subscribeToUpdates()

    // Start position update interval
    startPositionUpdates()

    // Update lists
    updatePlayersList()
    updateCatsList()

    console.log("Successfully joined game")
  } catch (error) {
    console.error("Error in joinGame:", error)
    alert("Une erreur est survenue lors de la connexion. Veuillez réessayer.")
  }
}

// Add player or cat to the map
function addPlayerToMap(entity) {
  const isCurrentPlayer = gameState.player && entity.id === gameState.player.id
  const isPlayer = entity.type === "player"

  if (isCurrentPlayer) {
    // Add marker for current player
    gameState.playerMarker = L.marker([entity.position.lat, entity.position.lng], {
      icon: L.divIcon({
        className: "current-player-marker",
        html: `<div style="background-color: #6c5ce7; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(gameState.map)

    // Add proximity circle for current player
    gameState.playerCircle = L.circle([entity.position.lat, entity.position.lng], {
      radius: config.playerProximityRadius,
      color: "#6c5ce7",
      fillColor: "#6c5ce7",
      fillOpacity: 0.2,
      weight: 1,
    }).addTo(gameState.map)

    // Update global boundary center
    gameState.globalBoundary.setLatLng([entity.position.lat, entity.position.lng])
  } else if (isPlayer) {
    // For other players, show approximate position with a circle
    const marker = L.marker([entity.position.lat, entity.position.lng], {
      icon: L.divIcon({
        className: "player-marker",
        html: `<div style="background-color: #00cec9; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>`,
        iconSize: [15, 15],
        iconAnchor: [7.5, 7.5],
      }),
    })

    const circle = L.circle([entity.position.lat, entity.position.lng], {
      radius: config.playerProximityRadius,
      color: "#00cec9",
      fillColor: "#00cec9",
      fillOpacity: 0.2,
      weight: 1,
    }).addTo(gameState.map)

    // Store references
    gameState.players.set(entity.id, {
      data: entity,
      marker: marker,
      circle: circle,
    })

    // Update players list
    updatePlayersList()
  } else {
    // For cats, show precise position
    const marker = L.marker([entity.position.lat, entity.position.lng], {
      icon: L.divIcon({
        className: "cat-marker",
        html: `<div style="background-color: #fd79a8; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>`,
        iconSize: [15, 15],
        iconAnchor: [7.5, 7.5],
      }),
    }).addTo(gameState.map)

    // Store reference
    gameState.cats.set(entity.id, {
      data: entity,
      marker: marker,
    })

    // Update cats list
    updateCatsList()
  }
}

// Update player position
function movePlayer(latlng) {
  if (!gameState.player) return

  // Update player position
  gameState.player.position = {
    lat: latlng.lat,
    lng: latlng.lng,
  }

  // Check if player is outside global boundary
  const distance = gameState.map.distance(latlng, gameState.globalBoundary.getLatLng())

  gameState.isOutsideBoundary = distance > config.globalBoundaryRadius

  // Update player marker and circle
  if (gameState.playerMarker) {
    gameState.playerMarker.setLatLng(latlng)
  }

  if (gameState.playerCircle) {
    // If outside boundary, center circle on player (penalty)
    // If inside, offset the circle to hide true position
    if (gameState.isOutsideBoundary) {
      gameState.playerCircle.setLatLng(latlng)
      gameState.playerCircle.setStyle({ color: "#d63031", fillColor: "#d63031" })
    } else {
      // Create a random offset within the circle to hide true position
      const angle = Math.random() * Math.PI * 2
      const offsetDistance = Math.random() * (config.playerProximityRadius * 0.7)
      const offsetLat = latlng.lat + (Math.sin(angle) * offsetDistance) / 111000
      const offsetLng =
        latlng.lng + (Math.cos(angle) * offsetDistance) / (111000 * Math.cos((latlng.lat * Math.PI) / 180))

      gameState.playerCircle.setLatLng([offsetLat, offsetLng])
      gameState.playerCircle.setStyle({ color: "#6c5ce7", fillColor: "#6c5ce7" })
    }
  }

  // Update player position in database
  updatePlayerPosition()
}

// Update player position in database
async function updatePlayerPosition() {
  if (!gameState.player) return

  const { error } = await supabase
    .from("player")
    .update({ position: gameState.player.position })
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

// Start position updates interval
function startPositionUpdates() {
  // Update position periodically if player moves
  setInterval(() => {
    if (gameState.player) {
      // Simulate small random movement for demo purposes
      // In a real app, this would be based on actual user movement
      const smallRandomLat = (Math.random() - 0.5) * 0.0005
      const smallRandomLng = (Math.random() - 0.5) * 0.0005

      const newPosition = {
        lat: gameState.player.position.lat + smallRandomLat,
        lng: gameState.player.position.lng + smallRandomLng,
      }

      movePlayer(newPosition)
    }
  }, config.updateInterval)
}

// Subscribe to real-time updates
function subscribeToUpdates() {
  gameState.subscription = supabase
    .channel("player-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "player" }, handleRealtimeUpdate)
    .subscribe()
}

// Handle real-time updates
function handleRealtimeUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload

  // Skip if it's the current player's update
  if (gameState.player && newRecord.id === gameState.player.id) {
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
}

// Handle new entity
function handleNewEntity(entity) {
  if (entity.type === "player") {
    if (!gameState.players.has(entity.id)) {
      addPlayerToMap(entity)
    }
  } else if (entity.type === "cat") {
    if (!gameState.cats.has(entity.id)) {
      addPlayerToMap(entity)
    }
  }
}

// Handle entity update
function handleEntityUpdate(entity) {
  if (entity.type === "player") {
    const playerData = gameState.players.get(entity.id)
    if (playerData) {
      // Update data
      playerData.data = entity

      // Update circle position with offset to hide true position
      // Unless player is outside boundary
      const isOutsideBoundary =
        gameState.map.distance([entity.position.lat, entity.position.lng], gameState.globalBoundary.getLatLng()) >
        config.globalBoundaryRadius

      if (isOutsideBoundary) {
        // Player is outside boundary, show true position
        playerData.circle.setLatLng([entity.position.lat, entity.position.lng])
        playerData.circle.setStyle({ color: "#d63031", fillColor: "#d63031" })

        // Show marker
        if (!gameState.map.hasLayer(playerData.marker)) {
          playerData.marker.addTo(gameState.map)
        }
        playerData.marker.setLatLng([entity.position.lat, entity.position.lng])
      } else {
        // Player is inside boundary, hide true position
        // Create a random offset within the circle
        const angle = Math.random() * Math.PI * 2
        const offsetDistance = Math.random() * (config.playerProximityRadius * 0.7)
        const offsetLat = entity.position.lat + (Math.sin(angle) * offsetDistance) / 111000
        const offsetLng =
          entity.position.lng +
          (Math.cos(angle) * offsetDistance) / (111000 * Math.cos((entity.position.lat * Math.PI) / 180))

        playerData.circle.setLatLng([offsetLat, offsetLng])
        playerData.circle.setStyle({ color: "#00cec9", fillColor: "#00cec9" })

        // Remove marker to hide exact position
        if (gameState.map.hasLayer(playerData.marker)) {
          gameState.map.removeLayer(playerData.marker)
        }
      }
    }
  } else if (entity.type === "cat") {
    const catData = gameState.cats.get(entity.id)
    if (catData) {
      // Update data
      catData.data = entity

      // Update marker position (cats always show exact position)
      catData.marker.setLatLng([entity.position.lat, entity.position.lng])
    }
  }
}

// Handle entity removal
function handleEntityRemoval(entity) {
  if (entity.type === "player") {
    const playerData = gameState.players.get(entity.id)
    if (playerData) {
      // Remove from map
      if (gameState.map.hasLayer(playerData.marker)) {
        gameState.map.removeLayer(playerData.marker)
      }
      if (gameState.map.hasLayer(playerData.circle)) {
        gameState.map.removeLayer(playerData.circle)
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
}

// Fetch existing entities
async function fetchExistingEntities() {
  // Fetch players
  const { data: players, error: playersError } = await supabase.from("player").select("*").eq("type", "player")

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
  const { data: cats, error: catsError } = await supabase.from("player").select("*").eq("type", "cat")

  if (catsError) {
    console.error("Error fetching cats:", catsError)
  } else if (cats) {
    // Add existing cats to map
    cats.forEach((cat) => {
      addPlayerToMap(cat)
    })
  }
}

// Update players list in sidebar
function updatePlayersList() {
  elements.playersList.innerHTML = ""

  gameState.players.forEach((player) => {
    const li = document.createElement("li")
    li.textContent = player.data.name
    elements.playersList.appendChild(li)
  })

  // Add current player to list if exists
  if (gameState.player && gameState.player.type === "player") {
    const li = document.createElement("li")
    li.textContent = `${gameState.player.name} (You)`
    li.style.fontWeight = "bold"
    elements.playersList.appendChild(li)
  }
}

// Update cats list in sidebar
function updateCatsList() {
  elements.catsList.innerHTML = ""

  gameState.cats.forEach((cat) => {
    const li = document.createElement("li")
    li.textContent = cat.data.name
    elements.catsList.appendChild(li)
  })

  // Add current player to list if they're a cat
  if (gameState.player && gameState.player.type === "cat") {
    const li = document.createElement("li")
    li.textContent = `${gameState.player.name} (You)`
    li.style.fontWeight = "bold"
    elements.catsList.appendChild(li)
  }
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

// Ajouter une fonction pour vérifier la connexion Supabase au démarrage
async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase.from("player").select("count").limit(1)

    if (error) {
      console.error("Supabase connection error:", error)
      elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
      elements.statusText.textContent = "Déconnecté"
      return false
    }

    console.log("Supabase connected successfully")
    elements.statusIndicator.style.backgroundColor = "var(--success-color)"
    elements.statusText.textContent = "Connecté"
    return true
  } catch (error) {
    console.error("Error checking Supabase connection:", error)
    elements.statusIndicator.style.backgroundColor = "var(--danger-color)"
    elements.statusText.textContent = "Erreur de connexion"
    return false
  }
}

// Modifier la fonction d'initialisation pour vérifier la connexion
document.addEventListener("DOMContentLoaded", async () => {
  // Check Supabase connection first
  const isConnected = await checkSupabaseConnection()

  if (isConnected) {
    initGame()
  } else {
    alert("Erreur de connexion à la base de données. Veuillez rafraîchir la page et réessayer.")
  }
})

