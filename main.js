/**
 * Konfigurationswerte
 */
const SHELLY_IP = "http://192.168.178.248"; // IP-Adresse des Shelly Geräts
const isClosed = [15, 20]; // Schwellwerte für die beiden Rollos
const pollInterval = 1000; // Abfrageintervall in Millisekunden
const closePos = 6; // Wert für Rollo geschlossen

/**
 * Modi für Ereignisse (Tastenaktionen)
 */
const mode = {
  single: "single_push",
  long: "long_push",
  double: "double_push",
  triple: "triple_push",
  down: "btn_down",
  up: "btn_up"
};

/**
 * Initialisiert den Event-Handler für Eingabesignale
 */
function initializeEventHandler() {
  Shelly.addEventHandler(function (event) {
    if (event.name === "input" && (event.id === 0 || event.id === 1)) {
      handleInputEvent(event);
    }
  });
}

/**
 * Verarbeitet Eingabeereignisse von Schaltern
 * @param {object} event - Das Ereignisobjekt
 */
function handleInputEvent(event) {
  let inputId = event.id; // Eingangs-ID (0 oder 1)
  let action = event.info.event; // Aktion (z.B. btn_up, btn_down)

  getAktor(inputId, function (aktorStatus) {
    if (action === mode.single) {
      processSingleAction(inputId, aktorStatus);
    }
    if (action === mode.long) {
      processLongAction(inputId, aktorStatus);
    }
  });
}

/**
 * Verarbeitet die Aktion "short" für einen Schalter
 * @param {number} inputId - ID des Eingangs (0 oder 1)
 * @param {object} aktorStatus - Status des Aktors
 */
function processSingleAction(inputId, aktorStatus) {
  if (aktorStatus.output) {
    print("Eingang " + inputId + " - Aktor ausschalten");
    switchAktor(inputId, false); // Schalte Aktor aus
  } else {
    print("Eingang " + inputId + " - Schließen und Aktor einschalten");
    getPos(function (positions) {
      if (arePositionsValid(positions)) {
        handleRolloClosing(inputId, positions);
      } else {
        print("Ungültige Positionsdaten erhalten.");
      }
    });
  }
}

/**
 * Verarbeitet die Aktion "long" für einen Schalter
 * @param {number} inputId - ID des Eingangs (0 oder 1)
 * @param {object} aktorStatus - Status des Aktors
 */
function processLongAction(inputId, aktorStatus) {
  if (aktorStatus.output) {
    print("Eingang " + inputId + " - Aktor ausschalten");
    switchAktor(inputId, false); // Schalte Aktor aus
  } else {
    print("Eingang " + inputId + " - Aktor einschalten");
    switchAktor(inputId, true); // Schalte Aktor ein
  }
}

/**
 * Überprüft, ob die übergebenen Positionen gültig und schließbar sind
 * @param {number[]} positions - Positionen der Rollos
 * @returns {boolean} - Ob die Positionen gültig sind
 */
function arePositionsValid(positions) {
  return positions && (positions[0] > closePos || positions[1] > closePos);
}

/**
 * Überprüft und steuert das Schließen der Rollos
 * @param {number} inputId - ID des Eingangs
 * @param {number[]} positions - Aktuelle Positionen der Rollos
 */
function handleRolloClosing(inputId, positions) {
  let rollosToClose = [];
  if (positions[0] > closePos) rollosToClose.push(0);
  if (positions[1] > closePos) rollosToClose.push(1);

  closeRollos(rollosToClose, function () {
    waitForRollosToClose(function () {
      switchAktor(inputId, true); // Schalte Aktor ein
    });
  });
}

/**
 * Fragt die Positionen der Rollos ab
 * @param {function} callback - Callback-Funktion, die die Positionen verarbeitet
 */
