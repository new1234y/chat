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
}

// DOM Elements
const elements = {
  joinForm: document.getElementById("join-form"),
  playerName: document.getElementById("player-name"),
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
}

// Ajoutez ces variables globales
let scoreInterval
const pointsToAdd = 0

// Initialize the game
function initGame() {
  // Set initial theme
  updateTheme(gameState.darkMode)

  // Initialize map with dark theme by default
  gameState.map = L.map("game-map").setView(config.defaultCenter, config.defaultZoom)

  // Add tile layer (map style) - dark by default
  updateMapTheme(gameState.darkMode)

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

// Set up event listeners
function setupEventListeners() {
  // Join form submission
  elements.joinForm.addEventListener("submit", handleJoinGame)

  // Center map button
  elements.centerMapBtn.addEventListener("click", () => {
    const bounds = []

    // Ajoute la position du joueur courant
    if (gameState.player && gameState.player.position) {
      bounds.push([gameState.player.position.lat, gameState.player.position.lng])
    }

    // Ajoute la position de tous les autres joueurs
    gameState.players.forEach((playerObj) => {
      if (playerObj.data.position) {
        bounds.push([playerObj.data.position.lat, playerObj.data.position.lng])
      }
    })

    if (bounds.length > 0) {
      // Ajuste le zoom et le centrage pour afficher tous les joueurs avec une marge de 50 pixels
      gameState.map.fitBounds(bounds, { padding: [50, 50] })
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
      alert("Please join the game first!")
    }
  })

  // Theme toggle
  elements.themeToggle.addEventListener("click", (e) => {
    gameState.darkMode = !gameState.darkMode
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
  } else if (tabName === "players") {
    elements.playersPage.classList.add("active")
    elements.mapPage.classList.remove("active")
    elements.playersTab.classList.add("active")
    elements.mapTab.classList.remove("active")
  }
}

// Handle join game form submission
async function handleJoinGame(e) {
  e.preventDefault()
  console.log("Join form submitted")

  const name = elements.playerName.value.trim()
  // Get the selected player type from radio buttons
  const type = document.querySelector('input[name="tabs"]:checked').value

  if (!name) {
    alert("Please enter a player name!")
    return
  }

  if (name.length < 2) {
    alert("Name must contain at least 2 characters!")
    return
  }

  showLoading()

  try {
    const { data: existingPlayer, error: checkError } = await supabase
      .from("player")
      .select("id, name")
      .eq("name", name)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking player:", checkError)
      alert("Error checking player. Please try again.")
      hideLoading()
      return
    }

    if (existingPlayer) {
      const { error: deleteError } = await supabase.from("player").delete().eq("id", existingPlayer.id)

      if (deleteError) {
        console.error("Error deleting existing player:", deleteError)
        alert("Error reclaiming username. Please try again.")
        hideLoading()
        return
      }
    }

    // Use geolocation
    if ("geolocation" in navigator) {
      // Use a default position in case of geolocation error
      const useDefaultPosition = () => {
        console.log("Using default position")
        const defaultPosition = {
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

        joinGame(name, type, defaultPosition).then(() => {
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

          await joinGame(name, type, playerPosition)
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
      alert("Geolocation is not supported by your browser.")
      hideLoading()
    }
  } catch (error) {
    console.error("Error in join process:", error)
    alert("An error occurred. Please try again.")
    hideLoading()
  }
}

// Join the game
async function joinGame(name, type, position) {
  console.log(`Joining game as ${type} named ${name} at position:`, position)

  if (!position || isNaN(position.lat) || isNaN(position.lng)) {
    console.error("Invalid position:", position)
    alert("Invalid position. Using default position.")
    position = {
      lat: config.defaultCenter[0],
      lng: config.defaultCenter[1],
    }
  }

  // Generate a unique ID
  const playerId = Date.now().toString()

  // Check if the initial position is inside the global boundary
  const isInZone = gameState.map
    ? gameState.map.distance([position.lat, position.lng], [config.defaultCenter[0], config.defaultCenter[1]]) <=
      config.globalBoundaryRadius
    : true

  // Create player object with inZone status
  const playerData = {
    id: playerId,
    name: name,
    type: type,
    position: position,
    score: 0,
    inZone: isInZone,
  }

  try {
    // Insert player into database
    const { data, error } = await supabase.from("player").insert([playerData])

    if (error) {
      console.error("Error joining game:", error)
      alert("Error joining game. Please try again.")
      return
    }

    // Set player in game state
    gameState.player = playerData
    gameState.inZone = isInZone
    gameState.lastServerUpdate = Date.now()

    // Hide login modal
    elements.loginModal.style.display = "none"

    // Show success message
    alert(`You've joined the game as a ${type === "player" ? "player" : "cat"}!`)

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

    console.log("Successfully joined game")
  } catch (error) {
    console.error("Error in joinGame:", error)
    alert("An error occurred while joining. Please try again.")
  }
}

// Add player or cat to the map
function addPlayerToMap(entity) {
  const isCurrentPlayer = gameState.player && entity.id === gameState.player.id
  const isPlayer = entity.type === "player"

  if (isPlayer) {
    // Check if the player is in zone (default to true if not specified)
    const isInZone = entity.inZone !== undefined ? entity.inZone : true

    // If player is outside the zone, show exact position
    if (!isInZone) {
      const exactPositionMarker = L.marker([entity.position.lat, entity.position.lng], {
        icon: L.divIcon({
          className: "player-exact-position",
          html: `<div style="width: 10px; height: 10px; background-color: ${isCurrentPlayer ? "#6c5ce7" : "#00cec9"}; border-radius: 50%;"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      }).addTo(gameState.map)

      if (isCurrentPlayer) {
        gameState.playerExactPositionMarker = exactPositionMarker
      } else {
        gameState.players.set(entity.id, {
          data: entity,
          marker: exactPositionMarker,
        })
      }

      // Don't show score in popup
      exactPositionMarker.bindPopup(`${entity.name}`)
    } else {
      // Inside zone - show circle
      let circlePosition
      if (isCurrentPlayer) {
        circlePosition = gameState.playerCirclePosition || entity.position
      } else {
        circlePosition = entity.position
      }

      const circle = L.circle([circlePosition.lat, circlePosition.lng], {
        radius: config.playerProximityRadius,
        color: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
        fillColor: isCurrentPlayer ? "#6c5ce7" : "#00cec9",
        fillOpacity: 0.2,
        weight: 1,
      }).addTo(gameState.map)

      if (isCurrentPlayer) {
        const exactPositionMarker = L.marker([entity.position.lat, entity.position.lng], {
          icon: L.divIcon({
            className: "player-exact-position",
            html: `<div style="width: 10px; height: 10px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        }).addTo(gameState.map)
        gameState.playerExactPositionMarker = exactPositionMarker
        gameState.playerCircle = circle
      } else {
        gameState.players.set(entity.id, {
          data: entity,
          circle: circle,
        })
      }

      // Don't show score in popup
      circle.bindPopup(`${entity.name}`)
    }
  } else {
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

    // Don't show score in popup
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
    .update({ position: gameState.player.position, inZone: gameState.inZone })
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

  // Check if the player is outside the global boundary
  const distanceToCenter = gameState.map.distance(
    [position.lat, position.lng],
    [config.defaultCenter[0], config.defaultCenter[1]],
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
    // Ne mettre à jour que si une synchronisation n'est pas déjà prévue
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
  const playerCount = Array.from(gameState.players.values()).filter((p) => p.data.type === "player").length
  const catCount = Array.from(gameState.cats.values()).length

  // Add current player to count if they exist
  if (gameState.player) {
    if (gameState.player.type === "player") {
      elements.playerCountBadge.textContent = `Joueurs: ${playerCount + 1}`
      elements.catCountBadge.textContent = `Chats: ${catCount}`
    } else {
      elements.playerCountBadge.textContent = `Joueurs: ${playerCount}`
      elements.catCountBadge.textContent = `Chats: ${catCount + 1}`
    }
  } else {
    elements.playerCountBadge.textContent = `Joueurs: ${playerCount}`
    elements.catCountBadge.textContent = `Chats: ${catCount}`
  }
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

  gameState.players.forEach((player) => {
    if (!gameState.player || player.data.name !== gameState.player.name) {
      addPlayerToMap(player.data)
    }
  })

  gameState.cats.forEach((cat) => {
    if (!gameState.player || cat.data.name !== gameState.player.name) {
      addPlayerToMap(cat.data)
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
      },
      {
        enableHighAccuracy: true,
        timeout: 5000, // Timeout plus court pour une meilleure réactivité
        maximumAge: 0, // Toujours obtenir la position la plus récente
      },
    )
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

  gameState.players.forEach((player) => {
    if (!addedPlayers.has(player.data.name)) {
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

  gameState.cats.forEach((cat) => {
    if (!addedCats.has(cat.data.name)) {
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

// Initialize the game when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Add viewport meta tag with additional parameters for iOS
  const meta = document.createElement("meta")
  meta.name = "viewport"
  meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
  document.getElementsByTagName("head")[0].appendChild(meta)

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
      config.playerProximityRadius = settings.player_proximity_radius
      config.globalBoundaryRadius = settings.global_boundary_radius
      config.updateInterval = 20000 // Force to 20 seconds as requested
      console.log("Game settings loaded from DB:", config)
    } else {
      console.warn("Using default settings.")
    }
    initGame()
  } else {
    alert("Error connecting to database. Please refresh the page and try again.")
  }
})

// Modify the refreshMapAndLists function to be more reliable
async function refreshMapAndLists() {
  console.log("Refreshing map and lists...")

  try {
    // Reload settings from DB
    const settings = await loadGameSettings()
    if (settings) {
      // Save old radius to detect changes
      const oldPlayerProximityRadius = config.playerProximityRadius
      const oldGlobalBoundaryRadius = config.globalBoundaryRadius

      // Update configuration
      config.defaultCenter = [settings.map_center_lat, settings.map_center_lng]
      config.globalBoundaryRadius = settings.global_boundary_radius
      config.defaultZoom = settings.map_zoom_level
      config.playerProximityRadius = settings.player_proximity_radius
      config.updateInterval = 20000 // Force to 20 seconds as requested

      console.log("Game settings reloaded:", config)

      // If player proximity radius changed and player has a circle, update the radius
      if (oldPlayerProximityRadius !== config.playerProximityRadius && gameState.playerCircle) {
        gameState.playerCircle.setRadius(config.playerProximityRadius)
        console.log("Player circle radius updated:", config.playerProximityRadius)
      }

      // Update global boundary circle with new values
      if (gameState.map) {
        if (gameState.globalBoundary) {
          gameState.globalBoundary.setLatLng(config.defaultCenter)

          // Only update radius if it changed to avoid visual glitches
          if (oldGlobalBoundaryRadius !== config.globalBoundaryRadius) {
            gameState.globalBoundary.setRadius(config.globalBoundaryRadius)

            // If player exists, check if their inZone status needs updating due to boundary change
            if (gameState.player && gameState.player.position) {
              const distanceToCenter = gameState.map.distance(
                [gameState.player.position.lat, gameState.player.position.lng],
                [config.defaultCenter[0], config.defaultCenter[1]],
              )
              const isOutside = distanceToCenter > config.globalBoundaryRadius

              // If inZone status would change due to boundary update, update the player position
              if (isOutside !== gameState.isOutsideBoundary) {
                updateCurrentPlayerPosition(gameState.player.position)
              }
            }
          }
        } else {
          gameState.globalBoundary = L.circle(config.defaultCenter, {
            radius: config.globalBoundaryRadius,
            color: "#6c5ce7",
            fillColor: "#6c5ce7",
            fillOpacity: 0.1,
            weight: 2,
            dashArray: "5, 10",
          }).addTo(gameState.map)
        }
      }
    } else {
      console.warn("Using default settings.")
    }

    // Fetch latest player data
    const { data: players, error: playersError } = await supabase
      .from("player")
      .select("*")
      .order("score", { ascending: false })

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
    .update({ type: "cat", score: Math.round(gameState.player.score) })
    .eq("id", gameState.player.id)

  if (error) {
    console.error("Error switching to cat:", error)
    alert("An error occurred while switching to cat. Please try again.")
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

  alert("You are now a cat! Your score has been reduced by 500 points.")
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
      alert("An error occurred while quitting. Please try again.")
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
      .update({ score: Math.round(gameState.player.score) })
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
  if (elements.playerScore) {
    elements.playerScore.textContent = `Score: ${Math.round(gameState.player.score)}`
  }
}

