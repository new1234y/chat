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
  updateInterval: 60000,
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
  playerExactPositionMarker: null, // Ajout pour le marqueur de position exacte
  playerCirclePosition: null, // Ajout pour la position du cercle
  playerCatMarker: null, // Ajout pour le marqueur de chat du joueur
  subscription: null,
  isOutsideBoundary: false,
  lastScoreUpdate: Date.now(),
  inZone: true, // Add inZone status for the current player
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

// Ajoutez ces variables globales au début du fichier
let scoreInterval
const pointsToAdd = 0

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

  // Ajoutez cet écouteur d'événements pour le bouton d'actualisation
  const refreshButton = document.getElementById("refresh-map")
  if (refreshButton) {
    refreshButton.addEventListener("click", refreshMapAndLists)
  }

  // Ajoutez cet écouteur d'événements pour le bouton "Devenir un chat"
  const switchToCatButton = document.getElementById("switch-to-cat")
  if (switchToCatButton) {
    switchToCatButton.addEventListener("click", switchToCat)
  }

  // Ajoutez cet écouteur d'événements pour le bouton "Quitter le jeu"
  const quitButton = document.getElementById("quit-game")
  if (quitButton) {
    quitButton.addEventListener("click", quitGame)
  }
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

  showLoading()

  try {
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
      const { error: deleteError } = await supabase.from("player").delete().eq("id", existingPlayer.id)

      if (deleteError) {
        console.error("Error deleting existing player:", deleteError)
        alert("Erreur lors de la reprise du pseudo. Veuillez réessayer.")
        hideLoading()
        return
      }
    }

    // Utiliser la géolocalisation en continu
    if ("geolocation" in navigator) {
      // Utiliser une position par défaut en cas d'erreur de géolocalisation
      const useDefaultPosition = () => {
        console.log("Utilisation de la position par défaut")
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

          // Essayer de continuer à obtenir la position réelle
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
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
          )
        })
      }

      // Essayer d'obtenir la position actuelle
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
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
          )
        },
        (error) => {
          console.warn("Geolocation error:", error)
          // Utiliser la position par défaut en cas d'erreur
          useDefaultPosition()
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    } else {
      alert("La géolocalisation n'est pas supportée par votre navigateur.")
      hideLoading()
    }
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
    score: 0, // Initialiser le score à 0
    inZone: isInZone, // Add inZone status
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
    gameState.inZone = isInZone

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

    // Update lists
    updatePlayersList()
    updateCatsList()

    // Start score update interval
    setInterval(updateScore, config.updateInterval)

    // Mettre à jour l'interface utilisateur
    document.querySelectorAll(".player-form > *:not(#switch-to-cat)").forEach((el) => (el.style.display = "none"))
    const switchToCatButton = document.getElementById("switch-to-cat")
    if (switchToCatButton) {
      switchToCatButton.style.display = type === "player" ? "block" : "none"
    }

    // Afficher le bouton "Quitter le jeu"
    const quitButton = document.getElementById("quit-game")
    if (quitButton) {
      quitButton.style.display = "block"
    }

    // Démarrer l'intervalle de score
    startScoreInterval()

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

      exactPositionMarker.bindPopup(entity.name)
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

      circle.bindPopup(entity.name)
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

    marker.bindPopup(entity.name)

    gameState.cats.set(entity.id, {
      data: entity,
      marker: marker,
    })
  }

  updatePlayersList()
  updateCatsList()
}