function getPos(callback) {
  Shelly.call(
    "HTTP.GET",
    { url: SHELLY_IP + "/rpc/Shelly.GetStatus" },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        parsePositionResponse(result.body, callback);
      } else {
        print("Fehler bei der HTTP-Anfrage: " + error_message);
        callback(null); // Kein Ergebnis
      }
    }
  );
}

/**
 * Parsen der Positionsantwort
 * @param {string} body - JSON-String mit den Rollo-Positionen
 * @param {function} callback - Callback-Funktion, die die Positionen verarbeitet
 */
function parsePositionResponse(body, callback) {
  try {
    if (body) {
      let data = JSON.parse(body);
      let rollo1Position = data["cover:0"].current_pos;
      let rollo2Position = data["cover:1"].current_pos;
      callback([rollo1Position, rollo2Position]);
    } else {
      print("Fehler: Kein Body in der Antwort enthalten.");
      callback(null);
    }
  } catch (err) {
    print("Fehler beim Parsen des JSON: " + err.message);
    callback(null);
  }
}

/**
 * Schließt die angegebenen Rollos
 * @param {number[]} rollos - IDs der zu schließenden Rollos
 * @param {function} callback - Callback-Funktion nach Abschluss
 */
function closeRollos(rollos, callback) {
  let closedCount = 0;
  rollos.forEach(function (rolloId) {
    setPos(rolloId, function () {
      closedCount++;
      if (closedCount === rollos.length) {
        callback();
      }
    });
  });
}

/**
 * Setzt die Position eines Rollos
 * @param {number} inputId - ID des Rollos
 * @param {function} callback - Callback-Funktion nach Abschluss
 */
function setPos(inputId, callback) {
  Shelly.call(
    "HTTP.GET",
    { url: SHELLY_IP + "/roller/" + inputId + "?go=to_pos&roller_pos=" + closePos },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        callback(); // Position erfolgreich gesetzt
      } else {
        print("Fehler beim Setzen der Position für Rollo " + inputId + ": " + error_message);
      }
    }
  );
}

/**
 * Wartet zyklisch, bis beide Rollos "geschlossen" sind
 * @param {function} callback - Callback-Funktion nach Abschluss
 */
function waitForRollosToClose(callback) {
  /**
   * Prüft, ob beide Rollos geschlossen sind
   * @param {number[]} positions - Die aktuellen Positionen der Rollos
   * @returns {boolean} - Wahr, wenn beide Rollos geschlossen sind
   */
  function areBothRollosClosed(positions) {
    return positions[0] <= isClosed[0] && positions[1] <= isClosed[1];
  }

  /**
   * Führt die zyklische Abfrage der Positionen durch
   */
  function poll() {
    getPos(function (positions) {
      if (positions) {
        if (areBothRollosClosed(positions)) {
          callback();
        } else {
          Timer.set(pollInterval, false, poll);
        }
      } else {
        print("Fehler beim Abfragen der Positionen.");
      }
    });
  }

  poll(); // Starte die erste Abfrage
}

/**
 * Schaltet einen Aktor (Relais ein- oder ausschalten)
 * @param {number} inputId - ID des Eingangs
 * @param {boolean} state - Zielzustand des Aktors
 */
function switchAktor(inputId, state) {
  Shelly.call(
    "Switch.Set",
    { id: inputId, on: state },
    function (result, error_code, error_message) {
      if (error_code !== 0) {
        print("Fehler beim Schalten von Aktor: " + error_message);
      }
    }
  );
}

/**
 * Fragt den Zustand eines Aktors ab
 * @param {number} inputId - ID des Eingangs
 * @param {function} callback - Callback-Funktion mit dem Zustand
 */
function getAktor(inputId, callback) {
  Shelly.call(
    "Switch.GetStatus",
    { id: inputId },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        callback(result);
      } else {
        print("Fehler beim Abfragen des Aktor-Zustands: " + error_message);
        callback(null);
      }
    }
  );
}

// Initialisierung starten
initializeEventHandler();
