const isClosed = [40, 40]; // Schwellwerte für die beiden Rollos
const pollInterval = 1000; // Abfrageintervall in Millisekunden
const closePos = 6; // Wert für Rollo geschlossen

// Event-Handler für beide Eingänge
Shelly.addEventHandler(function (event) {
  if (event.name === "input" && (event.id === 0 || event.id === 1)) {
    let inputId = event.id; // Eingangs-ID (0 oder 1)
    let action = event.info.event; // Aktion (z.B. btn_up, btn_down)
    getAktor(inputId, function(aktorStatus){
      // Rollo schließen und Aktor nach Schließen schalten
      if (action === mode.down) {
        // Licht erst ausschalten, wenn beide Rollos geschlossen sind
        if (aktorStatus.output) {
          print("Eingang " + inputId + " - Aktor ausschalten");
          switchAktor(inputId, false); // Schalte Aktor aus
        } else {
          print("Eingang " + inputId + " - Schließen und Aktor einschalten");
          getPos(function (positions) {
            if (positions && (positions[0] > closePos || positions[1] > closePos)) {
              // Beide Rollos schließen, falls sie nicht unterhalb der closePos sind
              let rollosToClose = [];
              if (positions[0] > closePos) rollosToClose.push(0);
              if (positions[1] > closePos) rollosToClose.push(1);

              closeRollos(rollosToClose, function () {
                pollPositionsUntilBothClosed(function () {
                  switchAktor(inputId, true); // Schalte Aktor ein
                });
              });
            } else {
              print("Beide Rollos sind bereits unterhalb der Schließposition.");
              switchAktor(inputId, true); // Aktor sofort einschalten, ohne das Rollo zu bewegen
            }
          });
        }
      }
    });
  }
});

// Modi für Ereignisse (Tastenaktionen)
const mode = {
  single: "single_push",
  long: "long_push",
  double: "double_push",
  triple: "triple_push",
  down: "btn_down",
  up: "btn_up"
};

// Positionen der Rollos abfragen
function getPos(callback) {
  Shelly.call(
    "HTTP.GET",
    { url: "http://192.168.178.248/rpc/Shelly.GetStatus" },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        try {
          if (result.body) {
            let data = JSON.parse(result.body); // JSON aus dem Body parsen

            let rollo1Position = data["cover:0"].current_pos;
            let rollo2Position = data["cover:1"].current_pos;
            print("Rollo 1 Position: " + rollo1Position);
            print("Rollo 2 Position: " + rollo2Position);

            callback([rollo1Position, rollo2Position]);
          } else {
            print("Fehler: Kein Body in der Antwort enthalten.");
            callback(null); // Kein Ergebnis
          }
        } catch (err) {
          print("Fehler beim Parsen des JSON: " + err.message);
          callback(null); // Kein Ergebnis
        }
      } else {
        print("Fehler bei der HTTP-Anfrage: " + error_message);
        callback(null); // Kein Ergebnis
      }
    }
  );
}

// Schließt die angegebenen Rollos
function closeRollos(rollos, callback) {
  let closedCount = 0;
  rollos.forEach(function(rolloId) {
    setPos(rolloId, function () {
      closedCount++;
      if (closedCount === rollos.length) {
        callback();
      }
    });
  });
}

// Positionen setzen (Schließen der Rollos)
function setPos(inputId, callback) {
  Shelly.call(
    "HTTP.GET",
    { url: "http://192.168.178.248/roller/" + inputId + "?go=to_pos&roller_pos=" + closePos },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        print("Position für Rollo " + inputId + " erfolgreich gesetzt.");
        callback(); // Position erfolgreich gesetzt
      } else {
        print("Fehler beim Setzen der Position für Rollo " + inputId + ": " + error_message);
      }
    }
  );
}

// Zyklisches Abfragen der Positionen, bis beide Rollos "geschlossen" sind
function pollPositionsUntilBothClosed(callback) {
  function poll() {
    getPos(function (positions) {
      if (positions) {
        let bothRollosClosed = (positions[0] <= isClosed[0]) && (positions[1] <= isClosed[1]);

        if (bothRollosClosed) {
          print("Beide Rollos sind geschlossen.");
          callback(); // Beide Rollos sind geschlossen, weiter mit dem nächsten Schritt
        } else {
          print("Rollos noch nicht geschlossen: Positionen: " + positions);
          Timer.set(pollInterval, false, poll); // Wiederhole die Abfrage
        }
      } else {
        print("Fehler beim Abfragen der Positionen.");
      }
    });
  }

  poll(); // Erste Abfrage starten
}

// Aktor schalten (Relais ein- oder ausschalten)
function switchAktor(inputId, state) {
  let actorState = state ? "eingeschaltet" : "ausgeschaltet";
  print("Aktor " + inputId + " wird " + actorState + ".");
  Shelly.call(
    "Switch.Set",
    { id: inputId, on: state },
    function (result, error_code, error_message) {
      if (error_code === 0) {
        print("Schalten erfolgreich.");
      } else {
        print("Fehler beim Schalten von Aktor: " + error_message);
      }
    }
  );
}

// Funktion zur Abfrage des Zustands eines Aktors
function getAktor(inputId, callback) {
  Shelly.call(
    "Switch.GetStatus", // Geänderter RPC-Befehl zum Abrufen des Schalterzustands
    { id: inputId }, // Parameterobjekt mit der Aktor-ID
    function (result, error_code, error_message) {
      if (error_code === 0) {
        // Erfolgreiche Abfrage, Ausgabe des Zustands
        callback(result);
      } else {
        // Fehlerbehandlung, falls ein Problem auftritt
        print("Fehler beim Abfragen des Aktor-Zustands: " + error_message);
        callback(null);
      }
    }
  );
}