// Update player position
function movePlayer(latlng) {
  // Cette fonction ne fait plus rien, car nous n'autorisons plus le déplacement manuel
  console.log("Le déplacement manuel n'est plus autorisé.")
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

// Remove the refresh button from the HTML by hiding it
// Find the refresh button element and set its display to none
const refreshButton = document.getElementById("refresh-map")
if (refreshButton) {
  refreshButton.style.display = "none"
}

// Set up an interval to automatically refresh the map and lists
setInterval(refreshMapAndLists, config.updateInterval)

// Modifier la fonction updateCurrentPlayerPosition pour corriger l'affichage des positions
function updateCurrentPlayerPosition(position) {
  if (!gameState.player) return

  gameState.player.position = position

  // Vérifier si le joueur est en dehors du cercle global
  const isOutsideGlobalBoundary =
    gameState.map.distance([position.lat, position.lng], [config.defaultCenter[0], config.defaultCenter[1]]) >
    config.globalBoundaryRadius

  // Stocker l'état précédent pour détecter les changements
  const wasOutsideBoundary = gameState.isOutsideBoundary
  gameState.isOutsideBoundary = isOutsideGlobalBoundary

  // Update inZone status
  const newInZone = !isOutsideGlobalBoundary
  const inZoneChanged = gameState.inZone !== newInZone
  gameState.inZone = newInZone
  gameState.player.inZone = newInZone

  // Si le joueur est un joueur (pas un chat)
  if (gameState.player.type === "player") {
    // Si le joueur vient d'entrer ou de sortir de la limite, mettre à jour l'affichage
    if (wasOutsideBoundary !== isOutsideGlobalBoundary || inZoneChanged) {
      // Supprimer les marqueurs/cercles existants
      if (gameState.playerCircle) {
        gameState.map.removeLayer(gameState.playerCircle)
        gameState.playerCircle = null
      }
      if (gameState.playerExactPositionMarker) {
        gameState.map.removeLayer(gameState.playerExactPositionMarker)
        gameState.playerExactPositionMarker = null
      }

      // Update inZone status in database
      updatePlayerInZoneStatus(newInZone)
    }

    if (isOutsideGlobalBoundary) {
      // En dehors de la limite globale - montrer la position exacte
      if (!gameState.playerExactPositionMarker) {
        gameState.playerExactPositionMarker = L.marker([position.lat, position.lng], {
          icon: L.divIcon({
            className: "player-exact-position",
            html: `<div style="width: 10px; height: 10px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        }).addTo(gameState.map)
      } else {
        gameState.playerExactPositionMarker.setLatLng([position.lat, position.lng])
      }

      // Supprimer le cercle s'il existe
      if (gameState.playerCircle) {
        gameState.map.removeLayer(gameState.playerCircle)
        gameState.playerCircle = null
      }
    } else {
      // À l'intérieur de la limite globale - montrer le cercle
      if (!gameState.playerCirclePosition) {
        // Initialiser la position du cercle si elle n'est pas définie
        gameState.playerCirclePosition = position
      }

      // Si le joueur vient de rentrer dans la zone, générer une nouvelle position aléatoire pour le cercle
      if (wasOutsideBoundary) {
        const angle = Math.random() * Math.PI * 2
        const distance = Math.random() * config.playerProximityRadius
        const newCircleLat = position.lat + (Math.sin(angle) * distance) / 111000
        const newCircleLng =
          position.lng + (Math.cos(angle) * distance) / (111000 * Math.cos((position.lat * Math.PI) / 180))
        gameState.playerCirclePosition = { lat: newCircleLat, lng: newCircleLng }
      } else {
        // Calculer la distance entre la position du joueur et le centre du cercle
        const distanceToCircleCenter = gameState.playerCirclePosition
          ? gameState.map.distance(
              [position.lat, position.lng],
              [gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng],
            )
          : 0

        // Calculer la distance au bord du cercle (rayon - distance au centre)
        const distanceToBorder = config.playerProximityRadius - distanceToCircleCenter

        // Si on est à moins de 2 mètres du bord ou si le cercle n'existe pas encore
        if (distanceToBorder < 2 || !gameState.playerCircle) {
          // Générer une nouvelle position pour le cercle centrée sur la position actuelle du joueur
          gameState.playerCirclePosition = { lat: position.lat, lng: position.lng }
        }
      }

      // Créer ou mettre à jour le cercle avec le rayon actuel de config
      if (!gameState.playerCircle) {
        gameState.playerCircle = L.circle([gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng], {
          radius: config.playerProximityRadius,
          color: "#6c5ce7",
          fillColor: "#6c5ce7",
          fillOpacity: 0.2,
          weight: 1,
        }).addTo(gameState.map)
      } else {
        // Mettre à jour la position et le rayon du cercle
        gameState.playerCircle.setLatLng([gameState.playerCirclePosition.lat, gameState.playerCirclePosition.lng])
        gameState.playerCircle.setRadius(config.playerProximityRadius)
      }

      // Toujours montrer le marqueur de position exacte pour le joueur actuel
      if (!gameState.playerExactPositionMarker) {
        gameState.playerExactPositionMarker = L.marker([position.lat, position.lng], {
          icon: L.divIcon({
            className: "player-exact-position",
            html: `<div style="width: 10px; height: 10px; background-color: #6c5ce7; border-radius: 50%;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        }).addTo(gameState.map)
      } else {
        gameState.playerExactPositionMarker.setLatLng([position.lat, position.lng])
      }
    }
  } else if (gameState.player.type === "cat") {
    // Pour les chats, toujours montrer la position exacte (pas de changement en sortant du cercle)
    if (gameState.playerCatMarker) {
      gameState.playerCatMarker.setLatLng([position.lat, position.lng])
    } else {
      addCatMarker(gameState.player)
    }

    // Update inZone status for cats too
    if (inZoneChanged) {
      updatePlayerInZoneStatus(newInZone)
    }
  }

  // Mettre à jour la position dans la base de données
  updatePlayerPosition()
}

// Add a new function to update player inZone status in the database
async function updatePlayerInZoneStatus(inZone) {
  if (!gameState.player) return

  const { error } = await supabase.from("player").update({ inZone: inZone }).eq("id", gameState.player.id)

  if (error) {
    console.error("Error updating inZone status:", error)
  } else {
    console.log(`Player inZone status updated to: ${inZone}`)
  }
}

// Subscribe to real-time updates
function subscribeToUpdates() {
  gameState.subscription = supabase
    .channel("player-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "player" }, (payload) => {
      handleRealtimeUpdate(payload)
      refreshMapAndLists() // Ajoutez cette ligne pour actualiser automatiquement
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
}

// Modification de updateMap pour éviter de supprimer le cercle global
function updateMap() {
  gameState.map.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Circle) {
      if (
        (gameState.globalBoundary && layer === gameState.globalBoundary) ||
        (gameState.player && layer === gameState.playerCircle) ||
        (gameState.player && layer === gameState.playerExactPositionMarker) ||
        (gameState.player && layer === gameState.playerCatMarker)
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
}

// Handle entity update
function handleEntityUpdate(entity) {
  if (entity.type === "player") {
    const playerData = gameState.players.get(entity.id)
    if (playerData) {
      // Check if inZone status has changed
      const inZoneChanged = playerData.data.inZone !== entity.inZone

      // Update player data
      playerData.data = entity

      // If inZone status changed, remove and re-add the player to update display
      if (inZoneChanged) {
        // Remove existing markers/circles
        if (playerData.circle) {
          gameState.map.removeLayer(playerData.circle)
        }
        if (playerData.marker) {
          gameState.map.removeLayer(playerData.marker)
        }

        // Remove from collection
        gameState.players.delete(entity.id)

        // Re-add with new status
        addPlayerToMap(entity)
      } else {
        // Just update position
        if (entity.inZone && playerData.circle) {
          playerData.circle.setLatLng([entity.position.lat, entity.position.lng])
          playerData.circle.bindPopup(`${entity.name} - Score: ${Math.round(entity.score || 0)}`)
        } else if (!entity.inZone && playerData.marker) {
          playerData.marker.setLatLng([entity.position.lat, entity.position.lng])
          playerData.marker.bindPopup(`${entity.name} - Score: ${Math.round(entity.score || 0)}`)
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
  updatePlayersList()
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
  const addedPlayers = new Set()

  if (gameState.player && gameState.player.type === "player") {
    const li = document.createElement("li")
    li.textContent = `${gameState.player.name} (You)`
    li.style.fontWeight = "bold"
    elements.playersList.appendChild(li)
    addedPlayers.add(gameState.player.name)
  }

  gameState.players.forEach((player) => {
    if (!addedPlayers.has(player.data.name)) {
      const li = document.createElement("li")
      li.textContent = player.data.name
      if (gameState.player && player.data.name === gameState.player.name) {
        li.textContent += " (You)"
        li.style.fontWeight = "bold"
      }

      // 🔥 Ajout du clic pour centrer la map sur le joueur
      li.addEventListener("click", () => {
        if (player.data.position) {
          gameState.map.setView([player.data.position.lat, player.data.position.lng], 15)
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
    li.textContent = `${gameState.player.name} (You)`
    li.style.fontWeight = "bold"
    elements.catsList.appendChild(li)
    addedCats.add(gameState.player.name)
  }

  gameState.cats.forEach((cat) => {
    if (!addedCats.has(cat.data.name)) {
      const li = document.createElement("li")
      li.textContent = cat.data.name
      if (gameState.player && cat.data.name === gameState.player.name) {
        li.textContent += " (You)"
        li.style.fontWeight = "bold"
      }

      // 🔥 Ajout du clic pour centrer la map sur le chat
      li.addEventListener("click", () => {
        if (cat.data.position) {
          gameState.map.setView([cat.data.position.lat, cat.data.position.lng], 18)
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
    // Charge les paramètres de la DB et met à jour l'objet config
    const settings = await loadGameSettings()
    if (settings) {
      config.defaultCenter = [settings.map_center_lat, settings.map_center_lng]
      config.defaultZoom = settings.map_zoom_level
      config.playerProximityRadius = settings.player_proximity_radius
      config.globalBoundaryRadius = settings.global_boundary_radius
      config.updateInterval = settings.update_interval
      console.log("Game settings chargés depuis la DB :", config)
    } else {
      console.warn("Utilisation des settings par défaut.")
    }
    initGame()
  } else {
    alert("Erreur de connexion à la base de données. Veuillez rafraîchir la page et réessayer.")
  }
})

// Modifier la fonction refreshMapAndLists pour s'assurer que le rayon du cercle du joueur est mis à jour
async function refreshMapAndLists() {
  console.log("Actualisation de la carte et des listes...")

  // Recharger les settings depuis la DB
  const settings = await loadGameSettings()
  if (settings) {
    // Sauvegarder l'ancien rayon pour détecter les changements
    const oldPlayerProximityRadius = config.playerProximityRadius

    config.defaultCenter = [settings.map_center_lat, settings.map_center_lng]
    config.globalBoundaryRadius = settings.global_boundary_radius
    config.defaultZoom = settings.map_zoom_level
    config.playerProximityRadius = settings.player_proximity_radius
    config.updateInterval = settings.update_interval

    console.log("Game settings rechargés :", config)

    // Si le rayon a changé et que le joueur a un cercle, mettre à jour le rayon
    if (oldPlayerProximityRadius !== config.playerProximityRadius && gameState.playerCircle) {
      gameState.playerCircle.setRadius(config.playerProximityRadius)
      console.log("Rayon du cercle du joueur mis à jour :", config.playerProximityRadius)
    }
  } else {
    console.warn("Utilisation des settings par défaut.")
  }

  // Mettre à jour le cercle global avec les nouvelles valeurs
  if (gameState.map) {
    if (gameState.globalBoundary) {
      gameState.globalBoundary.setLatLng(config.defaultCenter)
      gameState.globalBoundary.setRadius(config.globalBoundaryRadius)
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

  // Ensuite, on continue avec l'actualisation classique (joueurs, chats, etc.)
  const { data: players, error: playersError } = await supabase
    .from("player")
    .select("*")
    .order("score", { ascending: false })

  if (playersError) {
    console.error("Erreur lors de la récupération des joueurs:", playersError)
    return
  }

  // Vider les listes actuelles
  gameState.players.clear()
  gameState.cats.clear()

  // Mettre à jour les listes et la carte
  players.forEach((player) => {
    if (gameState.player && player.name === gameState.player.name) {
      gameState.player = { ...gameState.player, ...player }
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

  console.log("Carte et listes actualisées")
}

// Ajoutez cette nouvelle fonction pour ajouter un marqueur de chat
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

// Modifiez la fonction switchToCat
async function switchToCat() {
  if (!gameState.player || gameState.player.type !== "player") return

  // Appliquer la pénalité de 500 points
  gameState.player.score = Math.max(0, gameState.player.score - 500)

  // Mettre à jour le type de joueur et le score dans la base de données
  const { error } = await supabase
    .from("player")
    .update({ type: "cat", score: Math.round(gameState.player.score) })
    .eq("id", gameState.player.id)

  if (error) {
    console.error("Erreur lors du basculement en chat:", error)
    alert("Une erreur est survenue lors du basculement en chat. Veuillez réessayer.")
    return
  }

  // Mettre à jour l'état du jeu
  gameState.player.type = "cat"

  // Supprimer le cercle du joueur
  if (gameState.playerCircle) {
    gameState.map.removeLayer(gameState.playerCircle)
    gameState.playerCircle = null
  }

  // Supprimer le marqueur de position exacte
  if (gameState.playerExactPositionMarker) {
    gameState.map.removeLayer(gameState.playerExactPositionMarker)
    gameState.playerExactPositionMarker = null
  }

  // Ajouter le marqueur de chat
  addCatMarker(gameState.player)

  // Mettre à jour gameState.cats
  gameState.cats.set(gameState.player.id, {
    data: gameState.player,
    marker: gameState.playerCatMarker,
  })

  // Supprimer le joueur de gameState.players
  gameState.players.delete(gameState.player.id)

  // Actualiser la carte et les listes
  refreshMapAndLists()

  // Masquer le bouton "Devenir un chat" et afficher le bouton "Quitter le jeu"
  const switchToCatButton = document.getElementById("switch-to-cat")
  const quitGameButton = document.getElementById("quit-game")
  if (switchToCatButton) switchToCatButton.style.display = "none"
  if (quitGameButton) quitGameButton.style.display = "block"

  // Arrêter l'intervalle de score
  clearInterval(scoreInterval)

  alert("Vous êtes maintenant un chat ! Votre score a été réduit de 500 points.")
}

// Ajoutez cette nouvelle fonction pour démarrer l'intervalle de score
function startScoreInterval() {
  // Ne plus ajouter de points automatiquement
  scoreInterval = setInterval(() => {
    // Cette fonction est vide car nous ne voulons plus ajouter de points automatiquement
    // Les points sont uniquement ajoutés quand on est proche d'un chat
  }, 300000)
}

// Ajoutez cette nouvelle fonction pour quitter le jeu
async function quitGame() {
  if (gameState.player) {
    try {
      await supabase.from("player").delete().eq("id", gameState.player.id)
      clearInterval(scoreInterval)
      location.reload()
    } catch (error) {
      console.error("Erreur lors de la suppression du joueur:", error)
      alert("Une erreur est survenue lors de la déconnexion. Veuillez réessayer.")
    }
  }
}

// Add this new function to calculate and update the score
async function updateScore() {
  if (!gameState.player || gameState.player.type !== "player") return

  const now = Date.now()
  const dt = (now - gameState.lastScoreUpdate) / 1000 // Time difference in seconds
  gameState.lastScoreUpdate = now

  // Vérifier s'il y a des chats sur la carte
  if (gameState.cats.size === 0) {
    // Pas de chats sur la carte, pas de points à ajouter
    console.log("Aucun chat sur la carte, pas de points ajoutés")
    return
  }

  let maxFactor = 0
  let nearCat = false

  // Parcourir tous les chats pour trouver le plus proche
  gameState.cats.forEach((cat) => {
    if (!cat.data || !cat.data.position || !gameState.player.position) return

    const distance = gameState.map.distance(
      [gameState.player.position.lat, gameState.player.position.lng],
      [cat.data.position.lat, cat.data.position.lng],
    )

    // Seulement si le joueur est à moins de 150 mètres d'un chat
    if (distance <= 150) {
      nearCat = true
      // Plus le joueur est proche, plus le facteur est élevé (1 quand distance = 0, 0 quand distance = 150)
      const factor = (150 - distance) / 150
      maxFactor = Math.max(maxFactor, factor)
      console.log(`Proche d'un chat à ${Math.round(distance)}m, facteur: ${factor.toFixed(2)}`)
    }
  })

  // N'ajouter des points que si le joueur est près d'un chat
  if (nearCat) {
    const baseScore = 10 // Points par seconde quand juste à côté d'un chat
    const scoreIncrement = baseScore * maxFactor * dt

    gameState.player.score += scoreIncrement
    console.log(
      `Points ajoutés: ${scoreIncrement.toFixed(2)}, facteur: ${maxFactor.toFixed(2)}, temps: ${dt.toFixed(2)}s`,
    )

    // Mettre à jour le score dans la base de données
    const { error } = await supabase
      .from("player")
      .update({ score: Math.round(gameState.player.score) })
      .eq("id", gameState.player.id)

    if (error) {
      console.error("Erreur lors de la mise à jour du score:", error)
    } else {
      updateScoreDisplay()
    }
  } else {
    console.log("Pas assez proche d'un chat pour gagner des points")
  }
}

// Add this new function to update the score display
function updateScoreDisplay() {
  const scoreElement = document.getElementById("player-score")
  if (scoreElement) {
    scoreElement.textContent = `Score: ${Math.round(gameState.player.score)}`
  }
}


